# Implementation status

The development collection uses native Lit custom elements with isolated Shadow DOM styles. Source, builds, configuration, tests, and distribution tooling live in this independent repository.

Provider-neutral card models and an injected HA adapter live locally. Light command semantics follow Navet's `homeassistant-adapter.ts`; visual geometry follows Navet's compact card family and surface tokens. Shared extraction requires a versioned package with its own API and parity checks.

## Completed development scope

- Native custom-element host, picker registration, configuration validation, visual editor, and YAML preservation.
- Entity cards for humidifier, water heater, remote, update, light, switch, sensor, room, media, climate, cover, number, select, fan, lock, vacuum, person, weather, scene, script, generic entity, and navigation, plus Calendar and Composition.
- Custom Info, Note, Photo, Action, Battery, UPS, Energy Now, and Media Stack cards. Grouped readings consume explicit entity lists; notes open a dialog and persist through text helpers, Photo supports galleries, and Media Stack uses the selected player’s speaker composition.
- Daily weather forecasts and 24-hour energy history use host APIs behind normalized provider-boundary models.
- Shared visibility-aware forecast/history coordination deduplicates requests, pauses hidden work, preserves stale data on failure and reports loading/empty/unsupported/denied/offline/error separately. Freshness is 30 minutes for forecasts and five minutes for history.
- Independent configuration/themes, state-reference update filtering, read-only previews, subscription cleanup, and injected service APIs.
- Service-only primary-surface press/repeat/release actions with serialized cleanup and a per-card temporary accidental-action guard.
- Local named configuration inheritance, typed scalar variables, scoped Navet child reuse and visual import/export/materialization.
- Visibility-managed HA/Jinja subscriptions for display name/state/icon/picture/color/visibility, safe fallbacks and inert previews.
- Dedicated multi-calendar agenda with HA timezone windows, all-day handling, filters, partial errors and read-only event details.
- Shared HA more-info, local navigation and service execution, native Assist bridge, standard custom DOM events, ordered nested action sequences with cancellation, independent title/icon tap/hold/double-tap gestures, optional confirmation and recoverable command errors.
- Compact/comfortable/row composition, dark/light/black/glass appearances, CSS variables, keyboard controls, reduced motion, English and Swedish card strings.
- Shared room area/device index, explicit membership, lazy direct room controls, hash-linked panels and native HA entity details.
- Opt-in `config_version: 2` room planning and visual authoring: live/explicit membership, include/exclude, stable member/section IDs, recipes, role/control overrides, ordered sections, actual read-only card preview, save/cancel and snapshot import/export/remapping. Unversioned rooms retain their precedence and flat presentation.
- Typed grouped sub-controls, including an independent Sub-controls card; entity/action/weather/navigation Chips with separator/spacer entries, declarative visibility conditions, appearance presets and low/high effects.
- Scoped popup coordination, trigger dismissal/rearming, timeouts, header swipe, size options and active inline/sticky/fixed navigation.
- Lazy HA-helper child-card host and visual composition editor with active-only room mounting, per-child failures/retry, copied opaque configurations and inert previews; native and third-party acceptance remains separate.
- HA-owned visual selectors with standalone fallbacks; ordered grouped-entity lists, visual gallery editing, scalar visibility conditions, service targets/data/confirmation and room navigation links. Combined conditions and advanced service data use JSON; unknown fields survive editing.
- Capability-aware light hue/saturation and advertised effects, with provider-owned conversion and bounded Kelvin behavior. Color widgets are deferred until needed.
- Climate target-range and cover-tilt widgets: atomic low/high target application, native units/limits/step, separate standalone dialogs and inline room/row controls. Unknown tilt position disables its slider while advertised tilt actions remain available.
- Standalone resource plus complete modular candidate, artifact manifests/checksums, dependency lockfile, attributed bundle measurements, CI, HACS metadata, release workflow and manual installation documentation.

This section describes the unpublished working tree as of 2026-10-20, not an existing release's installation or live acceptance. Room/advanced editor field labels still include English-only fields; comfort, remote and grouping widgets and existing card strings support English and Swedish, with English fallback. Update controls currently use English field labels. Media controls include supported seek/repeat/shuffle/power and explicit grouping; progress uses reported values without extrapolation. Climate single-target controls retain their orb and HVAC mode; range-only devices use low/high targets instead. Covers retain movement/position alongside supported tilt. Number limits and select options remain provider-owned. Native HA details provide other device settings. See [room setup](room-setup.md) for the supported visual journey and limits.

## Validation boundaries

Contract tests exercise validation, normalized capability state, explicit provider ownership, area resolution, command translation, and errors. Browser tests exercise actual custom elements in a simulated host, including lifecycle, gestures, visual editing, layout, and a 30-card dashboard. TypeScript and the bundled artifact are checked separately.

Current development tests also cover room draft/legacy round trips, registry membership, a complete parent-editor kitchen journey, safe preview, snapshot/remapping, gallery editing and phone-width overflow. Advanced-control and artifact tests must pass for the integrated candidate; source implementation alone does not establish their browser or live acceptance.

Isolated Home Assistant 2024.6.4 and 2026.9.4 checks exercise real backend services, area registries, household-member access, and read-only service denial using demo entities. Rendered Home Assistant checks cover Sections/Masonry, native details, the visual editor, saved configuration, responsive sizing, and versioned resource loading. See the [verification status](verification-status.md) for the scope of evidence.

Pinned Bubble/Mushroom/button-card child coexistence passed bounded actual-HA desktop/phone checks; see the [progress ledger](plans/implementation-progress.md) for candidate identities and limits. Household devices, broader competitor behavior, companion-app WebViews and public HACS installation/upgrade remain acceptance gates. The beta resource and [human verification guide](human-verification.md) are prepared for that evaluation.

## Next increments and evaluation

Follow the [competitive implementation plan](plans/2026-10-20-competitive-implementation-plan.md) for prioritized scope, module interfaces, work packages, dependencies and acceptance. Bundle attribution, versioned room planning and the first complete visual room journey now exist in development. Complete their candidate-specific integration/live gates while continuing ready packages for device depth, composition, data, reusable configuration and extensions. The plan records intended coverage; only implemented subsets and recorded checks establish progress.

Household and distribution acceptance continue through the [human verification guide](human-verification.md) and [release checklist](release-checklist.md). Camera streaming requires a separate authenticated resource lifecycle; backend-owned features such as chores require a durable backend interface and remain outside this card-library parity plan.

## Source references

- [Home Assistant custom-card API](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/)
- [Home Assistant frontend state and contexts](https://developers.home-assistant.io/docs/frontend/data/)
- [Home Assistant dashboard actions](https://www.home-assistant.io/dashboards/actions/)
- [HACS Dashboard repository requirements](https://www.hacs.xyz/docs/publish/plugin/)
- [Bubble Card implementation](https://github.com/Clooos/Bubble-Card/blob/main/src/bubble-card.js)
- [Navet](https://github.com/navet-app/navet), source audited at `2c3ad628`.
