# Assist, custom events and action sequences

The bounded A02 slice adds Assist, standard custom DOM events and ordered, nested action sequences. This extends the shared action executor used by main cards, chips and sub-controls.

## Host contract

Home Assistant 2026.9.4 pins frontend `20260826.7`; the minimum Home Assistant 2024.6.4 pins `20240610.1`. The minimum manifest was also checked directly in the stopped, isolated validation container; no container startup or state mutation was required.

- Assist has optional `pipeline_id` and `start_listening`; native action handling defaults to `last_used` and `false`. Navet dispatches a composed, bubbling `hass-action` with `{config:{tap_action:{action:'assist',pipeline_id,start_listening}},action:'tap'}` after its own confirmation. The HA action mixin owns dialog loading and the companion app bridge. No microphone or pipeline service is called directly by Navet. Sources: [current action mixin](https://github.com/home-assistant/frontend/blob/20260826.7/src/state/action-mixin.ts), [current action handler](https://github.com/home-assistant/frontend/blob/20260826.7/src/panels/lovelace/common/handle-action.ts), [minimum action mixin](https://github.com/home-assistant/frontend/blob/20240610.1/src/state/action-mixin.ts), [minimum action handler](https://github.com/home-assistant/frontend/blob/20240610.1/src/panels/lovelace/common/handle-action.ts).
- `fire-dom-event` uses the standard `ll-custom` event, with the entire action configuration as its detail. Foreign fields are preserved. It does not select an arbitrary event name. Sources: the pinned current and minimum action handlers above, plus the [official event helper](https://github.com/home-assistant/frontend/blob/20260826.7/src/common/dom/fire_event.ts).
- HA owns whether Assist opens a web dialog or sends `assist/show` to a capable companion app. Sources: [current voice dialog helper](https://github.com/home-assistant/frontend/blob/20260826.7/src/dialogs/voice-command-dialog/show-ha-voice-command-dialog.ts), [minimum helper](https://github.com/home-assistant/frontend/blob/20240610.1/src/dialogs/voice-command-dialog/show-ha-voice-command-dialog.ts).

The raw minimum frontend files were fetched directly from those pinned official paths after the browsing cache returned a miss. This is source verification; it does not establish native dialog or companion app acceptance.

## Sequence behavior

`{action:'sequence',sequence:[...],continue_on_error?:boolean}` executes steps in order and awaits service responses. Each step may have its own confirmation; declining one stops the sequence. Errors stop by default. An enclosing sequence with `continue_on_error:true` may continue with its next step. Bounds apply before side effects: at most 24 steps in one sequence, eight nested levels and 256 actions in the entire tree. These are action graph validation limits, not bundle size ceilings.

The executor snapshots the complete action tree before confirmation. Configuration replacement, preview mode, disconnection or explicit cancellation aborts remaining steps. Awaiting confirmation or a service settles promptly on cancellation; late service rejection is consumed. An already dispatched service may still complete, and completed actions remain applied. No arbitrary JavaScript, delayed steps, rollback or transactional semantics are included.

The visual field authors Assist options, standard custom-event JSON fields, and nested steps with add/remove/reorder controls. Existing foreign fields survive unrelated edits.

## Evidence

The focused unit run passed 13 tests: eight new sequence/Assist/custom-event tests and five existing action tests. It covers ordering, snapshot isolation, nested error handling, confirmation cancellation, lifecycle cancellation, unavailable preview contexts and malformed/broad/deep graph rejection. TypeScript passed.

Ten unique browser scenarios passed across `tests/browser/action-sequences.spec.ts`, `tests/browser/actions.spec.ts` and `tests/browser/navigation-actions.spec.ts`: six new scenarios plus four existing gesture/navigation checks. The four affected cases passed after correcting the cancel control's stacking position. They verify configuration replacement during a pending service, explicit user cancellation, toggle-then-service continuation and visual editing with foreign event payloads. The other scenarios cover ordered host events, recoverable service errors, preview blocking and existing navigation/gesture behavior.

Inspected 390×844 screenshots of the running sequence's cancel control and the visual sequence editor. The cancel button is reachable above the card's primary-action overlay, and the nested editor has no horizontal overflow. Evidence was captured under `/tmp/navet-sequence-affected-proof`; focused logs are `/tmp/navet-sequence-browser.log` and `/tmp/navet-sequence-affected.log`.

Browser simulation verifies the Assist event bridge payload; it does not establish native Assist dialog, actual pipeline execution, microphone, companion app, physical device or third-party event-consumer acceptance. Those require separate native/frontend or household checks.
