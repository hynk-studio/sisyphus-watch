#!/usr/bin/env python3
"""Google AI API boundary smoke check for Sisyphus Watch.

This script is intentionally skipped by default so normal validation remains
no-key, no-network, and deterministic.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_PATH = PROJECT_ROOT / "src"
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))

from sisyphus_watch_demo import (  # noqa: E402
    compare_canonical_state,
    filter_sources_for_card,
    load_demo_sources,
    load_precomputed_records,
    maybe_run_google_ai_discovery,
    render_google_ai_live_check_html,
    resolve_google_api_key,
    run_quality_checks,
    select_news_card,
    snapshot_canonical_state,
)


SCENARIO_ID = "starliner_crew_return_decision"
GOOGLE_EXPLORATION_PROBLEM = "What public claim changed over time, and what sources should Sisyphus inspect first?"


def _enabled() -> bool:
    return os.environ.get("RUN_GOOGLE_AI_LIVE_CHECK", "").strip().lower() == "true"


def main() -> int:
    if not _enabled():
        print("google-ai-live-optional-skip: RUN_GOOGLE_AI_LIVE_CHECK is not true")
        return 0

    api_key = resolve_google_api_key()
    if not api_key:
        print("google-ai-live-optional-skip: GOOGLE_API_KEY unavailable")
        return 0

    sources = load_demo_sources()
    records = load_precomputed_records()
    news_card = select_news_card(records, SCENARIO_ID)
    selected_sources = filter_sources_for_card(sources, news_card)

    before = snapshot_canonical_state(news_card)
    discovery_packet = maybe_run_google_ai_discovery(
        GOOGLE_EXPLORATION_PROBLEM,
        selected_sources,
        SCENARIO_ID,
        api_key=api_key,
    )
    after = snapshot_canonical_state(news_card)
    comparison = compare_canonical_state(before, after)
    checks = run_quality_checks(news_card)
    quality_pass = all(row.get("status") == "PASS" for row in checks)

    candidates = discovery_packet.get("candidate_sources", [])
    candidate_ids = {
        str(candidate.get("source_id"))
        for candidate in candidates
        if isinstance(candidate, dict) and candidate.get("source_id")
    }
    canonical_source_ids = set(news_card.get("source_ids", []))
    live_packet_used = discovery_packet.get("mode") == "google_ai_discovery" and bool(discovery_packet.get("api_used"))
    candidates_review_only = bool(candidates) and candidate_ids.isdisjoint(canonical_source_ids)
    serialized_check_text = json.dumps(
        {
            "news_card": news_card,
            "discovery_packet": discovery_packet,
            "comparison": comparison,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    secret_leak_pass = api_key not in serialized_check_text

    if not live_packet_used:
        result = {
            "enabled": True,
            "status": "SKIP",
            "reason": discovery_packet.get("fallback_reason", "Google AI live check did not return a live packet."),
            "api_used": bool(discovery_packet.get("api_used")),
            "candidate_count": len(candidates),
            "canonical_comparison": comparison,
            "canonical_mutation": comparison.get("canonical_mutation", False),
            "quality_checks_pass": quality_pass,
            "secret_leak_check_pass": secret_leak_pass,
        }
        rendered = render_google_ai_live_check_html(result)
        if api_key in rendered:
            raise AssertionError("Google AI live-check renderer exposed the API key")
        api_key = None
        print("google-ai-live-optional-skip: live packet unavailable")
        return 0

    failed = (
        comparison.get("canonical_mutation")
        or not quality_pass
        or not candidates_review_only
        or not secret_leak_pass
    )
    result = {
        "enabled": True,
        "status": "FAIL" if failed else "PASS",
        "reason": "Google AI live smoke invariants passed." if not failed else "Google AI live smoke invariant failed.",
        "api_used": True,
        "candidate_count": len(candidates),
        "canonical_comparison": comparison,
        "canonical_mutation": comparison.get("canonical_mutation", False),
        "quality_checks_pass": quality_pass,
        "secret_leak_check_pass": secret_leak_pass,
        "checks": [
            {
                "label": "Candidates are review-only / non-canonical",
                "status": "PASS" if candidates_review_only else "FAIL",
                "summary": "Candidate source_ids do not overlap canonical source_ids."
                if candidates_review_only
                else "Candidate source_ids overlap canonical source_ids or no candidates were returned.",
            }
        ],
    }
    rendered = render_google_ai_live_check_html(result)
    if api_key in rendered:
        raise AssertionError("Google AI live-check renderer exposed the API key")
    api_key = None

    if failed:
        raise AssertionError(result)
    print("google-ai-live-optional-pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
