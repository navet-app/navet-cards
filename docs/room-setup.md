# Set up a room visually

This guide describes the unpublished development implementation as of 2026-10-20. Use a build containing these changes; an earlier release may show the legacy editor. Automated tests use simulated devices. Household-device, companion-app and HACS acceptance for this candidate remains pending.

## Create and arrange a room

1. In Home Assistant, edit the dashboard, choose **Add card**, then **Navet Room**. A new room starts with an empty entity selection.
2. Choose **Live area membership** and select the area by its friendly name. If area registry access is unavailable, use **Selected entities (snapshot)** and add entities by their friendly names instead.
3. Apply an **auto**, **kitchen**, **comfort**, **media**, **entry** or **state** room recipe. Recipes arrange the currently selected entities into native sections. They do not send device commands or install other card libraries. `state` makes the recipe's members read-only; other recipes use supported controls automatically.
4. Open **Include and exclude entities** to add an entity outside the area or exclude one you do not want. Exclusion wins if an entity appears in both lists. Hidden, disabled and diagnostic area entities are excluded by default; an explicit selection or inclusion can intentionally add an entity outside those defaults.
5. Open **Device labels, roles and controls**. Give readings useful labels and choose roles such as temperature, humidity or occupancy. A warning identifies ambiguous readings. Choose `auto` for supported controls, `state` for a reading only, or a supported toggle, slider or selection control. An unsupported choice falls back to state with a diagnostic.
6. Open **Sections and order**. Automatic sections separate readings from devices. Disable automatic arrangement to name and reorder sections, add sections, and add/remove/reorder their member entities. Add an entity to room membership before assigning it to a section. Members omitted from custom sections remain part of room membership and status, but are not displayed in the room dialog.
7. Set a unique **Room panel hash**, such as `#kitchen`, if the room should open from navigation. In the parent card editor, set its name, icon and appearance. Use **Room navigation links** to add named links to other rooms or local dashboard paths.
8. Inspect the real **Read-only room preview**. Open **Controls** to inspect selected devices and their order. Preview controls, configured actions and navigation stay disabled; opening the preview does not change the URL. Diagnostics explain missing entities, unavailable registries, unsupported controls and retained settings outside current membership.
9. Choose **Save room setup**, then finish saving the card/dashboard in Home Assistant. **Cancel room changes** restores the last supplied room configuration. Changes to the parent card's common fields remain separate from the local room draft and survive its save.

The room editor saves only when **Save room setup** is pressed. Common fields outside that editor update the parent card configuration as they are edited. Reopen the saved card to check the final configuration. The editor clones HA-owned data and preserves unknown advanced fields rather than rewriting the whole configuration from its visible controls.

## Membership and changes over time

| Choice | What happens when an area changes |
| --- | --- |
| Live area membership | Eligible members follow current entity assignments; device area is the fallback. New eligible members join automatically. Include/exclude overrides remain applied. |
| Selected entities (snapshot) | The saved ordered entity list stays fixed. Moving a device to another area does not remove it. |
| Freeze current membership as snapshot | The currently resolved members become an explicit list; current include/exclude results are captured in that list. |

Missing entities remain visible as missing in explicit membership; they are not silently replaced. Area-derived membership follows the supplied registry. If custom sections reference a member no longer in current membership, its settings remain saved and the editor reports the inactive reference. Newly discovered area members are not automatically inserted into explicitly arranged sections; use automatic sections or add the new members visually.

Existing unversioned rooms keep the previous `entities`-over-`area` precedence and flat member layout. Choose **Customize room setup** to opt into the new versioned structure. No automatic rewrite of existing dashboard cards is required.

## Duplicate a room and remap entities

Open **Duplicate, import and remap**, choose **Export room snapshot**, and copy the generated JSON. In a separate room card, choose **Import room snapshot**, paste it, then **Load snapshot into draft**. This changes the destination draft; it does not modify the source card or issue services.

Use each **Remap …** selector to choose the destination entity. Remapping preserves member and section IDs, labels, control choices and unknown fields, and changes membership to an explicit snapshot. A duplicate entity selection is rejected locally. Review every member, parent name and unique panel hash before saving. The snapshot contains card configuration, including advanced action targets; remapping room members does not rewrite service targets, sub-controls or links elsewhere in the configuration. Review those explicitly.

An invalid JSON snapshot or unsupported configuration version shows a local error and leaves the accepted configuration intact. Snapshots contain no entity state or transient command feedback. Treat configured service data and URLs as information you are choosing to copy.

## Add secondary controls, conditions and actions

In the parent card editor, open **Sub-controls** and **Add sub-control**. Select the owning entity, optional label and `state`, `toggle`, `slider` or `select` control. Unsupported controls are absent at runtime.

**Visibility condition** exposes state, availability, typed attribute equality and numeric bounds through fields. Attribute equality uses a literal attribute name and a string, number, boolean or null value; types must match exactly, missing attributes never match null, and unavailable entities do not match. Use `equals` for attribute equality; combining `attribute` with entity `state` or `available` is rejected. Numeric comparisons are exclusive (`above`/`below`) and may read a named attribute. Unknown, unavailable, missing and nonnumeric values do not match numeric comparisons. An availability condition can explicitly match an unavailable or missing entity. Advanced `all`, `any` and `not` groups use the combined JSON editor; nested conditions are bounded and validated.

**Sub-control tap action** supports no action, toggle where valid, more-info, local navigation, external HTTP(S) URLs, browser back and service actions. **Open URL** uses a separate tab without an opener; **Go back** follows browser history and may leave the dashboard. **Replace current history entry** applies to local navigation when the current location should be replaced instead of pushed. Preview blocks these effects. Choose the service and entity/area targets visually; advanced service data uses JSON. Without an explicit service target, the sub-control's selected entity owns its action. An explicit target remains authoritative. Confirmation may use a custom message. Home Assistant continues to enforce account permissions.

The **Sub-controls** editor also supports custom icons, attribute/unit readings, name/state visibility, top/bottom placement, reordering and named groups that can start collapsed. Closed groups mount no member controls. Each member can have separate tap, hold and double-tap actions. **Read only** disables all member actions and native details; expanding a group remains possible for inspection. Ordinary unavailable members still offer native details, with their device controls disabled. Preview blocks member effects, and pointer cancellation never commits a sub-control slider change.

**Icon gestures** provides separate icon tap, hold and double-tap settings where the identity icon is a gesture control. These do not change labeled device buttons, sliders or selections. Cancelled gestures and disconnected cards do not execute stale actions.

Grouped reading cards use the same ordered entity selector. The **Photo gallery** editor adds, reorders and removes image URLs; removing every gallery image restores the configured single image or image entity. Existing unknown configuration fields survive these edits.

## Operate supported devices

Open the saved room's **Controls** panel to use supported toggles, brightness, number/temperature/volume/position sliders, options, media playback, scene/script activation and cover movement. Hue/saturation and advertised light effects appear for capable lights; color temperature remains bounded to the device's advertised range. Unsupported color/effect modes stay absent. Compact lights expose color controls through their advanced disclosure; comfortable/row and room presentations expose supported controls in their relevant control area.

For climate ranges, **Temperature range** opens a standalone dialog with low/high targets and **Apply range**; the pair must respect the advertised limits, step and low-to-high ordering. Range-only devices omit the single-target orb. **Tilt** opens the standalone cover dialog with advertised open/stop/close and position controls. Unknown tilt position disables the position slider while supported movement actions remain available. Room auto/slider controls and row disclosures expose their supported range/tilt widgets inline. These new widgets require candidate-specific browser and live acceptance.

**Fan options** opens advertised preset modes, oscillation and direction in a standalone dialog. Room auto/select controls and row disclosures show the same choices inline. These options are independent of speed or power support. Unknown current values stay unselected; changing a choice sends only that setting to its owning fan.

**Climate options** exposes advertised presets, fan modes, swing and horizontal swing. If target ranges are also available, **Temperature range** opens the combined climate controls, including a supported single target and HVAC mode. **Cleaning options** exposes advertised vacuum fan speeds and secondary transport controls, including Return to dock. Room auto/select and row controls expose their supported choices inline. Current advertised lists and capabilities are rechecked before commands are sent.

**Media controls** (or **Volume** for volume-only players) opens a native dialog with supported seek, repeat, shuffle, independent power, volume/source and track controls. Room auto/select and row controls show their relevant options inline. Unknown position/duration disables seek; no synthetic playback progress is generated. Off/standby players retain supported power controls, while playback options remain disabled. Cancelled seek gestures send no command.

Device availability and capabilities are checked before dispatch. Select a member's name for native Home Assistant entity details. Escape and Close dismiss the room and release member controls. Device settings outside the implemented controls remain available through native details.

## Minimal configuration reference

Visual setup is the standard path. The smallest equivalent live-area configuration is:

```yaml
type: custom:navet-room-card
config_version: 2
area: kitchen
room:
  membership:
    mode: area
```

For a snapshot, use `membership.mode: explicit` with `membership.entities: [...]`; an empty list is valid during setup. Area mode uses `include` and `exclude` instead of `membership.entities`. `room.members` stores optional per-entity stable IDs and overrides. `room.sections` references those member IDs in display order. Omitted sections mean automatic arrangement; an empty section list intentionally displays no sections. Versioned `room` configuration takes precedence over retained legacy top-level `entities`.

Version 1 and unversioned configurations retain legacy behavior. Unsupported future versions fail validation rather than being silently downgraded. For a complete exported example, configure a room visually and use its snapshot exporter.

## Troubleshooting and acceptance

- No area members: check entity/device assignments and registry availability, or choose explicit entities. Diagnostics and hidden/disabled entries are excluded from automatic membership.
- An entity is missing from the dialog: inspect exclusions and custom section membership. Room summaries count all members even when a custom section omits them.
- A control is state-only: check the device's advertised capabilities and the chosen override. Native details can expose controls outside this implementation.
- A duplicate room opens: assign unique panel hashes in the same dashboard view, including after importing a snapshot.
- Preview differs from the saved card: choose **Save room setup**, then finish saving in HA and reopen. Invalid drafts are reported locally.

Automated acceptance covers a two-light kitchen with motion, temperature/humidity, a speaker, numeric helper and scene, including visual conditions/actions, JSON reload, owning service targets, no-registry setup, snapshot remapping and a 390 px layout. This is browser simulation evidence. Use the [human verification guide](human-verification.md) and [release checklist](release-checklist.md) for physical devices, companion apps, permissions, coexistence, installation and upgrades. The [historical verification status](verification-status.md) records earlier candidates and does not certify this working tree.

For opt-in rendered frontend checks against an already created disposable host, run `NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json node scripts/ha-frontend-check.mjs` with installed Chrome. Use only a session generated by the local validation setup on a loopback test port in 18000–18999. First copy the selected standalone resource and the complete modular artifact into that disposable host's `config/www/` and `config/www/navet-modular/`. The harness logs in through HA's real frontend without printing credentials, mounts editors with its actual supplied `hass`, and checks native selectors/details, versioned save/reopen, preview safety and separate standalone/modular browser contexts. Reports and screenshots stay in the ignored session's `frontend-evidence/` directory. It changes no dashboard or entity configuration and establishes no HACS, upgrade/rollback, companion-app or physical-device acceptance.

## Popup navigation and child cards

Use **Popup behavior** for a unique panel hash, optional scope, width/fullscreen mode, timeout and downward header swipe. Scoped destinations use `#scope--panel`. A state/availability/numeric/attribute condition can open the panel once; dismissing it requires the condition to become false before another automatic opening. Browser back closes a hash-linked panel. Manual previews remain read-only and leave browser history untouched.

**Child cards** selects native or installed custom card configurations, delegates editing to HA's child editor when available, and supports reorder/remove plus vertical/horizontal/grid layouts. Room children mount only while open and disconnect when closed. Foreign configurations are copied before being passed to children. Missing helpers/cards and failed children show local errors with retry. The simulated demo does not load HA's native card helpers; use a disposable HA dashboard for native-child acceptance. Third-party preview behavior beyond the host's disabled interactions and supplied flags remains owned by that card.

**Navet Sub-controls** offers the same grouped controls as an independent card. Chips include separator and spacer types, with conditions and visual ordering; these layout entries never dispatch actions.

## More device domains and actions

Humidifiers, water heaters, remotes and updates participate in area membership and explicit room selection. The comfort recipe groups humidifiers and water heaters with climate controls; the media recipe includes remotes. Supported controls follow each device's current capabilities, with humidity/temperature sliders and advertised mode/activity choices also available in sub-controls. Updates show version/progress information and require explicit confirmation for installation; previews and opening panels never install anything.

Media grouping requires explicit player selection and a grouping-capable owner. The server validates integration compatibility. Assist, standard custom DOM events and ordered nested action sequences are available in the shared visual action editor. Cancelling a sequence stops later actions without undoing a service already sent.

## Reuse and live display templates

The main editor’s **Reusable configurations** section creates local named definitions, scalar variables and ordered inheritance. Use **Navet Composition** to share a definition scope across its Navet children; foreign cards retain their literal configuration. Materialize creates a detached configuration for independent editing. The separate **HA display templates** section configures Jinja-driven name, state text, icon, picture, color or visibility, with JSON variables. Preview does not subscribe or dispatch commands. These settings remain optional for room setup; [reuse](plans/recipes-validation.md) and [templates](plans/template-validation.md) document the supported semantics.

**Protection** provides a temporary unlock against accidental interaction; it is not authentication. Primary-surface press/repeat/release actions accept service-only actions and finish release cleanup after an initiated press. Native device controls continue to use their advertised capabilities.
