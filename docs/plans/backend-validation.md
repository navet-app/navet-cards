# Backend validation of device controls

This records isolated demo-backend evidence for the expanded room/control work.
It does not certify household devices, companion apps, actual HACS installation,
manufacturer integrations, or every feature in the competitive implementation plan.

## Scope and safeguards

The opt-in test reads a private session under ignored `.ha-validation/`, refreshes
its token without printing it, and requires the expected named validation host on
a dedicated high loopback port. It does not use a household installation.
Disposable member/read-only credentials remain private. The existing service
round trips and permission checks remain in the same test, whose socket closes
in `finally`.

The new slice discovers actual advertised capabilities on the demo entities.
It sends color, effect, temperature-range and tilt-position commands through the
production provider adapter and checks normalized state read back from HA. It
selects a different value from current backend state, including refreshing effect
state after color changes. Unsupported capabilities are recorded as explicit
skips rather than manufactured attributes or successful checks.

## Results on 20 October 2026

| Backend | Host | Extended result |
| --- | --- | --- |
| Home Assistant 2026.9.1 | Official pinned container, loopback 18129 | Passed; all four requested capability families exercised; no capability skips |
| Home Assistant 2024.6.4 | Fresh official pinned container, loopback 18125 | Passed; all four requested capability families exercised; no capability skips |

The checked runs exercised:

| Capability | Actual demo entity | 2026.9.1 read-back | 2024.6.4 read-back |
| --- | --- | --- | --- |
| Color | `light.bed_light` | Hue 60°, saturation 75% | Hue 240°, saturation 75% |
| Effect | `light.bed_light` | `rainbow` | `none` |
| Target temperature range | `climate.ecobee` | Low 16.5, high 25.5 | Low 16, high 25.5 |
| Tilt position | `cover.living_room_window` | 60% | 40% |

No requested capability was skipped on either host. The existing single live test
passed in 2.72 seconds on 2026.9.1 and 9.95 seconds on 2024.6.4; these are whole-test
durations, not individual-command latency benchmarks.

Existing checks also covered brightness, switching, single thermostat target,
volume/playback, cover position, numeric/select helpers, HVAC mode, room registry
resolution, dashboard configuration and member/read-only service permissions.
Ten focused color/range/tilt contract tests passed. These checks do not establish
all color modes, every thermostat mode, directional/stop tilt behavior, or physical
hardware response.

The official minimum image was not cached and was pulled explicitly:
`ghcr.io/home-assistant/home-assistant:2024.6.4`, digest
`sha256:17d159928122e6f374bd39b0e75904522bc7d7c2a64e88b248948734e4c4d444`.
After confirming the dedicated minimum container was absent, the historical
`.ha-validation/2024.6.4` directory was renamed to
`.ha-validation/archive/2024.6.4-before-20261020`. The archive was absent before
renaming and was neither overwritten nor deleted. Fresh setup completed with the original
repository script and loopback port 18125. Both named validation containers were
left running for the integrator's frontend checks. After those checks passed,
both dedicated containers were stopped on 20 October 2026; private local configs
and the historical archive were retained. Household containers were unchanged.

## Reproduction and cleanup

After an authorized disposable host setup:

```sh
NAVET_HA_SESSION=.ha-validation/2026.9.1/session.json npm run test:live
NAVET_HA_SESSION=.ha-validation/2024.6.4/session.json npm run test:live
node --import tsx --test tests/climate-range.test.ts tests/light-color.test.ts
```

The backend test prints a compact exercised/skipped diagnostic containing entity
IDs and requested values, never session secrets. New evidence should retain the
exact backend version and its skip list. Restart only the dedicated named
validation containers for a future authorized run, then stop them when checks
finish. No household service or OpenHAB change is part of this procedure.
