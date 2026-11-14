# Calendar agenda implementation and evidence

The dedicated Calendar card provides a visually configured multi-calendar read-only agenda. Configuration selects calendar entities, a host-local day window and offset, maximum events, a plain text filter, location visibility and an optional shared event action. The default action opens a keyboard-accessible contained event dialog. Descriptions and locations remain text; event creation is outside this slice.

## API and date semantics

The provider reads `GET calendars/<entity>?start=<offset-aware ISO>&end=<offset-aware ISO>` using HA's authenticated `callApi`. The [official REST API](https://developers.home-assistant.io/docs/api/rest/#get-apicalendarscalendar_entity_id) documents the event list and `date`/`dateTime` variants. The [pinned HA 2026.9.4 CalendarEventView](https://github.com/home-assistant/core/blob/2026.9.4/homeassistant/components/calendar/__init__.py#L732) checks read permission, parses both query bounds, retrieves events, and returns the API event representation. The [calendar best practices](https://developers.home-assistant.io/blog/2023/03/28/calendar_best_practices/) specify exclusive all-day end dates. The matching `CalendarEventView` and `_api_event_dict_factory` were also inspected directly from the official HA 2024.6.4 container, copied read-only while stopped: the same GET path, offset-aware bounds, and `date`/`dateTime` response variants are present. This is minimum-version source compatibility evidence, not a minimum-version runtime check.

All-day boundaries use `hass.config.time_zone`; offset-aware timed events retain their instants. The date window advances calendar dates rather than adding 24-hour durations, preserving 23/25-hour DST days. Naive datetimes, malformed dates, mixed endpoint types, backwards events and events wholly outside the exclusive window are rejected. Event ordering, filtering and limits operate on normalized provider-neutral events.

## Lifecycle and remaining limits

Per-calendar queries reuse the existing host-scoped DataCoordinator for concurrent request deduplication, five-minute freshness/polling, retry, visibility suspension and late-result generation guards. Config, timezone, date window, transport identity and relevant calendar state/attribute revisions invalidate observations. Online reconnect invalidates active reads; hidden/disconnected cards retain no active refresh timer. No request occurs in preview. One calendar's permission or transport failure leaves other calendars available with independent status messages.

The current implementation uses authenticated REST reads and refresh/revision invalidation rather than the newer real-time calendar WebSocket subscription. It does not create, edit or delete events, render HTML descriptions, expand recurrence locally, or open external event URLs automatically. Calendar entity attributes alone are not substituted for a missing event-list API.

## Checks

Six provider/date/observation tests cover DST, exclusive dates, malformed payloads, request encoding, unsupported/offline/permission responses, filtering, host isolation, stale release and unchanged on/off event edits. Four browser scenarios cover phone layout, two-calendar deduplication, keyboard-safe text details, preview, partial errors, event intents, lossless visual editing and reconnect after pending removal. All four focused Chrome browser scenarios passed on the integrated parent build (2.6 seconds); `/tmp/navet-calendar-proof` contains the phone screenshot, which was visually inspected for readable text, focus and layout.


A bounded authenticated read-only API check passed on the existing disposable **HA 2026.9.4**, using its actual `calendar.calendar_1`, host timezone UTC and a seven-day window. One timed event normalized successfully; zero service calls or configuration writes were issued. Only summarized counts and window bounds were written to `/tmp/navet-calendar-live-evidence.json`; credentials and raw event contents were not logged. The preexisting host was left unchanged. The minimum-version container was already stopped and remained stopped; minimum-version runtime, real all-day integration data, native calendar editor UI and physical calendars remain unverified.
