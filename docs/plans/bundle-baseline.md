# Bundle measurements and topology decision

Measured 2026-10-20 from the current workspace with production esbuild minification,
ES2022, compacted Lit CSS, retained legal comments and gzip level 6 (Node's existing
default). These initial B01 measurements preceded feature implementation. Sizes use decimal
bytes. The original experiment rewrote editor registration at build time. The
current B02 implementation below uses actual source lazy imports. Neither set of
simulation results constitutes an accepted modular installation.

Reproduce with `node scripts/build.mjs --analyze`; the default `npm run build` still
emits the supported standalone `dist/navet-cards.js`. Every build emits
`dist/bundle-report.json`, with hashes, actual file sizes, source attribution,
version and measurement policy. The `--modular` flag emits the actual modular candidate and both esbuild
metafiles under `dist/bundle-analysis/`. The frozen initial measurements are in
[.changes/bundle-analysis.json](../../.changes/bundle-analysis.json).

| Scenario | Standalone raw/gzip | Modular raw/gzip | Requests |
| --- | --- | --- | --- |
| Initial view | 139,964 / 39,494 | 129,181 / 37,365 | 1 / 2 |
| Open room after view | no added JS | no added JS | 0 added |
| First edit, cumulative | 139,964 / 39,494 | 140,884 / 41,033 | 1 / 3 cumulative |
| Editor incremental | 98,403 | 24,907 | 2 |
| Installed suite | 139,964 / 39,494 | 140,884 / 41,033 | 1 / 3 files |

Modular numbers count the entry **and its static dependency closure**, including
shared Lit/config/runtime code exactly once. Gzip is the sum of independently
compressed actual files, matching independent HTTP responses. The closure gives
the module bytes loaded and potentially evaluated in each scenario. It is not a
CPU evaluation-duration measurement: most function bodies execute later, and
browser parse/compile strategies differ. Existing room code is eager in either
profile. Runtime timing/device acceptance remains Q02 work.

## Attribution and CSS correctness

Largest standalone contributions are styles (39,091 bytes), card presentation
(32,831), editor (11,477), HA provider (9,585), lit-html (7,115), config (6,794),
i18n (6,106), and reactive-element (5,893). Attribution is esbuild's contribution
to minified raw output; it is not additive gzip attribution. Framing and legal
comments explain the difference between contribution sums and file bytes.

The CSS transform now rejects missing or interpolated templates rather than
silently generating broken output; its existing minification targets remain
Chrome 111 and Safari 16. The experiment keeps the same transform, minification,
license-comment policy, version banner and dependencies. Splitting uses shared
chunks rather than duplicating Lit in entry and editor.

## Current measurement policy

At the user's request on 20 October 2026, all bundle size ceilings, working targets and size-based build failures are removed. Limits will be considered later. The historical filename [`scripts/bundle-budgets.json`](../../scripts/bundle-budgets.json) is retained for compatibility; its current content is report-only.

Standalone remains the supported production installation. The modular candidate defers editor, data, composition, rich content/styles and advanced controls, with every scenario's complete dependency closure measured. Raw size, independently compressed gzip, requests, baseline deltas and source contributions remain visible. Version, digest and safe-path validation still protect artifact correctness.

Earlier experimental allocations were superseded by this decision. The original resource measured 139,964 raw / 39,494 gzip bytes; later feature batches exceeded their interim size ceilings. Those failures prompted attribution and the actual optimizations below. A change to an interim ceiling was a scope allocation, not a byte saving. Superseded policy metadata is retained in historical evidence; it does not enforce or propose a current limit.

After composition, broader domains, momentary controls, calendar, reusable configurations and HA templates, the checked build reports:

| Scenario | Raw | Gzip | Runtime files / requests |
| --- | ---: | ---: | ---: |
| Standalone | 373,509 | 97,814 | 1 |
| Modular everyday view | 196,907 | 57,636 | 9 |
| Editor incremental | 98,403 | 24,907 | 2 |
| Rich content and stylesheet incremental | 14,894 | 4,498 | 1 |
| Visible data incremental | 5,277 | 2,448 | 2 |
| Sub-controls incremental | 7,918 | 2,961 | 1 |
| Chips incremental | 5,280 | 2,223 | 1 |
| Child-card host incremental | 6,407 | 2,638 | 2 |
| Calendar incremental | 14,308 | 5,802 | 2 |
| HA templates incremental | 4,860 | 2,107 | 1 |
| Advanced-controls pack incremental | 29,622 | 6,369 | 1 |
| Full installed modular suite | 374,797 | 107,814 | 20 |

The expanded scope grows initial, optional and installed costs. The complete dependency closure is reported separately from the installed suite; neither is a CPU or physical-client latency measurement. Child hosting shares one optional helper chunk with the editor, so first-use costs depend on what has already loaded.

## Measured loading and compression decisions

Rich content loads only for Info, Battery, UPS, Energy Now, Note and Photo.
Reading glyphs stay in a small independent module. Button cards have no rich
body and do not load the pack. A controlled same-source experiment measured
5,119 raw / 1,647 gzip bytes removed from the initial closure, with one additional
shared-module request. Deferred code remains included in installed-size accounting.

The rich-family stylesheet now follows the renderer. Its 9,290 minified CSS bytes
include the original responsive rules and later overrides in their original
order. Mixed person/media/entity/weather/lock rules and the narrow vacuum spacing
rule remain in the base stylesheet. The renderer exports its stylesheet and the
owning card adopts it per instance after base styles; the fallback appends only
the optional sheet after existing base styles. No global styles are changed.
A controlled experiment removed approximately 9,260 raw / 1,729 gzip bytes from
the initial path, while independent gzip compression increased installed size.
Computed-style and screenshot comparisons against the captured old full stylesheet
passed all 16 combinations of desktop/phone, four themes and compact/comfortable
layouts: no computed differences and byte-identical screenshots. History was held
constant in the simulated fixture to avoid unrelated data changes during capture.
A separate fallback check disabled constructed stylesheet adoption before loading
the cards; all six rich families retained base and optional styles with no computed
differences from the captured full stylesheet.

The initial grouping experiment combined six advanced controls in one optional transport pack: light color, thermostat
range, cover tilt, fan options, climate options and vacuum options. The same-source
experiment reduced installed gzip by 3,493 bytes and runtime files from 16 to 11.
At that comparison snapshot, the tradeoff was a first-use pack of 12,865 raw / 3,084 gzip bytes instead of one
small individual widget. Per-feature report aliases honestly charge the full
shared pack on first use; its complete transport cost is reported once. The pack now also includes media, comfort, remote, grouping and update controls; the current cost appears in the table above.

Editor, rich content, visible data and sub-controls scenarios each count the
initial closure plus their own static dependencies. Unrelated dynamic packs are
excluded from each scenario; the installed suite includes every emitted file.
All profiles, twelve named scenario measurements and baseline deltas are written to
`dist/bundle-report.json`; no size threshold fails the build. The frozen B01
baseline remains available for comparisons across later scope growth.

Shared chunks load relative to the entry, with every runtime file in
manifests/releases/previews and standalone fallback retained. Local simulation and
hashes do not establish household, HACS, deployment retention or disposable-HA
acceptance for modular installation.

## Focused verification

`node --test tests/bundle-report.test.mjs` covers static/dynamic dependency closures, shared imports, missing assets and actual byte/hash/gzip measurement. An oversized fixture deliberately exceeds the superseded limits and must build successfully while reporting all twelve measurements. It verifies that no allocation, target, headroom or pass/fail size metadata survives in the report. `npm run test:build` also verifies artifact integrity.

## Implemented B02 artifact and release lifecycle

The production default remains the standalone resource. A virtual standalone entry
imports the editor eagerly, preserving synchronous custom-element registration
for existing hosts. Source now loads the editor lazily through `getConfigElement`;
`node scripts/build.mjs --modular` also emits the opt-in candidate under
`dist/modular/`, with content-hashed chunks and `artifact-manifest.json`.
The standalone manifest is `dist/navet-cards.manifest.json`.

The manifests enumerate every runtime file, digest, byte count and static/dynamic
import. Validation rejects traversal, symlinks, missing/changed files, incorrect
versions, duplicate paths and unexpected files in isolated artifact snapshots.
`package-preview.mjs --modular` and `package-verification.mjs --modular` copy the
whole closure into separate candidate directories and an archive, keeping the
canonical standalone paths available. Verification checksum lists include every
runtime file and its manifest. Verification archives also include the room setup
guide and owning implementation plan. Local links to packaged documents stay
relative; source-only references become canonical GitHub links to the build commit.

The visible weather/history query module is also lazy now. Scenario reports count
first edit as the union of the initial closure and the editor's static closure,
excluding unrelated optional packs. Visible data and its incremental closure are
reported separately. Full installed size counts every runtime file; no current size limits or working targets are configured.

Standalone publication produces schema-2 release evidence binding the runtime and
manifest. It checks uploaded immutable payloads, then downloads the actual
resource, manifest and archive and verifies their bytes, version and correspondence
before completing publication. Source promotion verifies evidenced schema-2 asset
bytes as well. Existing schema-1 sources retain eligibility; recovery preserves
the legacy asset layout when its published evidence is schema 1. A schema-2 release
missing its manifest cannot downgrade to legacy evidence. No publication was run
as part of this implementation.

Five real Chromium tests load the actual modular build, create a native light card
and request its editor: direct resource, HACS-shaped prefix, reverse-proxy prefix,
missing editor chunk and an already-open tab across simulated entry replacement.
The failure test confirms explicit import rejection with existing controls still
usable. The old-tab fixture retains original hashed chunks in an in-memory asset
map. That proves the required retention behavior under simulation; it does not
prove any hosting system retains old assets.

A failed dynamic import can remain cached by the browser. Restoring files alone
is not promised to retry within the same document; reload after restoring the
matching complete artifact or use the standalone fallback. Automatic import retry,
fully installed modular resource registration, actual HACS multi-file delivery, real upgrade/rollback,
and deployed old-chunk retention remain unaccepted. Production release workflows
continue to publish standalone only.
