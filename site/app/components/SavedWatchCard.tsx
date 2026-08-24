import type { LocalWatch } from "../lib/local-watch";
import { SisyphusLoadingStatus } from "./SisyphusMark";

export function SavedWatchCard({
  watch,
  executionAvailable,
  liveEnabled,
  isLoading,
  isWatchRechecking,
  cooldownRemainingSeconds,
  onCheck,
  onForget,
}: {
  watch: LocalWatch;
  executionAvailable?: boolean;
  liveEnabled?: boolean;
  isLoading: boolean;
  isWatchRechecking: boolean;
  cooldownRemainingSeconds: number;
  onCheck: () => void;
  onForget: () => void;
}) {
  const canExecute = executionAvailable ?? liveEnabled ?? false;
  const checkDisabled = !canExecute || isLoading || cooldownRemainingSeconds > 0;
  const checkLabel = isWatchRechecking
    ? "Checking for changes…"
    : cooldownRemainingSeconds > 0
      ? `Try again in ${cooldownRemainingSeconds}s`
      : "Check for changes";

  return (
    <section className="saved-watch-card" aria-labelledby="saved-watch-title">
      <div className="saved-watch-heading">
        <div>
          <p className="eyebrow">Browser-local continuity</p>
          <h2 id="saved-watch-title">Saved watch</h2>
        </div>
      </div>
      <p className="saved-watch-question">{watch.normalized_public_interest_question}</p>
      <div className="saved-watch-primary-row">
        <dl className="saved-watch-facts">
          <div>
            <dt>Last checked</dt>
            <dd>
              <time dateTime={watch.last_checked_at}>
                {formatWatchTimestamp(watch.last_checked_at)}
              </time>
            </dd>
          </div>
        </dl>
        <div className="saved-watch-actions">
          <button
            className="saved-watch-check-button"
            type="button"
            disabled={checkDisabled}
            onClick={onCheck}
          >
            {checkLabel}
          </button>
          <button
            className="saved-watch-forget-button"
            type="button"
            onClick={onForget}
          >
            Forget
          </button>
        </div>
      </div>
      {isWatchRechecking ? (
        <SisyphusLoadingStatus
          message="Checking for changes…"
          detail="The displayed investigation and saved baseline stay intact until this check finishes."
        />
      ) : (
        <p className="saved-watch-status" role="status" aria-live="polite">
          {!canExecute
            ? "Browser-local. Connect your Relay to check this Watch again. Checks run only when you choose Check for changes."
            : isLoading
              ? "Another bounded investigation is running. Check for changes will be available when it finishes."
              : cooldownRemainingSeconds > 0
                ? `The existing in-memory cooldown has ${cooldownRemainingSeconds}s remaining.`
                : "Browser-local. Checks run only when you select Check for changes; no background monitoring occurs."}
        </p>
      )}
      <details className="saved-watch-details">
        <summary>Watch details</summary>
        <dl>
          <div>
            <dt>Review approach</dt>
            <dd>
              {watch.saved_discovery_profile === "coverage_expansion"
                ? "Expand source coverage"
                : "Standard review"}
            </dd>
          </div>
          <div>
            <dt>Source bound</dt>
            <dd>{watch.saved_source_limit} sources</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>This browser profile only</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}

export function formatWatchTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
