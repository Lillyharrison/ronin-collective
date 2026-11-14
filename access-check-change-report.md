# Access check and completion alerts

## Delivered
- Master-admin-only Access check button in Meet the Team, bilingual phone-first overview and person reports, Problems/fix links, house and access summaries, table counts, wrong-alert highlighting, hourly findings, dismissal and collapsed recent resolutions.
- Access-check notifications open `/meet-team?view=access-check` from Home or the notification panel, only for master admins.
- House/roster fix links open the existing person editor on Houses. Checks use the caller's existing session, never a target login. Detailed checks call the owner RPC with `_log: true`.
- Task completion no longer broadcasts to Tasks subscribers. The notification service resolves the persisted task creator under the caller's row rules and adds only admin/master-admin roles, removes the completer, then applies the existing house/login filters and push delivery. A manager is included only if they actually created the task.
- No database table, database function, policy, trigger or setting changed.

## Verification
- Full suite: 484 tests passed; after final refinements, 37 focused tests passed (including two additional notification-request tests).
- Latest automatic build: OK. Difference whitespace check: clean.
- `notify-section` deployed successfully; an unauthenticated POST returned 401. No notification was sent.
- Real master-admin session: Access page and findings read opened at 1280px and 390px with no horizontal overflow or runtime errors.
- **Live blocker:** the existing `admin_access_overview` RPC returned HTTP 500, code `57014`, “canceling statement due to statement timeout”. The page shows Retry rather than claiming all clear. The database was not changed to bypass this.
- Populated overview/detail layouts checked with explicitly labelled browser fixtures at 390px (scales 1, 1.2, 1.4), plus desktop overview; no horizontal overflow. These are layout checks, not proof of live report results.
- Not verified: successful live overview/person-report result, real finding dismissal, actual task-completion recipients/push delivery, real iPhone. No real finding, task or alert was changed during testing. Each successful real person check will be logged by the existing owner RPC as requested.
- Existing English fallback and photo-completion requirements are unrelated to this change and were not modified.

## Files changed
Access check:
- `src/components/team/AccessCheckPage.tsx`
- `src/components/team/useAccessCheck.ts`
- `src/components/team/accessCheckLogic.ts`
- `src/components/team/AccessCheckPage.test.tsx`
- `src/components/team/accessCheckLogic.test.ts`
- `src/components/team/MemberEditDrawer.tsx`
- `src/components/sections/MeetTeamSection.tsx`
- `src/components/NotificationsPanel.tsx`
- `src/components/sections/Dashboard.tsx`

Completion audience:
- `src/components/tasks/TaskModal.tsx`
- `src/lib/notifySection.ts`
- `supabase/functions/notify-section/index.ts`
- `supabase/functions/_shared/taskCompletionAudience.ts`
- `src/lib/taskCompletionAudience.test.ts`
- `src/lib/taskCompletionNotification.test.ts`

Project notes: `AGENTS.md`, `roadmap.md`, this report, and the archived approved plan.