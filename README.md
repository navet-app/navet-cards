# Navet Cards

Compact Home Assistant dashboard cards for lights, rooms, climate, media, and more. Add them to your existing dashboard and configure them in the visual editor or with YAML.

![Navet Cards on a simulated Home Assistant dashboard](docs/images/dashboard.png)

Navet Cards is in early beta and requires **Home Assistant 2024.6.4 or later**. Read the notes for the release you install to see which features it includes.

## Install Navet Cards

1. Open [GitHub Releases](https://github.com/navet-app/navet-cards/releases) and download `navet-cards.js` from **Assets**.
2. Copy it to `/config/www/` in Home Assistant. If you just created the `www` directory, restart Home Assistant.
3. In your dashboard, choose **Edit dashboard → Manage resources**. Enable Advanced mode in your profile if the resource menu is hidden.
4. Add `/local/navet-cards.js?v=VERSION` as a **JavaScript module**, using the version from the release notes. If you already have a Navet resource, update its URL.
5. Refresh the dashboard, choose **Add card**, and search for **Navet**.

### Marketplace and HACS distribution

Adding Navet Cards from a link requires a regular [GitHub release](https://github.com/navet-app/navet-cards/releases) with the standalone `navet-cards.js` asset. While only prereleases are available, follow the manual installation steps above.

On Home Assistant 2026.11 and later, open **Settings → Marketplace → Add from link** and enter `https://github.com/navet-app/navet-cards`. Connect GitHub when prompted and select **Dashboard** if Marketplace asks for a type. On earlier versions with HACS, use **Custom repositories** and select **Dashboard**. See the [Marketplace custom repository guide](https://www.home-assistant.io/integrations/marketplace/#custom-repositories) or the [HACS custom repository guide](https://www.hacs.xyz/docs/faq/custom_repositories/).

## Configuration

Use the card’s visual editor to select entities and adjust its appearance. The [card configuration reference](docs/card-configuration.md) covers supported entities, YAML examples, actions, themes, and upgrades. To build a room dashboard, start with the [room setup guide](docs/room-setup.md).

## Help and contributing

- [Ask a question](https://github.com/navet-app/navet-cards/discussions) or [report a bug](https://github.com/navet-app/navet-cards/issues/new/choose). Include the Navet Cards and Home Assistant versions and a minimal card configuration.
- [Contribute or run a local preview](CONTRIBUTING.md) · [Verification status](docs/verification-status.md) · [Release workflow](docs/release-workflow.md)
- [License](LICENSE) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md)
