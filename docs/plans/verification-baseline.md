# Competitive implementation verification baseline

This is a bounded Q02 starting slice. It complements `tests/browser/performance.spec.ts`; it does not complete Q02 or establish household-device acceptance.

## Reusable kitchen dataset

`tests/fixtures/kitchen.ts` supplies simulated state, areas and devices for seven visible room members, plus explicit-area override, hidden, disabled and diagnostic exclusions. It includes light color capability metadata, a temperature device class, window contact, blind position, thermostat and unavailable media player. Its legacy room configuration has nested unknown fields, advanced action data and grid settings for save/reopen checks. Consumers must clone data before modifying it.

Use this dataset for the subsequent room editor journey instead of increasing the demo's public surface. Future editor tests should exercise actual selectors, membership, ordering, conditions, action editing and duplication once those features exist. The baseline tests currently edit only the existing Name field; they do not claim complete visual room setup.

## Current gates and observations

`tests/browser/room-baseline.spec.ts` adds two browser scenarios:

- Reopen a realistic room through twelve detach/reattach cycles. Each observed context subscription must release exactly once; navigation while detached must leave zero detail rows. Replacing the device registry must remove the two moved members. Thirty relevant state updates must preserve all five remaining controls and show the final changed state.
- Edit and serialize the existing room configuration, reopen it in a new editor and render it as a preview. The original input remains unchanged, nested unknown/action/grid fields survive, and the preview makes zero service calls and retains zero detail controls.

The tests attach `room-reconnect-baseline.json` and `room-config-roundtrip.json` through Playwright. Use a JSON/HTML reporter to retain attachments. Relevant update P50/P95 covers assignment through Lit update completion; it excludes paint, service latency and real device round trips. It is recorded as a baseline observation without an unmeasured device threshold.

Retain the existing synthetic performance gate: 20 rooms, 5,000 registry entries, one shared index scan, zero unrelated renders, zero retained rows after 100 open/close cycles, setter P95 below 5 ms. That setter measurement differs from the new update-completion measurement and must not be compared as equivalent latency.

## Reproduce

```sh
npm run build
NAVET_PREVIEW_PORT=4191 NAVET_BROWSER_CHANNEL=chrome npx playwright test tests/browser/room-baseline.spec.ts
```

Initial focused run: two tests passed on desktop Chrome, 2026-10-20. TypeScript passed after the final test changes. Integration must rerun the standard repository checks against the final shared source and built resource. No mobile, physical kiosk, real HA, heap-retention or HACS evidence was collected here.

Further Q02 work follows the features it measures: complete room journey, hidden views, query deduplication, artwork, long-session memory recovery and named household clients. Avoid adding speculative tests for unavailable interfaces.
