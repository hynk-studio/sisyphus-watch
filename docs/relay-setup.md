# Sisyphus Relay setup

Sisyphus Watch keeps live-provider credentials off the public site.

```text
Browser → your HTTPS Relay → OpenAI API
```

The browser sends a bounded investigation request to the Relay. The Relay keeps `OPENAI_API_KEY` on its backend, runs the OpenAI-backed workflow, and returns the live Site-packet contract it advertised during capability negotiation. The current reference configuration uses `site_ready_case_packet.v2`; existing v1 Relays remain compatible.

## Quick setup

1. Run a backend you control.
2. Put `OPENAI_API_KEY` in that backend's secret/environment configuration. Do not put it in browser code, a URL, or this repository.
3. Expose these two endpoints:

```text
GET  /v1/capabilities
POST /v1/lineage
```

4. Serve the Relay over HTTPS in production.
5. Allow the Sisyphus Watch site origin through CORS.
6. Paste the Relay base URL into **Connect your relay** on the public site.

The current public origin is:

```text
https://sisyphus-watch.hynk1240.chatgpt.site
```

## 1. Capabilities endpoint

`GET /v1/capabilities` must return JSON compatible with Relay v1:

```json
{
  "contract_version": "sisyphus_relay_capabilities.v1",
  "lineage_response_contract": "site_ready_case_packet.v2",
  "supported_source_limits": [3, 5],
  "supported_discovery_profiles": ["standard", "coverage_expansion"],
  "relay_display_name": "My Sisyphus Relay"
}
```

`relay_display_name` is optional. The other fields are required by the current client. `lineage_response_contract` may be `site_ready_case_packet.v1` or `site_ready_case_packet.v2`; the lineage response must exactly match the advertised value.

Connecting performs this capability check only. It does not start an OpenAI request.

## 2. Lineage endpoint

`POST /v1/lineage` receives JSON shaped like:

```json
{
  "question": "How has this public claim changed across recent updates?",
  "sourceLimit": 3,
  "discoveryProfile": "standard"
}
```

For the reference capability response above, the response must be a valid live `site_ready_case_packet.v2` with:

```text
mode = live
status = live
```

Prepared, fallback, malformed, or incompatible responses are rejected by the browser and do not replace the displayed investigation or Saved Watch baseline.

The v2 packet preserves all ordinary Site-packet fields and may add at most one
`source_supported_relation_signals` entry. Absence of exact deterministic
source support is represented by an empty overlay, not by promoting the raw
relation candidate. A legacy Relay that advertises v1 must continue returning
v1 exactly.

If you are building the Relay from this repository, the existing lineage handler can be reused directly:

```ts
import { handleLineageRequest } from "../app/lib/lineage/handler";

return handleLineageRequest(request, {
  apiKey: env.OPENAI_API_KEY,
});
```

Adjust the relative import for your Worker/server entry point. `handleLineageRequest` uses the same bounded analysis pipeline as the hosted application and returns the Site-ready lineage packet.

## 3. CORS

The public browser contacts the Relay directly, so the Relay must allow the Sisyphus Watch origin.

A minimal production policy should allow:

```text
Origin: https://sisyphus-watch.hynk1240.chatgpt.site
Methods: GET, POST, OPTIONS
Headers: Content-Type
```

Return `Vary: Origin` when applicable. Do not use `Access-Control-Allow-Credentials`; the current browser client uses `credentials: "omit"`.

The client also sends no `Authorization` header and no API-key field.

## 4. Keep the provider key on the Relay

The public Sisyphus Watch site never asks for your OpenAI API key. The key belongs in the Relay's server-side secret store.

For example, on a server or Worker environment, configure:

```text
OPENAI_API_KEY=<server-side secret>
```

Do not commit `.env` files, keys, tokens, or generated secret artifacts.

## 5. Connect from Sisyphus Watch

Open the public site and choose **Connect your relay**. Enter the Relay base URL, for example:

```text
https://relay.example
```

The browser will request:

```text
https://relay.example/v1/capabilities
```

After a compatible response, the live investigation composer becomes available. Investigation requests then go directly from that browser to:

```text
https://relay.example/v1/lineage
```

Reloading the page does not automatically reconnect or run provider work. The saved Relay metadata contains only non-secret endpoint/capability information.

## Security note

Relay v1 does not carry a generic bearer token or API secret from the Sisyphus browser. CORS restricts browser origins but is not authentication. If the Relay can spend provider credits, apply appropriate backend/network controls and bounded usage policy for your deployment, and do not leave an unrestricted provider-funded endpoint exposed unnecessarily.

There is no automatic Relay → operator-sponsored fallback. A Relay failure cannot silently spend the Sisyphus operator's provider budget.

For the full contract and runtime details, see [`site/README.md`](../site/README.md), [`site/app/lib/relay.ts`](../site/app/lib/relay.ts), and [`site/app/lib/lineage/handler.ts`](../site/app/lib/lineage/handler.ts).
