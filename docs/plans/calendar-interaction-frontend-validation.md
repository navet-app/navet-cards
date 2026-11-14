# Calendar and interaction frontend validation — 2026-10-20

The first-batch development candidate was frozen under the disposable Home Assistant 2026.9.4 host's isolated `/local/competition-m6/` prefix after the integrated check passed (161 unit/provider, 16 release/build, 156 browser scenarios). The canonical registered resource, dashboard, registries, users and container lifecycle were preserved.

| Profile | Entry SHA-256 |
| --- | --- |
| Standalone | `f421c11550dabdb5f4e5cf6605255a1cfe278462e66a076d22f2d8690eabb96a` |
| Modular | `4cadc29c301aa69bcf71bbaa10d4c348d61293856b9bc7c811756c909e19b9b7` |

The [dedicated harness](../../scripts/ha-calendar-interaction-check.mjs) uses a fresh desktop standalone context (1280 × 900) and phone modular context (390 × 844), the real HA frontend and native calendar entity selector. Calendar data comes from actual read-only `/api/calendars/<entity>` requests. It never synthesizes events to claim backend acceptance. Momentary interaction dispatch uses an overridden `callService` function and records only fixture service calls; no interaction command reaches the backend. WebSocket service calls, page errors and preview calendar requests are asserted zero.

Credentials remain in the ignored disposable session file. The harness fills username/password fields explicitly and redacts those credentials from error reports. It never passes the session object into page evaluation or logs it.

Both contexts passed. Each selected actual `calendar.calendar_1` through HA's multiple-entity picker, changed the window to 14 days, preserved an unknown field through JSON save/reopen, fetched a successful backend calendar response, and displayed one actual event. Its read-only event dialog opened and closed successfully. The native selector advertised `multiple: true`; this run selected one calendar and does not establish multi-calendar backend acceptance.

Each context also verified locked controls, explicit unlocking, a Space-key press and release recorded only by the overridden service function, automatic relocking after one second, and disabled previews. Both recorded **zero backend service calls, zero preview calendar requests and zero unhandled page errors**. The modular context loaded deferred relative chunks. Phone agenda and native editor screenshots were inspected: event details and controls fit the 390-pixel viewport.

The first attempt hit a harness-only shadow-root readiness race; the guard was corrected before the successful run. No application change or backend mutation was needed.

Evidence is written to the ignored `.ha-validation/2026.9.4/calendar-interaction-evidence-competition-m6/` directory. These checks do not establish physical-device, HACS, minimum-version or maintainer acceptance. The next development build may differ from this frozen candidate; the entry hashes identify the scope of this evidence.

Reproduce against the retained isolated artifact copy and existing disposable host:

```sh
NAVET_HA_ARTIFACT_PREFIX=competition-m6 node scripts/ha-calendar-interaction-check.mjs
```
