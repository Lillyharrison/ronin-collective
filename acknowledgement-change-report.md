# Repair and task acknowledgements

## Delivered

- Shared English/Spanish acknowledgement controls with optional notes, role/house/assignee eligibility and sender exclusion.
- Quiet persisted acknowledger name/date/note readback, including family task and repair views.
- Amber New indicators on repair list/board/table and task cards; neutral waiting text for the sender.
- Existing notification record popups expose acknowledgement controls for repairs and tasks.
- Deployed `acknowledge-entry`: authenticates the caller, calls existing `acknowledge_entry` using the caller's JWT, and invokes existing `send-push-notification` with the winning RPC's sender/title/body. Already-acknowledged responses do not send push. No notification inserts outside the owner's RPC.
- Push entry links open the existing RLS-scoped record popup from the app shell, including when the family sender cannot use an editing screen.
- No tables, database functions, policies, triggers, existing rows or settings were changed.

## Changed files

Shared implementation:
- `src/lib/entryAcknowledgement.ts`
- `src/components/EntryAcknowledgement.tsx`
- `supabase/functions/_shared/acknowledgeEntry.ts`
- `supabase/functions/acknowledge-entry/index.ts`

Repair surfaces and reads:
- `src/hooks/useMaintenanceIssues.ts`
- `src/lib/fetchIssueForDetail.ts`
- `src/components/maintenance/IssueCard.tsx`
- `src/components/maintenance/IssueDetailDrawer.tsx`
- `src/components/sections/MaintenanceSection.tsx`

Task surfaces and reads:
- `src/components/tasks/TaskCard.tsx`
- `src/components/tasks/TaskModal.tsx`
- `src/components/tasks/FamilyTasksView.tsx`
- `src/components/sections/TasksSection.tsx`

Notification popup and push tap target:
- `src/lib/notificationDetail.ts`
- `src/components/NotificationRecordDialog.tsx`
- `src/components/AppShell.tsx`

Tests/documentation:
- `src/lib/entryAcknowledgement.test.ts`
- `src/components/EntryAcknowledgement.test.tsx`
- `src/components/tasks/TaskModal.test.tsx` — provider added and stale timestamp assertions aligned with the previously deployed DATE convention; application date behavior unchanged.
- `src/components/maintenance/IssueModal.test.tsx` — stale timestamp assertions aligned with the previously deployed DATE convention; application date behavior unchanged.
- `AGENTS.md`, `roadmap.md`, this report.

## Verification

- 79 focused tests passed across acknowledgement logic/UI and existing notification, dashboard, task and repair views.
- Tests cover permitted/denied users, sender exclusion, one request on rapid double tap, one RPC/one push for a winning acknowledgement, concurrent already-acknowledged suppression, optional notes, readable errors, sender readback, New indicator conditions and both notification popup types.
- Controlled phone (390px) and desktop (1280px) repair notification popup: optional note entered, one acknowledgement request, persisted fixture readback visible; screenshots inspected. These are fixture checks, not live account verification.
- Preview compilation: latest entry says build OK.
- Deployed function without authentication: HTTP 401, `Unauthorized`.

## Unverified and known limitations

- Live acknowledgement under an actual account, sender in-app notice, actual phone push delivery, and published push-link round trip remain unverified. No injected session was available and session minting found no app account matching the requesting user. No live entries or notifications were changed to test this.
- Push is best effort, exactly one dispatch attempt for the atomic winning RPC response. Network failure can leave acknowledgement successful without a phone push; no retries are made because the existing RPC returns already acknowledged thereafter.
- An additionally run repository-wide DATE source guard reports a pre-existing UTC date operation in `src/components/timesheets/presentation.ts:28`; that unrelated Timesheets file was not changed. Focused acknowledgement and impacted-view tests are all passing.