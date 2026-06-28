#!/usr/bin/env python3
"""Smoke checks for Kaggle course-concept demo modules."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_PATH = PROJECT_ROOT / "src"
if str(SRC_PATH) not in sys.path:
    sys.path.insert(0, str(SRC_PATH))

from sisyphus_watch_adk_demo import (  # noqa: E402
    build_adk_capability_manifest,
    run_sisyphus_adk_demo,
)
from sisyphus_watch_demo import (  # noqa: E402
    build_case_selector_options,
    build_deterministic_discovery_packet,
    build_guided_flow_summary,
    build_surface_model,
    build_user_problem_packet,
    compare_canonical_state,
    filter_sources_for_card,
    get_evidence_patch_for_scenario,
    load_demo_sources,
    load_evidence_patches,
    load_precomputed_records,
    render_agent_capability_strip_html,
    render_agent_contact_surface_html,
    render_case_hook_html,
    render_case_selector_html,
    render_case_source_links_html,
    render_discovery_packet_html,
    render_course_concepts_html,
    render_evaluation_summary_html,
    render_export_artifacts_overview_html,
    render_google_ai_exploration_html,
    render_google_ai_live_check_html,
    render_guided_flow_html,
    render_judge_quickstart_html,
    render_plain_summary_vs_sisyphus_html,
    render_product_brief_html,
    render_quality_checks_html,
    render_review_map_html,
    render_run_status_html,
    render_submission_readiness_html,
    render_surface_model_html,
    render_user_problem_card_html,
    render_what_changed_html,
    run_quality_checks,
    select_news_card,
    snapshot_canonical_state,
    write_export_artifacts,
)
from sisyphus_watch_mcp_server import (  # noqa: E402
    build_mcp_capability_manifest,
    get_sisyphus_agent_packet,
    get_sisyphus_card,
    get_sisyphus_claim_graph,
    get_sisyphus_guided_flow,
    get_sisyphus_security_notes,
    list_sisyphus_scenarios,
)


SCENARIO_ID = "starliner_crew_return_decision"
PROBLEM_TEXT = "How did the public story around Boeing Starliner Crew Flight Test shift from an expected crewed Starliner return to NASA's uncrewed return decision and a different crew return path?"
REAL_CASE_IDS = [
    "starliner_crew_return_decision",
    "crowdstrike_windows_outage_2024",
    "voyager1_data_recovery_2024",
]
SYNTHETIC_SCENARIO_IDS = [
    "city_heatwave_cooling_centers",
    "public_transit_delay_communication",
    "school_air_quality_alert_communication",
]
REQUIRED_SNAPSHOT_MARKERS = {
    "real_case_snapshot",
    "public_source_snapshot",
    "deterministic",
    "not_live_verification",
}
PROBLEM_TEXT_BY_SCENARIO = {
    SCENARIO_ID: PROBLEM_TEXT,
    "crowdstrike_windows_outage_2024": (
        "How did the public story around the July 2024 CrowdStrike Windows outage shift from a broad outage "
        "to a source-bound account of a Falcon content update issue, affected systems, remediation, and root-cause review?"
    ),
    "voyager1_data_recovery_2024": (
        "How did the public story around Voyager 1 shift from unreadable spacecraft data to a source-bound "
        "recovery story involving flight data system troubleshooting and restored data return?"
    ),
}


def main() -> int:
    adk_manifest = build_adk_capability_manifest()
    assert len(adk_manifest["conceptual_agents"]) >= 3

    adk_trace = run_sisyphus_adk_demo(SCENARIO_ID, PROBLEM_TEXT)
    assert len(adk_trace["steps"]) >= 3
    assert {step["agent_name"] for step in adk_trace["steps"]} >= {
        "DiscoveryAgent",
        "EpistemicSeparationAgent",
        "RevisionHandoffAgent",
    }

    mcp_manifest = build_mcp_capability_manifest()
    assert mcp_manifest["server_name"] == "Sisyphus Watch"
    assert len(mcp_manifest["tools"]) >= 5
    assert len(mcp_manifest["resources"]) >= 4
    assert mcp_manifest["requires_api_key_for_default_tools"] is False

    scenarios = list_sisyphus_scenarios()
    scenario_ids = {scenario.get("scenario_id") for scenario in scenarios}
    assert len(scenarios) >= 6
    for scenario_id in REAL_CASE_IDS + SYNTHETIC_SCENARIO_IDS:
        assert scenario_id in scenario_ids

    card = get_sisyphus_card(SCENARIO_ID)
    assert str(card["card_id"]).startswith("news_")
    assert card["scenario_id"] == SCENARIO_ID

    agent_packet = get_sisyphus_agent_packet(SCENARIO_ID)
    assert agent_packet.get("packet_version")

    claim_graph = get_sisyphus_claim_graph(SCENARIO_ID)
    assert claim_graph.get("nodes")
    assert claim_graph.get("edges")

    guided_flow = get_sisyphus_guided_flow(SCENARIO_ID, PROBLEM_TEXT)
    assert guided_flow.get("steps")

    security_notes = get_sisyphus_security_notes()
    serialized_notes = json.dumps(security_notes, ensure_ascii=False)
    env_secret = os.environ.get("GOOGLE_API_KEY")
    if env_secret:
        assert env_secret not in serialized_notes
    assert "AIza" not in serialized_notes
    assert security_notes["requires_api_key_for_default_tools"] is False

    sources = load_demo_sources()
    records = load_precomputed_records()
    default_card = select_news_card(records)
    assert default_card["scenario_id"] == SCENARIO_ID
    assert str(default_card["card_id"]).startswith("news_")

    selector_options = build_case_selector_options(records, sources, SCENARIO_ID)
    selector_html = render_case_selector_html(selector_options, SCENARIO_ID)
    assert isinstance(selector_html, str) and selector_html.strip()
    for scenario_id in REAL_CASE_IDS:
        assert scenario_id in selector_html

    evidence_patches = load_evidence_patches()
    real_case_html_outputs = [selector_html]
    for scenario_id in REAL_CASE_IDS:
        case_card = select_news_card(records, scenario_id)
        assert str(case_card["card_id"]).startswith("news_")
        assert case_card["scenario_id"] == scenario_id
        assert case_card.get("is_public_source_snapshot") is True
        assert case_card.get("is_live_verification") is False
        assert REQUIRED_SNAPSHOT_MARKERS <= {str(item) for item in case_card.get("snapshot_markers", [])}
        assert len(case_card.get("version_timeline", [])) >= 3
        assert len(case_card.get("claim_drift", [])) >= 4
        assert case_card.get("claim_graph", {}).get("nodes")
        assert case_card.get("claim_graph", {}).get("edges")

        case_sources = filter_sources_for_card(sources, case_card)
        assert len(case_sources) >= 2
        for source in case_sources:
            assert str(source.get("url", "")).startswith("https://")
            assert source.get("is_public_source_snapshot") is True
            assert source.get("is_live_verification") is False
            assert REQUIRED_SNAPSHOT_MARKERS <= {str(item) for item in source.get("snapshot_markers", [])}

        case_checks = run_quality_checks(case_card)
        assert case_checks
        assert all(row.get("status") == "PASS" for row in case_checks)
        case_problem = PROBLEM_TEXT_BY_SCENARIO.get(scenario_id, PROBLEM_TEXT)
        case_discovery_packet = build_deterministic_discovery_packet(case_problem, case_sources, scenario_id)
        real_case_html_outputs.extend(
            [
                render_case_hook_html(case_card, case_discovery_packet),
                render_what_changed_html(case_card),
                render_case_source_links_html(case_sources),
            ]
        )
    assert all(isinstance(output, str) and output.strip() for output in real_case_html_outputs)
    assert all("sisyphus-block" in output for output in real_case_html_outputs)

    selected_card = select_news_card(records, SCENARIO_ID)
    assert selected_card["scenario_id"] == SCENARIO_ID
    assert str(selected_card["card_id"]).startswith("news_")
    selected_sources = filter_sources_for_card(sources, selected_card)
    assert selected_sources
    assert all(source.get("is_public_source_snapshot") is True for source in selected_sources)
    assert all(str(source.get("url", "")).startswith("https://") for source in selected_sources)
    evidence_patch = get_evidence_patch_for_scenario(evidence_patches, SCENARIO_ID)
    discovery_packet = build_deterministic_discovery_packet(PROBLEM_TEXT, selected_sources, SCENARIO_ID)
    problem_packet = build_user_problem_packet(PROBLEM_TEXT, SCENARIO_ID, "deterministic_fixture_discovery")
    local_guided_flow = build_guided_flow_summary(
        selected_card,
        selected_sources,
        discovery_packet=discovery_packet,
        evidence_patch=evidence_patch,
    )
    surface_model = build_surface_model(
        selected_card,
        evidence_patch=evidence_patch,
        discovery_packet=discovery_packet,
        adk_manifest=adk_manifest,
        mcp_manifest=mcp_manifest,
    )
    assert surface_model["model_type"] == "sisyphus_surface_model"
    assert "core_state" in surface_model
    assert "human_review_workflow" in surface_model
    assert "agent_contact_surface" in surface_model
    assert "boundary_rules" in surface_model
    assert selected_card.get("claim_drift")
    assert selected_card.get("version_timeline")
    assert selected_card.get("claim_graph", {}).get("nodes")
    assert selected_card.get("claim_graph", {}).get("edges")
    checks = run_quality_checks(selected_card)
    assert checks
    assert all(row.get("status") == "PASS" for row in checks)
    canonical_state = snapshot_canonical_state(selected_card)
    canonical_comparison = compare_canonical_state(canonical_state, snapshot_canonical_state(selected_card))
    assert canonical_comparison["status"] == "PASS"
    assert canonical_comparison["canonical_mutation"] is False
    fake_api_key = "fake-google-api-key-that-must-not-render"
    fake_discovery_packet = {
        "mode": "google_ai_discovery",
        "query_or_problem": "What public claim changed over time?",
        "scenario_id": SCENARIO_ID,
        "network_used": True,
        "api_used": True,
        "api_key_lookup_performed": True,
        "source_count": 1,
        "candidate_sources": [
            {
                "source_id": "src_google_ai_candidate_review_only_001",
                "title": "Review-only candidate source",
                "url": "https://example.com/review-only-candidate",
                "source_type": "discovery_candidate",
                "published_at": "2024-01-01T00:00:00Z",
                "snippet": "Candidate summary for reviewer inspection only.",
                "why_selected": "Useful candidate for Sisyphus intake preview.",
                "trust_or_limit_note": "Must be reviewed before use as evidence.",
            }
        ],
        "coverage_limits": [
            "Review-only candidates do not mutate canonical cards.",
        ],
    }
    skipped_exploration_html = render_google_ai_exploration_html(
        None,
        enabled=False,
        api_key_available=False,
    )
    no_key_exploration_html = render_google_ai_exploration_html(
        None,
        enabled=True,
        api_key_available=False,
        reason="GOOGLE_API_KEY was not available; no Google AI call was made.",
    )
    fake_exploration_html = render_google_ai_exploration_html(
        fake_discovery_packet,
        enabled=True,
        api_key_available=True,
    )
    live_pass_html = render_google_ai_live_check_html(
        {
            "enabled": True,
            "status": "PASS",
            "reason": "API Boundary Check passed; canonical demo cards are not mutated.",
            "api_used": True,
            "candidate_count": 1,
            "canonical_comparison": canonical_comparison,
            "canonical_mutation": False,
            "quality_checks_pass": True,
            "secret_leak_check_pass": True,
            "checks": [
                {
                    "label": "Candidates are review-only / non-canonical",
                    "status": "PASS",
                    "summary": "review-only candidates do not overlap canonical source_ids.",
                }
            ],
        }
    )
    mutated_state = dict(canonical_state)
    mutated_state["claim_drift_count"] = canonical_state["claim_drift_count"] + 1
    live_fail_html = render_google_ai_live_check_html(
        {
            "enabled": True,
            "status": "FAIL",
            "reason": "API Boundary Check found an invariant failure.",
            "api_used": True,
            "candidate_count": 1,
            "canonical_comparison": compare_canonical_state(canonical_state, mutated_state),
            "canonical_mutation": True,
            "quality_checks_pass": True,
            "secret_leak_check_pass": True,
            "checks": [],
        }
    )
    google_ai_html_outputs = [
        skipped_exploration_html,
        no_key_exploration_html,
        fake_exploration_html,
        live_pass_html,
        live_fail_html,
    ]
    assert all(isinstance(output, str) and output.strip() for output in google_ai_html_outputs)
    google_ai_html = "\n".join(google_ai_html_outputs)
    assert "canonical demo cards are not mutated" in google_ai_html
    assert "review-only" in google_ai_html
    assert "GOOGLE_API_KEY was not available" in no_key_exploration_html
    assert "FAIL" in live_fail_html
    assert fake_api_key not in google_ai_html
    run_status = {
        "run_google_discovery": False,
        "run_google_ai_exploration": False,
        "run_google_ai_live_check": False,
        "run_live_mode": False,
        "discovery_mode": discovery_packet.get("mode"),
        "record_mode": records.get("mode", "demo"),
        "fallback_reasons": [],
        "selected_card_id": selected_card.get("card_id"),
        "selected_scenario_id": selected_card.get("scenario_id"),
        "available_demo_card_count": len(records.get("news_cards", [])),
        "evidence_patch_available": evidence_patch is not None,
        "export_path_target": "/kaggle/working",
    }
    html_outputs = [
        selector_html,
        render_case_hook_html(selected_card, discovery_packet, surface_model),
        render_case_source_links_html(selected_sources),
        render_what_changed_html(selected_card),
        fake_exploration_html,
        live_pass_html,
        render_product_brief_html(selected_card),
        render_review_map_html(
            surface_model,
            run_status=run_status,
            adk_manifest=adk_manifest,
            mcp_manifest=mcp_manifest,
        ),
        render_judge_quickstart_html(
            selected_card,
            problem_packet=problem_packet,
            discovery_packet=discovery_packet,
            evidence_patch=evidence_patch,
            adk_manifest=adk_manifest,
            mcp_manifest=mcp_manifest,
        ),
        render_agent_capability_strip_html(),
        render_run_status_html(run_status),
        render_surface_model_html(surface_model),
        render_user_problem_card_html(problem_packet),
        render_discovery_packet_html(discovery_packet),
        render_guided_flow_html(local_guided_flow),
        render_plain_summary_vs_sisyphus_html(selected_card, discovery_packet),
        render_course_concepts_html(adk_manifest, adk_trace, mcp_manifest),
        render_agent_contact_surface_html(surface_model, selected_card, evidence_patch),
        render_export_artifacts_overview_html(selected_card, evidence_patch),
        render_submission_readiness_html(
            selected_card,
            evidence_patch,
            checks,
            discovery_packet=discovery_packet,
            adk_manifest=adk_manifest,
            mcp_manifest=mcp_manifest,
        ),
        render_evaluation_summary_html(checks, selected_card),
        render_quality_checks_html(checks),
    ]
    assert all(isinstance(output, str) and output.strip() for output in html_outputs)
    assert all("sisyphus-block" in output for output in html_outputs)
    combined_html = "\n".join(html_outputs)
    assert "Sisyphus Watch" in combined_html
    assert "Human Review Workflow" in combined_html
    assert "Agent Contact Surface" in combined_html
    assert "overflow-wrap" in combined_html
    assert "sisyphus-table-wrap" in combined_html
    fragile_layout_markers = [
        "repeat(" + "auto-fit",
        "grid-template-columns:" + "repeat(" + "auto-fit",
        "grid " + "two",
        "dashboard" + "-card",
    ]
    for marker in fragile_layout_markers:
        assert marker not in combined_html
    assert "summary-grid" not in combined_html or "display: flex" in combined_html
    assert "sisyphus_surface_model.json" in combined_html

    with tempfile.TemporaryDirectory() as tmp_dir:
        export_paths = write_export_artifacts(selected_card, tmp_dir)
        surface_model_path = export_paths["surface_model"]
        exported_surface_model = json.loads(surface_model_path.read_text(encoding="utf-8"))
        assert exported_surface_model["model_type"] == "sisyphus_surface_model"
        assert surface_model_path.name == "sisyphus_surface_model.json"

    print("course-concepts-smoke-ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
