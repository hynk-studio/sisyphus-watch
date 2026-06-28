"""Lightweight MCP server demo for deterministic Sisyphus Watch artifacts.

The optional ``mcp`` package is not required for default Kaggle execution.
When FastMCP is installed, this module registers local stdio MCP tools and
resources. Without FastMCP, importing the module still works and direct
execution prints a capability manifest.
"""

from __future__ import annotations

import json
import os
from typing import Any

from sisyphus_watch_demo import (
    build_agent_packet,
    build_deterministic_discovery_packet,
    build_guided_flow_summary,
    filter_sources_for_card,
    get_claim_graph,
    get_evidence_patch_for_scenario,
    get_news_cards,
    load_demo_sources,
    load_evidence_patches,
    load_precomputed_records,
    select_news_card,
)


try:  # pragma: no cover - optional dependency
    from mcp.server.fastmcp import FastMCP  # type: ignore
except Exception as exc:  # pragma: no cover - optional dependency
    FastMCP = None  # type: ignore[assignment]
    MCP_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"
else:  # pragma: no cover - optional dependency
    MCP_IMPORT_ERROR = None


SERVER_NAME = "Sisyphus Watch"
DEFAULT_SCENARIO_ID = "starliner_crew_return_decision"
DEFAULT_PROBLEM_TEXT = "How did the public story around Boeing Starliner Crew Flight Test shift from an expected crewed Starliner return to NASA's uncrewed return decision and a different crew return path?"

MCP_TOOLS = [
    "list_sisyphus_scenarios",
    "get_sisyphus_card",
    "get_sisyphus_agent_packet",
    "get_sisyphus_claim_graph",
    "get_sisyphus_guided_flow",
    "get_sisyphus_security_notes",
]

MCP_RESOURCES = [
    "sisyphus://scenarios",
    "sisyphus://scenario/{scenario_id}/card",
    "sisyphus://scenario/{scenario_id}/agent-packet",
    "sisyphus://scenario/{scenario_id}/claim-graph",
]


def _load_card_context(scenario_id: str) -> dict[str, Any]:
    source_records = load_demo_sources()
    records = load_precomputed_records()
    news_card = select_news_card(records, scenario_id)
    selected_sources = filter_sources_for_card(source_records, news_card)
    evidence_patch = get_evidence_patch_for_scenario(
        load_evidence_patches(),
        str(news_card.get("scenario_id", scenario_id)),
    )
    return {
        "source_records": source_records,
        "records": records,
        "news_card": news_card,
        "selected_source_records": selected_sources,
        "evidence_patch": evidence_patch,
    }


def list_sisyphus_scenarios() -> list[dict[str, Any]]:
    """Return available deterministic scenarios and titles."""
    records = load_precomputed_records()
    scenarios: list[dict[str, Any]] = []
    for card in get_news_cards(records):
        scenarios.append(
            {
                "scenario_id": card.get("scenario_id"),
                "card_id": card.get("card_id"),
                "title": card.get("title"),
                "scenario_name": card.get("scenario_name"),
            }
        )
    return scenarios


def get_sisyphus_card(scenario_id: str = DEFAULT_SCENARIO_ID) -> dict[str, Any]:
    """Return the canonical deterministic Sisyphus news_card."""
    return _load_card_context(scenario_id)["news_card"]


def get_sisyphus_agent_packet(scenario_id: str = DEFAULT_SCENARIO_ID) -> dict[str, Any]:
    """Return the agent packet for a deterministic scenario card."""
    return build_agent_packet(get_sisyphus_card(scenario_id))


def get_sisyphus_claim_graph(scenario_id: str = DEFAULT_SCENARIO_ID) -> dict[str, Any]:
    """Return the deterministic claim graph for a scenario."""
    return get_claim_graph(get_sisyphus_card(scenario_id))


def get_sisyphus_guided_flow(
    scenario_id: str = DEFAULT_SCENARIO_ID,
    problem_text: str = DEFAULT_PROBLEM_TEXT,
) -> dict[str, Any]:
    """Return deterministic guided-flow context for downstream agents."""
    context = _load_card_context(scenario_id)
    news_card = context["news_card"]
    selected_sources = context["selected_source_records"]
    discovery_packet = build_deterministic_discovery_packet(
        problem_text,
        selected_sources,
        str(news_card.get("scenario_id", scenario_id)),
    )
    return build_guided_flow_summary(
        news_card,
        selected_sources,
        discovery_packet=discovery_packet,
        evidence_patch=context["evidence_patch"],
    )


def get_sisyphus_security_notes() -> dict[str, Any]:
    """Return security notes for deterministic MCP tool reuse."""
    return {
        "security_features": [
            "GOOGLE_API_KEY is resolved only through explicit argument, Kaggle Secrets, or environment in optional paths.",
            "The MCP server deterministic tools do not need an API key.",
            "Source text is treated as untrusted data.",
            "Generated image prompts are not evidence.",
            "Google AI discovery candidates are review inputs, not canonical evidence.",
            "Default canonical card mutation is disabled.",
            "Validation and fallback are used for optional live paths.",
        ],
        "default_network_used": False,
        "requires_api_key_for_default_tools": False,
        "secrets_exported": False,
    }


def build_mcp_capability_manifest() -> dict[str, Any]:
    """Return the MCP capability manifest even when FastMCP is unavailable."""
    return {
        "server_name": SERVER_NAME,
        "mcp_available": FastMCP is not None,
        "mcp_import_error": MCP_IMPORT_ERROR,
        "default_transport": "stdio",
        "tools": MCP_TOOLS,
        "resources": MCP_RESOURCES,
        "security_features": get_sisyphus_security_notes()["security_features"],
        "deterministic_default": True,
        "requires_api_key_for_default_tools": False,
        "network_listeners_by_default": False,
    }


if FastMCP is not None:  # pragma: no cover - optional dependency
    mcp = FastMCP(SERVER_NAME)
    mcp.tool()(list_sisyphus_scenarios)
    mcp.tool()(get_sisyphus_card)
    mcp.tool()(get_sisyphus_agent_packet)
    mcp.tool()(get_sisyphus_claim_graph)
    mcp.tool()(get_sisyphus_guided_flow)
    mcp.tool()(get_sisyphus_security_notes)

    @mcp.resource("sisyphus://scenarios")
    def _resource_scenarios() -> str:
        return json.dumps(list_sisyphus_scenarios(), indent=2, ensure_ascii=False)

    @mcp.resource("sisyphus://scenario/{scenario_id}/card")
    def _resource_card(scenario_id: str) -> str:
        return json.dumps(get_sisyphus_card(scenario_id), indent=2, ensure_ascii=False)

    @mcp.resource("sisyphus://scenario/{scenario_id}/agent-packet")
    def _resource_agent_packet(scenario_id: str) -> str:
        return json.dumps(get_sisyphus_agent_packet(scenario_id), indent=2, ensure_ascii=False)

    @mcp.resource("sisyphus://scenario/{scenario_id}/claim-graph")
    def _resource_claim_graph(scenario_id: str) -> str:
        return json.dumps(get_sisyphus_claim_graph(scenario_id), indent=2, ensure_ascii=False)
else:
    mcp = None


def main() -> int:
    """Run FastMCP over stdio when available, else print the manifest."""
    if mcp is None:
        print(json.dumps(build_mcp_capability_manifest(), indent=2, ensure_ascii=False))
        return 0

    transport = os.environ.get("SISYPHUS_MCP_TRANSPORT", "stdio")
    try:  # pragma: no cover - optional dependency
        mcp.run(transport=transport)
    except TypeError:  # pragma: no cover - optional dependency compatibility
        mcp.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
