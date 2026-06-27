#!/usr/bin/env python3
"""Smoke checks for Kaggle course-concept demo modules."""

from __future__ import annotations

import json
import os
import sys
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
    build_deterministic_discovery_packet,
    build_guided_flow_summary,
    build_user_problem_packet,
    filter_sources_for_card,
    get_evidence_patch_for_scenario,
    load_demo_sources,
    load_evidence_patches,
    load_precomputed_records,
    render_discovery_packet_html,
    render_course_concepts_html,
    render_export_artifacts_overview_html,
    render_guided_flow_html,
    render_judge_quickstart_html,
    render_plain_summary_vs_sisyphus_html,
    render_run_status_html,
    render_submission_readiness_html,
    render_user_problem_card_html,
    run_quality_checks,
    select_news_card,
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


SCENARIO_ID = "city_heatwave_cooling_centers"
PROBLEM_TEXT = "What changed in this public-interest claim, and what evidence supports the current judgment?"


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
    assert len(scenarios) >= 3

    card = get_sisyphus_card(SCENARIO_ID)
    assert str(card["card_id"]).startswith("news_")

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
    selected_card = select_news_card(records, SCENARIO_ID)
    selected_sources = filter_sources_for_card(sources, selected_card)
    evidence_patch = get_evidence_patch_for_scenario(load_evidence_patches(), SCENARIO_ID)
    discovery_packet = build_deterministic_discovery_packet(PROBLEM_TEXT, selected_sources, SCENARIO_ID)
    problem_packet = build_user_problem_packet(PROBLEM_TEXT, SCENARIO_ID, "deterministic_fixture_discovery")
    local_guided_flow = build_guided_flow_summary(
        selected_card,
        selected_sources,
        discovery_packet=discovery_packet,
        evidence_patch=evidence_patch,
    )
    checks = run_quality_checks(selected_card)
    run_status = {
        "run_google_discovery": False,
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
        render_judge_quickstart_html(
            selected_card,
            problem_packet=problem_packet,
            discovery_packet=discovery_packet,
            evidence_patch=evidence_patch,
            adk_manifest=adk_manifest,
            mcp_manifest=mcp_manifest,
        ),
        render_run_status_html(run_status),
        render_user_problem_card_html(problem_packet),
        render_discovery_packet_html(discovery_packet),
        render_guided_flow_html(local_guided_flow),
        render_plain_summary_vs_sisyphus_html(selected_card, discovery_packet),
        render_course_concepts_html(adk_manifest, adk_trace, mcp_manifest),
        render_export_artifacts_overview_html(selected_card, evidence_patch),
        render_submission_readiness_html(
            selected_card,
            evidence_patch,
            checks,
            discovery_packet=discovery_packet,
            adk_manifest=adk_manifest,
            mcp_manifest=mcp_manifest,
        ),
    ]
    assert all(isinstance(output, str) and output.strip() for output in html_outputs)

    print("course-concepts-smoke-ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
