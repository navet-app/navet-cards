# Composition frontend validation — 2026-10-20

The unpublished composition candidate passed rendered Home Assistant checks on **2024.6.4** and **2026.9.4**. Each host passed a fresh standalone desktop context and modular phone context, including native chips authoring, room setup, rich secondary controls and native entity details. All four contexts recorded zero service calls and zero unhandled page errors.

This extends the earlier [frontend validation](frontend-validation.md) with the C01/C02 composition features. Artifact version `0.1.0-beta.3` is reused by the development working tree; the following hashes identify this candidate.

## Candidate identity

| Profile | Entry SHA-256 | Packaging |
| --- | --- | --- |
| Standalone | `a6fd260379262fa9fd29d945ed98b69c9e5fad982bb84b5090bc74745815b109` | 253,317 raw bytes; 67,053 gzip bytes |
| Modular | `5cdf325865acd5245dfb7566515f4982d50d7264017381bf3537a6055c83db41` | 81,649-byte entry; complete 13-file installed runtime |

The modular initial dependency closure measured 149,833 raw bytes and 44,603 gzip bytes across seven files. These are size observations. Both hosts received the same frozen generated runtime under `/local/competition-m2/`; their canonical registered resource files were preserved. No runtime source rebuild occurred between the checks. Entry hashes identify the tested entry files, while complete manifest integrity remains a separate packaging check.

## Results

| HA version | Profile | Viewport | Native chips and JSON reopen | Room and secondary controls | Native details | Service calls / page errors |
| --- | --- | --- | --- | --- | --- | --- |
| 2024.6.4 | Standalone | 1280 × 900 | Pass | Pass | Pass | 0 / 0 |
| 2024.6.4 | Modular | 390 × 844 | Pass | Pass | Pass | 0 / 0 |
| 2026.9.4 | Standalone | 1280 × 900 | Pass | Pass | Pass | 0 / 0 |
| 2026.9.4 | Modular | 390 × 844 | Pass | Pass | Pass | 0 / 0 |

The [harness](../../scripts/ha-frontend-check.mjs) authenticates through the actual disposable HA application, obtains its `hass`, and mounts the registered card editors inside the application event boundary. It does not substitute simulated `ha-form` or selector components.

For chips it starts with an empty card, enters a title and subtitle, adds an entity chip through HA's native picker, commits its custom name with Tab, adds a navigation chip and reorders both. Assertions verify the name before and after reordering, stable IDs, the selected entity, navigation path, title/subtitle and preservation of an unknown advanced field. The emitted configuration survives JSON serialization and editor reopening. The rendered preview shows both chips disabled; attempted clicks produce neither commands nor a hash change. The editor fits the phone viewport.

The retained room journey selects live area membership and a recipe, saves versioned room configuration, reopens it through JSON, and checks safe preview disclosure. The secondary-control journey uses native selection, edits its label and read-only setting, and reopens the emitted configuration. Finally, a saved room opens HA's actual native entity details without a service call. Modular contexts request relative editor, chips, secondary-control and advanced-control chunks from the isolated candidate directory.

Screenshots of the current phone chips editor and rendered preview were inspected: controls remain within the viewport, labels wrap and the preview retains the authored title, subtitle and chip names. This is viewport evidence, rather than a physical-phone or companion-app test.

## Harness compatibility and evidence

Native picker selection uses keyboard ArrowDown/Enter and waits for the selected entity in the emitted configuration before editing another field. Clicking the next input checks that the picker released its focus trap. An earlier modern-host harness attempt left that popup open, causing subsequent typing to enter its search field; this was corrected in the harness without a runtime change. The minimum frontend retains the previously documented Enter sign-in and MDC native-dialog accommodations.

Reproduce with the matching disposable sessions and complete candidate files already present:

```sh
NAVET_HA_SESSION=.ha-validation/2024.6.4/session.json NAVET_HA_ARTIFACT_PREFIX=competition-m2 node scripts/ha-frontend-check.mjs
NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json NAVET_HA_ARTIFACT_PREFIX=competition-m2 node scripts/ha-frontend-check.mjs
```

Both commands reported `Rendered disposable HA checks passed for standalone, modular.` Sanitized per-profile results and screenshots are retained locally in ignored `.ha-validation/<version>/frontend-evidence-competition-m2/` directories. `results.json` records the version, entry hash, requested runtime paths, viewport, native component outcomes, two-chip roundtrip, preview call count and page errors. Screenshot names include `modular-native-chips-selectors.png`, `modular-native-chips-editor.png`, `modular-native-chips-preview.png` and `modular-native-details.png`, with corresponding standalone files. Credentials and sessions are not included in this report.

After the four successful contexts, the dedicated `navet-cards-ha-2024-6-4` container was stopped. Its private session and configuration remain available locally. The preexisting disposable 2026.9.4 Compose host remains running; its canonical assets and configuration were preserved.

## Acceptance limits

These checks save and reopen the custom editor's `config-changed` output; they do not write HA dashboard storage. They use disposable demo entities and send no device commands. Household hardware, HACS installation, downloaded-release installation, upgrade/rollback, companion apps, comprehensive assistive-technology testing and coexistence with competing libraries remain separate acceptance work. Neither this report nor the earlier historical verification status establishes release approval. Follow the [release checklist](../release-checklist.md) for those gates.
