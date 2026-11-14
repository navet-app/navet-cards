# Navet Cards competitive audit

Implementation follow-up: [prioritized delivery plan and parallel work packages](../plans/2026-10-20-competitive-implementation-plan.md).

Audit date: **20 October 2026**. Decision: **Navet is a credible everyday-control beta, but is not yet a replacement for Bubble Card's dashboard-building platform.** The shortest competitive route is excellent room setup, compact household controls and reliable installation. Broad feature parity is a substantially larger undertaking.

## Scope and evidence

Audited Navet `0.1.0-beta.3`, checkout `746181623facd3d08085b77e0d5f0ec9d2b698da`. Remote `main` is `a145c37ccc49c3c2336d5db3c6fdab3c747ecaad`; both commits have tree `589240c046d7db0c917628dd73a7140ba7851ba9`. The apparent branch divergence is a squash merge, not a source difference. The worktree was clean before research.

Competitor baselines: **Bubble Card 3.4.2**, **Mushroom 5.2.3**, and **button-card 7.0.1 stable**, verified from official release pages. See the [competitor evidence and primary-source references](2026-10-20-competitor-evidence.md). Development-only features are excluded. These are established alternatives selected for distinct strengths; this audit does not establish installed-user market share.

Evidence labels used throughout:

- **Verified now:** inspected source, fresh local checks, screenshots, or a current GitHub response.
- **Recorded:** earlier verification documents or remote CI results, with their dates and scope retained.
- **Assessment/proposal:** our judgment or a suggested acceptance target, rather than a measured result.

This is an audit and roadmap, not feature implementation or release approval. Competitor behavior is documented behavior, not a new side-by-side runtime benchmark. Household devices, HACS and companion apps were not exercised. No historical memory claim is needed for the conclusions; the October 6 audit is used only as a dated comparison.

## Competitive position

| Alternative | Why someone chooses it | Navet's current position | What would make Navet competitive |
| --- | --- | --- | --- |
| Bubble Card | A coherent dashboard with navigation, rich compact controls and reusable customization | Everyday controls overlap; composition and extension depth lag | Make a complete room quicker to configure and easier to operate; add bounded composition |
| Mushroom | Consistent defaults and extensive visual configuration | Similar everyday purpose, but Navet still requires YAML for useful advanced options | Finish visual authoring and provide strong task presets |
| button-card | Programmable presentation and reusable configurations | Navet's bounded schema offers much less customization | Serve users who prefer maintained defaults; offer declarative reuse before executable extensions |
| Built-in Tile | Entity controls already available in HA | Generic entity control alone is insufficient differentiation | Demonstrate better room workflows, information hierarchy and task completion |

These are positioning assessments. Built-in Tile already supplies entity information, card/icon gestures, attributes and inline/bottom control features; basic controls are an existing baseline, not a unique product advantage. [HA Tile documentation](https://www.home-assistant.io/dashboards/tile/)

**Recommended promise to validate:** “Build a useful room dashboard quickly, with dependable controls for everyone at home.” Navet's room registry index and normalized command boundary support this direction. Neither low-power performance superiority nor easier setup has yet been established in a comparative user/device test.

## What has changed since the October 6 audit

The [older comparison](2026-10-06-bubble-card-comparison.md) examined seven Navet families against Bubble 3.0. Repeating its findings unchanged would misrepresent the current product.

| Earlier gap | Current source/evidence | Remaining boundary |
| --- | --- | --- |
| Area scans on every update | Shared weakly keyed registry index; current performance test passes | No physical low-power measurements |
| Closed rooms retain all controls | Member controls mount on open and release on close | No heap-retention or long-session certification |
| No navigation or sub-controls | Navigation card, room hashes, eight typed sub-controls and equality conditions | Not a general popup/composition framework |
| Raw area/entity setup | HA selectors and friendly area names | Grouped cards still use entity-ID text; advanced composition still needs YAML |
| Hidden climate slider | Visible temperature orb and step buttons | Physical scroll/drag and companion-app verification pending |
| Build-from-source installation | Compiled download instructions and a published Dev resource | No stable release or verified HACS installation/upgrade |
| Seven families | 26 registered families | Catalog breadth is not equivalent control depth or workflow completeness |
| Unconditional glass blur | Low effects default; blur only with high effects | GPU/client benefit has not been measured |

Sources: [card lifecycle and rendering](../../src/card.ts), [provider/index](../../src/providers/home-assistant.ts), [editor](../../src/editor.ts), [styles](../../src/styles.ts), [performance test](../../tests/browser/performance.spec.ts), [installation](../../README.md), [recorded status](../verification-status.md).

Bubble has also advanced: 3.3 introduced capability-aware picker recipes across 33 domains; 3.4 added HA/Jinja templates and additional popup behavior; 3.4.2 expanded entity-specific controls. Recipe/domain totals must not be compared with Navet's custom-element count. [Bubble 3.3](https://github.com/Clooos/Bubble-Card/releases/tag/v3.3.0), [3.4](https://github.com/Clooos/Bubble-Card/releases/tag/v3.4.0), [3.4.2](https://github.com/Clooos/Bubble-Card/releases/tag/v3.4.2)

## Workflow comparison with Bubble

“Present” means a bounded useful implementation exists in Navet; it does not mean identical behavior or live acceptance. “Partial” identifies a materially narrower workflow. “Absent” means no native Navet implementation was found. Native HA cards/actions may supply workarounds.

| User workflow | Bubble stable evidence | Navet implementation | Assessment |
| --- | --- | --- | --- |
| Toggle/dim everyday devices | Device recipes and slider controls | Capability-aware lights, switches, fans and helpers | Present; validate on household devices |
| Choose useful defaults for an entity | Capability-aware recipes, including module recipes | Picker suggestions mainly select a family and entity | Partial; family discovery is ahead of task setup |
| Open a room from navigation | Popup/navigation system | Hash-linked room dialog and local navigation links | Present for native rooms |
| Place arbitrary dashboard content inside a popup | Documented popup composition | Fixed member rows and direct controls | Absent; major substitution blocker |
| Keep navigation at hand on mobile | Horizontal stack and fixed-footer options | Wrapping in-flow text links | Partial; no equivalent persistent navigation |
| Operate multiple entities compactly | Rich sub-button variants/groups | Up to eight state/toggle/slider/select sub-controls | Partial; useful typed subset, less layout/control freedom |
| Show/hide controls from state | Template/condition system | One entity/state equality per sub-control | Partial; no compound comparisons or attribute conditions |
| Reuse behavior across many cards | Modules and global application | Warm/neutral/cool appearance presets and CSS tokens | Absent for reusable behavior/configuration |
| Compute names, icons or content | HA/Jinja and JavaScript customization | Literal configuration and normalized entity values | Absent natively |
| Customize visual structure | Styles, modules and layouts | Three layouts, per-card appearance and CSS variables | Partial; no comparable arbitrary style/layout contract |
| Adjust advanced light controls | Color-related slider modes | Brightness and supported Kelvin control; other color through HA details | Partial |
| Control a range thermostat or cover tilt | Low/high climate targets and tilt controls | One temperature target and cover position | Partial |
| Read a calendar from the same library | Calendar card and native event details | No calendar implementation | Absent |
| Operate security and less common domains | Alarm keypad and additional domain recipes | Lock card; arbitrary configured service actions | Partial; no alarm keypad/domain-specific UI |
| Make a familiar household dashboard | Extensive editor and localization | Visual basics, English/Swedish card strings, some English editor text | Partial; real household usability unverified |
| Install and receive updates | HACS/manual distribution | Manual download plus HACS manifest | Partial; HACS acceptance and stable release pending |

Bubble sources and version-specific details are in the [evidence note](2026-10-20-competitor-evidence.md): tagged control reference, releases 3.0, 3.3, 3.4 and 3.4.2. Navet evidence: [configuration schema](../../src/config.ts), [picker](../../src/index.ts), [editor](../../src/editor.ts), [models](../../src/core.ts), [card implementation](../../src/card.ts).

There is no defensible single “percent of Bubble” here: basic controls, popup composition and a community extension ecosystem have different costs and value. Navet is close enough for a narrowly scoped everyday room trial; it remains several major product capabilities away from being a general Bubble replacement.

## Audit findings, in priority order

### 1. Adoption and release confidence are the immediate bottleneck

**Verified:** GitHub currently exposes one Dev prerelease, published October 7; the latest stable release endpoint returns 404. Package beta naming is not proof of a published beta. The compiled-download path is now documented, which resolves the earlier build requirement. [Published releases](https://github.com/navet-app/navet-cards/releases)

**Recorded:** HACS clean installation, upgrades, rollback, companion apps and real household devices remain acceptance gates. A manifest is present; default HACS inclusion and successful custom-repository installation are separate claims. [Status](../verification-status.md), [release checklist](../release-checklist.md), [manifest](../../hacs.json)

**Impact:** A user cannot evaluate the design advantage if installation/update confidence is poor. **Priority: P0 for public competition.** Complete a selected candidate's manual and HACS lifecycle, state supported versions accurately, publish it only with maintainer authorization, and keep release evidence attached to that candidate.

### 2. The bundle has effectively no room to grow

**Verified fresh build:** 139,964 bytes raw and 39,494 bytes gzip. Enforced ceilings are 140,000/40,000, leaving **36 raw bytes and 506 gzip bytes**. The complete editor is eagerly imported by `src/index.ts`; all families ship together. Lit is the sole declared runtime dependency. [Build](../../scripts/build.mjs), [entrypoint](../../src/index.ts), [dependencies](../../package.json)

**Impact:** Even a small feature can fail the existing budget. **Priority: P0 before expansion.** Analyze the bundle and choose a measured strategy: reduce common code, load editor/optional capabilities separately if distribution permits, or explicitly revise the budget with justification. Preserve an independent build and installable resource contract. Do not quietly remove the limit or claim current size predicts runtime speed. The old audit's small-bundle measurements describe a much smaller feature set and cannot be reused as a current speed comparison.

### 3. Room composition is the largest Bubble replacement gap

**Verified:** A room can infer membership, show a summary and open lazy member controls. Its contents are generated rows; there is no child-card configuration, third-party Lovelace creation, or configurable panel sections. The dialog is capped at 460 px. [Room rendering and routing](../../src/card.ts), [dialog styles](../../src/styles.ts)

**Impact:** Users cannot move an existing room popup containing graphs, camera/calendar cards and other custom content into Navet without changing the workflow. **Priority: P1.** First add useful native room sections and curated content; then evaluate opt-in child cards with explicit `hass`, sizing, error, focus and disposal contracts. Preserve lazy mounting. Do not promise third-party compatibility until tested with actual cards and HA dialogs.

### 4. The visual editor does not yet author the whole useful product

**Verified:** Grouped Info/Battery/UPS/Energy/Media Stack selection uses an entity-ID textarea. Photo has single-image and description fields but no gallery-list editor. Conditional sub-control visibility and custom actions are explicitly delegated to YAML. Appearance is mostly text/select fields rather than visual previews. The editor preserves advanced fields, which is a strength, but preserving configuration differs from authoring it. [Editor](../../src/editor.ts), [schema](../../src/config.ts)

**Impact:** A newcomer reaches YAML while building otherwise ordinary compositions. **Priority: P1.** Add native multi-entity selection, gallery editing, sub-control conditions/actions and an understandable appearance preview. Include ordering and validation. Make “set up one useful room without YAML” an observed task, not a marketing assertion.

Mushroom explicitly emphasizes visual editing and provides mature light/chips/template workflows. It is the appropriate ease-of-use comparator. [Mushroom evidence](2026-10-20-competitor-evidence.md#mushroom-the-low-friction-baseline)

### 5. Card suggestions do not yet reduce enough setup work

**Verified:** `getEntitySuggestion` generally supplies `{entity}` or `{entities:[id]}`. Room stubs choose the first three lights rather than an area recipe. There is no saved room recipe or shared semantic preset. [Picker and stubs](../../src/index.ts), [stub implementation](../../src/card.ts)

**Impact:** Users still choose and arrange the pieces manually. **Priority: P1 and an opportunity to differentiate.** Offer capability-aware, editable room recipes: lights + temperature + occupancy; heating; speaker; entry/security. Let users preview explicit membership and excluded devices. Avoid silently converting every registry entity into a visible control. Track setup time, corrections and fallback to YAML against Mushroom/Bubble on the same household task.

### 6. Reuse is much narrower than the appearance labels suggest

**Verified:** Warm/neutral/cool presets choose accents; they do not define reusable card behavior or inherited configuration. Conditions are single state-equality tests. No named config templates, shared recipe application, Jinja evaluation, module loader or extension store was found. [Schema](../../src/config.ts), [appearance/conditions](../../src/card.ts)

**Impact:** A user maintaining many similar rooms repeats configuration and edits. **Priority: P1 for declarative reuse, P3 for arbitrary executable extensions.** Introduce versioned named recipes with explicit local overrides and known entity dependencies. Define migration/rollback semantics. Bubble's module system and button-card's inherited templates are real maintenance capabilities; reproducing a store adds a separate compatibility and support obligation. [Bubble 3.0 modules](https://github.com/Clooos/Bubble-Card/releases/tag/v3.0.0), [button-card templates](https://custom-cards.github.io/button-card/stable/advanced/config-templates/)

### 7. Device breadth hides control-depth gaps

**Verified:** The normalized command set has no RGB/HS color selection, climate low/high range targets, cover tilt, fan oscillation/direction/preset selection, media seek, or alarm-specific commands. Some of these tasks can be configured as service actions or opened in native details. That is a fallback, not equivalent on-card control. [Models/commands](../../src/core.ts), [capability mapping and translation](../../src/providers/home-assistant.ts)

**Impact:** A replacement looks complete in the picker but sends users elsewhere for frequent tasks. **Priority: P1/P2 by household demand.** Implement light color, climate ranges and cover tilt first if target homes use them; each needs capability-specific models, service contracts and real-device evidence. Keep an explicit device/task coverage table. Generic service actions should remain available without becoming the substitute for all product design.

### 8. Data cards need a stronger shared request lifecycle

**Verified:** Weather and Energy Now fetch via the injected HA host. Each card throttles itself for five minutes and ignores obsolete responses by generation. There is no shared in-flight cache or visibility gate. Requests are not aborted; history is downsampled after receipt, so the response/work is not bounded by the rendered point count. Refresh is driven by host assignments rather than a guaranteed visible-card schedule. Errors clear data into the same general empty presentation. [Data fetching](../../src/providers/card-data.ts), [refresh lifecycle](../../src/card.ts)

**Impact:** Duplicate cards can duplicate requests; unavailable history and genuine empty data are hard to distinguish. This is a source-level scaling/diagnostic risk, not a measured network incident. **Priority: P2 before general history/calendar/camera expansion.** Use a host-scoped request/cache boundary, define freshness/retry behavior and distinguish loading, permission, transport, unsupported and empty outcomes. Test generation changes, reconnects and duplicate requests. Do not turn a small energy chart into a promise of full HA Energy functionality.

### 9. Runtime foundations are good; comparative performance is unproven

**Verified now:** The synthetic 20-room/5,000-registry-entry test passes: one shared registry scan, no unrelated renders, zero closed member controls, release after 100 open/close cycles, and setter-batch P95 below 5 ms. Other browser checks cover unrelated entity updates and 30 isolated instances. [Performance test](../../tests/browser/performance.spec.ts), [browser suite](../../tests/browser/cards.spec.ts)

**Limit:** This measures a desktop synthetic update path, not scroll/GPU cost, retained heap, cold load, battery use or low-power touch latency. Bubble was not run in the same workload. Its 3.4.2 release includes a reconnect-retention fix, illustrating why long-running lifecycle tests matter for both projects. [Bubble 3.4.2](https://github.com/Clooos/Bubble-Card/releases/tag/v3.4.2)

**Priority: P1 for evidence.** Run equivalent-task dashboards on named phone/tablet/kiosk clients, including artwork and effects, service failures, reconnects and repeated navigation. Separate frontend feedback from HA/backend latency. Do not advertise “faster than Bubble” until those measurements exist.

### 10. Visual consistency is promising; density and touch need evaluation

**Verified visual inspection:** Fresh dark desktop and light phone catalog screenshots show coherent family geometry and useful distinctions for weather, locks, media and readings. Sparse Action/Scene/Script cards devote much of their area to empty space. Generic labels such as “Widget” and “Entity” consume hierarchy without always helping the household task. The phone catalog becomes a long sequence of medium cards. These are design observations, not automated failures. [Screenshots generated by catalog checks](../../tests/browser/catalog.spec.ts)

**Verified source:** Base action buttons are commonly 36 px and range inputs 22 px high, with family-specific overrides. Much label text is 11–12 px. Keyboard/focus behavior has automated coverage. No screen-reader audit, contrast certification or physical touch result is established. [Styles](../../src/styles.ts)

**Priority: P1/P2.** Review a real room dashboard rather than only a catalog. Test comfortable target sizes, a compact action strip/chip composition, long names, localization, large text and physical scrolling. Measure accidental commands and discoverability of the orb/disclosures. Retain a useful density choice instead of making every card larger.

### 11. Localization is both a configuration and state-formatting gap

**Verified:** Card strings cover English/Swedish with English fallback, while several editor labels remain literal English. `formatEntityState` exists on the host interface but is not used by `mapEntity`; plain state text and a small dictionary cannot represent all HA device-class/localized states or number formats. Some other formatting uses browser defaults rather than HA locale. [Strings](../../src/i18n.ts), [provider](../../src/providers/home-assistant.ts), [editor](../../src/editor.ts), [chart labels](../../src/custom-content.ts)

**Priority: P2.** Use HA state/locale formatting at the provider boundary and localize all exposed editor labels. Verify binary sensor classes, Swedish/English, decimal separators and Fahrenheit. Add languages based on contributors and target users; do not compete through translation-count marketing alone.

### 12. Architecture supports expansion, but one class carries too many concerns

**Verified:** Provider-neutral entities and commands, capability checks, per-card configuration, scoped styles and cleanup are sound foundations. Service targets are checked against owning entities and YAML is cloned/preserved. However, the 718-line `NavetCard` owns host lifecycle, data requests, gestures, navigation, notes, galleries, room dialogs and nearly every family renderer; CSS and editor logic likewise span the catalog. [Core](../../src/core.ts), [card](../../src/card.ts), [editor](../../src/editor.ts)

**Impact:** Adding composition plus templates plus more data sources to that class increases cross-family regression risk. **Priority: P1 alongside the next feature, not a broad rewrite.** Extract a data coordinator when adding history/calendar, a room-content lifecycle when adding composition, and capability-specific controls when adding advanced commands. Keep the public configuration stable. Do not create neighboring-checkout runtime dependencies.

## Delivery roadmap and acceptance

These are proposed milestones, not calendar estimates or approved implementation scope. Each should produce independently useful behavior.

| Milestone | Concrete deliverable | Exit evidence | Effort character |
| --- | --- | --- | --- |
| 0. A trustworthy trial | Bundle plan; selected candidate; clear known limits; manual/HACS install, upgrade and rollback | Candidate digest/version, HA/browser/app versions, completed applicable release gates | Bounded engineering plus maintainer/device dependency |
| 1. A room without YAML | Capability-aware room recipes; complete grouped/gallery/sub-control editor; useful dense actions/navigation | Observe the same room setup task against alternatives; no required YAML for advertised recipe | Several focused product/editor slices |
| 2. A room people can operate | Priority device-depth controls; touch/keyboard/locale refinements; recoverable data states | Real capabilities/services, physical touch and companion apps; equivalent-task performance traces | Medium capability and verification program |
| 3. A dashboard worth switching to | Lazy configurable room sections; carefully scoped child cards; reusable declarative recipes | Mixed-card coexistence, focus/back navigation, migrations and lifecycle checks | Large architecture and compatibility work |
| 4. Optional ecosystem | Versioned external extension contract and distribution policy, only if demand supports it | Compatibility policy, teardown/update/migration behavior and support capacity | Ongoing platform investment |

**Recommended order:** complete milestone 0 and the first useful milestone 1 room recipe before adding more decorative families. Then choose milestone 2 controls using target-household tasks. Arbitrary template execution, a module marketplace, camera streaming, maps, RSS and backend-owned features should not delay the initial competitive trial.

Suggested task benchmark, using the same entities, HA version and screen size for each library:

1. Install a resource, find the card and create a kitchen room with a light, motion sensor, temperature and speaker.
2. Add one conditional secondary control, reuse that configuration for a second room, and change a shared appearance choice.
3. From a phone, find the room, adjust brightness/heating, change the speaker source, recover from a rejected command and return to the previous view.
4. Edit entity membership, reload, upgrade and roll back the selected release.

Record elapsed setup time, configuration corrections, YAML visits, steps/taps per task, accidental commands, recovery success, and participant preference. For runtime, record warm/cold load, frontend feedback P50/P95, long tasks, dropped frames and retained heap across navigation/reconnect cycles. Choose numeric acceptance budgets from named target clients; no measured superiority is claimed here.

## Verification and remote delivery state

Verified during this audit:

- TypeScript passes; **26 contract/data tests**, **5 release tests**, and **46 Chromium browser tests** pass.
- `npm run check` passed its type/unit/release/build stages; browser startup first hit sandbox loopback `EPERM`. The affected browser stage then passed with authorized loopback, installed Chrome and port 4189. Node was 24.15.0; repository CI uses Node 22. No blanket claim of an unchanged CI environment is made.
- Build is **139,964 raw / 39,494 gzip bytes**. Inspected fresh `phone.png`, `catalog-390-light.png` and `catalog-1280-dark.png`; generated screenshots remain local test artifacts.
- [PR #5](https://github.com/navet-app/navet-cards/pull/5) is merged, its head matches the audited checkout, and required check names are `validate`, `live-ha (2024.6.4)` and `live-ha (2026.9.4)`. Reported runs on that PR succeeded October 7. There are no inline review threads or conversation comments in the queried result.
- The checked PR head has no GitHub deployment records or posted preview links. Its [CI run](https://github.com/navet-app/navet-cards/actions/runs/37673107504) lists unexpired preview and verification artifacts. This audit used fresh local rendering; it did not inspect a hosted PR preview or download the old artifacts.
- Fresh live HA containers were not run. Prior two-version backend/rendered evidence remains recorded evidence; the CI version matrix is not proof of compatibility with every newer HA release. Household acceptance and HACS remain pending.

No runtime behavior changed, and no release was published. This audit makes the next work reviewable; it does not claim release readiness.
