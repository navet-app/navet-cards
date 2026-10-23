# Media backend validation

The opt-in scenario in `tests/live/home-assistant.test.ts` discovers actual media players and exercises typed production-provider commands for:

- Seek: requires an advertised capability, a known current position and positive duration, selects a different position within the duration, and checks the reported backend position.
- Repeat: requires a known valid current enum and submits a different normalized repeat option.
- Shuffle: requires a known boolean and submits its opposite.
- Power pair: requires both advertised power flags on an available active player, switches it off, observes off/standby, then switches it on using freshly read state. Restoration runs in `finally` after an accepted off command. This establishes paired behavior only; it does not establish independent single-flag hardware coverage.

Every service passes through `executeCommand`, including current-owner, feature, state and argument validation. No backend state is injected. Unsupported or unknown current data produces an explicit capability skip.

## Bounded execution evidence, 2026-10-20

The first authorized run on each disposable backend failed at the first new seek operation, after existing capability checks had passed:

| Backend | Existing capabilities completed | New media result |
| --- | --- | --- |
| HA 2026.9.4, loopback 18124 | Nine | Seek service returned `unknown_error`; later media cases were not reached |
| HA 2024.6.4, loopback 18125 | Eight, plus the existing horizontal-swing diagnostic skip | Seek service returned `unknown_error`; later media cases were not reached |

The minimum-version container's recent exception trace identifies `MediaPlayerEntity.media_seek` raising `NotImplementedError`. The demo advertises seek support without implementing the seek method. The [2026.9.4 official demo source](https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/components/demo/media_player.py) also advertises seek for its YouTube player while providing no seek override. This is a backend fixture limitation; it does not establish a successful seek round trip.

The strict-run logs are retained locally at `/tmp/navet-media-live-2026-9-4.log` and `/tmp/navet-media-live-2024-6-4.log`. These initial failures are retained as evidence; seek has no successful real-backend round trip from this validation.

## Explicit demo exception and follow-up results

Default behavior remains strict: the seek check runs and an unsuccessful service fails the scenario. No generic backend errors are caught or converted to passing results.

An explicit `NAVET_LIVE_SKIP_DEMO_MEDIA_SEEK=1` exception excludes only this audited demo seek case. The CI matrix explicitly enables it for its two pinned demo versions; default opt-in device runs remain strict. The exception is restricted to disposable 2026.9.4 and 2024.6.4 sessions and emits this exact capability diagnostic:

```text
demo advertises SEEK but backend NotImplementedError confirmed on2026.9.4/2024.6.4
```

One authorized follow-up per host, with that flag, passed the remaining media checks:

| Media check | Real entity on both hosts | Submitted value / observed outcome |
| --- | --- | --- |
| Repeat | `media_player.walkman` | `one` observed in the backend |
| Shuffle | `media_player.living_room` | `true` observed in the backend |
| Power pair | `media_player.living_room` | Off/standby observed after power-off, then available active state observed after power-on |
| Seek | Advertised demo player | Explicit audited exception; no seek success claimed |

The 2026.9.4 scenario passed in **2.97 seconds**, with **12 exercised capabilities and one diagnostic skip**. The 2024.6.4 scenario passed in **7.77 seconds**, with **11 exercised capabilities and two diagnostic skips**: audited seek plus the previously recorded unsupported horizontal climate swing. The monolithic scenario also repeated its existing helper, permission and capability checks.

```sh
NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json NAVET_LIVE_SKIP_DEMO_MEDIA_SEEK=1 npm run test:live
NAVET_HA_SESSION=.ha-validation/2024.6.4/session.json NAVET_LIVE_SKIP_DEMO_MEDIA_SEEK=1 npm run test:live
```

Follow-up logs are `/tmp/navet-media-live-followup-2026-9-4.log` and `/tmp/navet-media-live-followup-2024-6-4.log`. TypeScript and whitespace checks passed. No production mapping or host configuration was altered for the exception.

Real seek acceptance still requires a backend that implements its advertised seek capability and a passing **strict** run without the exception. Paired demo power checks do not establish independent power-on-only or power-off-only hardware coverage.

Both hosts' configuration and lifecycle were preserved. The minimum-version container remains running for the integrator's final frontend check. Backend demo evidence does not establish physical-device, household, HACS or maintainer acceptance.
