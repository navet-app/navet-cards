# Comfort and remote backend validation

The opt-in `tests/live/comfort-remote.test.ts` scenario discovers real entities on an isolated Home Assistant demo instance, sends commands through production `executeCommand`, reads the resulting backend state, and restores the original reported values. It never injects synthetic entity state. Each check is independent; service errors fail the check rather than becoming diagnostic skips.

Required evidence is an advertised capability and a known current value with a different valid target. Remote activity additionally requires an advertised activity list containing both the current activity and another activity. Missing capabilities or unknown values produce explicit skips. Power checks require both power capabilities and compare the opposite power state and its restoration; they do not establish hardware with independent power flags.

## Bounded execution, 2026-10-20

Both containers were verified as dedicated Navet validation hosts with the `navet-cards.validation=true` label and high loopback ports. No household container, host configuration or canonical frontend resource was changed. Credentials are omitted from this document and the test logs. The [progress ledger](implementation-progress.md) records an accidental disclosure of disposable test credentials in tool output during metadata inspection.

| Check | HA 2026.9.4, port 18124 | HA 2024.6.4, port 18125 |
| --- | --- | --- |
| Humidity target | `humidifier.humidifier`: 70%, then restored | Same entity: 69%, then restored |
| Humidifier mode | `humidifier.hygrostat`: `eco`, then restored | Same entity and value, then restored |
| Water temperature | `water_heater.demo_water_heater`: 49.3 °C, then restored | Same entity and value, then restored |
| Water operation | Same heater: `electric`, then restored | Same entity and value, then restored |
| Away mode | Same heater: `true`, then restored | Same entity and value, then restored |
| Humidifier power | Opposite state and restoration verified | Same checks passed |
| Water heater power | Opposite state and original operation restored | Same checks passed |
| Remote power | `remote.remote_one`: on, then restored off | Explicit skip: no remote entities supplied by this demo configuration |
| Remote activity | Explicit skip: actual demo remotes advertise feature flags 0 and no activities | Explicit skip: no remote entities supplied by this demo configuration |

The current-version run exercised eight capabilities, with one explicit remote-activity skip and no failures. The minimum-version run exercised seven capabilities, with two explicit skips because its demo configuration provides no remote entities, and no failures. Total scenario process durations were 0.43 seconds and 0.21 seconds respectively. Service completion was followed by a fresh backend read; no sleep or polling loop was used.

Run this dedicated scenario directly to avoid repeating unrelated opt-in backend scenarios:

```sh
NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json node --import tsx --test tests/live/comfort-remote.test.ts
NAVET_HA_SESSION=.ha-validation/2024.6.4/session.json node --import tsx --test tests/live/comfort-remote.test.ts
```

Local logs: `/tmp/navet-comfort-remote-live-2026-9-4.log` and `/tmp/navet-comfort-remote-live-2024-6-4.log`.

The current-version host was already running and is left running. The minimum-version host was stopped initially; it was restarted only for this verification and was returned to its original stopped state after the checks. This demo evidence does not establish physical-device, household, HACS or maintainer acceptance. Remote activity still requires a backend that actually advertises that capability.
