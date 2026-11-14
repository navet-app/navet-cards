# Set up a room visually

Install [Navet Cards](../README.md#install-navet-cards), then add a room to your Home Assistant dashboard.

## Create and arrange a room

1. In Home Assistant, edit the dashboard, choose **Add card**, then **Navet Room**. A new room starts with an empty entity selection.
2. Choose **Live area membership** and select the area by its friendly name. If area registry access is unavailable, use **Selected entities (snapshot)** and add entities by their friendly names instead.
3. Apply an **auto**, **kitchen**, **comfort**, **media**, **entry** or **state** room recipe. Recipes arrange the currently selected entities into native sections. `state` makes the recipe's members read-only; other recipes use supported controls automatically.
4. Open **Include and exclude entities** to add an entity outside the area or exclude one you do not want. Exclusion wins if an entity appears in both lists. Hidden, disabled and diagnostic area entities are excluded by default; an explicit selection or inclusion can intentionally add an entity outside those defaults.
5. Open **Device labels, roles and controls**. Give readings useful labels and choose roles such as temperature, humidity or occupancy. A warning identifies ambiguous readings. Choose `auto` for supported controls, `state` for a reading only, or a supported toggle, slider or selection control. An unsupported choice falls back to state with a diagnostic.
6. Open **Sections and order**. Automatic sections separate readings from devices. Disable automatic arrangement to name and reorder sections, add sections, and add/remove/reorder their member entities. Add an entity to room membership before assigning it to a section. Members omitted from custom sections remain part of room membership and status, but are not displayed in the room dialog.
7. Set a unique **Room panel hash**, such as `#kitchen`, if the room should open from navigation. In the parent card editor, set its name, icon and appearance. Use **Room navigation links** to add named links to other rooms or local dashboard paths.
8. Open the **Read-only room preview**. Open **Controls** to inspect selected devices and their order. Diagnostics explain missing entities, unavailable registries, unsupported controls and retained settings outside current membership.
9. Choose **Save room setup**, then finish saving the card/dashboard in Home Assistant. **Cancel room changes** restores the last supplied room configuration. Changes to the parent card's common fields remain separate from the local room draft and survive its save.

## Membership and changes over time

| Choice | What happens when an area changes |
| --- | --- |
| Live area membership | Eligible members follow current entity assignments; device area is the fallback. New eligible members join automatically. Include/exclude overrides remain applied. |
| Selected entities (snapshot) | The saved entity list and order stay fixed across area changes. |
| Freeze current membership as snapshot | The currently resolved members become an explicit list; current include/exclude results are captured in that list. |

Explicit membership shows missing entities in place. Area-derived membership follows the supplied registry. Custom sections keep their assigned slots and report inactive members in the editor. Add new members to custom sections manually, or use automatic sections.

## Duplicate a room and remap entities

Open **Duplicate, import and remap**, choose **Export room snapshot**, and copy the generated JSON. In a separate room card, choose **Import room snapshot**, paste it, then **Load snapshot into draft**. The imported snapshot loads into the destination draft.

Use each **Remap …** selector to choose the destination entity. Remapping preserves member and section IDs, labels, control choices and unknown fields, and changes membership to an explicit snapshot. A duplicate entity selection is rejected locally. Review every member, parent name and unique panel hash before saving. The snapshot contains card configuration, including advanced action targets; remapping room members does not rewrite service targets, sub-controls or links elsewhere in the configuration. Review those explicitly.

An invalid JSON snapshot or unsupported configuration version shows a local error and leaves the accepted configuration intact. Snapshots contain no entity state or transient command feedback. Treat configured service data and URLs as information you are choosing to copy.

## Add secondary controls, conditions and actions

In the parent card editor, open **Sub-controls → Add sub-control**. Choose an entity and a state, toggle, slider, or select control. Use **Visibility condition** to choose when it appears and **Sub-control tap action** to add a shortcut. See [sub-control configuration](card-configuration.md#navigation-and-sub-controls) for conditions, groups, and action targets.

## Operate supported devices

Open **Controls** to see the actions each device supports, such as brightness, temperature range, cover tilt, and media playback. Select a member’s name to open Home Assistant’s entity details. Press Escape or select **Close** to return to the dashboard. The [card catalog](card-configuration.md#card-catalog) lists controls by device type.

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

For a snapshot, use `membership.mode: explicit` with `membership.entities: [...]`; an empty list is valid during setup. Area mode uses `include` and `exclude` instead of `membership.entities`. `room.members` stores optional per-entity stable IDs and overrides. `room.sections` references those member IDs in display order. Omitted sections mean automatic arrangement; an empty section list intentionally displays no sections.

For a complete example, configure a room visually and export its snapshot.

## Troubleshooting

- No area members: check entity/device assignments and registry availability, or choose explicit entities. Diagnostics and hidden/disabled entries are excluded from automatic membership.
- An entity is missing from the dialog: inspect exclusions and custom section membership. Room summaries count all members even when a custom section omits them.
- A control is state-only: check the device's advertised capabilities and the chosen override. Native details can expose controls outside this implementation.
- A duplicate room opens: assign unique panel hashes in the same dashboard view, including after importing a snapshot.
- Preview differs from the saved card: choose **Save room setup**, then finish saving in HA and reopen. Invalid drafts are reported locally.

## Popup navigation and child cards

Use **Popup behavior** for a unique panel hash, optional scope, width/fullscreen mode, timeout and downward header swipe. Scoped destinations use `#scope--panel`. A state/availability/numeric/attribute condition can open the panel once; dismissing it requires the condition to become false before another automatic opening. Browser back closes a hash-linked panel. Manual previews remain read-only and leave browser history untouched.

**Child cards** selects native or installed custom card configurations, delegates editing to HA's child editor when available, and supports reorder/remove plus vertical/horizontal/grid layouts. Room children appear when the panel opens. Failed children show an error and a retry control.

**Navet Sub-controls** offers the same grouped controls as an independent card. Chips include separator and spacer types, with conditions and visual ordering; these layout entries never dispatch actions.

For advanced actions, reusable configurations, or display templates, see the [configuration guide](card-configuration.md).
