# Verification status

Use the [release notes](https://github.com/navet-app/navet-cards/releases) to identify a published build and the [release checklist](release-checklist.md) to record acceptance for the selected candidate. Check the workflow run for the commit you are testing.

| Check | What it covers |
| --- | --- |
| [Cards CI](../.github/workflows/ci.yml) | Type checking, configuration and provider contracts, release packaging, and Chromium tests with simulated entities |
| Live Home Assistant CI | Service round trips, permissions, and subscriptions against demo entities on Home Assistant 2024.6.4 and 2026.9.4 |
| [Rendered frontend checks](human-verification.md#rendered-frontend-checks) | Native selectors and details, visual editor round trips, and resource loading in an isolated Home Assistant instance |
| [Household and distribution checks](release-checklist.md) | Physical devices, companion apps, client performance, and installation of the selected release |

## Home Assistant 2026.11.1

On November 14, 2026, a local `0.1.0-beta.3` bundle built from commit `a145c37` passed manual installation on a disposable Home Assistant 2026.11.1 instance. The desktop browser check covered card-picker registration, Sections and Masonry, dashboard persistence, room controls, and light, switch, climate, cover, and media commands against demo entities. Switching the dashboard resource to the published Dev bundle and back preserved the saved cards.

The same instance rejected a clean Marketplace add when GitHub offered only a prerelease. Verify add and resource registration with the regular release before marking the distribution check complete. [Issue #6](https://github.com/navet-app/navet-cards/issues/6)
