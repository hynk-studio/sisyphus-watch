import type { FormEvent } from "react";
import type { DiscoveryProfile } from "../lib/source-profile";

export function SearchComposer({
  question,
  sourceLimit,
  discoveryProfile,
  liveEnabled,
  isLoading,
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
  routeError: string | null;
  investigationStarted: boolean;
  onQuestionChange: (value: string) => void;
  onSourceLimitChange: (value: number) => void;
  onDiscoveryProfileChange: (value: DiscoveryProfile) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPreparedExample: () => void;
}) {
  return (
    <section
      className={`composer-section${investigationStarted ? " composer-section-compact" : ""}`}
      id="top"
      aria-labelledby="composer-title"
    >
      <div className="composer-heading">
        <p className="eyebrow">Build a source-bound version map</p>
        <h1 id="composer-title">What do you want to investigate?</h1>
        <p>
          Start with a public-interest topic or question. Sisyphus Watch organizes
          bounded sources, candidate claim relations, and unanswered questions
          without turning them into accepted truth.
        </p>
      </div>
      <form className="investigation-form" onSubmit={onSubmit}>
        <label htmlFor="investigation-question">Topic or public-interest question</label>
        <textarea
          id="investigation-question"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          minLength={12}
          maxLength={500}
          placeholder="How has access to cooling centers changed during the current heatwave?"
          required
          aria-describedby="live-availability-note"
        />
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
                <small>One conventional bounded pass</small>
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
                <small>Seek under-surfaced source roles</small>
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
              <option value={5}>5 sources</option>
              <option value={8}>8 sources · maximum</option>
            </select>
          </label>
        </div>
        <div className="composer-actions">
          <button
            className="build-map-button"
            type="submit"
            disabled={!liveEnabled || isLoading}
          >
            {isLoading ? "Building investigation map…" : "Build investigation map"}
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
            {liveEnabled
              ? "Bounded live discovery is available."
              : "Live source discovery is not enabled on this public version."}
          </strong>
          <span>
            {liveEnabled
              ? "Results can be live, partial, or a clearly labeled prepared fallback. Every inferred record remains review-only."
              : "Arbitrary questions cannot run here yet. The prepared cooling-center example uses the same map components without an API key or network."}
          </span>
        </div>
        {routeError ? <p className="form-error" role="alert">{routeError}</p> : null}
      </form>
    </section>
  );
}
