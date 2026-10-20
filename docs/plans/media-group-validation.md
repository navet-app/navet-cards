# Explicit media grouping — 2026-10-20

The D03 grouping slice adds reported membership and explicit join/leave controls. HA's `GROUPING` feature bit (`524288`) grants `media_join` and `media_unjoin`; incidental group attributes grant neither capability. The provider normalizes valid, unique media-player IDs in `group_members`, preserving the distinction between an unknown and empty reported list.

The provider supplies candidate IDs, display names and availability. The widget receives those normalized values and never reads HA payloads. Every other valid media player is listed without assuming cross-integration compatibility; unavailable entries are disabled. No candidates are selected automatically. Joining targets the owning player with only the checked `group_members`; leaving targets only that owner. Home Assistant determines whether the selected integrations can group together and its errors remain visible to the user.

Before dispatch, the provider rechecks the exact current owner, its feature bit and availability, then validates every selected member against the latest state. Empty, duplicate, self, non-media, unavailable and mismatched-owner selections are rejected without broadening the request. Powered-off players remain eligible when HA advertises grouping and the entity is available; this slice does not invent a playback-state restriction.

Selection is transient per widget. It resets on owner, capability, group snapshot, candidate context, preview/disabled state or disconnect. A queued click from an obsolete context cannot emit a command. Preview and disabled widgets cannot dispatch grouping commands.

## Verification

Six focused provider tests passed: independent feature flags, membership normalization and immutability, normalized candidates, exact join/unjoin payloads, current owner/member revalidation and invalid selection rejection. The tests are [media-groups.test.ts](../../tests/media-groups.test.ts).

Four browser cases in [media-groups.spec.ts](../../tests/browser/media-groups.spec.ts) cover explicit selection and exact native-card dispatch, stale members plus backend compatibility failure/retry, context/lifecycle reset and queued clicks, and preview/disabled/capability withdrawal. All four passed in the integrated full check: 127 unit/provider tests, eight release tests, eight build/manifest tests and 136 Chromium scenarios (28.2 seconds). The 390px phone screenshot `/tmp/navet-media-grouping-phone.png` was inspected: the normalized player choices, disabled unavailable player, grouping explanation and Join/Leave actions fit inside the native dialog without horizontal overflow.

The follow-up Q01 slice localizes grouping labels, unknown membership, unavailable states and integration guidance in English and Swedish. The widget's `.language` comes from its owning card, while integration-provided player names stay unchanged. Grouping buttons now use inherited per-card control/text tokens. Three locale/theme browser scenarios passed across focused runs, alongside all four grouping regressions. The actual light-card test exposed a preexisting media dialog token mismatch; the scoped parent-dialog fix passed the affected light/dark follow-up. Regenerated 390px phone screenshots were inspected with readable grouping actions on both surfaces. These checks measure enabled controls against the tested dialog colors; they do not claim a complete accessibility audit.

No actual backend grouping, physical speakers, cross-integration combinations or companion apps are accepted by these simulated checks. A group candidate's presence is not a compatibility guarantee. No queue management, automatic playback-position clock or implicit whole-home grouping is added. Bundle sizes remain report-only with no ceilings.

## Primary contracts

- [HA 2026.9.4 media-player constants](https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/components/media_player/const.py): GROUPING and group_members.
- [HA 2026.9.4 media-player services](https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/components/media_player/services.yaml): join, unjoin and group_members.
- [HA media-player entity documentation](https://developers.home-assistant.io/docs/core/entity/media-player/): integration-owned grouping implementation.
