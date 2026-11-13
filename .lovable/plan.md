# House-isolation audit: findings and proposed fix order

Read-only audit. Nothing was changed. "Service-role" means the function skips the database's row-level rules. Fix-order proposals are at the end; nothing is built until you approve.

## Urgent (outside the house rule, but serious)
| Where | What leaks | Smallest safe fix |
|---|---|---|
| `generate-vapid-keys` (public, no login) | Returns the **stored private push key** verbatim | Delete the function, rotate the push keys |
| `send-push-notification` (public, no login) | Anyone can push any text to any user ID; reveals each user's device count | Require the internal service secret |
| `ronin-event-listener` | Webhook secret is hard-coded in source | Move to a stored secret and rotate it |
| `GanttChart.tsx:52` + `timeline-share-get/save` | Fixed token in the app code gives anyone read/**write** of the whole construction board, for every house | Edits need sign-in and admin; random, revocable, house-bound read links |

## 1. Backend functions
### Critical / high: break the house rule
- **`ronin-ai` (AI assistant): critical.** Every query runs with service-role. Before answering, it loads into the AI's context, across all houses: all houses (address, occupants), up to 50 open tasks, 50 assets, 20 open repairs, 15 system events and the top 20 **memories (full text)**. The only guard is the prompt line "staff only receive their properties", which is not a security boundary.
  - **Search tools, all unscoped:** search_tasks, search_assets, get_calendar_events, search_maintenance_issues, search_planned_maintenance, search_vendors, search_library_item. If you name a house you aren't assigned to, it is searched; if no house is named, all houses are searched.
  - **Write tools, no house check:** log_maintenance_issue, create_task, update_task_status (fuzzy title match across all houses), log_asset, send_staff_message, save_memory, add_shopping_list_item, log_vendor. update_occupancy is admin-only but still unscoped.
  - **Chat threads:** reads any chat thread's title and last 25 messages by ID, with no membership check.
  - **Answer to your question:** yes. A staff or family member can ask about an unassigned house and get an answer, directly or through memories.
  - **Signed-out calls:** the chat path does not reject calls without a login.
  - **Alerts:** AI-action alerts go to every admin and every section subscriber, with no house check.
  - **Admin actions:** invite, create draft and save draft are admin-gated, but a plain admin can set any role, houses or permissions. Save draft doesn't check the target is actually a draft.
  - **Not touched by the assistant:** manuals, house rules, orders and schedules are never queried.
  - **Fix:** reject signed-out calls; filter every snapshot and tool by allowed houses (master admin exempt). Refuse unassigned or unknown houses instead of searching everything. Give memories a house or audience rule. Check thread membership. Scope the AI-action alert audience.
- **`ronin-event-listener`: high.** Staff briefings go to whoever the event lists, with no house check. The event title is copied verbatim, and private events aren't excluded. It reuses any thread containing both people (not just two-person threads). Master-admin briefings are fine.
- **`notify-section`: high.** Any signed-in user can choose recipients, title and body. Direct recipients and all admins skip the house filter. Subscribers are house-filtered only when the caller passes a house. **Fix:** work out the house from the record on the server and filter every recipient (master admin exempt).
- **`staff-schedule-share-get` (public link): high.** A link holder sees every staff member (names, assigned house IDs, contract hours, leave entitlement, start date, level). They also see **every house name and city**, all shifts and patterns with notes, and approved leave for the date range. Links **cannot** be scoped to one house today.
- **`staff-schedule-share-mutate` (public link): high.** The same link can create, edit or delete shifts for any staff or house in the range. **Fix:** read-only links bound to chosen houses, and editing only when signed in.
- **`calendar-sync`: high.** Public, service-role. Anyone can trigger imports (no direct data returned). **Fix:** require a scheduled-job secret.
- **`planned-maintenance-reminder`: high.** Public, service-role, changes statuses and sends reminders. **Fix:** require a scheduled-job secret.
- **`order-list-submit`: high.** Signed-in only, with no check that the sender can access that list's house. **Fix:** check house access before sending.

### Medium / low
- **Checklist public links (`checklist-public-get/update/submit`): high exposure, but one house.**
  - A holder sees one checklist with its item photos and notes, the house name, and the whole session row. They can tick items and submit.
  - Links are tied to one house, but tokens are a title slug plus 4 random characters, so they are guessable, and they never expire.
  - **Fix:** long random tokens, expiry, and show only the fields needed.
- **`save-push-subscription`: medium.** A device registration can be taken over from its owner. **Fix:** don't reassign an existing one.
- **`extract-checklists`, `translate-entries`: medium.** No login check. No house data is involved, but anyone can run up AI usage.
- **`debug-vapid`: low.** Public diagnostic. Remove it.

### Safe or acceptable
- **`acknowledge-entry`:** runs as the caller; the database function does check the house.
- **`acknowledge-notification`:** runs as the caller, and the database function checks that the notification belongs to the caller. It has no house check, but it only touches the caller's own notification.
- **`time-tracking-reminders`:** secret-protected.
- **`time-tracking-staff`:** admin-only.
- **`set-user-password`:** master-admin only.
- **`extract-care-guide`:** signed-in, no stored house data read.
- **No separate invite function:** invites go through `ronin-ai`, covered above.

## 2. App reads that skip the normal rules
- **`get_staff_schedule_profiles`: high.** Admins and schedule viewers get all staff with their full assigned-house lists. The screen filters afterwards, but the data was already sent.
- **`timesheet_overview`, `effective_visits`, `archive_blockers`: unverified.** No house check (all three are used only on admin screens).
- **`visible_staff_ids`, `profile_ids_who_can_see`: low.** Both return IDs only, with no house check.
- **`batch_mark_messages_seen`: medium.** Uses a user ID the caller supplies, so anyone can mark any messages as seen.
- **`acknowledge_notification`: medium.** Has no ownership check. These two are integrity problems, not leaks.
- **Already safe:** `clock_in` and `my_clock_status` check the house. The view `checklist_completion_log` follows the normal row rules.
- **Property pickers:** about 12 pickers query the full house list but rely on the database rules, so they are safe.

### Public file buckets (anyone with the link can open the file)
| Bucket | Where links are stored | Writers / readers |
|---|---|---|
| maintenance | maintenance_issues.photo_url, photo_urls, close_out_photo_url | IssueModal, IssueDetailDrawer, repairs PDF |
| manuals | checklist_templates.cover_image_url, card_images; checklist_items.photo_url; checklist product images; tasks.attachments (path `task-attachments/...`, no house in path) | ChecklistDetailPage, ChecklistItemRow, CareGuideDetailPage, CareGuideScanModal, TaskModal |
| chat-media | messages.content_media_url | ChatView, MessageBubble |
| vehicles | vehicles.photo_url | CarWashSection |
| order-library | order_library_items.image_url, order_list_draft_lines.photo_url | useOrderLibrary, OrderListDetailPage |
| property-images | properties.image_url | PropertySection |
| avatars (also public) | profiles.avatar_url | ProfileSection, PropertySection |
| timesheets (private, downloads only) | timesheets.file_path | timesheets Excel helper |

- **Could not trace to a bucket:** manuals.file_url and cover_image_url, assets.photo_url, tasks.photo_url. No current upload code was found for them, so check which bucket the stored links point to.
- **Moving to private buckets:** most object paths don't include the house, so access checks would need to look up the owning record. Signed links would come from a small server check.

## 3. Names, counts and badges
- **AI assistant:** the biggest leak (above).
- **Repair and planned-maintenance alerts:** the title and house name go out through `notify-section`, so they can reach unassigned admins or direct recipients. Once copied into someone's notification, the database rules no longer protect the text.
- **Shared schedule link:** shows every house name.
- **Staff calendar exports:** built from already-filtered data, apart from the house lists sent by the schedule RPC.
- **Dashboard counts:** use normal queries (safe). Dashboard summaries stored in system settings and events weren't traced, so that's unverified.
- **Search:** no app-wide search exists. Local searches follow the database rules.
- **Repairs, planned and library PDFs:** follow the data on screen (safe), but the photos inside them come from public links.

## Questions for Lilly
1. Should plain admins (not master) also be limited to their assigned houses everywhere, including alerts? The code currently lets admins through in several places.
2. Should share links remain an intended exception (external people with a link), but bound to chosen houses?

## Proposed fix order (after approval, one step at a time)
1. Remove the key-leaking function and rotate the push keys. Lock down send-push, calendar-sync and the maintenance reminder; move the listener secret.
2. AI assistant: require sign-in; scope the snapshot, memories, tools, threads and alerts to allowed houses.
3. Alerts: notify-section works out the house on the server and filters every recipient; same in the event listener.
4. Share links: house-bound, read-only schedule links; strong expiring checklist tokens; Gantt editing only when signed in.
5. Schedule profiles RPC: return only allowed staff and houses (needs a database change, so it will need your go-ahead).
6. Make buckets private with signed links, one bucket at a time, starting with maintenance and chat-media.
