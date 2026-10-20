# Contributing to Navet Cards

Use [Discussions](https://github.com/navet-app/navet-cards/discussions) for setup help and early ideas. Open an [issue](https://github.com/navet-app/navet-cards/issues/new/choose) for a reproducible bug or a focused feature request. Discuss substantial changes before implementing them.

## Develop locally

Use Node.js 22 or newer:

```sh
npm ci
npm run build
npx playwright install chromium
npm run dev
```

Open http://127.0.0.1:4178/demo/ for the simulated dashboard or http://127.0.0.1:4178/demo/composition.html for the composition preview. Rebuild after source changes and refresh the preview. Run `npm run check` before submitting behavior changes; it checks types, contracts, the bundle, and Chromium interactions. See [human verification](docs/human-verification.md) for opt-in tests against a disposable Home Assistant instance.

## Build an installable resource

Clone your fork or the repository and use Node.js 22 or newer:

```sh
git clone https://github.com/navet-app/navet-cards.git
cd navet-cards
npm ci
npm run build
```

The build produces the default standalone `dist/navet-cards.js` and a modular candidate under `dist/modular/`. Use the standalone file for the [manual installation steps](README.md#install-navet-cards). Neither a local build nor a verification ZIP establishes release publication, household acceptance or HACS acceptance.

The modular candidate includes an entry and relative chunks. Copy every runtime file listed in `dist/modular/artifact-manifest.json`, preserving paths; copying only its entry breaks deferred editor/data/control loading. Keep each candidate in a separate directory when testing upgrade/rollback, and retain files needed by old open tabs. HACS metadata continues to identify the standalone resource; modular HACS installation is not accepted.

Run `npm run check` for TypeScript, contract, release, build, and browser checks. To use installed Chrome and a free preview port, run `NAVET_BROWSER_CHANNEL=chrome NAVET_PREVIEW_PORT=4187 npm run check`.

Run `npm run package:verification` to run the checks and produce a verification folder and ZIP under `dist/`, including the resource, checksum, instructions, and test status. Published downloads are built by [release automation](docs/release-workflow.md).

After those checks, `node scripts/package-verification.mjs --modular` creates a separate modular verification bundle. Its artifact manifest and `SHA256SUMS` cover the complete runtime file set. Test the extracted bundle from its intended resource prefix; verify editor opening, deferred controls/data, missing-file errors, a previously open tab, upgrade and rollback using the [release checklist](docs/release-checklist.md). Do not treat a successful ZIP or simulated host as completed installation acceptance.

## Bundle policy and focused verification

`npm run build` measures both profiles using [scripts/bundle-budgets.json](scripts/bundle-budgets.json), now a report-only measurement policy. Bundle size ceilings and target-based gates are deferred at the maintainer's request. `dist/bundle-report.json` records raw bytes, gzip level 6, complete dependency closures, baseline deltas and module contributions for the initial view, optional features and full installation. `node scripts/build.mjs --analyze` also writes the esbuild metafile under `dist/bundle-analysis/`. Artifact integrity, supported versions and safe paths remain validated.

For room changes, use the [visual setup guide](docs/room-setup.md) and the parent-editor journey in `tests/browser/room-journey.spec.ts`. Preserve legacy configuration, unknown fields, save/cancel behavior and disabled preview side effects. Run the smallest affected tests while developing, then `npm run check` at integration. Screenshots and tests must name their simulated host; physical-device evidence belongs in the live verification process.

## Submit a pull request

1. Fork the repository and create a focused branch.
2. Make the smallest change that addresses the issue. Preserve saved card configuration and advanced YAML fields.
3. Update the README when configuration or user-visible behavior changes.
4. Use Conventional Commit titles, such as `fix: preserve card appearance when editing`.
5. Add a `.changes/<topic>.json` [release fragment](docs/release-workflow.md#release-notes), including `internal` for changes without a user-facing outcome.
6. Explain the outcome, link the issue, and report the checks you ran. Include phone/tablet/desktop and relevant theme screenshots for UI changes, using simulated devices.

Maintainers review the current commit and CI before merging. Browser simulations do not replace household-device, companion-app, and distribution checks in the [release checklist](docs/release-checklist.md).

## Code boundaries

This repository builds independently. Normalized models belong in `src/core.ts`; raw Home Assistant state and service translation belong in `src/providers/`. Cards own appearance and transient state. Home Assistant owns configuration, authentication, layout, and device state. Follow [AGENTS.md](AGENTS.md) for detailed implementation rules.

Keep credentials, household data, and private URLs out of issues, screenshots, and commits. Participation follows the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are covered by the repository's [AGPL-3.0-only license](LICENSE).
