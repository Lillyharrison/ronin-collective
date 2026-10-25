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