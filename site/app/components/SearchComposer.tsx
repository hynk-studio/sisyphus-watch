import type { FormEvent } from "react";
import type { DiscoveryProfile } from "../lib/source-profile";

export function SearchComposer({
  question,
  sourceLimit,
  discoveryProfile,
  liveEnabled,
  isLoading,
  cooldownRemainingSeconds,
  routeError,
  investigationStarted,
  onQuestionChange,
  onSourceLimitChange,
  onDiscoveryProfileChange,
  onSubmit,
  onPreparedExample,
}: {
  question: string;
  sourceLimit: number;
  discoveryProfile: DiscoveryProfile;
  liveEnabled: boolean;
  isLoading: boolean;
  cooldownRemainingSeconds: number;
  routeError: string | null;
  investigationStarted: boolean;
  onQuestionChange: (value: string) => void;
  onSourceLimitChange: (value: number) => void;
  onDiscoveryProfileChange: (value: DiscoveryProfile) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPreparedExample: () => void;
}) {
  const ComposerHeading = investigationStarted ? "h2" : "h1";

  return (
    <section
      className={`composer-section${investigationStarted ? " composer-section-compact" : ""}`}
      aria-labelledby="composer-title"
    >
      <div className="composer-heading">
        <p className="eyebrow">Build a source-bound version map</p>
        <ComposerHeading id="composer-title">
          {liveEnabled
            ? "What do you want to investigate?"
            : "Explore how public information changes"}
        </ComposerHeading>
        <p>
          {liveEnabled
            ? "Start with a public-interest topic or question. Sisyphus Watch organizes bounded sources, candidate claim relations, and unanswered questions without turning them into accepted truth."
            : "An investigation map keeps sources, actor claims, changes, and unanswered questions inspectable without turning them into accepted truth."}
        </p>
      </div>
      {liveEnabled ? (
        <form className="investigation-form" onSubmit={onSubmit}>
          <section
            className="investigation-brief"
            aria-labelledby="investigation-brief-title"
          >
            <div className="investigation-brief-heading">
              <p id="investigation-brief-title">Investigation brief</p>
              <span>Public-interest question · 12–500 characters</span>
            </div>
            <label htmlFor="investigation-question">Topic or public-interest question</label>
            <textarea
              id="investigation-question"
              value={question}
              onChange={(event) => onQuestionChange(event.target.value)}
              minLength={12}
              maxLength={500}
              placeholder="How has access to cooling centers changed during the current heatwave?"
              required
              aria-describedby="live-input-privacy live-availability-note"
            />
            <div className="investigation-privacy-region">
              <p id="live-input-privacy" className="live-input-privacy">
                Your question is sent to OpenAI to discover and analyze public sources.
                Do not enter personal, confidential, sensitive, or identifying information.
                This release does not persist visitor questions or results. Results may be
                incomplete or wrong; records and relations remain review candidates.
              </p>
              <details className="live-privacy-disclosure">
                <summary>Privacy &amp; limits</summary>
                <p>
                  Source inclusion is not endorsement or truth verification. A live map
                  can take time because several bounded discovery and source-local
                  extraction operations may be required. The 20-second timeout applies
                  to each provider request, and the whole investigation has a
                  110-second deadline.
                </p>
                <p>
                  The 30-second in-memory cooldown reduces accidental repeats in this
                  page session. It is a usability guard, not strong abuse prevention,
                  and resets naturally in a new page session.
                </p>
                <p>
                  Server-side aggregate capacity limits bound concurrent, hourly, and
                  daily work. They do not store visitor identity and therefore do not
                  guarantee fairness between signed-out visitors.
                </p>
              </details>
            </div>
          </section>

          <section
            className="composer-config-rail"
            aria-labelledby="composer-config-title"
          >
            <div className="composer-config-heading">
              <p id="composer-config-title">Investigation settings</p>
              <span>Bounded discovery configuration</span>
            </div>
            <div className="composer-options">
              <fieldset className="profile-fieldset">
                <legend>Discovery approach</legend>
                <label aria-label="Standard review discovery approach">
                  <input
                    type="radio"
                    name="discovery-profile"
                    value="standard"
                    checked={discoveryProfile === "standard"}
                    onChange={() => onDiscoveryProfileChange("standard")}
                  />
                  <span>
                    <strong>Standard review</strong>
                    <small>Start with official and established sources</small>
                  </span>
                </label>
                <label aria-label="Expand source coverage discovery approach">
                  <input
                    type="radio"
                    name="discovery-profile"
                    value="coverage_expansion"
                    checked={discoveryProfile === "coverage_expansion"}
                    onChange={() => onDiscoveryProfileChange("coverage_expansion")}
                  />
                  <span>
                    <strong>Expand source coverage</strong>
                    <small>Also look for local, firsthand, specialist, and corrective sources</small>
                  </span>
                </label>
              </fieldset>
              <label className="source-limit-control" htmlFor="source-limit">
                Source limit
                <select
                  id="source-limit"
                  value={sourceLimit}
                  onChange={(event) => onSourceLimitChange(Number(event.target.value))}
                >
                  <option value={3}>3 sources</option>
                  <option value={5}>5 sources · broader and slower</option>
                </select>
              </label>
            </div>
          </section>

          <div className="composer-actions">
            <button
              className="build-map-button"
              type="submit"
              disabled={isLoading || cooldownRemainingSeconds > 0}
            >
              {isLoading
                ? "Building investigation map…"
                : cooldownRemainingSeconds > 0
                  ? `Try again in ${cooldownRemainingSeconds}s`
                  : "Build investigation map"}
            </button>
            <button
              className="prepared-example-button"
              type="button"
              onClick={onPreparedExample}
            >
              Try the cooling-center example
            </button>
          </div>
          <div
            id="live-availability-note"
            className={`availability-note${liveEnabled ? " live-ready" : ""}`}
            role="status"
          >
            <strong>
              {isLoading
                ? "Bounded live investigation running."
                : cooldownRemainingSeconds > 0
                  ? `Next live attempt available in ${cooldownRemainingSeconds}s.`
                  : "Bounded live discovery is available."}
            </strong>
            <span>
              {isLoading
                ? "The displayed investigation stays intact until one schema-checked response is available."
                : cooldownRemainingSeconds > 0
                  ? "The prepared investigation and New investigation remain usable during this accidental-repeat guard."
                  : "Results can be live, partial, or a clearly labeled prepared fallback. A capacity denial leaves the displayed investigation intact; the prepared example remains a separate choice. Every inferred record remains review-only."}
            </span>
          </div>
          {routeError ? <p className="form-error" role="alert">{routeError}</p> : null}
        </form>
      ) : (
        <div className="prepared-launch-panel">
          <div className="prepared-launch-heading">
            <p className="prepared-launch-kicker">Prepared investigation</p>
            <span>Curated case file</span>
          </div>
          <div className="prepared-launch-copy">
            <h2>Cooling-center access during extreme heat</h2>
            <p>
              Follow a curated source record, inspect candidate changes, and trace
              the open evidence gaps in a working investigation map.
            </p>
          </div>
          <button
            id="prepared-investigation-cta"
            className="prepared-primary-button"
            type="button"
            onClick={onPreparedExample}
          >
            Explore the prepared investigation
          </button>
          <div className="availability-note" role="status">
            <strong>Public live investigations are unavailable right now.</strong>
            <span>
              The prepared investigation is the available working path and does
              not start external source discovery or an OpenAI provider request.
            </span>
          </div>
          <details className="live-workflow-disclosure">
            <summary>How live investigations work</summary>
            <p>
              When enabled, the live workflow accepts a public-interest question,
              a Standard review or Expand source coverage approach, and a bounded
              source limit only when the server-side admission boundary has
              available aggregate capacity.
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
