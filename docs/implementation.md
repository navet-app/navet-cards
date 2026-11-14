# Architecture

Navet Cards registers Lit custom elements with Home Assistant’s card picker. Each card uses Shadow DOM for its styles and owns its configuration, appearance, and interaction state. Home Assistant supplies dashboard layout, state, authentication, and service APIs.

| Area | Source | Responsibility |
| --- | --- | --- |
| Card models | [`src/core.ts`](../src/core.ts) | Normalize entity state, capabilities, and commands |
| Home Assistant adapter | [`src/providers/home-assistant.ts`](../src/providers/home-assistant.ts) | Map state and translate capability-checked commands through the Home Assistant host |
| Card rendering | [`src/card.ts`](../src/card.ts) | Render cards and manage their lifecycle |
| Configuration | [`src/config.ts`](../src/config.ts), [`src/editor.ts`](../src/editor.ts) | Validate config and submit visual edits through Home Assistant’s editor |
| Composition | [`src/composition/`](../src/composition/) | Resolve room controls, child cards, actions, and display data |
| Browser preview | [`demo/`](../demo/) | Exercise the cards with simulated entities |

Card state comes from Home Assistant’s `hass` property and supported frontend contexts. Card services use the supplied session. Cards release subscriptions when disconnected, and room child cards are mounted while their panel is open. Visual editing preserves fields outside the editor’s controls.

See the [configuration guide](card-configuration.md) for user-facing behavior, [Contributing](../CONTRIBUTING.md) for builds and tests, and [verification status](verification-status.md) for test scope.

## Home Assistant interfaces

- [Custom card API](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/)
- [Frontend data and contexts](https://developers.home-assistant.io/docs/frontend/data/)
- [Dashboard actions](https://www.home-assistant.io/dashboards/actions/)
