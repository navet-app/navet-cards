# Climate and vacuum option backend validation

The opt-in backend scenario in `tests/live/home-assistant.test.ts` now discovers and tests five option capabilities through the production Home Assistant provider:

| Capability | Advertised list | Round-trip state attribute |
| --- | --- | --- |
| Climate preset | `preset_modes` | `preset_mode` |
| Climate fan | `fan_modes` | `fan_mode` |
| Climate swing | `swing_modes` | `swing_mode` |
| Climate horizontal swing | `swing_horizontal_modes` | `swing_horizontal_mode` |
| Vacuum fan speed | `fan_speed_list` | `fan_speed` |

Each case refreshes actual host state and registries, discovers an available entity with the capability, requires its current value to belong to the advertised list, and selects a different advertised option. It submits the typed command through `executeCommand`, which rechecks the current owner, feature and option list, then waits for a backend state round trip. No REST state injection or invented capability flags are used.

The scenario emits machine-readable `exercised` and `skipped` diagnostics. Missing capability, unknown current state and absence of an alternative option produce an explicit skip, not a pass claiming device support. The scenario retains its existing disposable helpers, permissions and domain checks.

The mappings were verified against Home Assistant 2026.10.2 primary source: [climate features](https://github.com/home-assistant/core/blob/2026.10.2/homeassistant/components/climate/const.py), [climate services](https://github.com/home-assistant/core/blob/2026.10.2/homeassistant/components/climate/services.py), [vacuum features](https://github.com/home-assistant/core/blob/2026.10.2/homeassistant/components/vacuum/const.py) and [vacuum services](https://github.com/home-assistant/core/blob/2026.10.2/homeassistant/components/vacuum/services.py). The older backend must independently advertise each option before a test runs.

## Execution evidence, 2026-10-20

One bounded run passed against the existing isolated Navet demo backend, Home Assistant **2026.9.4**, at loopback port **18124**. The test completed in **6.48 seconds** (6.71 seconds including the test runner). All five new option capabilities performed a real service call and reported the requested backend state:

| Capability | Actual demo entity | Requested and observed value |
| --- | --- | --- |
| Climate preset | `climate.ecobee` | `eco` |
| Climate fan | `climate.hvac` | `on_low` |
| Climate swing | `climate.hvac` | `auto` |
| Climate horizontal swing | `climate.hvac` | `rangefull` |
| Vacuum fan speed | `vacuum.demo_vacuum_0_ground_floor` | `min` |

The same run passed the existing capability checks for light color/effect, thermostat target range and cover tilt, plus the earlier backend contracts. Its capability diagnostic recorded **nine exercised capabilities and zero skips**. The local runner log is `/tmp/navet-device-live-2026-9-4.log`; it contains capability results without session credentials.

Executed once:

```sh
NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json npm run test:live
```

The existing 2026.9.4 demo container, Compose configuration and lifecycle were preserved. Its real attributes supplied all tested option lists and current values. No household host was contacted.

## Minimum-version evidence: Home Assistant 2024.6.4

One bounded run passed against the disposable minimum-version backend on loopback port **18125**, completing in **9.94 seconds** (10.06 seconds including the test runner).

| Capability | Actual demo entity | Requested and observed value |
| --- | --- | --- |
| Climate preset | `climate.ecobee` | `eco` |
| Climate fan | `climate.hvac` | `on_low` |
| Climate swing | `climate.hvac` | `auto` |
| Vacuum fan speed | `vacuum.0_ground_floor` | `min` |
| Climate horizontal swing | None selected | Explicit diagnostic skip: no available demo climate advertises a valid current option and an alternative |

The capability diagnostic recorded **eight exercised capabilities and one skipped capability**, including the earlier color, effect, target-range and tilt round trips. The enclosing backend test passed; its capability skip is recorded in diagnostics rather than counted as a skipped test. Horizontal swing therefore has real backend evidence on 2026.9.4 only, with feature-driven omission on this 2024.6.4 fixture.

```sh
NAVET_HA_SESSION=.ha-validation/2024.6.4/session.json npm run test:live
```

The dedicated `navet-cards-ha-2024-6-4` container was recreated only after confirming its name was absent and port 18125 was free. It uses the exact official `ghcr.io/home-assistant/home-assistant:2024.6.4` image, validation label and preserved `.ha-validation/2024.6.4/config` bind. Existing configuration and private session files were preserved; bootstrap was not rerun. The image had to be fetched because it was absent locally. A single bounded curl request with built-in retries established readiness before the one backend run.

The minimum-version container remains running for the integrator's frontend check; the integrator should stop this dedicated container afterward. The separate 2026.9.4 Compose host remains unchanged. The local minimum-version runner log is `/tmp/navet-device-live-2024-6-4.log`. Session files contain credentials; do not copy their contents into logs or documentation.

This backend scenario does not establish frontend, physical-device, household, HACS or maintainer acceptance.
