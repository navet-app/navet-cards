# Human verification

Download the versioned ZIP from the selected [GitHub release](https://github.com/navet-app/navet-cards/releases) and extract it. It contains `navet-cards.js`, installation instructions, release notes, test status, build metadata, and `SHA256SUMS`. For a local source build, use the folder produced by the [contributor packaging command](../CONTRIBUTING.md#build-an-installable-resource).

## Install on your Home Assistant

1. Keep a copy of your existing dashboard configuration and any previous Navet Cards resource.
2. Copy `navet-cards.js` into `/config/www/`.
3. Add `/local/navet-cards.js?v=VERSION` as a JavaScript Module in dashboard resources, replacing `VERSION` with the version in the package instructions. If a Navet Cards resource already exists, update its URL so only one resource is registered.
4. Reload the frontend, add a Navet card through the card picker, and select a device you can safely operate.
5. Check the flows below in desktop browsers and the Home Assistant companion app you use.

Verify the copy with `shasum -a 256 -c SHA256SUMS` from the verification folder. For rollback, restore the previous file and resource URL, then reload the frontend.

## Household checks

- Light: on/off, brightness, a binary light, an unavailable device, and a real command failure.
- Switch: on/off for a switch and an input boolean.
- Sensor: a numeric value, zero, a binary sensor, an attribute, missing entity, and unavailable entity.
- Room: an area and an explicit entity list; open Controls, open native Details, press Escape, and check focus returns.
- Media: playback, volume, mute, skip and sources on devices with different supported controls.
- Climate: heating mode and a visible target temperature in your installation's units, allowed limits, and a device without a single target temperature.
- Cover: open, stop, close, and position where supported; multiple covers in a room panel.
- Number/select: native bounds and step, non-first option, rejected command and unavailable state.
- Composition: row disclosures, conditional sub-controls, navigation hashes, browser Back, preview mode and late/reconnecting host.
- Performance: 30–60 visible controls and 10–20 rooms on a named low-power device; compare opaque and glass effects, scrolling and repeated panel cycles. Record client model/browser, P95 local feedback/panel latency, long tasks and retained objects.
- Editing: change appearance/actions, save, close, reopen, save again, and reload. Confirm advanced YAML fields stay intact.
- Layout: Sections and Masonry, long titles, your smallest phone/tablet, dark/light themes, and mixed built-in/custom cards.
- Input: keyboard focus, tap, hold, double tap, scrolling across sliders, reduced motion, and dialogs in the companion app.
- Accounts: a household member and any restricted accounts used at home.
- Added entity families: fan speed, lock slide confirmation (including code-protected locks via details), vacuum start/pause/dock, scene/script activation, presence and current weather.
- Custom cards: live grouped readings, UPS metrics, battery percentages, energy sensor units, individual media playback, photo fallback and text-helper note persistence across reload.
- Upgrade: replace a resource with the versioned build URL, reload all frontends, then verify rollback.

Record the Home Assistant version, browser or companion-app version, card configuration, expected behavior, actual behavior, and a screenshot for any issue.

## Disposable local test host

Docker and Node.js 22 or newer are required. From this repository:

```sh
npm ci
npm run build
npm run ha:validation -- 2026.9.4 18124
NAVET_HA_SESSION=.ha-validation/2026.9.4/session.json npm run test:live
```

The setup binds to `127.0.0.1`, uses demo devices, and creates a dedicated dashboard with Masonry, Sections, 30 cards across five themes, and missing entities. It creates administrator, household-member, and read-only test users. Generated credentials are in the ignored `.ha-validation/<version>/session.json`; keep that file private. Open the URL printed by the setup and sign in with a test user. Existing containers and saved sessions are preserved; setup refuses to reset them.

### Manage the saved environment with Compose

The repository's `compose.yaml` manages the initialized 2026.9.4 environment at http://127.0.0.1:18124. Run the setup above once before using Compose; the Compose file reuses its configuration, dashboard and accounts, and refuses to create a missing configuration directory.

For the one-time switch from the container created by the setup script to Compose, run from the repository root:

```sh
docker stop navet-cards-ha-2026-9-4
docker rm navet-cards-ha-2026-9-4
docker compose up -d
```

Removing the container preserves the bind-mounted `.ha-validation/2026.9.4/config` directory and the adjacent `session.json` credentials. After switching, manage the environment with:

```sh
docker compose stop
docker compose start
docker compose logs --tail 100 -f homeassistant
```

Use `docker compose down` to remove the Compose container and network, then `docker compose up -d` to recreate them with the saved configuration. Keep `.ha-validation/` to preserve accounts and dashboards. Rebuilding the card still requires copying `dist/navet-cards.js` into `.ha-validation/2026.9.4/config/www/navet-cards.js` and refreshing the browser.

Use `2024.6.4 18125` with the setup script to check the compatibility target separately; this instance is outside the Compose project. Stop it with `docker stop navet-cards-ha-2024-6-4` after verification and resume it with `docker start navet-cards-ha-2024-6-4`.

## Acceptance

Accept the beta after household device and companion-app checks pass. HACS distribution requires a published release resource and a separate clean-install/upgrade check. The maintainer approves prerelease publication after reviewing this evidence.
