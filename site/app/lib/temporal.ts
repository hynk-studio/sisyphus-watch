const EXACT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EXACT_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/;

export type TemporalPrecision = "day" | "instant" | null;

export interface NormalizedTimestamp {
  value: string | null;
  precision: TemporalPrecision;
}

export interface ReviewTimestampValue {
  value: string;
  precision: Exclude<TemporalPrecision, null>;
}

export type ReviewTimestampGroupPrecision = "day" | "instant" | "mixed";

export interface ReviewTimestampGroup<Item> {
  calendarDate: string;
  precision: ReviewTimestampGroupPrecision;
  items: Item[];
}

export function normalizeTimestampWithPrecision(
  value: string | null,
): NormalizedTimestamp {
  if (!value) return { value: null, precision: null };
  const trimmed = value.trim();
  const dateMatch = EXACT_DATE_PATTERN.exec(trimmed);
  if (dateMatch) {
    const [, yearText, monthText, dayText] = dateMatch;
    if (!isValidCalendarDate(yearText, monthText, dayText)) {
      return { value: null, precision: null };
    }
    return {
      value: `${yearText}-${monthText}-${dayText}T00:00:00.000Z`,
      precision: "day",
    };
  }

  const dateTimeMatch = EXACT_DATE_TIME_PATTERN.exec(trimmed);
  if (!dateTimeMatch) return { value: null, precision: null };
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText = "00",
    fractionText = "",
    zoneText,
  ] = dateTimeMatch;
  if (!isValidCalendarDate(yearText, monthText, dayText)) {
    return { value: null, precision: null };
  }

  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) {
    return { value: null, precision: null };
  }

  const offsetMinutes = parseOffsetMinutes(zoneText);
  if (offsetMinutes === null) return { value: null, precision: null };
  const millisecond = Number(fractionText.slice(0, 3).padEnd(3, "0"));
  const instant = new Date(0);
  instant.setUTCFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
  instant.setUTCHours(hour, minute, second, millisecond);
  instant.setTime(instant.getTime() - offsetMinutes * 60_000);
  return Number.isFinite(instant.getTime())
    ? { value: instant.toISOString(), precision: "instant" }
    : { value: null, precision: null };
}

export function normalizeExactTimestamp(value: string | null): string | null {
  return normalizeTimestampWithPrecision(value).value;
}

export function isExactTimestamp(value: string): boolean {
  return normalizeExactTimestamp(value) !== null;
}

export function formatReviewTimestamp(
  value: string | null,
  precision: TemporalPrecision,
): string {
  if (!value || !precision) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (precision === "day") {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function compareReviewTimestamps(
  left: ReviewTimestampValue,
  right: ReviewTimestampValue,
): number {
  const leftDate = left.value.slice(0, 10);
  const rightDate = right.value.slice(0, 10);
  if (leftDate !== rightDate) return left.value.localeCompare(right.value);
  if (left.precision !== right.precision) {
    // A date-only value uses midnight internally for representation, not as an
    // asserted clock time. A mixed-precision pair on the same UTC calendar date
    // has no defensible strict order.
    return 0;
  }
  if (left.precision === "day") return 0;
  return left.value.localeCompare(right.value);
}

export function isMixedPrecisionSameCalendarDay(
  left: ReviewTimestampValue,
  right: ReviewTimestampValue,
): boolean {
  return left.value.slice(0, 10) === right.value.slice(0, 10)
    && left.precision !== right.precision;
}

export function groupReviewTimestampItems<Item>(
  items: readonly Item[],
  timestampFor: (item: Item) => ReviewTimestampValue,
  tieBreak: (left: Item, right: Item) => number,
): ReviewTimestampGroup<Item>[] {
  const byCalendarDate = new Map<string, Item[]>();
  for (const item of items) {
    const calendarDate = timestampFor(item).value.slice(0, 10);
    const group = byCalendarDate.get(calendarDate) ?? [];
    group.push(item);
    byCalendarDate.set(calendarDate, group);
  }

  return [...byCalendarDate]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([calendarDate, groupItems]) => {
      const hasDay = groupItems.some(
        (item) => timestampFor(item).precision === "day",
      );
      const hasInstant = groupItems.some(
        (item) => timestampFor(item).precision === "instant",
      );
      const precision: ReviewTimestampGroupPrecision = hasDay && hasInstant
        ? "mixed"
        : hasDay
          ? "day"
          : "instant";
      const ordered = [...groupItems].sort((left, right) => {
        const leftTimestamp = timestampFor(left);
        const rightTimestamp = timestampFor(right);
        if (
          leftTimestamp.precision === "instant"
          && rightTimestamp.precision === "instant"
        ) {
          return leftTimestamp.value.localeCompare(rightTimestamp.value)
            || tieBreak(left, right);
        }
        if (leftTimestamp.precision === rightTimestamp.precision) {
          return tieBreak(left, right);
        }
        // Mixed groups are explicitly labeled as non-chronological. Exact
        // instants stay clock-ordered together; day-level peers are placed in a
        // separate trailing subgroup rather than interleaved by surrogate time.
        return leftTimestamp.precision === "instant" ? -1 : 1;
      });
      return { calendarDate, precision, items: ordered };
    });
}

function isValidCalendarDate(
  yearText: string,
  monthText: string,
  dayText: string,
): boolean {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function parseOffsetMinutes(zone: string): number | null {
  if (zone === "Z") return 0;
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(zone);
  if (!match) return null;
  const [, sign, hourText, minuteText] = match;
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  const total = hours * 60 + minutes;
  return sign === "+" ? total : -total;
}
