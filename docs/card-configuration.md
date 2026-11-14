# Card configuration

Start with [installation](../README.md#install-navet-cards). Then choose **Add card**, search for **Navet**, and configure the card in the visual editor or in YAML.

- [Card catalog](#card-catalog) and [custom cards](#custom-cards)
- [Sensors](#sensors), [rooms](#rooms), and [calendar agenda](#calendar-agenda)
- [Navigation and sub-controls](#navigation-and-sub-controls), [actions](#actions), and [theme variables](#theme-variables)
- [Reusable configurations and HA templates](#reusable-configurations-and-ha-templates)
- [Manual resource management and rollback](#manual-resource-management)

## Card catalog

| Card type | Supported selection | Controls |
| --- | --- | --- |
| `custom:navet-light-card` | `light.*` | On/off, brightness, supported color temperature, hue/saturation and effects |
| `custom:navet-switch-card` | `switch.*`, `input_boolean.*` | On/off |
| `custom:navet-sensor-card` | `sensor.*`, `binary_sensor.*` | Value, unit, optional attribute |
| `custom:navet-room-card` | Visual area selection or explicit entities | Recipes, ordered sections, room status, lazy direct controls and entity details |
| `custom:navet-media-card` | `media_player.*` | Playback, volume, skip, mute, and source selection when supported |
| `custom:navet-climate-card` | `climate.*` | Current temperature, single target or low/high range, and heating mode when supported |
| `custom:navet-cover-card` | `cover.*` | Open/stop/close, position and advertised tilt controls |
| `custom:navet-number-card` | `number.*`, `input_number.*` | Value slider with native limits, step and unit |
| `custom:navet-select-card` | `select.*`, `input_select.*` | Advertised options |
| `custom:navet-navigation-card` | Local paths or room hashes | Named navigation buttons |
| `custom:navet-fan-card` | `fan.*` | Supported on/off and speed percentage with presets |
| `custom:navet-lock-card` | `lock.*` | State and slide to lock/unlock; code-protected locks use entity details |
| `custom:navet-vacuum-card` | `vacuum.*` | Supported start, pause and return to dock; battery when provided |
| `custom:navet-person-card` | `person.*`, `device_tracker.*` | Presence and entity picture |
| `custom:navet-weather-card` | `weather.*` | Condition, prominent temperature, feels-like reading and daily forecast when supplied |
| `custom:navet-scene-card` | `scene.*` | Run scene |
| `custom:navet-script-card` | `script.*` | Run script |
| `custom:navet-entity-card` | Any entity | State, unit, supported toggle, and entity details |
| `custom:navet-info-card` | `entities` list of sensors | Live grouped readings and entity details |
| `custom:navet-battery-card` | `entities` list of sensors | Battery readings, percentage bars and low-battery highlighting |
| `custom:navet-ups-card` | `entities` list of sensors | Selected UPS status and metrics |
| `custom:navet-energy-now-card` | `entities` list of sensors | Power/energy readings and a 24-hour power history chart |
| `custom:navet-media-stack-card` | `entities` list of media players | Selected-player speaker controls and entity details |
| `custom:navet-note-card` | `input_text.*`, `text.*`, or `content` | Save notes to a text helper or display configured text |
| `custom:navet-photo-card` | `image.*` or `image` URL | Single photo or gallery with an image description |
| `custom:navet-button-card` | Button, scene, script, or `tap_action` | Run an entity action, service, or local navigation |
| `custom:navet-chips-card` | Entity, weather, action and navigation chips | Compact readings and shortcuts |
| `custom:navet-sub-controls-card` | `sub_controls` list | Grouped readings and capability-based controls |
| `custom:navet-humidifier-card` | `humidifier.*` | Power, humidity targets and modes |
| `custom:navet-water-heater-card` | `water_heater.*` | Power, temperature, operation and away mode |
| `custom:navet-remote-card` | `remote.*` | Power and advertised activities |
| `custom:navet-update-card` | `update.*` | Versions, progress and confirmed installation |
| `custom:navet-calendar-card` | `calendar.entities` list | Calendar agenda and event details |
| `custom:navet-composition-card` | `cards` list | Layout and shared scope for reusable configurations |

### Custom cards

Use the ordered entity selector for grouped readings (1–24 IDs), including add, move and remove. Put the power sensor first in Energy Now and the daily energy sensor second. Values retain their sensor units. Its chart reads the power sensor’s previous 24 hours from Home Assistant history; if history is unavailable, the card says so. Weather requests the daily forecast when the weather entity supports it. These requests share the injected Home Assistant host: forecasts refresh after 30 minutes and history after five minutes while visible. Hidden cards and tabs pause scheduled refreshes; returning to a stale card refreshes it. Unsupported, empty, denied and failed requests have distinct status messages, and retained data is marked stale after a refresh failure.

Choose UPS status, battery, load and runtime sensors explicitly to match your device. Battery sensors are recognized by device class or their battery/charge name; other selected measurements appear in compact tiles. Media Stack shows one selected player using the speaker card controls. Choose another player from its selector.

```yaml
type: custom:navet-info-card
name: Kitchen readings
entities:
  - sensor.kitchen_temperature
  - sensor.kitchen_humidity
```

To edit a note from the dashboard, create a Text helper in Home Assistant and select it:

```yaml
type: custom:navet-note-card
entity: input_text.kitchen_note
```

Select the note text to open its editor. Save writes to the helper using its native length limits; Escape closes the editor without saving. A failed save keeps your draft so you can retry. Password helpers stay private and are opened through entity details. For text configured in the dashboard, use `content: Remember to water the plants` without an entity.

```yaml
type: custom:navet-photo-card
name: Mountains
image: /local/mountains.jpg
alt: Mountain lake at sunrise
```

Use **Photo gallery** in the visual editor to add, reorder and remove up to 24 image URLs, or set `images` in YAML. Arrow buttons and dots select the displayed photo. Shuffle chooses another image at random when you use an arrow. The `alt` text describes the displayed image.

Photo sources can be local paths or HTTP(S) URLs; an `image.*` entity supplies its entity picture. Unavailable images display a fallback. A Home Assistant image uses the host's own picture URL. External image servers must allow your browser to load the image.

```yaml
type: custom:navet-button-card
name: Evening routine
tap_action:
  action: perform-action
  perform_action: scene.turn_on
  target:
    entity_id: scene.evening
```

Fan cards expose advertised preset modes, oscillation and direction through **Fan options**; room auto controls and row disclosures show the same supported choices. Unknown current values stay unselected. Climate presets, fan modes, swing and horizontal swing appear when advertised, and vacuum cards expose supported fan speeds. Media controls expose supported seek, repeat, shuffle and independent power actions. The controls dialog also contains volume, source and track controls; room and row layouts show supported controls inline. Seek uses the reported position and duration. Rich thermostats group their target and mode controls under **Temperature range** or **Climate options**; vacuum **Cleaning options** includes fan speed and secondary transport controls. This keeps the main controls within narrow cards.

The **Humidifier**, **Water heater**, **Remote** and **Update** cards use the same visual entity picker and room recipes. Humidifiers expose supported humidity targets and modes. Water heaters expose advertised temperature, operation, away and power controls. Remotes offer activities and power when the device advertises them. Update controls show installed/latest versions and reported installation progress, with supported skip/clear actions. **Install latest** always asks for confirmation and rechecks the offered version before dispatch.

Media **Controls** also exposes grouping when advertised. Select players explicitly and choose **Join selected**, or **Leave group**. Reported membership is displayed as supplied; Home Assistant decides whether the selected integrations can group together. Candidate availability updates while the dialog is open. Comfort, remote and grouping widgets follow English/Swedish host language and the card's theme.

The **Chips** card provides compact entity readings, current weather, actions and navigation. Start with **Navet Chips** in the card picker, then add, reorder and configure chips visually. Title/subtitle, icons, state visibility, conditions, separate gestures, noninteractive separators and flexible spacers are supported; navigation chips highlight the exact current path/hash. Up to 24 chips wrap with 44 px minimum touch targets. Preview never sends commands or navigates.

```yaml
type: custom:navet-chips-card
title: At a glance
chips:
  - id: temperature
    entity: sensor.kitchen_temperature
  - id: kitchen
    name: Kitchen
    icon: mdi:countertop
    tap_action:
      action: navigate
      navigation_path: '#kitchen'
```

The current custom catalog includes Info, Note, Photo, Action, Battery, UPS, Energy Now, and Media Stack. RSS, Map, and Assist are planned separately. Weather displays current conditions and supported daily forecasts; Media Stack controls the selected player.


```yaml
type: custom:navet-light-card
entity: light.kitchen
name: Kitchen lights
layout: compact
show_brightness: true
appearance:
  accent: "#ea8c55"
  radius: 24
  theme: auto
tap_action:
  action: toggle
hold_action:
  action: more-info
grid_options:
  columns: 6
  rows: 3
```

Common fields:

| Field | Meaning | Default |
| --- | --- | --- |
| `entity` | Supported Home Assistant entity ID | Required on entity cards |
| `name` | Card title | Entity friendly name or area name |
| `icon` | Icon such as `mdi:lightbulb-outline` | A relevant icon for the card |
| `size` | `small` or `extra-small` | Switch footprint; defaults to `small` |
| `layout` | `compact`, `comfortable`, or `row` | `compact` |
| `show_state` | Show state or sensor value | `true` |
| `show_brightness` | Show supported brightness control | `true` on light cards |
| `appearance.accent` | Six-digit hex color | Theme variable, Navet orange, or the card family accent |
| `appearance.radius` | Corner radius, 0–48 pixels | 24 pixels |
| `appearance.preset` | `warm`, `neutral`, or `cool`; accent can override it | `warm` |
| `appearance.effects` | `low` uses opaque glass and simpler decoration; `high` enables glass blur | `low` |
| `panel_id` | Unique room hash such as `#kitchen` | Optional on room cards |
| `sub_controls` | Up to eight entity controls, also available as an independent card | Empty |
| `popup` | Room scope, size, timeout, header swipe and opening condition | Optional |
| `cards` | Ordered native/installed custom child-card configurations | Empty |
| `definitions`, `use`, `variables` | Local reusable configurations, ordered names and scalar overrides | Optional |
| `display_templates` | HA/Jinja name, state, icon, picture, color and visibility templates | Optional |
| `calendar` | Calendar entity list, window, limit, filter, location and event action | Calendar card only |
| `press_action`, `repeat_action`, `release_action`, `repeat_interval` | Primary-surface service actions and repeat milliseconds | Optional; 500 ms |
| `protection` | Accidental-action guard with temporary unlock | Optional; five seconds |
| `cards_layout`, `cards_columns` | Vertical/horizontal/grid child layout and grid columns | `vertical`, 2 |
| `navigation_position`, `navigation_offset` | Inline/sticky/fixed navigation and bottom offset in pixels | `inline`, 0 |
| `appearance.theme` | `auto`, `light`, `dark`, `black`, or `glass` | `auto` follows HA theme |
| `grid_options` | Home Assistant Sections placement | Card-specific sizing |

`row` presents identity and state with a **Controls** disclosure for entity actions. `compact` uses the medium Navet card height for device and room cards. Medium cards use a 2×1 footprint, small cards use 1×1, and extra-small switches use 1×0.5: the same width as small, with half its height. Home Assistant Sections uses 12 columns for medium and 6 for both switch sizes, with 3 rows for medium/small and 2 for extra-small to fit its whole-row grid; explicit `grid_options` override these defaults. Switches default to `small`; set `size: extra-small` for the shorter horizontal composition with identity and toggle controls. The settings button appears on small switches. `comfortable` adds vertical space for richer controls; both keep family controls on the card. Single-target climate cards place the current temperature beside the gauge, with a temperature orb and step buttons. Drag the orb clockwise or counterclockwise to adjust the target; arrow keys adjust one step, and Home/End select the supported limits. Range-capable climate cards expose **Temperature range** with low/high targets applied together; range-only devices omit the single-target orb. Covers expose **Tilt** with supported tilt movement/position controls; unknown tilt position disables its slider. Comfortable climate/light layouts expose heating mode and light color temperature; row disclosures and room panels also expose supported device controls. The media controls dialog contains supported volume, track, source, seek, repeat, shuffle and power controls. Progress uses the reported position and duration. Sliders send a command when a change is committed, and support keyboard input.

Home Assistant owns placement through `grid_options` on versions with Sections sizing. Use enough rows for controls and wrapped titles; `rows: auto` lets HA follow content height when disclosures expand or sub-controls are present. On Home Assistant 2024.6.4, Sections uses full-width custom cards. Cards also provide Masonry sizing.

### Sensors

```yaml
type: custom:navet-sensor-card
entity: sensor.kitchen_temperature
name: Temperature
```

To display an attribute, add `attribute: humidity` and, if needed, `unit: "%"`. Numeric zero is preserved. Missing, unknown, and unavailable entities show an explanation.

### Rooms

Add a **Navet Room** card, choose **Live area membership**, select the area by friendly name, and apply a kitchen, comfort, media or entry recipe. Include/exclude entities, label readings, choose roles and controls, and arrange sections. **Save room setup** applies this local draft; finish saving the card in Home Assistant. The real card preview opens its Controls panel with commands and navigation disabled.

Choose **Selected entities (snapshot)** when membership should stay fixed or registry information is unavailable. Existing rooms retain their behavior until you choose **Customize room setup**. Unknown advanced fields survive visual edits. Follow the [complete room setup guide](room-setup.md) for preview, duplicate/remap, membership rules and troubleshooting.

The equivalent minimal versioned configuration is:

```yaml
type: custom:navet-room-card
config_version: 2
area: kitchen
room:
  membership:
    mode: area
```

For a simple room, set `area` or supply an `entities` list. An explicit list takes precedence. Area membership uses entity area assignments with device areas as fallback and excludes hidden, disabled and diagnostic entries by default. **Controls** mounts supported member controls only while open; Escape and Close release them.

### Assist, custom events and action sequences

The visual action editor includes **Assist**, **Fire DOM event** and **Sequence**. Assist uses HA's native action handling, with a pipeline choice and optional listening on open. Fire DOM event emits the standard bubbling `ll-custom` event with the complete action configuration; installed handlers own what it does.

Sequences run ordered actions, including nested sequences, with visual add/reorder/remove controls and explicit continue-on-error behavior. A declined confirmation stops the sequence. **Cancel action**, config replacement, preview mode and disconnect stop subsequent steps and release pending waits. A service already dispatched cannot be undone by cancellation. Errors stop the sequence unless its containing sequence enables continue-on-error. **Momentary controls** configure service-only press, optional repeat and release actions on the primary card surface. Repeat defaults to 500 ms (minimum 100 ms). Pointer or keyboard release, scrolling, focus loss and disconnect stop repetition and release an initiated press once in-flight dispatch finishes. These actions do not accept confirmations. **Protection** temporarily unlocks a card for a configurable duration (default five seconds); this prevents accidental interaction and is not authentication. Calendar, Chips, Sub-controls and Composition do not offer momentary controls.

### Navigation and sub-controls

Set **Room panel hash** to `#kitchen` to open a room from a navigation card in the same view. Add local paths or hashes directly through **Room navigation links** in the room card editor. The equivalent navigation card is:

```yaml
type: custom:navet-navigation-card
links:
  - name: Kitchen
    path: "#kitchen"
  - name: Home
    path: /lovelace/home
```

Use unique room hashes within a view. Navigation activates the matching room; Escape and Close return through the popup's own browser-history entry. Directly linked popups clear their hash when dismissed. Local paths follow Home Assistant's dashboard navigation. Navigation buttons mark the exact current destination. **Navigation placement** offers inline, sticky and fixed footer modes with a pixel bottom offset and device safe-area padding. For a persistent sidebar, set the inherited CSS variable `--navet-sidebar-offset` to its width; fixed positioning also depends on the surrounding dashboard layout.

**Popup behavior** adds a scope, default/wide/fullscreen sizes, an optional timeout in seconds and downward swipe dismissal from the header. A scoped panel `#kitchen` under `downstairs` uses the link `#downstairs--kitchen`. **Open popup when** uses the shared conditions editor. Dismissal consumes the current true trigger; the condition must become false before it can open again. Only one Navet popup is active in a window. Preview allows manual read-only inspection without automatic triggers, history changes or timeout effects.

Open **Child cards** to add, edit, reorder or remove native and installed custom cards using Home Assistant's picker and child editors when available. Vertical, horizontal and grid layouts are supported, with configurable grid columns. On room cards, children mount only while the popup is open; on other cards they appear below the main content. Each child has a contained loading/error state and retry. Child previews disable interaction and pass preview/edit state, but third-party code still controls its own behavior. Actual HA checks cover native Tile/history/calendar and pinned Bubble Card 3.4.2, Mushroom 5.2.3 and button-card 7.0.1 children on desktop and phone. See [child-card validation](plans/competitor-child-validation.md) for the tested versions and scope.

Choose **Navet Sub-controls** for an independent group of controls, or add small controls to an existing card through **Sub-controls** in the visual editor or YAML:

```yaml
type: custom:navet-light-card
entity: light.kitchen
layout: row
sub_controls:
  - entity: switch.coffee_machine
    name: Coffee
    control: toggle
  - entity: sensor.kitchen_temperature
    control: state
    visible_when:
      entity: input_boolean.show_room_readings
      state: "on"
```

`control` accepts `state`, `toggle`, `slider`, or `select`. Controls appear only for supported capabilities. The name opens entity details; an optional `tap_action` changes that behavior and defaults action targets to the sub-control's entity. **Visibility condition** visually supports entity state, availability, numeric state/attribute bounds and exact attribute values. Attribute equality uses `{entity, attribute, equals}` with a string, finite number, boolean or null; types must match and attribute names are literal own keys. Missing attributes never match null, and unavailable/unknown entities do not match attribute equality. Use `state` for entity state or `attribute` with `equals` for attribute equality. Combined `all`, `any` and `not` expressions use the advanced JSON field. Missing/unknown/unavailable entities fail numeric comparisons; availability can explicitly match an unavailable or missing entity. **Sub-control tap action** visually configures navigation or service actions, with advanced service data available as JSON. Unknown fields survive editing.

Number and select cards use the same `entity`, `layout`, and appearance fields. Number sliders preserve the entity's minimum, maximum, step, and unit; selects show the options supplied by the device.

### Actions

Light and switch titles toggle the entity by default. Other entity titles open **more-info**. The circular settings control opens Home Assistant details. Room titles open the room dialog. Buttons and sliders perform their labeled controls. Optional `tap_action`, `hold_action`, and `double_tap_action` apply to the card title. **Icon gestures** separately configures `icon_tap_action`, `icon_hold_action` and `icon_double_tap_action` for identity icons rendered as gesture controls. Dedicated device controls retain their labeled behavior. Keyboard activation performs the tap action.

Home Assistant enforces account permissions. A denied control or configured action displays a permission explanation, and **Close** dismisses it. Entity details remain available to accounts that can read the entity.

Supported actions are `none`, `more-info`, `toggle` on light/switch/fan cards, `navigate`, `url`, `back`, and `perform-action`. **Open URL** accepts absolute HTTP(S) URLs and opens a separate tab without an opener. **Go back** uses browser history; it can leave the current dashboard. For local navigation, **Replace current history entry** sets `navigation_replace: true` instead of adding a history entry. Previews block all three effects.

For example:

```yaml
tap_action:
  action: navigate
  navigation_path: /lovelace/kitchen
hold_action:
  action: perform-action
  perform_action: scene.turn_on
  target:
    entity_id: scene.kitchen_evening
  data:
    transition: 2
  confirmation:
    text: Activate the kitchen evening scene?
```

The visual editor uses Home Assistant entity/icon selectors when the host supplies them, with standalone fallbacks; room areas are selected by friendly name. Action fields expose type, local/external navigation, back, service, entity/area targets and confirmation; advanced service data uses JSON. Combined condition JSON and other unexposed advanced settings remain editable without discarding unknown fields. Confirmation supports a boolean or a text object; user exemptions are outside this initial action contract.

### Theme variables

Set these through Home Assistant themes or supported styling tools:

```yaml
Navet:
  navet-card-accent: "#ea8c55"
  navet-card-radius: "24px"
```

The cards consume `--navet-card-accent`, `--navet-card-radius`, `--navet-card-background`, `--navet-card-text`, `--navet-card-border`, and `--navet-card-font`. Per-card appearance overrides the corresponding global variable. Glass with `effects: high` uses transparency and blur. Low effects use opaque glass and simpler decoration; all controls and information remain available. Dark and black use solid surfaces. Focus indicators and labels remain visible with reduced motion.

## Calendar agenda

Choose **Navet Calendar**, then select calendars in its visual editor. Set the day window, offset, event limit, filter and location visibility without YAML. The agenda uses Home Assistant’s timezone, handles timed and all-day events, and reports failed calendars separately. Events open read-only details by default; an optional event action uses the shared action editor. Hidden cards pause reads and previews make no calendar requests. See [calendar validation](plans/calendar-validation.md) for backend and frontend scope.

## Reusable configurations and HA templates

Use **Reusable configurations** in the visual editor to create named definitions, order inherited definitions, set typed scalar variables, import/export JSON or materialize an independent copy. Later definitions override earlier ones; fields set on the card override inherited fields. A **Navet Composition** card groups children and supplies a local definition scope to Navet children. Foreign child configurations stay opaque. Arrays replace inherited arrays, except supported root Navet control lists with stable IDs, which merge by ID; an explicit empty list clears inherited entries.

Recipe placeholders such as `${room}` substitute scalar variables, including inside typed chips, without executing code. Child configurations in `cards` keep their independent variable context. These are separate from **HA display templates**, which run Jinja through Home Assistant’s template subscription API. The template editor supports name, displayed state, icon, picture, color and visibility, with JSON variables. Errors show a local status and fallback; previews never subscribe. A visibility template closes the room popup when it hides the card. Templates change presentation only: entity targets, capabilities and commands retain their configured meaning. See [reuse](plans/recipes-validation.md) and [template validation](plans/template-validation.md) for semantics and evidence.

## Manual resource management

For a YAML-managed resource list, replace `VERSION` with the downloaded release version:

```yaml
resources:
  - url: /local/navet-cards.js?v=VERSION
    type: module
```

When replacing the resource, change the version in its URL and reload each browser or companion-app frontend. Keep a copy of the previous resource to roll back. Existing dashboard card configurations stay in Home Assistant.
