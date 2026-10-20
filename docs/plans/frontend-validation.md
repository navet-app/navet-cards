# Disposable frontend validation — 2026-10-20

The 212,116-byte standalone development candidate passed rendered Home Assistant checks on **2024.6.4** and **2026.9.1**, using the actual application-supplied `hass`, native form/selectors and native entity details. Both standalone desktop and modular phone contexts passed on each host, with zero preview service calls and zero browser page errors.

This is an unpublished working-tree candidate reporting artifact version `0.1.0-beta.3`. The hashes below identify the tested assets more precisely than that reused development version. These results do not alter the historical [verification status](../verification-status.md).

## Candidate identity

| Profile | Tested entry SHA-256 | Packaging |
| --- | --- | --- |
| Standalone | `2a55e2c6c9472bf1bf22a4a9e66387daf4a91e04e6f0c2765c875a5fe1349649` | Single `navet-cards.js`, 212,116 raw bytes |
| Modular | `02bc64d135fa40a0670df528d40bbc6f33571b3ddb4d270c71920398f5a165dd` | Entry plus complete manifest-listed asset set; nine runtime files |

The same generated assets were copied to both disposable hosts. No source build occurred between these validation runs. Modular evidence records requests for the relative shared, editor and light-color chunks. The entry checksum does not substitute for validating all artifact-manifest digests; complete artifact validation remains part of build/package checks.

## Results and scope

Browser: installed Google Chrome **155.0.8059.85**, headless on the development Mac. Phone means a 390 × 844 browser viewport, rather than a physical phone or companion-app WebView.

| Home Assistant | Profile | Viewport | Native selectors | V2 save/reopen | Preview service calls | Native details | Page errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2024.6.4 | Standalone | 1280 × 900 | Pass | Pass | 0 | Pass | 0 |
| 2024.6.4 | Modular | 390 × 844 | Pass | Pass | 0 | Pass | 0 |
| 2026.9.1 | Standalone | 1280 × 900 | Pass | Pass | 0 | Pass | 0 |
| 2026.9.1 | Modular | 390 × 844 | Pass | Pass | 0 | Pass | 0 |

The [frontend harness](../../scripts/ha-frontend-check.mjs) logs in through each isolated HA frontend, calls the registered card's `getConfigElement`, and mounts the resulting editor inside the actual application event boundary. It verifies that native `ha-form`/`ha-selector` components render, selects live area membership and a kitchen recipe, opens the real disabled preview dialog without URL changes, saves the emitted versioned configuration and reopens it through JSON serialization. It then renders a saved room and opens HA's native more-info for a demo member.

The modular case uses a fresh browser context. It substitutes the registered standalone entry response with an import of `/local/navet-modular/navet-cards.js`; it never evaluates both bundle profiles in one context. Relative chunks load from the complete copied modular directory. This exercises deferred loading on the real host without changing its resource registry.

The harness does not save dashboard configuration to HA storage, send device commands, change registries or create/delete helpers. Its save/reopen result concerns the real custom editor's `config-changed` output and JSON transport. Disposable backend service tests are separate evidence.

Two additional simulated-browser attribute-condition regressions passed against this same source build: actual parent-editor typed attribute authoring/roundtrip, relevant attribute updates versus unrelated updates, disabled preview effects, and invalid numeric/null/mode editing. Run them through `tests/browser/attribute-conditions.spec.ts`.

## Harness compatibility

The minimum frontend needed two harness accommodations: its older sign-in component is submitted with Enter when the modern accessible button is absent, and its visible native details dialog is identified through the MDC surface rather than the modern dialog role. Screenshots confirmed the native dialog before the assertion was adjusted. Neither accommodation changed Navet runtime behavior.

## Reproduction and local evidence

With the corresponding disposable sessions already created and the selected standalone/modular assets copied to their `config/www/` directories:

```sh
NAVET_HA_SESSION=.ha-validation/2024.6.4/session.json node scripts/ha-frontend-check.mjs
NAVET_HA_SESSION=.ha-validation/2026.9.1/session.json node scripts/ha-frontend-check.mjs
```

The authorized hosts for this run were loopback ports **18125** and **18129**, respectively. The harness accepts only generated `.ha-validation` sessions on loopback test ports 18000–18999. Credentials stay in memory and are excluded from report output and pre-login screenshots. No household instance was accessed.

Each ignored `.ha-validation/<version>/frontend-evidence/` directory contains:

- `results.json`: per-profile version, viewport, entry checksum, native-form/details outcomes, preview call count, requested runtime paths and page errors.
- `standalone-native-selectors.png`, `standalone-room-editor.png`, `standalone-native-details.png`.
- `modular-native-selectors.png`, `modular-room-editor.png`, `modular-native-details.png`.

Native-selector and room screenshots were inspected at phone width; actual native details screenshots were also inspected. These local evidence files contain only disposable demo-host views and are not committed.

After validation, both dedicated Navet containers were stopped. Private session/config directories and the preserved historical minimum-version archive remain available locally. Household containers were unchanged.

## Remaining acceptance

Household devices, companion apps, HACS installation/default listing, downloaded-release installation, resource registration, upgrade/rollback/old-tab behavior, and coexistence with other card libraries remain separate gates. Native selector rendering here is not a complete keyboard/screen-reader audit of HA's selectors. This bounded check does not establish all advanced device controls on real hardware or the entire competitor parity plan. Follow the [release checklist](../release-checklist.md) and [human verification guide](../human-verification.md) for those outcomes.
