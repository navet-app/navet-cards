# Home Assistant display templates

T02 uses Home Assistant's native Jinja `render_template` websocket subscription. Templates produce presentation values for name, state, icon, picture, color and visibility. Outputs never become commands, entities, service names, URLs for actions or executable JavaScript.

The contract was checked against official [HA 2024.6.4 commands.py](https://github.com/home-assistant/core/blob/2024.6.4/homeassistant/components/websocket_api/commands.py), [HA 2026.9.4 commands.py](https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/components/websocket_api/commands.py) and [frontend ws-templates.ts](https://github.com/home-assistant/frontend/blob/dev/src/data/ws-templates.ts). Both pinned backends accept `template`, `variables`, `strict`, `report_errors` and `timeout`; results and errors arrive as subscription events. The adapter requests strict rendering, error reporting and a five-second timeout. HA's websocket client restores subscriptions after connection recovery; the adapter also reports disconnected/loading transitions.

## Lifecycle and output boundaries

Identical connection/template/variables queries share one remote subscription, even across different output fields. Variable object key order is canonicalized while arrays retain order. When the last observer hides or releases, the remote subscription stops. If unsubscribe becomes available after release, it runs immediately; late callbacks cannot repaint old cards. No polling or retry timer runs in the template coordinator. Explicit retry or renewed observation can restart rejected subscriptions.

Display fields accept scalar text. Icons require a namespaced icon identifier. Pictures follow the existing HTTP(S) or single-slash local resource URL policy. Colors accept supported hexadecimal, common named and numeric RGB/HSL values while rejecting URLs, CSS declarations and arbitrary expressions. Visibility accepts booleans and conventional explicit true/false scalar representations; ambiguous strings are errors. Text uses normal Lit escaping. Non-ready or invalid outputs fall back to the card's configured presentation and expose a field-local error.

When a room’s visibility becomes false, its popup coordinator and dialog close together, including the hash-linked navigation lifecycle. Hidden rooms suppress trigger/hash reconciliation while retaining the visibility subscription; after becoming visible, Controls can open a fresh modal. Regression scenarios cover both linked and unlinked rooms, continued subscription, Escape dismissal and absence of service calls.

The visual editor preserves unknown card and per-template fields. Incomplete variables JSON remains a local draft, survives unrelated common-field edits, and never replaces the last valid saved variables. Templates remain HA/Jinja source text; they are not evaluated in the browser.

## Evidence — 2026-10-20

Eight unit scenarios cover shared stream identity, host isolation, hide/resume/release, delayed unsubscribe, stale callback rejection, offline/recovery, subscription rejection classification, explicit retry, unsafe-output rejection and canonical variables. TypeScript checks pass.

The read-only [live test](../../tests/live/templates.test.ts) passed on the disposable HA 2026.9.4 host. It verified a constant template with variables, a real demo entity read returning only a boolean, invalid Jinja reporting and acknowledged unsubscribe cleanup. Logged evidence includes only version and boolean outcomes: no session credentials or rendered entity values. The only websocket command types were `render_template` and `unsubscribe_events`; there were zero service commands and zero active callbacks after cleanup.

```sh
NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json node --import tsx --test tests/live/templates.test.ts
```

The minimum backend protocol was verified from its exact official source; this report does not claim a live minimum-backend template test. Rendering arbitrary templates can expose information available to the connected HA user, just as HA's own template tooling does. Household permissions, physical-device acceptance and companion-app rendering remain separate checks.

## Integrated browser and native frontend evidence

The integrated browser coverage includes four scenarios after root runtime/editor wiring and picture recovery hardening: shared escaped display output and local error recovery, visibility false remaining subscribed so it can recover, preview making no subscriptions, disconnect cleanup, phone visual editing with incomplete variables JSON and unknown fields preserved, and recovery from a failed template picture when a new URL arrives without mutating saved configuration. The phone editor screenshot was inspected: labels and editable Jinja/JSON remain readable inside the viewport.

The [native frontend harness](../../scripts/ha-templates-check.mjs) then passed on actual disposable HA 2026.9.4 in desktop standalone (1280 × 900) and phone modular (390 × 844) contexts. It authors a Jinja name template and variables through the main visual editor, serializes the emitted configuration, mounts a saved runtime card with the real `hass`, and waits for actual backend results. It verifies name, numeric state, icon, color and visibility outputs; invalid Jinja falls back locally and recovers after configuration correction. Preview adds zero template subscriptions. Both contexts report zero service calls and zero unhandled page errors.

The frozen `competition-templates` candidate hashes were:

- Standalone: `8bc371b70afa222b84ab9fdd632e63d5d15be67ab71c169e64edcb6cf3e89410`.
- Modular entry: `37e3134113fdee521b692d6350c2d3b6f05c3bd6d738d068bd9da4ebfd2e4e9a`.

These identify the tested candidate only, rather than later source changes. Local sanitized evidence is retained in `.ha-validation/2026.9.4/template-evidence-competition-templates/`. The phone runtime screenshot shows the templated title, numeric state, icon and color correctly. The harness imports candidate resources in fresh browser contexts and does not save HA resource registries or dashboards. The preexisting current HA host remains running, with canonical files preserved.

```sh
NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json NAVET_HA_ARTIFACT_PREFIX=competition-templates node scripts/ha-templates-check.mjs
```
