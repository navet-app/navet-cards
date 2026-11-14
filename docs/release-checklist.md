# Release checklist

Follow the [release workflow](release-workflow.md) to publish Dev builds and promote tested candidates. Stable publication requires installing and testing the selected beta/RC.

## Automated evidence

Use [verification status](verification-status.md) for the beta's recorded evidence and [human verification](human-verification.md) for installation and acceptance.

- Install from the lockfile with `npm ci`.
- Run `npm run check` with Chromium available.
- Verify `dist/navet-cards.js` stays under the bundle budget and embeds the package version.
- Review phone/tablet/desktop and light/dark/black/glass screenshots, long titles, missing entities, and command errors.

## Isolated Home Assistant validation

- Install the resource on the compatibility-target version and current stable Home Assistant.
- Add each card through the picker and through YAML in Sections and Masonry views.
- Resize cards, edit/save/reload repeatedly, and verify wrapped titles and all controls remain visible.
- Mix cards with built-in cards and Bubble Card; check styles, events, dialogs, and URL navigation.
- Confirm no extra login/socket is created and non-admin users see clear capability/registry behavior.
- Exercise service success, permission denial, unavailable state, reconnection, entity removal, and registry changes.
- Verify light brightness, input_boolean switching, media feature combinations, Celsius/Fahrenheit climate ranges, and cover position against real HA service calls in the test instance.
- Verify keyboard activation, hold/double-tap, touch scrolling, focus return, Escape, reduced motion, and companion-app WebViews.
- Verify a 30-card dashboard stays responsive during unrelated state updates.

## Distribution validation

- Verify a clean manual install, versioned resource refresh, upgrade, and rollback.
- Verify the candidate package contains the standalone `navet-cards.js` asset named in `hacs.json`. Install the beta or RC manually for candidate testing. Marketplace and legacy HACS skip prereleases by default on a clean add.
- After publishing the regular release, connect GitHub on a clean Home Assistant 2026.11.1 or later instance and add `https://github.com/navet-app/navet-cards` through **Settings → Marketplace → Add from link**. Select **Dashboard** if prompted. Verify the add succeeds with default prerelease settings, and record the Home Assistant version and selected release tag.
- Install from Marketplace and verify it registers a single JavaScript module under `/local/community/navet-cards/` and that Navet appears in the card picker. Verify upgrade and rollback when a second release is available. Check the Dashboard custom-repository add and resource registration on a supported legacy HACS installation as well.
- Set the supported Home Assistant minimum from live evidence, then align `hacs.json` and README.
- Record tested HA/browser/app versions and unresolved issues in release notes.
- Complete the applicable live gates before promoting Dev to beta/RC, and install the selected candidate before stable publication. Default HACS catalog inclusion is a separate submission.
