# Notification acknowledgements

## Result

Both the bell and Dashboard rows expose a quiet 44px Acknowledge / Enterado button only for another human's unacknowledged notification. Confirmed receipts replace it with a check and Acknowledged / Enterado without deleting or dismissing the row. Notification-opened record pop-ups show only the receipt control; standalone repair/task entry controls remain.

The owner RPC is the sole receipt writer. The new wrapper authenticates the caller, invokes that RPC with their JWT, filters the sender through ids_with_login, and attempts push only for a winning notified response. Already-acknowledged and notified-false results do not push. Family via_entry results omit entity fields in the deployed RPC, so the wrapper reads the caller's own original notification to retain the repair/task popup link. No database objects or existing data were modified.

## Notification insert audit

| Insert point | Actor attribution |
| --- | --- |
| notify-section section fan-out and direct targets | Validated human caller ID; exact service-role calls remain null. notifySection/notifyUsers already funnel through this writer and do not insert themselves. |
| ronin-ai notifyAdminsOfAIAction (repairs, tasks, assets) | Explicit real caller ID, separate from recipient exclusions. |
| ronin-ai send_staff_message notification | Real caller ID. |
| order-list-submit order request notices | Authenticated submitting user's ID. |
| ChecklistDetailPage completion notices | Signed-in completer's ID. |
| CarWashSection ScheduleView completion and assignment notices | Signed-in person performing the action, not the assigned worker. |
| checklist-public-submit | Validated signed-in visitor if a user token is supplied; anonymous share-token visitors remain null. Free-text assignee names are not trusted as identity. |
| time-tracking-reminders start/end/month notices | Unchanged: system notices, no actor. |
| planned-maintenance-reminder notices | Unchanged: system notices, no actor. |
| Owner-deployed notify_on_calendar_event_insert | Read-only inspection confirms it already writes NEW.created_by into actor_id; unchanged. |
| Owner-deployed notify_on_occupant_change and notify_todays_birthdays | System rule/birthday notices, no actor; unchanged. |
| Owner-deployed acknowledge_entry and acknowledge_notification_receipt | Receipt notices have no actor; unchanged, preventing receipt loops. |
| activate_draft_profile | Reference-transfer function, not a new notification producer; unchanged. |

Historical migration definitions for calendar/rule notices and the rolled-back activation SQL test were inspected but not modified. No other application notification insert points were found. Reminders, rule triggers, birthdays and receipts were not given actors.

## Files changed

- src/components/notifications/NotificationAcknowledgement.tsx and its test: shared control, eligibility, cross-surface in-flight lock and confirmed readback.
- src/components/notifications/useNotificationDetails.ts: carry originating notification identity into pop-ups.
- src/components/NotificationsPanel.tsx and src/components/sections/Dashboard.tsx: select actor/receipt fields, show controls and reflect confirmed receipt events; dismissal code unchanged.
- src/components/NotificationRecordDialog.tsx: user-scoped actor/receipt query and single notification-level control.
- src/components/maintenance/IssueDetailDrawer.tsx: optional suppression only when a notification popup supplies its own control.
- src/components/sections/ChecklistDetailPage.tsx and CarWashSection.tsx: human actors at existing insert points.
- supabase/functions/acknowledge-notification/index.ts: caller-authorized receipt/push wrapper, no inserts.
- supabase/functions/_shared/notificationReceipt.ts and notificationActor.ts: testable push gating and actor rules.
- supabase/functions/notify-section/index.ts, ronin-ai/index.ts, order-list-submit/index.ts, checklist-public-submit/index.ts: attribution at existing writers.
- src/lib/notificationReceiptRules.test.ts: attribution and receipt-writer guards.
- AGENTS.md, roadmap.md and this report: architecture, completion and audit documentation.

## Verification and limitations

All 88 focused tests passed, covering eligibility, system/legacy notices, Spanish/error/retry states, shared double taps, one RPC/one push, push gating and targets, single repair/task popup controls and preserved swipe/delete/dismiss behavior. Controlled Playwright phone (390px) and desktop (1280px) repair pop-ups showed one control, one request and confirmed readback with no duplicate entry control.

Deployed acknowledge-notification, notify-section, ronin-ai, order-list-submit and checklist-public-submit. Invalid-token requests to acknowledge-notification return 401 Unauthorized. The preview build passes.

Live authenticated receipt creation, originator in-app readback and phone push delivery remain unverified: the preview is signed out and self-session minting finds no account matching the requester. No real notices were acknowledged or dispatched during checks. Controlled browser checks use fixtures, not a real account. Push remains one best-effort attempt with no retries after the RPC has succeeded.