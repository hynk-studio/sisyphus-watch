const EXACT_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EXACT_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/;

export function normalizeExactTimestamp(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const dateMatch = EXACT_DATE_PATTERN.exec(trimmed);
  if (dateMatch) {
    const [, yearText, monthText, dayText] = dateMatch;
    if (!isValidCalendarDate(yearText, monthText, dayText)) return null;
    return `${yearText}-${monthText}-${dayText}T00:00:00.000Z`;
  }

  const dateTimeMatch = EXACT_DATE_TIME_PATTERN.exec(trimmed);
  if (!dateTimeMatch) return null;
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
  if (!isValidCalendarDate(yearText, monthText, dayText)) return null;

  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const offsetMinutes = parseOffsetMinutes(zoneText);
  if (offsetMinutes === null) return null;
  const millisecond = Number(fractionText.slice(0, 3).padEnd(3, "0"));
  const instant = new Date(0);
  instant.setUTCFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
  instant.setUTCHours(hour, minute, second, millisecond);
  instant.setTime(instant.getTime() - offsetMinutes * 60_000);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
}

export function isExactTimestamp(value: string): boolean {
  return normalizeExactTimestamp(value) !== null;
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
