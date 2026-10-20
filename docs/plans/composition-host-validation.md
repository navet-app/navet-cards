# Child-card composition host — 2026-10-20

C04 now has a lazy child-card host and visual composition editor. The first integrated unpublished candidate passed six simulated browser scenarios and actual Home Assistant frontend checks on 2024.6.4 and 2026.9.4, each in standalone desktop and modular phone contexts. This extends the earlier [C01/C02 frontend evidence](composition-frontend-validation.md) for the frozen candidate identified below; later source changes require their own verification.

## Interface and lifecycle

`navet-child-cards` consumes opaque `cards` configurations, `hass`, `active`, `preview`, `editMode`, `layout` (vertical/horizontal/grid) and `columns`. HA's `window.loadCardHelpers()` owns child creation. Each child receives a cloned configuration; helper-side mutation cannot change the user's configuration. The host forwards current HA state, preview and edit state, retains normal composed HA events, and handles `ll-rebuild`. Per-child creation/state-propagation failures render contained errors; helper failures have an explicit retry. Unhandled errors inside foreign asynchronous code remain the child's responsibility.

Inactive hosts disconnect their children. Pending asynchronous loads cannot mount after close, reconfiguration or disconnect. Reopening creates fresh child instances. Preview content is `inert` and receives `preview=true`, preventing pointer and keyboard interaction. These flags and inertness are not a sandbox for third-party code that ignores the host contract or calls services autonomously.

The host estimates Masonry sizes from child `getCardSize()` values, using three units for unavailable/failed children. Horizontal and grid layouts aggregate per row. Sections sizing uses child `getGridOptions().rows` when every row is known and otherwise reports automatic height. Room children mount inside the open room popup; their dimensions should not enlarge the closed room tile. Inline children extend other cards.

`navet-child-cards-editor` consumes opaque `cards`, `hass` and optional `lovelace`; it emits `child-cards-changed` with a cloned complete cards array. It uses an already registered HA card picker and card-element editor, falling back to supported child constructor `getConfigElement()` and a small native/custom type chooser when those components are unavailable. Selection, reorder and removal preserve complete child configurations. Child visual edits merge top-level fields to preserve foreign settings omitted by an editor. Because omitted fields are retained, **Replace complete configuration** provides an explicit JSON replacement path for deleting saved settings. It requires a configuration object with a nonempty type; child-specific validation remains HA's responsibility. No claim is made that a card without its own visual editor can be configured entirely without YAML or JSON.

## Evidence and limits

Six focused Chromium scenarios passed against the integrated modular build (2.7 seconds):

- Per-child errors, cloned opaque configurations, current host state, edit state, native details event propagation and Masonry/Sections aggregation.
- Active/inactive disconnect, stale helper resolution, reopening and reconnect.
- Preview flag propagation and inert pointer/keyboard interaction.
- Missing helper failure and successful explicit retry.
- Simulated native picker/editor composition with unknown-field preservation and reorder/remove.
- Actual Navet room popup mounting, Escape cleanup, fresh children on reopening and opener focus restoration.

The suite is [tests/browser/child-cards.spec.ts](../../tests/browser/child-cards.spec.ts). The integrated full check subsequently passed all 125 browser scenarios, including complete JSON replacement/removal and collapsed-room sizing equivalence. The native picker and child elements in these six browser scenarios are explicit fixtures; separate actual frontend evidence follows. Bubble Card, Mushroom and button-card coexistence, nested details-overlay coexistence, companion apps and physical devices remain C04 acceptance work.

Desktop and 390-pixel phone popup screenshots were generated. The phone image was inspected: child labels, contained error and retry, and popup close controls fit the viewport. Local evidence: `/tmp/navet-child-composition-desktop.png` and `/tmp/navet-child-composition-phone.png`. Fixture children intentionally contain simple text, not simulated screenshots of third-party cards.


## Actual Home Assistant frontend evidence

The [rendered frontend harness](../../scripts/ha-frontend-check.mjs) retains all earlier room, secondary-control, chips, preview and native-details journeys and adds actual child-card checks. It loads the real native Tile, history graph and calendar through HA helpers, plus a deliberately missing custom card that produces HA's contained error card. All three native children receive the actual application's HA connection. Closing disconnects every captured child; reopening creates fresh native instances. The test does not mock HA state, helpers, native children or native editors.

The harness loads HA's own Grid editor through its supported constructor method to register HA's nested picker/editor components. It then renders the actual Tile editor inside Navet's child editor, sends an update through that native editor's rendered `ha-form` event contract, reorders children, saves the parent configuration and reopens it through JSON. The opaque configuration on a sibling missing custom card survives. The registered HA card picker renders with the actual host state. This verifies actual native editor integration and the form-update contract; it does not claim a complete pointer/keyboard native card-selection journey. Native Tile rejects arbitrary unknown fields under its own schema; its schema controls whether a particular advanced configuration has a visual editor.

Both versions supplied `calendar.calendar_1` at runtime despite the short YAML configuration not listing a calendar platform. Calendar uses the real HA connection and mounts successfully; event contents, calendar writes and calendar-specific editor fields were not asserted. Native history rendered a chart, but this test does not validate recorder data accuracy. The missing custom card is an error-containment example, not installation or competitor compatibility evidence.

| HA version | Standalone 1280 × 900 | Modular 390 × 844 | Service calls | Unhandled page errors |
| --- | --- | --- | --- | --- |
| 2024.6.4 | Pass | Pass | 0 in both contexts | 0 in both contexts |
| 2026.9.4 | Pass | Pass | 0 in both contexts | 0 in both contexts |

Candidate identity (`0.1.0-beta.3`, unpublished working-tree build):

- Standalone entry SHA-256: `6e8307d33d859e211e3a613fd136625cece9f5dd4cdc4edd75520b51157057af`.
- Modular entry SHA-256: `d6e61b1bdf0d3457fd15668aa484b16d97c09b97a6cb458366e46fd25de6b7bc`.

The complete standalone file and modular directory were copied to each host's isolated `/local/competition-m3/` before subsequent development continued. Canonical registered resources and HA configuration were preserved. Each context imported only its selected profile; the modular context requested relative child, editor and shared chunks from that directory. These hashes identify the first batch, not later source edits.

Reproduce while the matching dedicated demo host is available:

```sh
NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json NAVET_HA_ARTIFACT_PREFIX=competition-m3 node scripts/ha-frontend-check.mjs
NAVET_HA_SESSION=.ha-validation/2024.6.4/session.json NAVET_HA_ARTIFACT_PREFIX=competition-m3 node scripts/ha-frontend-check.mjs
```

Sanitized results and screenshots remain in ignored `.ha-validation/<version>/frontend-evidence-competition-m3/`. Actual phone popup, Tile editor and inert preview screenshots were inspected: native controls, chart and editor actions fit within the viewport and scroll inside the popup. Each run reports native child tags, actual calendar ID, child lifecycle, native editor/picker and roundtrip outcomes, candidate hashes, resource requests and zero service calls/page errors. The harness does not save HA dashboard storage. An initial harness-only attempt omitted the required room `config_version: 2`; adding it resolved that validation failure without a runtime change.

The dedicated minimum-version container was verified by exact name, official image, validation label and loopback port 18125, started for this check and stopped afterward. Its configuration/session remain. The preexisting current-version demo host on port 18124 was left running; household services were untouched.

## Primary API references

The implementation follows the current upstream HA frontend contracts inspected on 2026-10-20. These source links use the moving development branch; deployment-version acceptance still requires actual frontend checks.

- [Card helper creation and lazy native-card loading](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/create-element/create-card-element.ts).
- [HA child picker: hass/lovelace properties and config-changed events](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/editor/card-editor/hui-card-picker.ts).
- [HA card-element editor: getConfigElement/getConfigForm](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/editor/card-editor/hui-card-element-editor.ts).
- [HA element editor: value, hass and error-bearing config-changed events](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/editor/hui-element-editor.ts).
- [HA stack editor: nested picker/editor integration](https://github.com/home-assistant/frontend/blob/dev/src/panels/lovelace/editor/config-elements/hui-stack-card-editor.ts).

Bundle measurements remain report-only. This slice adds no size ceilings.
