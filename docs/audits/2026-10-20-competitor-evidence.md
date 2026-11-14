# Home Assistant card competitors: source evidence

Research date: 2026-10-20. Primary sources only. This is a capability and distribution comparison, not a hands-on compatibility, accessibility, performance, or household usability certification. Documentation claims describe the advertised behavior; release-note performance claims have not been independently benchmarked.

## Version boundary

| Project | Stable baseline observed | Development distinction |
| --- | --- | --- |
| Bubble Card | v3.4.2, marked Latest; release page shows 14 October | Compare against the tagged README and stable releases, rather than assuming everything on main shipped. [Release](https://github.com/Clooos/Bubble-Card/releases/tag/v3.4.2), [release list](https://github.com/Clooos/Bubble-Card/releases) |
| Mushroom | v5.2.3, marked Latest; release page shows 1 September | This release includes a template feature requiring HA 2026.9. [Releases](https://github.com/piitaya/lovelace-mushroom/releases) |
| custom:button-card | v7.0.1, 2025-11-13, marked Latest | v7.1.0-dev.2 is explicitly a prerelease. URL-loaded configuration templates belong to that prerelease, so are excluded from stable parity. [Stable release](https://github.com/custom-cards/button-card/releases/tag/v7.0.1), [release list](https://github.com/custom-cards/button-card/releases) |

GitHub stars and issue counts are not installation, retention, quality, or market-share measurements. No installed-user or active-user ranking was verified here.

## Bubble Card: stable offering

| Area | Advertised stable functionality |
| --- | --- |
| Core collection | Button, media, cover, select, climate, calendar, separator, empty column, horizontal navigation stack, pop-up, and sub-buttons-only cards |
| Compact controls | Button, slider and dropdown sub-buttons; groups; top/bottom placement; fixed footer mode |
| Display/layout | Sections sizing, multiple layouts, ordered state content, CSS customization |
| Navigation | Hash-linked pop-ups, state triggers, close gestures, timeouts, mobile layout modes |
| Extensibility | JavaScript templates, community modules, module editing/import/export and compatibility filtering |
| Localization | Documentation advertises 64 editor languages and 62 translated documentation languages |
| Distribution | HACS and manual installation; stated minimum HA 2023.9 |

Source for this table: [v3.4.2 README](https://raw.githubusercontent.com/Clooos/Bubble-Card/v3.4.2/README.md). The repository advertises over 100 community modules; this is the maintainer's claim, not an independent count. [Official repository](https://github.com/Clooos/Bubble-Card).

For control-depth comparisons, the same stable README explicitly documents light brightness/hue/saturation/white-temperature slider modes; cover position/tilt-position sliders and capability-gated tilt buttons; and climate low/high targets with independent hide options. These are control-level capabilities, rather than additional card families. [Stable control reference](https://raw.githubusercontent.com/Clooos/Bubble-Card/v3.4.2/README.md).

### Why the competitive target is larger than attractive pills

Bubble Card 3.0 introduced UI-managed modules, an integrated store with installation and updates, global module application, custom module forms, and calendar support. It also improved popup creation, section sizing, slider bounds, read-only sliders and hold-to-slide interaction. The release acknowledges that structural changes can affect advanced custom styling. This is a reusable customization platform with upgrade costs as well as a visual card collection. [v3.0.0 release](https://github.com/Clooos/Bubble-Card/releases/tag/v3.0.0).

Version 3.3 adds capability-aware card-picker recipes spanning 33 domains; HA 2026.6 or later is needed for the picker integration. Examples include light color controls, cover tilt, and vacuum transport actions. Modules can contribute complete cards or layouts to that picker. Module authors get a live suggestion preview, teardown hooks and change tracking. Native card templates are described as a future plan, so must not be counted as shipped native functionality. [v3.3.0 release](https://github.com/Clooos/Bubble-Card/releases/tag/v3.3.0).

Version 3.4 adds HA/Jinja templates in names, icons, state content, sub-buttons, navigation stacks, styles, modules and conditions. It adds an HA-dialog popup style, native-like swipe closing, a consolidated state-content list, and humidifier/water-heater support through the climate card. Editing older configurations migrates them, and the notes warn migrated cards may not work after downgrading. The maintainer reports rendering optimizations on old tablets; there is no cross-project benchmark here. [v3.4.0 release](https://github.com/Clooos/Bubble-Card/releases/tag/v3.4.0).

Version 3.4.2 adds alarm modes with an inline keypad through select cards/dropdown sub-buttons, vacuum fan-speed menus, remote activities, fan direction and native calendar-event details. It also fixes a reconnect-related retention leak affecting slider sub-buttons and long-running phone/tablet dashboards. These demonstrate both mature feature breadth and the ongoing lifecycle maintenance burden of a large dashboard library. [v3.4.2 release](https://github.com/Clooos/Bubble-Card/releases/tag/v3.4.2).

Competitive implication (inference): a replacement must address dashboard composition, entity-specific setup, compact multi-entity controls and reusable customization. Matching a few light/climate/media controls does not establish Bubble Card parity. A 33-domain suggestion count also does not mean 33 dedicated card implementations: recipes can compose generic cards and sub-controls.

## Mushroom: the low-friction baseline

The official README prioritizes visual editing for all cards/options, icon and color pickers, zero additional-card dependencies, light/dark themes and internationalization. It explicitly places deep customization outside the project's main goal. Its listed collection covers alarm, chips, climate, cover, entity, empty, fan, humidifier, light, lock, media, number, person, select, template, title, update and vacuum cards; it also offers a template badge and a legacy template card. Installation is available through HACS and manually. [Official README](https://github.com/piitaya/lovelace-mushroom).

The stable light card exposes brightness, color temperature and RGB controls, light-derived colors, primary/secondary information, multiple layouts, and tap/hold/double-tap actions. Collapsible controls are documented to cause possible layout shifts in Sections. [v5.2.3 light documentation](https://github.com/piitaya/lovelace-mushroom/blob/v5.2.3/docs/cards/light.md).

Stable chips cover actions, alarms, back navigation, conditions, entity state, light, drawer menu, quickbar, spacers, templates and weather. [v5.2.3 chips documentation](https://github.com/piitaya/lovelace-mushroom/blob/v5.2.3/docs/cards/chips.md).

The stable template card supports HA templates for labels, icons, images, color and badges, entity/area context, and separate card/icon gestures. [v5.2.3 template documentation](https://github.com/piitaya/lovelace-mushroom/blob/v5.2.3/docs/cards/template.md).

Competitive implication (inference): attractive defaults, complete visual editing and broad everyday domain coverage are already an established baseline. Navet should measure onboarding steps and the number of tasks requiring YAML against this baseline, alongside visual quality.

## custom:button-card: the customization ceiling

Stable documentation advertises generic entity support, configurable card/icon gestures, momentary press/release actions, JavaScript/multiple/toast actions, state-driven presentation, CSS styling, custom layouts, JavaScript templates, animation, confirmation/locking, PIN/password action protection, companion-app haptics and HACS installation. Frontend action protection should not be treated as backend authorization. [Stable documentation](https://custom-cards.github.io/button-card/stable/).

Reusable configuration templates support recursive inheritance, multiple template composition and local overrides. [Stable configuration templates](https://custom-cards.github.io/button-card/stable/advanced/config-templates/). Custom fields can embed other cards and use CSS Grid or absolute positioning. [Stable custom fields](https://custom-cards.github.io/button-card/stable/advanced/custom-fields/).

Competitive implication (inference): an opinionated Navet library can compete on setup, cohesion and task completion without reproducing this entire programmable surface. Claiming equivalent customization would require a much larger extension and documentation commitment.

## Decision criteria for the Navet audit

These are assessment criteria inferred from the evidence, not claims about Navet's current implementation:

1. **Whole-house coverage:** test common rooms and tasks, including mixed sensors, locks/alarms, fans, covers, vacuum, calendar and person state; count complete workflows rather than card names.
2. **First useful dashboard:** measure installation, picker discovery, capability-aware defaults, visual editor completeness, and how often a new user needs YAML.
3. **Composition:** verify room navigation, popups, compact secondary controls, conditional visibility and Sections sizing.
4. **Household operation:** verify touch ergonomics, disabled/unavailable/error states, keyboard behavior, actual companion apps, old wall tablets, reconnection and long sessions.
5. **Reuse and upgrade:** examine shared presets/templates, migration, backup/rollback and customization compatibility.
6. **Distribution and trust:** distinguish an existing HACS manifest from accepted listing/install verification; require release assets, examples, troubleshooting and current HA/device evidence.
7. **Differentiation:** choose a task or audience where Navet demonstrably reduces setup or improves operation; feature totals alone do not show a reason to switch.

No claim of benchmark superiority, accessibility compliance, security equivalence or live-device parity is established by this research.
