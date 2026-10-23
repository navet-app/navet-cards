# Navet Cards audit against Bubble Card 3.0

Historical baseline. For the current catalog and Bubble 3.4.2 comparison, see the [October 20 competitive audit](2026-10-20-navet-cards-competitive-audit.md).

Audit date: 2026-10-06. Navet Cards: `0.1.0-beta.2`, commit `c12ba818eab2b4a2ff65c37c2f77fa46e23c5c9e`. Comparison: Bubble Card **v3.0.0**, commit `6dc07eb504d9f9f26c48ec58a0c0ef0e514e40f5`.

## Decision

Navet Cards is a small, useful device-card beta, but it does not yet offer Bubble Card's dashboard composition, customization, or installation experience. Its strongest opportunity is a room-first collection with compact controls, lazy detail panels, straightforward visual configuration, and measured performance on inexpensive household displays.

Keep the independent Lit implementation and provider boundary. Build the useful composition primitives before expanding the catalog or adding a module marketplace. Feature additions should pass explicit update, DOM, interaction, and lifecycle budgets.

This audit recommends work; it does not implement features, publish a release, or establish physical-device acceptance.

## Capability comparison

Bubble capabilities below are grounded in the [v3.0.0 README](https://github.com/Clooos/Bubble-Card/blob/v3.0.0/README.md) and [release notes](https://github.com/Clooos/Bubble-Card/releases/tag/v3.0.0). Later 3.x additions are excluded from the parity baseline.

| User task | Bubble Card 3.0.0 | Navet Cards at audited head | Recommended response |
| --- | --- | --- | --- |
| Everyday devices | Button variants, media, cover, climate, select | Seven families: light, switch, sensor, room, media, climate, cover | Preserve current coverage; deepen controls before counting more card types |
| Compact mixed controls | Configurable sub-buttons with separate entities, state/attributes, actions and dropdowns | Fixed family actions; room shows four member shortcuts to HA details | Add typed, configurable sub-controls with explicit entity dependencies |
| Room detail panels | Hash-linked pop-ups containing dashboard cards; trigger, close and layout options | Per-room native dialog containing entity rows that open HA details | Add lazy room detail content and explicit opener/close behavior |
| Dashboard navigation | Horizontal buttons stack linked to pop-ups | Local-path action; no navigation card; hash-only navigation rejected | Add a compact navigation primitive and deliberate panel routing |
| Reusable appearance/features | CSS variables, styles, JavaScript templates, Modules and Module Store | CSS variables plus per-card accent, radius and five themes | Start with declarative presets and typed conditions; evaluate extension API later |
| Numeric helpers | Slider button includes input_number with configurable limits/steps | Brightness, volume, cover position and temperature only | Add normalized numeric helper controls after shared slider ergonomics |
| Select/calendar | Dedicated select and calendar cards | Missing | Select is a smaller next addition; calendar should load on demand |
| Advanced device controls | Richer media/climate/select and configurable sub-buttons | Playback/volume, single target temperature, cover open/stop/close/position; advanced details delegated to HA | Prioritize HVAC mode, media skip/mute/source and supported light color/temperature where household tasks justify them |
| Composition spacing | Separator and empty-column types | HA owns arrangement; no collection-specific separator | Use native HA composition where it works; add only meaningful Navet primitives |
| Visual setup | Extensive integrated editor including modules and popup creation aids | Basic fields and datalist; room area ID and entity list entered as text | Native HA area/entity/action selectors, friendly labels and room presets |
| Installation | Documented HACS install and direct resource download | README requires clone/build/copy; HACS clean install/upgrade remains an acceptance gate | Publish authorized prebuilt releases and validate HACS install/update/rollback |

Navet already registers entity suggestions for its supported domains (`src/index.ts`). These generate basic card configurations; do not confuse that with an extensive capability-specific preset system. Do not attribute later Bubble 3.x suggestion features to 3.0.0.

## Verified strengths

- Single local bundle; Lit is the only declared runtime dependency. No neighboring Navet React dependency or runtime CDN requirement.
- Single-entity cards filter HA assignments by relevant state references. Synthetic unrelated updates caused zero renders.
- Provider mapping and service translation live in `src/providers/home-assistant.ts`; presentation consumes normalized models.
- Commands check capabilities and availability; backend permission failures have a normalized explanation.
- Slider commands are submitted on change rather than every input event.
- Disconnect cleans up subscription and gesture timers; advanced YAML fields survive visual editing.
- Artwork uses lazy loading and asynchronous decoding. There are no authored continuously running animations in current card styles.

## Findings that matter before expanding

### 1. Area membership scanning blocks the update path

`src/card.ts:79` resolves previous and next IDs on every HA assignment. `src/providers/home-assistant.ts:133` resolves an area by enumerating, filtering and sorting the full entity registry. Every area card therefore performs two registry scans even when the only changed state is unrelated.

In the synthetic browser workload below, 20 area cards took approximately 70 ms for one setter batch without rendering anything. Avoiding renders is insufficient when dependency discovery itself blocks the main thread.

Repair direction: cache/index membership against entity/device registry identity and area/config identity; share that index within the injected host boundary where possible. State-only assignments should compare cached member references. Invalidate for device area changes, entity overrides, registry additions/removals, hidden/disabled/category changes and configuration changes. Preserve explicit-member behavior and avoid caching by state-map identity.

### 2. Closed dialogs retain every member row

`src/card.ts:514` always renders the room dialog and maps every member into its list, whether open or closed. Twenty rooms with fifty members each retained **1,000 closed-dialog rows**, plus their descendant spans. Relevant room state changes also revisit this content.

Repair direction: retain a lightweight closed shell or opener, mount detail content on opening, and release detail work on close. Keep summary state current independently. Use stable entity keys for list reconciliation; introduce pagination/virtualization only if large lists justify it. Richer nested controls must not all be mounted in closed panels.

### 3. Setup costs too much user effort

`src/editor.ts:98` enumerates entities during each editor render; room configuration uses a raw area-ID field and multiline entity IDs. The reactive `hass` property also permits unrelated HA updates to rebuild the editor's option list. README installation requires a local Node build.

Repair direction: native HA selectors with friendly names, cached selector options, room preview and useful defaults. Load editor code when requested if bundle analysis shows a useful saving; measure before splitting a currently small bundle. Provide a prebuilt resource with authorized releases and validated HACS distribution.

### 4. Climate drag interaction is concealed

`src/styles.ts` makes the temperature range input transparent and stretches its target over the right side of the card. It appears only with keyboard focus. The visible dial is decorative, while tapping/dragging the invisible range can submit a temperature command. This is a discoverability and accidental-adjustment risk; physical touch behavior was not validated in this audit.

Repair direction: show an understandable target-temperature control, preserve plus/minus keyboard/touch access, and verify scroll-versus-drag behavior. Apply consistent slider intent handling to light, volume, numeric and cover controls. Bubble 3.0's hold-to-slide behavior is a useful precedent, not a requirement to duplicate every interaction.

### 5. Glass and decorative paints have no measured quality policy

`src/styles.ts:10` applies `backdrop-filter: blur(12px)` to every glass card. Climate includes layered shadows, gradients and a masked conic decoration. These are cost risks, not measured evidence of slow GPU rendering. Default dark cards do not apply the glass blur.

Repair direction: opaque surfaces as the inexpensive default; one coherent effects policy for optional blur/decorative work. Preserve information, contrast, controls and layout at every quality level. Reduced motion alone does not remove static blur cost. Avoid relying exclusively on unreliable device guesses to choose quality.

## Measurements and limits

### Bundled resource

| Resource | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| Navet Cards, fresh audited build | 61,551 | 19,925 |
| Bubble Card, v3.0.0 committed dist resource | 472,812 | 107,175 |

Navet's resource is about **87% smaller raw / 81% smaller gzip**. This compares different feature sets and packaging, not equal functionality. Gzip was measured locally with the same Node zlib defaults; actual HA transport may differ. Bundle size does not establish relative runtime latency, memory, battery use or responsiveness.

### Synthetic update workload

macOS arm64, headless installed Google Chrome, 390×844 viewport, simulated HA host with 5,000 registry entries; 20 cards; 100 unrelated state-map assignments. Setter timing excludes creating the next state map and is measured for all 20 cards together. Tests and benchmark ran concurrently on this desktop, so exact timings are indicative rather than a stable hardware baseline.

| Configuration | Median batch | P95 batch | Renders | Closed dialog rows |
| --- | ---: | ---: | ---: | ---: |
| Single sensor cards | Below timer resolution | 0.1 ms | 0 | 0 |
| Explicit rooms, 50 members each | 0.1 ms | 0.2 ms | 0 | 1,000 |
| Area rooms, 50 members each | 69.6 ms | 75.5 ms | 0 | 1,000 |

This isolates room membership overhead. It is not a realistic household update frequency, a Bubble runtime benchmark, a GPU/scroll benchmark, or low-power-device acceptance. A registry reassignment probe correctly removed a member and rendered the new count; no stale-membership defect was established.

### Checks performed

- TypeScript passed; all 12 contract tests passed; fresh build passed its existing 160 kB raw budget.
- All 16 existing browser tests passed using installed Chrome via a temporary config on port 4187.
- The stock check could not finish initially because sandbox loopback binding was blocked; the pinned Playwright browser was also absent. Existing port 4178 was occupied. The successful run used a separate authorized server and installed Chrome; it does not establish pinned-browser CI results.
- Inspected the generated phone screenshot. The collection is visually coherent, but labels and controls are small at two-column phone width and the room panel is a details launcher. Physical touch, assistive technology and device performance remain unverified.
- Live Home Assistant, HACS and companion-app checks were not rerun. Existing verification documentation is historical evidence, not a current acceptance result.


## Delivery sequence

1. **Performance foundation:** cache area membership, separate summary from detail rendering, release closed panel work, establish benchmarks. Fix concealed climate interaction and verify lifecycle/registry invalidation.
2. **Useful composition:** compact row variant, typed sub-controls, lazy room controls and navigation. Keep the family cards and existing configuration compatible. Favor room-first presets over a generic dashboard framework.
3. **Easy adoption:** native visual selectors, appearance presets, prebuilt releases and HACS verification. Keep advanced YAML round-tripping and native HA details available.
4. **Targeted coverage:** selects and numeric helpers, then high-value media/climate/light capabilities. Evaluate calendar and third-party nested cards against measured cost.
5. **Extension ecosystem:** consider a separately loaded, versioned extension contract only after core composition is proven. A JavaScript Module Store would add execution, dependency and support costs; begin with declarative presets and conditions whose entity dependencies can be tracked.

## Proposed performance gates

These are proposed acceptance targets, not measured achievements or existing contracts. Ratify them against named household devices before presenting a performance promise.

- Keep the core bundle near its current size; initial growth ceiling **100 kB raw / 35 kB gzip**, with editor/calendar/optional extensions analyzed separately. The current enforced budget is 160 kB raw.
- After caching, target **under 5 ms P95** for the specified desktop 20-room/5,000-entry unrelated update batch, with zero card renders. Repeat independently to avoid concurrent-test noise.
- Zero mounted detail rows/child controls for never-opened closed panels; zero active detail timers/subscriptions after close/disconnect.
- Use identical dashboards for Navet and Bubble: 30–60 visible controls, 10–20 room panels, idle and burst state updates, artwork, scrolling, editing, repeated navigation and reconnects. Compare equivalent tasks and visual effects, then test extras separately.
- On named low-power clients, target local input feedback below 100 ms P95 and usable panel content below 250 ms P95 after warm load; record cold load separately. Separate HA/backend service latency from frontend response.
- Measure frame times/long tasks, DOM nodes, heap and retained objects across 100 open/close cycles. Require no growing retained panels/listeners and no recurring interaction long tasks. Do not substitute CPU throttling for real-device evidence.
- Include an older Android tablet/WebView, an older iPad, and a Raspberry Pi-class Chromium kiosk. The frontend client renders these cards; a low-power HA server is a separate service-load concern.
- Verify touch scrolling, keyboard/focus restoration, phone/tablet/landscape composition, default opaque surfaces, glass, reduced motion, unavailable entities and permission failures.

Navet should promise fast everyday room control only after these gates are observed on actual target devices. The current evidence supports a small runtime and identifies a concrete update bottleneck; it does not yet support a claim that Navet Cards outperforms Bubble Card.
