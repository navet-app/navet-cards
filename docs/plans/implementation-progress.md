# Competitive implementation progress

Updated 20 October 2026. This records integrated work against the [complete plan](2026-10-20-competitive-implementation-plan.md). A delivered slice does not mean the entire package or competitor parity is complete.

## Integrated behavior

| Packages | Delivered | Remaining scope or acceptance |
| --- | --- | --- |
| B01/B02 | Bundle measurement reports, standalone plus modular candidate, complete hashed asset manifests, packaging/release integrity, lazy editor/data/composition/content/styles and one shared advanced-controls pack | Modular HACS installation, deployed upgrade/rollback and companion-device acceptance before changing the supported default |
| B03 | Versioned configuration, structured diagnostics, cloned validation and lossless nested drafts | Continue migration fixtures with later schemas |
| R01–R04/E03 | Visual area/live or explicit/snapshot room setup, include/exclude, recipes, ordered members/sections, supported controls, preview/save/reopen, snapshot import/export and remapping | First-time-user timing, household acceptance and richer recipes |
| E01/E02 | Ordered pickers, icon/color/gallery/action fields, typed attribute equality, state/numeric/availability/composite conditions, conditional secondary actions, advanced-field preservation | Remaining catalog fields and comprehensive localization |
| C01 slice | Standalone and grouped sub-controls, top/bottom placement, icon/name/state/attribute/unit overrides, read-only behavior, tap/hold/double gestures, ordered visual editing; collapsed groups unmount controls | Hold-to-slide and richer control variants |
| C02 slice | Dedicated Chips card with entity/current-weather/action/navigation chips, exact active navigation, title/subtitle, 44 px minimum targets, wrapping, conditions, separators/spacers and visual authoring | Programmable template chips, native HA badges and further layout primitives |
| C03 slice | Scoped/unique popup ownership, browser back/deep links, state-trigger dismissal/rearm, stable timeout, sizes, header swipe, foreground/reconnect cleanup, active inline/sticky/fixed navigation | Broader mobile/custom-style options, automatic sidebar-layout coordination and physical-client acceptance |
| C04 slice | Lazy native/installed-custom child host, visual picker/editor/order, copied opaque configuration, per-child failure/retry, active-only lifecycle, sizing, inert preview; actual native HA Tile/history/calendar frontend checks and pinned Bubble 3.4.2/Mushroom 5.2.3/button-card 7.0.1 child coexistence | Broader third-party behavior, competitor service actions, Bubble global popup behavior and physical devices |
| A01/A02 slices | Shared actions, confirmations, separate icon gestures, HTTP(S)/back/replace, native Assist bridge, standard custom events, visually authored nested sequences with error rules and explicit/lifecycle cancellation, serialized service-only press/repeat/release and temporary per-card protection | PIN protection, feedback/haptics, actual Assist pipeline/microphone/companion acceptance |
| D01 slice | Advertised HS/RGB light color, effects and existing bounded color temperature | Remaining color-mode combinations, derived styling and physical lights |
| D02 | Atomic dual setpoints; independently supported cover tilt; advertised climate preset/fan/swing/horizontal-swing options | Broader hardware combinations and physical-device acceptance |
| D03 slices | Fan presets/oscillation/direction, vacuum fan speed, media seek/repeat/shuffle/power and explicit grouping; dedicated remote power/activity controls; controls stay contained in native dialogs and room/row layouts | Time extrapolation, remote command palettes, remaining transport variants, physical devices and actual grouping/activity backend acceptance |
| D04 slice | Dedicated humidifier and water-heater cards, supported targets/modes/away/power, native room/row/sub-control integration; real demo-backend round trips on both tested HA versions | Protected alarm/lock and transient-code flows, hardware/permission combinations |
| D05 slice | Dedicated update card, installed/latest/skipped versions and reported progress, safe literal release summary/link, explicit confirmed latest installation with current-version guard, skip/clear | Ordered generic attributes/timestamps, checked remaining domain recipes, backup/specific-version installation and physical update acceptance |
| H01 | Shared forecast/history work, freshness/retry states, visibility cleanup, stale-response protection and transport isolation | Broader data presentation and physical-client soak evidence |
| H02 slice | Dedicated visual multi-calendar agenda, HA timezone windows, all-day handling, filtering, partial errors, lifecycle-managed reads and read-only details; current actual-HA frontend checks | Minimum-version agenda runtime, additional calendar providers and physical-client acceptance |
| T01 slice | Local named definitions, ordered inheritance, typed scalar variables, stable-ID control merges, visual import/export/materialization, scoped Navet children and foreign-config preservation | Wider recipe catalog, individual inherited-member deletion and dashboard-global reuse |
| T02 slice | HA/Jinja subscriptions for display name/state/icon/picture/color/visibility, variables, safe fallbacks/retry, hidden/disconnect cleanup and inert preview; current backend/frontend proof | Minimum-version template runtime, programmable layouts/actions, template chips and broader acceptance |
| Q01–Q03 slices | Existing performance gates, 100 room cycles, targeted keyboard/phone layouts, EN/SV comfort/remote/grouping controls, tested control contrast across opposite host/card themes, stylesheet equivalence, real HA frontend and demo-backend checks | Full localization/accessibility, current release-time stable, HACS, coexistence, companion apps and named older clients |

## Bundle accounting

Bundle size ceilings have been removed at the user's request and will be considered later. `scripts/bundle-budgets.json` is a report-only measurement policy. Builds retain raw/gzip sizes, static/dynamic dependency closures, baseline deltas and source attribution, with no target or size-based failure. [Bundle measurements and topology decisions](bundle-baseline.md) records the measured optimizations and superseded allocation history.

| Final profile | Raw bytes | Gzip bytes | Runtime files |
| --- | ---: | ---: | ---: |
| Standalone | 373,301 | 97,743 | 1 |
| Modular initial static closure | 196,699 | 57,568 | 9 |
| Complete modular installation | 374,589 | 107,749 | 20 |
| Editor incremental | 98,403 | 24,909 | 2 |
| Child-card host incremental | 6,407 | 2,643 | 2 |
| Chips incremental | 5,280 | 2,222 | 1 |
| Calendar incremental | 14,308 | 5,802 | 2 |
| HA templates incremental | 4,860 | 2,107 | 1 |
| Shared advanced controls incremental | 29,622 | 6,369 | 1 |

Initial, optional and installed costs have grown with composition, provider domains and actions. All twelve named measurements remain visible, including full installed and standalone sizes. No size-based failure or new ceiling has been introduced.

Controlled same-source comparisons saved 5,119 initial raw bytes by deferring rich rendering and about 9,260 more by deferring its stylesheet. Grouping advanced controls saved 3,493 installed gzip bytes at that comparison snapshot. The first advanced control now loads the complete shared pack; per-feature aliases report that full cost. Sixteen style comparisons across widths, themes and layouts produced identical screenshots and no computed-style differences; fallback stylesheet adoption also passed. These are byte/layout measurements, not physical-client timing claims.

## Verification and known limits

The final integrated `npm run check` passes TypeScript, **180 unit/provider tests**, **eight release tests**, **eight build/manifest tests**, **168 Chromium browser scenarios**. The 168-scenario Chromium run took 17.1 seconds on the development host; this is suite duration, not interaction latency. It includes an in-flight-command focus regression. The CI follow-up defers options-dialog focus restoration until its opener is rendered and enabled, and explicitly enables the audited seek exception for the pinned demo matrix. This does not establish real seek acceptance. Both pinned HA CI jobs now pass. The remaining native-select keyboard tests were reproduced in Playwright 1.63.0 on Linux: the committed tests produced the same two focus failures; committing typeahead with Tab before Escape passed all seven affected cases on the unchanged runtime (3.5 seconds), and those seven cases also passed on macOS (3.2 seconds). Enter opens the Linux native select menu, which consumes Escape; the tests now assert dialog removal before focus restoration. Real bugs found and fixed include deferred-content reconnect, post-hold extra taps, cancelled sliders, duplicate error announcements and clipped narrow controls, popup preview history changes, native-details traversal ordering, missing child-only state updates, inconsistent light media-dialog tokens and an overlay blocking sequence cancellation.

[Climate/vacuum backend validation](device-options-validation.md) records actual advertised service/state round trips on HA 2026.9.4 and minimum 2024.6.4. Horizontal swing was exercised on 2026.9.4 and explicitly skipped on the minimum. [Media validation](media-validation.md) records repeat, shuffle and paired power round trips on both versions. Both demo backends reject advertised seek with `NotImplementedError`; strict seek validation still fails and the explicit version-limited test exception does not establish seek acceptance.

[Native composition evidence](composition-host-validation.md) identifies the frozen C03/C04 batch hashes: actual HA 2024.6.4 and 2026.9.4 each passed standalone desktop and modular phone contexts for native Tile/history/calendar children, contained missing custom cards, actual native picker/editor, copied config round trips and preview guards. All four contexts had zero service calls/page errors. This evidence belongs to that frozen earlier candidate; it does not silently validate later action/update/locale source changes. [Earlier room/sub-control/chips frontend evidence](composition-frontend-validation.md) retains its own candidate identity.

[Comfort/remote backend evidence](comfort-remote-validation.md) records eight capabilities exercised on HA 2026.9.4 and seven on 2024.6.4, with original reported values restored. Remote activity was explicitly skipped because it was not advertised; the minimum demo had no remotes. [Grouping](media-group-validation.md), [updates](update-controls-validation.md) and [action sequences](action-sequences-validation.md) record their provider/browser proofs and remaining live acceptance. No live firmware installation or reboot was attempted. The dedicated minimum host was returned to its stopped state; the pre-existing 2026.9.4 Compose host remains running.

[Pinned competitor evidence](competitor-child-validation.md) records the final integrated runtime on both HA versions, standalone desktop and modular phone: four contexts passed with zero service calls/page errors. [Calendar and interaction frontend evidence](calendar-interaction-frontend-validation.md), [reusable configuration evidence](recipes-validation.md) and [HA template evidence](template-validation.md) record their own candidate identities, backend/frontend scope and remaining limits. Native checks do not establish household or distribution acceptance.

A verification agent accidentally printed disposable localhost test credentials into tool output. No credentials were written into repository reports or test logs; an in-memory exact-match scan checked source/document/report files and the relevant live logs. The test accounts were not rotated or removed.

Household hardware, companion apps, actual HACS install/update/rollback and maintainer release acceptance remain unverified. No release publication is authorized. Commit/push status does not change these acceptance boundaries; candidate identities and evidence scopes above remain authoritative.

## Next ready work

The [remaining execution sequence](2026-10-20-competitive-implementation-plan.md#remaining-execution-sequence-from-this-checkpoint) groups the next bounded parallel batches. Estimated remaining implementation effort is 35–45%; this is a scope estimate, with release/device acceptance tracked separately.

1. D04 protected alarm/lock and transient-code flows, building on the new accidental-action guard.
2. C01 hold-to-slide, C02 native badges and further composition/mobile acceptance.
3. D01 remaining light color modes; D03 progress extrapolation/remote command recipes; D05 ordered attributes/timestamps and remaining domain recipes.
4. H03 richer weather/history presentation and wider calendar acceptance.
5. Extend T01/T02 where evidence exposes gaps, then T03/T04 programmable layout/actions and M6 extensions under the original dependency graph.

M5 now has initial reusable-configuration and HA display-template implementations; programmable layout/actions and M6 extensions remain planned. General Bubble Card replacement, button-card programming parity and ecosystem claims remain premature.
