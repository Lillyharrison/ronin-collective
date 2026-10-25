# Architecture rules

- StaffCalendarTab filters its single profile/schedule/shift/leave feed through cached user-keyed visible_staff_ids before passing data to grids, pickers and exports; fallback evidence comes only from RLS-returned shifts/patterns, never profiles or leave.
- SharedStaffSchedule applies viewer visibility for signed-in visitors and obtains fallback evidence through direct RLS queries, not the service-role share payload; anonymous token-authorized sharing remains unchanged.

- MaintenanceSection and Dashboard share repair-create notices; usePlannedMaintenance owns planned save notifications based on persisted before/after dates so modal, copy and list mutations cannot create independent broadcasts.
- Edge notification audiences use service-role ids_with_login before inserting rows or dispatching push; shared pure recipient rules keep reminder fallback and exclusions testable without exposing login lookups to clients.

- Work assignee pickers use the cached profile_ids_who_can_see RPC through useAssignableProfileIds and shared option filtering; filter inside each work modal so all profile feeds retain fallback and existing-assignee data.

- Notification record viewing uses an RLS-scoped, user-keyed detail query and a higher-layer portal above the notification list; repair details share fetchIssueForDetail with Maintenance to keep joins consistent.
- Notification surfaces share SwipeableNotificationRow, useNotificationSwipe and useNotificationDetails; surface-owned actions preserve dashboard acknowledgment versus bell deletion, while direction locking isolates gestures from navigation.

- Keep phone-specific weekly staff schedule rendering in MobileStaffWeek, reusing the existing schedule data and edit callbacks; this preserves desktop rendering and existing visibility permissions.
- Reusable property shopping lists live in Orders & Deliveries, but retain checklist_templates with kind='order_list' and order_list_items as their single data source; standard checklist queries exclude that kind to avoid duplicate workflows.
- Sending property shopping lists goes through order-list-submit to create Orders, recipient tasks and notifications server-side; Orders uses same-origin query parameters for list and order deep links so requests survive refresh and notification navigation.
- Property visibility is by assignment for every role except master_admin (client `isMasterAdmin` checks + `user_can_access_property`); rank never grants extra properties.
