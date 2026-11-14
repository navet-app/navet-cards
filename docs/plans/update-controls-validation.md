# Update controls validation

This slice adds normalized update versions, reported progress, literal release summaries, safe release links and explicit latest-version installation, skip and clear-skipped intents. The parent card requires confirmation before dispatching an installation. The provider rechecks the exact current entity, capabilities, progress state and requested version after confirmation. A changed offered version aborts the command.

## Primary-source contract

The pinned official Home Assistant [2024.6.4 update implementation](https://github.com/home-assistant/core/blob/2024.6.4/homeassistant/components/update/__init__.py) and [2026.9.4 update implementation](https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/components/update/__init__.py) establish these service constraints:

- `update.install` requires the INSTALL feature and no installation in progress. This slice sends an empty payload for the latest version, after explicit confirmation.
- `update.skip` and `update.clear_skipped` do not require INSTALL. They are unavailable when automatic updates are enabled. The UI requires an explicit reported `auto_update: false` and an appropriate known offered or skipped version.
- Install and skip require different known installed/latest versions. A state of `off` only offers installation when it reflects the latest version being skipped; an older advertised latest version does not create an installation action.
- Legacy numeric `in_progress`, including zero, means busy and supplies reported progress when PROGRESS is advertised. Current `update_percentage` is shown only while busy with advertised PROGRESS. Unknown busy state exposes no mutation controls.

The common feature values were verified against the pinned [minimum-version constants](https://github.com/home-assistant/core/blob/2024.6.4/homeassistant/components/update/const.py) and [current-version constants](https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/components/update/const.py): INSTALL=1, SPECIFIC_VERSION=2, PROGRESS=4, BACKUP=8 and RELEASE_NOTES=16. Arbitrary versions, backup selection and fetching/rendering release-note content remain deferred. Native entity details remain available through the owning card.

## Bounded verification, 2026-10-20

Five focused provider tests pass. They cover independent feature/policy gating; unknown/malformed versions; nonmutating normalization; unsafe release URL rejection; legacy and current progress; exact service/payload/owner mapping; and changed owner, offered version, installation state or policy rejection.

Three Chrome browser scenarios pass against a simulated host in 2.1 seconds:

1. Opening controls sends no service. Dismissing installation confirmation sends no service. Accepting confirmation sends exactly one simulated latest-version install request. Release summary HTML remains literal and the release link has safe external-link attributes.
2. Skip and clear-skipped send exact simulated service requests. Numeric legacy progress at zero renders as an active installation and removes mutation controls.
3. Preview disables commands and removes the release-link destination. A latest-version change during confirmation prevents installation.

The phone dialog screenshot was inspected at `/tmp/navet-update-proof/update-controls-update-con-d7941-fore-simulated-installation-chromium/update-controls-phone.png`. Versions, release summary, link and buttons are readable, with no horizontal overflow.

No real installation, firmware update, reboot or update-service mutation was attempted against a live backend. These tests establish provider and simulated browser behavior only; hardware, household, HACS and maintainer acceptance remain separate.
