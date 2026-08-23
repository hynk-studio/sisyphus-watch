import type { FormEvent } from "react";

import type { ExecutionTransport } from "../lib/execution-transport";
import type { RelayConnection } from "../lib/relay";
import type { DiscoveryProfile } from "../lib/source-profile";

export function SearchComposer({
  question,
  sourceLimit,
  discoveryProfile,
  liveEnabled,
  executionMode = liveEnabled ? "operator_sponsored" : null,
  operatorSponsoredReady = liveEnabled,
  relayHydrated = true,
  activeRelay = null,
  storedRelay = null,
  relayUrlInput = "",
  relayFormOpen = false,
  relayConnecting = false,
  relayNotice = null,
  relayError = null,
  isLoading,
  cooldownRemainingSeconds,
  routeError,
  investigationStarted,
  onQuestionChange,
  onSourceLimitChange,
  onDiscoveryProfileChange,
  onSubmit,
  onPreparedExample,
  onRelayUrlChange = noopString,
  onOpenRelay = noop,
  onCancelRelay = noop,
  onConnectRelay = noop,
  onDisconnectRelay = noop,
  onSelectOperatorSponsored = noop,
  onLeaveOperatorSponsored = noop,
}: {
  question: string;
  sourceLimit: number;
  discoveryProfile: DiscoveryProfile;
  liveEnabled: boolean;
  executionMode?: ExecutionTransport["kind"] | null;
  operatorSponsoredReady?: boolean;
  relayHydrated?: boolean;
  activeRelay?: RelayConnection | null;
  storedRelay?: RelayConnection | null;
  relayUrlInput?: string;
  relayFormOpen?: boolean;
  relayConnecting?: boolean;
  relayNotice?: string | null;
  relayError?: string | null;
  isLoading: boolean;
  cooldownRemainingSeconds: number;
  routeError: string | null;
  investigationStarted: boolean;
  onQuestionChange: (value: string) => void;
  onSourceLimitChange: (value: number) => void;
  onDiscoveryProfileChange: (value: DiscoveryProfile) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPreparedExample: () => void;
  onRelayUrlChange?: (value: string) => void;
  onOpenRelay?: () => void;
  onCancelRelay?: () => void;
  onConnectRelay?: () => void;
  onDisconnectRelay?: () => void;
  onSelectOperatorSponsored?: () => void;
  onLeaveOperatorSponsored?: () => void;
}) {
  const ComposerHeading = investigationStarted ? "h2" : "h1";
  const availabilityState = isLoading
    ? "loading"
    : cooldownRemainingSeconds > 0
      ? "cooldown"
      : "idle-ready";
  const relaySelected = executionMode === "relay" && activeRelay !== null;
  const sponsoredSelected = executionMode === "operator_sponsored";
  const questionPrivacy = relaySelected
    ? "When you build, your question is sent directly from this browser to your relay. The public Sisyphus server does not receive relay provider credentials."
    : sponsoredSelected
      ? "When you build, your question uses the separately enabled operator-sponsored route. The Sisyphus operator funds provider work under bounded admission limits."
      : "You can draft and revise your question before choosing an execution transport. Nothing is submitted merely by typing.";

  return (
    <section
      className={`composer-section${investigationStarted ? " composer-section-compact" : ""}`}
      aria-labelledby="composer-title"
    >
      <div className="composer-heading">
        <p className="eyebrow">Build a source-bound version map</p>
        <ComposerHeading id="composer-title">
          What do you want to investigate?
        </ComposerHeading>
        <p>
          Start with a public-interest topic or question. Sisyphus Watch organizes
          bounded sources, candidate claim relations, and unanswered questions
          without turning them into accepted truth.
        </p>
      </div>

      <div className="composer-workflow">
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
              aria-describedby="question-input-privacy execution-status-note"
            />
            <div className="investigation-privacy-region">
              <p id="question-input-privacy" className="live-input-privacy">
                {questionPrivacy} Do not enter personal, confidential, sensitive, or
                identifying information. By default, Sisyphus Watch does not persist
                visitor questions or results. Results may be incomplete or wrong;
                records and relations remain review candidates.
              </p>
              <details className="live-privacy-disclosure">
                <summary>Privacy &amp; limits</summary>
                <p>
                  Source inclusion is not endorsement or truth verification. A live map
                  can take time because several bounded discovery and source-local
                  extraction operations may be required.
                </p>
                {sponsoredSelected ? (
                  <p>
                    Sponsored provider requests retain the existing 20-second
                    per-request timeout, 110-second workflow deadline, a short cooldown
                    to prevent accidental repeat requests, and D1-backed aggregate capacity limits.
                  </p>
                ) : null}
                <p>
                  A Saved Watch is explicit browser-local storage, not an account. No
                  background checks occur; Check for changes runs only when selected.
                </p>
                <p>
                  A failed relay request never falls back to sponsored compute, and a
                  sponsored failure never contacts a relay automatically.
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
                    <small>
                      Also look for local, firsthand, specialist, and corrective sources
                    </small>
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
              id="build-investigation-map"
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
              id="prepared-investigation-cta"
              className="prepared-example-button"
              type="button"
              disabled={isLoading}
              onClick={onPreparedExample}
            >
              Try the prepared cooling-center example
            </button>
          </div>

          {liveEnabled ? (
            <div
              className={`availability-note availability-${availabilityState}`}
              data-live-capability="available"
              data-execution-transport={executionMode ?? "none"}
              data-availability-state={availabilityState}
              role="status"
            >
              {availabilityState === "idle-ready" ? (
                <strong className="live-ready-line">
                  <span className="live-ready-dot" aria-hidden="true" />
                  {relaySelected ? "Relay ready" : "Sponsored capacity ready"}
                  {" "}<span aria-hidden="true">·</span> bounded limits apply
                </strong>
              ) : (
                <>
                  <strong>
                    {isLoading
                      ? "Bounded live investigation running."
                      : `Next live attempt available in ${cooldownRemainingSeconds}s.`}
                  </strong>
                  <span>
                    {isLoading
                      ? "The displayed investigation stays intact until one schema-checked response is available."
                      : "The prepared investigation remains usable during this short cooldown."}
                  </span>
                </>
              )}
            </div>
          ) : null}
          {routeError ? <p className="form-error" role="alert">{routeError}</p> : null}
        </form>

        <section className="execution-support" aria-labelledby="execution-support-title">
          {liveEnabled ? (
            <div className={`execution-mode-banner execution-mode-${executionMode}`}>
              <div>
                <p className="execution-mode-kicker" id="execution-support-title">
                  {relaySelected ? "Live via your relay" : "Sponsored live investigation"}
                </p>
                <strong>
                  {relaySelected
                    ? `Connected to ${activeRelay?.relay_display_name ?? "your relay"}`
                    : "Explicitly operator-funded"}
                </strong>
                <span id="execution-status-note">
                  {relaySelected
                    ? "Build sends the question directly from this browser to the configured relay."
                    : "This explicitly selected operator-funded investigation is subject to strict capacity limits."}
                </span>
              </div>
              <button
                className="execution-mode-exit"
                type="button"
                disabled={isLoading}
                onClick={relaySelected ? onDisconnectRelay : onLeaveOperatorSponsored}
              >
                {relaySelected ? "Disconnect" : "Stop using sponsored live"}
              </button>
            </div>
          ) : (
            <div className="execution-setup-intro">
              <div>
                <p className="execution-mode-kicker">Execution setup</p>
                <h2 id="execution-support-title">Run your question when you are ready</h2>
                <p id="execution-status-note">
                  Connect a Relay you control before starting a personal live investigation.
                  Your authored question and settings stay in the composer.
                </p>
              </div>
              <button
                id="relay-connect-toggle"
                className="connect-relay-button"
                type="button"
                onClick={onOpenRelay}
              >
                {storedRelay ? "Reconnect your Relay" : "Connect your Relay"}
              </button>
            </div>
          )}

          <aside className="relay-explanation" aria-labelledby="relay-explanation-title">
            <strong id="relay-explanation-title">What is a Relay?</strong>
            <p>
              A Relay is a small backend you control that runs Sisyphus investigations
              using your own OpenAI API key. Your API key stays on the Relay; this Site
              connects only to its URL.
            </p>
            <a
              href="https://github.com/hynk-studio/sisyphus-watch#use-your-own-relay"
              target="_blank"
              rel="noreferrer"
            >
              How to set up a Relay <span aria-hidden="true">→</span>
            </a>
          </aside>

          {relaySelected && operatorSponsoredReady ? (
            <div className="execution-switches">
              <button type="button" disabled={isLoading} onClick={onSelectOperatorSponsored}>
                Use sponsored live instead
              </button>
            </div>
          ) : null}
          {sponsoredSelected ? (
            <div className="execution-switches">
              <button
                id="relay-connect-toggle"
                type="button"
                disabled={isLoading}
                onClick={onOpenRelay}
              >
                Connect your Relay instead
              </button>
            </div>
          ) : null}

          {relayFormOpen ? (
            <div className="relay-connect-form">
              <label htmlFor="relay-url">Relay URL</label>
              <input
                id="relay-url"
                name="relay-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                spellCheck={false}
                value={relayUrlInput}
                onChange={(event) => onRelayUrlChange(event.target.value)}
                placeholder="https://relay.example"
                required
              />
              <p>
                HTTPS is required except for loopback development. Connect performs one
                non-billable Relay v1 capability check. It does not submit your question
                or start provider work.
              </p>
              <div>
                <button
                  className="relay-connect-submit"
                  type="button"
                  disabled={relayConnecting}
                  onClick={onConnectRelay}
                >
                  {relayConnecting ? "Connecting…" : storedRelay ? "Reconnect" : "Connect"}
                </button>
                <button type="button" onClick={onCancelRelay}>
                  Cancel
                </button>
              </div>
              {relayError ? <p className="relay-error" role="alert">{relayError}</p> : null}
            </div>
          ) : null}

          {relayHydrated && relayNotice ? (
            <p className="relay-status" role="status" aria-live="polite">
              {relayNotice}
            </p>
          ) : null}

          {operatorSponsoredReady && !liveEnabled ? (
            <section className="sponsored-option" aria-labelledby="sponsored-option-title">
              <div>
                <p>Optional lower-priority path</p>
                <h3 id="sponsored-option-title">Sponsored live investigation</h3>
                <span>
                  Explicitly select operator-funded execution, subject to strict
                  capacity limits.
                </span>
              </div>
              <button type="button" onClick={onSelectOperatorSponsored}>
                Use sponsored live
              </button>
            </section>
          ) : null}
        </section>
      </div>
    </section>
  );
}

const noop = () => undefined;
const noopString = () => undefined;
