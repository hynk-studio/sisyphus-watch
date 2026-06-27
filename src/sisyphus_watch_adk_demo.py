"""ADK-style multi-agent demo for Sisyphus Watch.

This module demonstrates the Sisyphus Watch pipeline as a small orchestrated
agent system. Google ADK is optional: when it is unavailable, the same
conceptual agent sequence runs as deterministic local Python.
"""

from __future__ import annotations

import importlib
import importlib.util
from typing import Any

from sisyphus_watch_demo import (
    build_agent_packet,
    build_deterministic_discovery_packet,
    build_epistemic_layers,
    build_guided_flow_summary,
    export_agent_graph_packet,
    export_reviewer_packet,
    filter_sources_for_card,
    get_claim_graph,
    get_evidence_patch_for_scenario,
    load_demo_sources,
    load_evidence_patches,
    load_precomputed_records,
    select_news_card,
)


DEFAULT_SCENARIO_ID = "city_heatwave_cooling_centers"
DEFAULT_PROBLEM_TEXT = "What changed in this public-interest claim, and what evidence supports the current judgment?"

CONCEPTUAL_AGENTS = [
    {
        "agent_name": "DiscoveryAgent",
        "responsibility": "Load deterministic fixture discovery, or inspect an optional Google AI discovery packet when enabled elsewhere.",
    },
    {
        "agent_name": "EpistemicSeparationAgent",
        "responsibility": "Separate source-bound findings, actor claims, actions, interpretations, counter-branches, and source-bound judgment.",
    },
    {
        "agent_name": "RevisionHandoffAgent",
        "responsibility": "Package claim graph context, evidence patch context, and reviewer/agent handoff artifacts.",
    },
    {
        "agent_name": "SisyphusOrchestratorAgent",
        "responsibility": "Run the sequence and emit a structured trace for notebook and downstream-agent review.",
    },
]


def _detect_google_adk() -> tuple[bool, str | None]:
    """Best-effort ADK detection without making ADK a dependency."""
    try:
        if importlib.util.find_spec("google.adk") is None:
            return False, None
        importlib.import_module("google.adk")
        return True, "google.adk"
    except Exception:
        return False, None


def _load_demo_context(scenario_id: str, problem_text: str) -> dict[str, Any]:
    source_records = load_demo_sources()
    records = load_precomputed_records()
    news_card = select_news_card(records, scenario_id)
    selected_source_records = filter_sources_for_card(source_records, news_card)
    evidence_patch = get_evidence_patch_for_scenario(
        load_evidence_patches(),
        str(news_card.get("scenario_id", scenario_id)),
    )
    discovery_packet = build_deterministic_discovery_packet(
        problem_text,
        selected_source_records,
        str(news_card.get("scenario_id", scenario_id)),
    )
    return {
        "source_records": source_records,
        "records": records,
        "news_card": news_card,
        "selected_source_records": selected_source_records,
        "evidence_patch": evidence_patch,
        "discovery_packet": discovery_packet,
    }


def build_adk_capability_manifest() -> dict[str, Any]:
    """Describe the ADK-style capability without requiring Google ADK."""
    adk_available, adk_module = _detect_google_adk()
    return {
        "manifest_type": "sisyphus_adk_capability_manifest",
        "agent_system_type": "google_adk" if adk_available else "deterministic_adk_style_fallback",
        "adk_available": adk_available,
        "adk_module": adk_module,
        "conceptual_agents": CONCEPTUAL_AGENTS,
        "fallback_deterministic_orchestration_available": True,
        "deterministic_default": True,
        "requires_api_key_for_default_run": False,
        "default_network_used": False,
        "default_live_model_call": False,
        "notes": [
            "This demo intentionally does not require Google ADK for Kaggle execution.",
            "When ADK is unavailable, the same conceptual agent sequence runs deterministically.",
            "Default execution uses local fixtures, deterministic cards, and no external services.",
        ],
    }


def _count_card_outputs(news_card: dict[str, Any], claim_graph: dict[str, Any]) -> dict[str, int]:
    return {
        "facts": len(news_card.get("facts", [])),
        "actor_claims": len(news_card.get("actor_claims", [])),
        "actions": len(news_card.get("actions", [])),
        "interpretations": len(news_card.get("interpretations", [])),
        "counter_branches": len(news_card.get("counter_branches", [])),
        "bias_notes": len(news_card.get("bias_notes", [])),
        "timeline_events": len(news_card.get("version_timeline", [])),
        "claim_drift_records": len(news_card.get("claim_drift", [])),
        "claim_graph_nodes": len(claim_graph.get("nodes", [])),
        "claim_graph_edges": len(claim_graph.get("edges", [])),
    }


def run_sisyphus_adk_demo(
    scenario_id: str = DEFAULT_SCENARIO_ID,
    problem_text: str | None = None,
) -> dict[str, Any]:
    """Run the ADK-style Sisyphus Watch agent sequence deterministically."""
    selected_problem = problem_text or DEFAULT_PROBLEM_TEXT
    manifest = build_adk_capability_manifest()
    context = _load_demo_context(scenario_id, selected_problem)
    news_card = context["news_card"]
    selected_sources = context["selected_source_records"]
    discovery_packet = context["discovery_packet"]
    evidence_patch = context["evidence_patch"]

    epistemic_layers = build_epistemic_layers(news_card)
    claim_graph = get_claim_graph(news_card)
    agent_packet = build_agent_packet(news_card)
    claims = news_card.get("actor_claims", [])
    focus_claim_id = claims[0].get("claim_id") if claims and isinstance(claims[0], dict) else None
    graph_packet = export_agent_graph_packet(news_card, focus_ref_id=focus_claim_id)
    reviewer_packet = export_reviewer_packet(news_card, "next_agent_handoff", focus_ref_id=focus_claim_id)
    guided_flow = build_guided_flow_summary(
        news_card,
        selected_sources,
        discovery_packet=discovery_packet,
        evidence_patch=evidence_patch,
    )

    steps = [
        {
            "step_id": "adk_step_1_discovery",
            "agent_name": "DiscoveryAgent",
            "status": "PASS",
            "summary": (
                f"Loaded {discovery_packet.get('source_count', 0)} deterministic candidate source(s) "
                "without network or API use."
            ),
            "outputs": ["discovery_packet", "selected_source_records"],
        },
        {
            "step_id": "adk_step_2_epistemic_separation",
            "agent_name": "EpistemicSeparationAgent",
            "status": "PASS",
            "summary": (
                f"Separated {len(epistemic_layers.get('source_bound_findings', []))} finding(s), "
                f"{len(epistemic_layers.get('claim_history', []))} claim(s), and "
                f"{len(epistemic_layers.get('interpretation_branches', []))} interpretation branch(es)."
            ),
            "outputs": ["epistemic_layers", "source_bound_judgment"],
        },
        {
            "step_id": "adk_step_3_revision_handoff",
            "agent_name": "RevisionHandoffAgent",
            "status": "PASS",
            "summary": (
                f"Packaged graph with {len(claim_graph.get('nodes', []))} node(s) and "
                f"{len(claim_graph.get('edges', []))} edge(s), plus reviewer and agent packets."
            ),
            "outputs": ["claim_graph", "agent_packet", "graph_packet", "reviewer_packet"],
        },
        {
            "step_id": "adk_step_4_orchestrator_trace",
            "agent_name": "SisyphusOrchestratorAgent",
            "status": "PASS",
            "summary": "Built a structured deterministic multi-agent trace and guided flow summary.",
            "outputs": ["guided_flow_summary", "adk_trace"],
        },
    ]

    return {
        "agent_system_type": manifest["agent_system_type"],
        "adk_available": manifest["adk_available"],
        "selected_scenario_id": news_card.get("scenario_id", scenario_id),
        "steps": steps,
        "output_counts": _count_card_outputs(news_card, claim_graph),
        "security_notes": [
            "Default ADK-style demo requires no API key and performs no network calls.",
            "GOOGLE_API_KEY is never printed, logged, exported, or stored.",
            "Source text remains untrusted data; generated image prompts are not evidence.",
            "Optional Google AI discovery candidates are review inputs, not canonical evidence.",
            "Canonical card mutation is disabled in the default deterministic path.",
        ],
        "deployability_notes": [
            "Runs in Kaggle with attached data/, src/, schemas/, and examples/ folders.",
            "Runs locally with Python only; Google ADK is optional.",
            "Uses deterministic fixtures and writes exports through the main notebook path.",
        ],
        "reusable_artifacts": {
            "news_card_id": news_card.get("card_id"),
            "agent_packet_id": agent_packet.get("packet_id"),
            "graph_packet_id": graph_packet.get("packet_id"),
            "reviewer_packet_id": reviewer_packet.get("packet_id"),
            "guided_flow_id": guided_flow.get("flow_id"),
        },
        "manifest": manifest,
    }

