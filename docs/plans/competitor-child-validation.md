# Pinned competitor child-card validation

The C04 coexistence harness mounts exact upstream release assets inside Navet's child-card host in the actual disposable Home Assistant frontend. The assets live only under ignored `.ha-validation/`; Navet does not bundle or depend on the competitor libraries. No bundle size ceilings are imposed.

## Fixtures and candidate

| Library | Official release | SHA-256 |
| --- | --- | --- |
| Bubble Card | [3.4.2](https://github.com/Clooos/Bubble-Card/releases/tag/v3.4.2) | `d526dfd815af6a022b8f7355874fc96f2df859aa213cff7b374f7d913a6436ae` |
| Mushroom | [5.2.3](https://github.com/piitaya/lovelace-mushroom/releases/tag/v5.2.3) | `631668268e474d5357e0f17f161322499ea5c93a910431477e112653d7aa456b` |
| button-card | [7.0.1](https://github.com/custom-cards/button-card/releases/tag/v7.0.1) | `5d6e9c6afca01e8014653fa56bb5d6aa9248d832c34fb944a7f2c36329bc22d1` |

The fixture downloader checked every asset against the SHA-256 digest published by GitHub's release API. The harness checks the on-disk fixture digest again before launch. The manifest records exact repository, tag, official download URL, bytes and digest.

The final integrated candidate `competition-m7` includes reusable configurations, display templates and the child host’s scoped configuration reconciliation. Its standalone entry SHA-256 is `ea5d2d5615f28934f2ddae4160362b25d5ca3b912b66695de3fa9533798b32f2`. Both complete profiles were copied once from the frozen final build; cached competitor fixtures were reused and rechecked against the pinned digests.

An earlier `competition-m5` pass covered the pre-template candidate (`c354bcce17716b2c4a37caa2bfb363521f48a90557603a81076a6c1cf1d10520`). Its local evidence is retained, but the results below identify the final integration.

## Scope

The harness uses each library's ordinary entity/button card with a real demo light in a Navet room popup. It checks render, state setter delivery, positive masonry size, grid sizing fallback, phone containment, closed-popup unmount, fresh children on reopen, actual competitor visual editors where advertised, opaque config replacement and unknown-field preservation, JSON reopen and inert previews. It records page errors and asserts zero backend service commands.

Competitor state setters can be write-only. The harness wraps their original setters to record delivery and delegates every value unchanged; it does not assume a public `hass` getter. This instrumentation is confined to each fresh browser context.

The host's popup is exercised. Bubble's own global hash popups, Mushroom dialogs, button-card JavaScript/templates, HACS installation, physical devices and full upstream option matrices remain outside this bounded acceptance slice. Button-card's lack of an advertised visual editor is represented by Navet's complete JSON replacement path; it is not reported as a competitor visual editor pass.

## Reproduction

With exact fixtures and both complete Navet artifact profiles copied under the private session's `config/www/competition-m7/`:

```sh
NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json NAVET_HA_ARTIFACT_PREFIX=competition-m7 node scripts/ha-coexistence-check.mjs
NAVET_HA_SESSION=.ha-validation/2024.6.4/session.json NAVET_HA_ARTIFACT_PREFIX=competition-m7 node scripts/ha-coexistence-check.mjs
```

The [harness](../../scripts/ha-coexistence-check.mjs) accepts only isolated `.ha-validation` sessions on loopback ports 18000–18999. It imports fixtures and the candidate only in a fresh browser context, without saving resource registries, dashboards, accounts or entity configuration. Its logs expose only whitelisted evidence and redact session credentials from errors.

Set `NAVET_HA_FETCH_COMPETITORS=1` for an explicit first download. The harness then downloads only the three hardcoded official release assets, verifies hardcoded published digests, and writes the private fixture manifest. It never registers those resources in HA.

## Results — 2026-10-20

| HA frontend | Profile / viewport | Competitor render and size | Editor / opaque roundtrip | Popup lifecycle / preview | Service commands / page errors |
| --- | --- | --- | --- | --- | --- |
| 2024.6.4 | Standalone / 1280 × 900 | Pass | Pass | Pass | 0 / 0 |
| 2024.6.4 | Modular / 390 × 844 | Pass | Pass | Pass | 0 / 0 |
| 2026.9.4 | Standalone / 1280 × 900 | Pass | Pass | Pass | 0 / 0 |
| 2026.9.4 | Modular / 390 × 844 | Pass | Pass | Pass | 0 / 0 |

The final modular entry SHA-256 is `f806dfd796d3b0c3c192dc513faeedbde158661bd806a78e8a5f437b7cc217fd`. All four contexts reported combined masonry size five and automatic grid rows. Child widths were contained within the host: 458 px desktop, 354 px phone, with no document overflow. The phone screenshot was inspected: Bubble and Mushroom remain readable and button-card fits the popup width; the popup scrolls vertically to its larger button tile.

Both Bubble and Mushroom expose visual editors and rendered them inside the real HA-backed child editor. An initial injected unknown top-level field in Mushroom caused the upstream editor to fall back to HA's YAML editor; the valid supported Mushroom configuration renders its visual editor. Navet does not remove unknown fields to force GUI support. Opaque-field preservation was verified on Bubble and button-card; button-card's complete JSON replacement updated its name while preserving the foreign field.

The final scoped child-host reconciliation required no additional competitor-specific runtime change. The initial state assertion was corrected to respect write-only competitor setters, and the initial Mushroom editor fixture was corrected as described above. These were harness/fixture corrections, not library compatibility fixes.

Sanitized results and screenshots remain locally in `.ha-validation/<version>/coexistence-evidence-competition-m7/`. The existing current-version host was left running and its canonical resource files were preserved. Only the dedicated minimum-version host was restarted for these checks and stopped afterwards; private configuration and sessions were retained.
