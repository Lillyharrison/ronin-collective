# Architecture rules

- Access checks load stored overview timestamps and refresh via sequential single-person owner RPCs under the caller session, never an impersonated login; this avoids request timeouts, and findings dismissal persists before refreshing.
- Task completion supplies an explicit audience mode to notify-section, which reads the creator under caller RLS and resolves admin roles server-side before existing house/login filters and push.

- Baseline readability is owned by shared Tailwind text tokens, global minimum-text utilities and shared UI hit areas so it can be reverted independently of personal enlargement.
- Personal text enlargement uses one root rem scale, an early user-keyed cache and the signed-in profile query; shared Aa/Profile controls persist the same setting and remeasure iOS text on foregrounding. PDF API font sizes remain numerical points, never CSS units.
- Bottom navigation uses equal-width slots with matching horizontal padding; the header title is screen-centred unless enlarged text or measured control overlap requires flow layout, preventing asymmetric controls from shifting the logo.

- Entry acknowledgement UI shares eligibility and status helpers; acknowledge-entry calls the owner RPC under the caller JWT and dispatches push only for the winning acknowledgement, never inserting notifications itself.
- Notification receipt controls share user-keyed cache and an in-flight lock across rows/pop-ups; acknowledge-notification calls the owner RPC under caller JWT and pushes only winning notified results, independent of dashboard dismissal.

- ClockCard uses owner-deployed time RPCs and a user-scoped durable ordered queue; reminders read their Bearer token through the service-role client from private_config and claim dedupe keys before inserting notices, without changing database structures.
- Admin timesheets use owner-deployed review/issue RPCs; Excel generation reads immutable issued snapshots and private admin-only storage, so corrected versions retain historical exports and roster logic remains independent.
- Time/pay Settings narrow the shared login-only people feed using profile level, archive state and database staff roles without filtering history; reminders fail closed through can_clock_in before processing candidates.
- Timesheets presentation helpers choose visit colours, flag priority and the next visible action without changing persistence; visit review opens existing correction forms so the compact list retains the same audit machinery.

- StaffCalendarTab filters its single profile/schedule/shift/leave feed through cached user-keyed visible_staff_ids before passing data to grids, pickers and exports; fallback evidence comes only from RLS-returned shifts/patterns, never profiles or leave.
- SharedStaffSchedule applies viewer visibility for signed-in visitors and obtains fallback evidence through direct RLS queries, not the service-role share payload; anonymous token-authorized sharing remains unchanged.

- MaintenanceSection and Dashboard share repair-create notices; usePlannedMaintenance owns planned save notifications based on persisted before/after dates so modal, copy and list mutations cannot create independent broadcasts.
- Repair creation/assignment bodies use the shared repairNotificationBody formatter and the saved reported_by profile, including assistant-created reports, so attribution never substitutes the current editor.
- Edge notification audiences use service-role ids_with_login before inserting rows or dispatching push; shared pure recipient rules keep reminder fallback and exclusions testable without exposing login lookups to clients.

- Work assignee pickers use the cached profile_ids_who_can_see RPC through useAssignableProfileIds and shared option filtering; filter inside each work modal so all profile feeds retain fallback and existing-assignee data.

- Notification record viewing uses an RLS-scoped, user-keyed detail query and a higher-layer portal above the notification list; repair details share fetchIssueForDetail with Maintenance to keep joins consistent.
- Notification surfaces share SwipeableNotificationRow, useNotificationSwipe and useNotificationDetails; surface-owned actions preserve dashboard acknowledgment versus bell deletion, while direction locking isolates gestures from navigation.

- Keep phone-specific weekly staff schedule rendering in MobileStaffWeek, reusing the existing schedule data and edit callbacks; this preserves desktop rendering and existing visibility permissions.
- Reusable property shopping lists live in Orders & Deliveries, but retain checklist_templates with kind='order_list' and order_list_items as their single data source; standard checklist queries exclude that kind to avoid duplicate workflows.
- Sending property shopping lists goes through order-list-submit to create Orders, recipient tasks and notifications server-side; Orders uses same-origin query parameters for list and order deep links so requests survive refresh and notification navigation.
- Property visibility is by assignment for every role except master_admin (client `isMasterAdmin` checks + `user_can_access_property`); rank never grants extra properties.
- Draft-to-live activation goes only through the service-role activate_draft_profile DB function (one transaction, re-points every profile reference, deletes draft last); new profile-id columns must be added to its list.
- Calendar dates go through src/lib/calendarTime.ts (client) and supabase/functions/_shared/eventTime.ts (server): all-day entries read UTC date parts, timed entries show in the viewer's zone and are entered in the house zone; the planned-maintenance trigger is the only writer of its calendar rows, so one convention holds everywhere.
- tasks.due_date, maintenance_issues.scheduled_date and planned_maintenance.scheduled_date are DATE columns: read/write plain YYYY-MM-DD keys through calendarTime plain-date helpers and compare with the viewer's local date; calendar_events retain all_day=true date-bound UTC storage and real instants for timed entries, so DATE fields never shift across zones.
- Staff roster shift times and clock-in times intentionally display in the HOUSE's local time, because work is judged in the worker's house time rather than the viewer's zone.
- Clock in/out is a home-screen shortcut (ClockQuickAction) that hosts the unchanged ClockCard flow in a sheet; the editor owns the 'clock' shortcut via the clock switch and writes staff_time_settings in one combined upsert (memberAccess.timeSettingWrite).
- Section access has no role fallback: non-admins need explicit user_section_permissions rows (dashboard/profile are baselines) and new people are created with no rows, houses or shortcuts; editor rules live in src/components/team/memberAccess.ts so they stay testable.
- Protected edge functions authenticate through supabase/functions/_shared/internalAuth.ts: internal callers present x-internal-token (private_config) or the service-role Bearer; user-facing ones require a signed-in JWT, so no function relies on hard-coded secrets.
- Car-wash request inserts must bind requested_by to the caller and check screen, vehicle and assigned-house access; direct shared Gantt reads/inserts are admin-only because public sharing uses token-scoped edge functions.

- House request inserts omit status to use private drafts; send_request_list is the only draft-to-sent path, with batch-aware notifications and PA grouping; existing order/receipt RPCs preserve house scoping and plain delivery dates without database changes.
- Login email changes use a caller-JWT admin check, Auth's same-id update and the owner session-revocation RPC; shared recovery handling and masked-only audit records preserve account history without profile writes.
