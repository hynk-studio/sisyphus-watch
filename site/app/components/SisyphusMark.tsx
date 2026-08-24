export function SisyphusMark({
  animated = false,
  className = "",
}: {
  animated?: boolean;
  className?: string;
}) {
  const classes = [
    "sisyphus-mark",
    animated ? "sisyphus-loading-mark" : "sisyphus-static-mark",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span className={classes} aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false">
        <rect width="32" height="32" rx="7" fill="#14213d" />
        <path
          d="M8 22c3.2-7.7 7.7-11.7 15-12M9 23h14"
          fill="none"
          stroke="#f6c453"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <g className="sisyphus-mark-stone">
          <circle cx="23" cy="10" r="3" fill="#f7f4eb" />
        </g>
      </svg>
    </span>
  );
}

export function SisyphusLoadingStatus({
  message,
  detail,
  variant = "compact",
  liveRegion = true,
}: {
  message: string;
  detail?: string;
  variant?: "compact" | "prominent";
  liveRegion?: boolean;
}) {
  return (
    <div
      className={`sisyphus-loading-status sisyphus-loading-status-${variant}`}
      role={liveRegion ? "status" : undefined}
      aria-live={liveRegion ? "polite" : undefined}
      aria-atomic={liveRegion ? "true" : undefined}
    >
      <SisyphusMark animated />
      <span className="sisyphus-loading-copy">
        <strong>{message}</strong>
        {detail ? <span>{detail}</span> : null}
      </span>
    </div>
  );
}
