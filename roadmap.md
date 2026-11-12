# Timesheets visual redesign

- [x] Replace people/month layouts with a centred, colour-coded single column and one next-step action; persistence/export unchanged.
- [x] Verify visit states, flag priority, next actions and issued read-only cards: 37 Timesheets tests pass; controlled English/Spanish detail views checked at 360/390/430/1280px, including correction sheet and issued/paid menus.
- [ ] Verify against a real signed-in admin's Timesheets: no preview session is available and session minting finds no account matching the requesting user. No real pay records changed.

# Plain DATE task and repair follow-up

- [x] Replace task/repair stamp handling with plain date keys in readers, writers and filters; database untouched.
- [x] Add four-zone and source-regression tests (76 passed); deploy ronin-ai and ronin-event-listener.
- [x] Read-only signed-in Pacific-time repair cards/details show Nov 23; task card/detail checked with Nov 10 (no saves); changed-file report provided.
- [ ] Verify a real Nov 23 task card/detail: no tasks with due_date=2026-11-23 are returned for the signed-in Lilly session; four-zone tests cover Nov 23.

# House-protected roster

# Task and repair date-only stamps

- [x] Share mixed date/moment helpers across task/repair displays, comparisons, forms, calendar and exports; redeploy ronin-ai and ronin-event-listener for task writes/text.
- [x] Test four viewer zones and unchanged date saves (95 tests); signed-in Pacific-time Marble etching card/detail show Nov 23; no records saved.
- [x] Audit other parsing: plain DATE fields using parseISO are already local-date safe; messaging/audit/resolved timestamps remain moments. Server overdue digest uses UTC calendar days because it has no viewer zone; its upstream database trigger is untouched as required.

# Casual staff time tracking

- [x] Switch reminder authorization to private_config and redeploy; invalid Bearer returns 401.
- [x] Add admin Timesheets review, edit, issue, Excel, payment, corrected versions and audit/history.
- [x] Add admin time/pay and property clock-location settings; private admin-only file storage; deploy authenticated time-tracking-staff login lookup.
- [x] Add person-targeted notification routing; 86 focused tests passed and signed-in admin month list checked on desktop/phone without overflow.
- [ ] Verify real visit edit, issue, file upload, payment and corrected-version round trip: requires a designated test person/month and a renewed admin preview session; no actual pay records changed.

- [x] Add bilingual dashboard clock, local-time corrections and durable per-user offline queue.
- [x] Deploy visits/month reminder function and notification destinations without database changes.
- [x] Test clock states, queue ordering/retries and reminder rules (66 tests); Spanish phone flow checked with controlled responses, disabled clock checked with real signed-in session.
- [ ] Owner will configure cron schedules using the Bearer token already stored in private_config (time_tracking_cron_token); no environment secret required.
- [ ] Verify Mercy’s real clock-in/out readback; not exercised because it would record actual working hours.

- [x] Add cached visible_staff_ids lookup and restrictive fallback.
- [x] Filter roster rows, pickers, leave views, exports and signed-in shared views without changing existing scope or anonymous sharing.
- [x] Test hidden staff, own row and failed lookup behavior (11 tests passed); changed StaffCalendarTab and SharedStaffSchedule, downstream pickers/leave inherit filtered props.
- [ ] Verify real signed-in house access; blocked because the preview has no session and the requesting user's email has no matching app account.

# Notification audience rules

- [x] Apply login filtering and multi-recipient exclusions in notify-section.
- [x] Prevent repair duplicates and centralize exact-date planned booking/assignment alerts across mutation paths.
- [x] Limit reminders to logged-in assignee or master admins, preserve status flips and deduplicate.
- [x] Test notification rules and deploy notify-section / planned-maintenance-reminder; unauthenticated notify-section rejects requests.
- [ ] Verify a real signed-in create/book/recipient readback; blocked because no preview session is available and session minting finds no account for the requesting user's email.

# Assignment picker eligibility

- [x] Add cached screen-access lookup and apply to task, family task, planned-maintenance and repair pickers (including Dashboard via shared IssueModal).
- [x] Preserve fallback lists/current assignees, add localized hints, and test eligibility behavior (10 eligibility tests, 11 dashboard regression tests and controlled phone/desktop checks passed).
- [ ] Verify eligibility against real signed-in accounts; blocked because the requesting user's email has no matching auth account and no session is available.

# Notification details

- [x] Share swipe actions and record-detail control between dashboard and bell; preserve dismissal versus deletion.
- [x] Test dashboard viewing/dismissal/swiping and audit other notification surfaces (35 tests and controlled phone/desktop checks passed; header delegates to bell, system push clicks stay separate).

- [x] Add phone swipe-to-reveal deletion, preserve desktop and notification opening, and verify gestures/deletion tests (24 tests and controlled phone/desktop browser checks passed).

- [x] Open repair, planned maintenance, task, calendar event and birthday details above the notification list.
- [x] Reuse repair detail loading without changing Maintenance behaviour; preserve other notification links and permissions.
- [x] Verify loading, inaccessible records, close-to-list, and mobile stacking with automated tests and controlled browser records.
- [ ] Verify real signed-in notification records; blocked because the requesting user's email has no matching auth account and no session is available.

# Staff schedule phone layout

- [x] Add staff-by-staff weekly agenda for read-only users.
- [x] Add compact seven-day grid and tap-to-open shift details for editors.
- [x] Preserve desktop layout and existing schedule visibility/edit permissions.
- [x] Verify phone and desktop rendering and editing access.
- [x] Show half-hour times (e.g. 7:30) on phone shift chips without overflow.

# Property shopping lists

- [x] Move reusable property order lists into Orders & Deliveries → Shopping List; preserve existing ad-hoc shopping list and normal checklists.
- [x] Open submitted requests in Orders and preserve existing property-scoped read access through delivery.
- [x] Verify list editing, saved selections after reload, sending, placement and delivery as the signed-in tester; temporary test data removed.
# Draft-to-live activation

- [x] Atomic activate_draft_profile function (service role only), verified in a rolled-back transaction.
- [x] ronin-ai calls it, checks result, removes new login on failure; drawer uses new id.
- [ ] Live invite of a real draft not exercised (would send a real email).

# Archive people who leave

- [x] Archive dialog with open-work check, Archived view with history and restore (admins only).
- [x] Hide archived people from team list, assignee pickers, chat pickers and birthdays; history names untouched.
- [ ] Click-through as a signed-in admin not done (no preview session).
