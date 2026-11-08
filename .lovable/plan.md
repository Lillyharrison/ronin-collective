# Draft-to-live profile activation: findings and proposed fix

Findings only. No code or data has been changed.

## 1. What happens today, step by step

Path: Team screen, `MemberEditDrawer` "Send invitation" button, which calls the `ronin-ai` function with `save_draft_user` and `send_invitation: true` (`supabase/functions/ronin-ai/index.ts` about lines 880–952).

1. The draft profile row (old id) is updated with the form values, and `is_draft` is set to false.
2. The form's section permissions and role are written against the **old** draft id.
3. `auth.admin.inviteUserByEmail` creates a **new auth user with a new id**. An auth user can't take over an existing id.
4. Signup triggers then fire for the new id: `handle_new_user` creates a blank profile, `handle_new_user_role` adds a `staff` role, and `handle_new_user_stats` adds a user_stats row.
5. The old profile is copied over the blank one by upsert (all columns except created_at/updated_at).
6. Roles: both ids' roles are deleted, then one role is inserted for the new id.
7. Only `staff_shifts`, `staff_schedules` and `staff_leave_requests` are moved to the new id (`staff_id`).
8. The old section permissions are deleted, the form's rows are written for the new id, and **the draft profile row is deleted**.

So yes: a new auth user and a new profile are created, and the draft row is deleted, not left behind.

Weak points:
- Steps 5–8 are separate calls with no transaction. The results of steps 6–8 are never checked, so a failed move is ignored and the draft is still deleted.
- The function then returns the new id, but the drawer's `onSaved` keeps the old member id on screen.
- Before the recent fix, step 5 was an insert that failed against the trigger-made blank profile, and step 7 didn't exist. Wendy (Nov 5) and Mercy (Oct 1) were activated under that older code. That explains the 82 shifts, 50 patterns, 132 notifications, 6 stats and 4 roles left pointing at deleted ids.

## 2. What is carried over (current code)

Carried over through the profile copy:
- assigned properties
- department
- job title
- level
- contracted days and hours
- leave allowance
- start date
- birthday
- avatar
- phone, notes and quick actions
- `section_permissions` JSON

Also carried over:
- role (a single row, re-created)
- section permission rows (re-written from the form)
- shifts, patterns and leave

Not carried over:
- notifications
- user_stats (the trigger makes a fresh one; points and badges are lost)
- user_preferences
- tasks assigned to or created by the draft
- planned maintenance, repairs, orders and shopping approvals
- checklist sessions and comments
- chat participation and messages
- property occupancy
- the `created_by` / `reviewed_by` columns in schedule tables

Caveat: if the form sends empty contract values, step 1 overwrites them with null before the copy runs.

## 3. Columns that can hold a profile id

Staff schedule:
- `staff_shifts`: staff_id, created_by
- `staff_schedules`: staff_id, created_by
- `staff_leave_requests`: staff_id, created_by, reviewed_by
- `staff_schedule_publications`: published_by
- `staff_schedule_shares`: created_by

Access and accounts:
- `user_roles`: user_id
- `user_section_permissions`: user_id (FK to profiles, cascade delete)
- `user_stats`: user_id
- `user_preferences`: user_id
- `user_presence`: user_id
- `user_thread_settings`: user_id
- `push_subscriptions`: user_id

Notifications:
- `notifications`: user_id, plus the `acknowledged_by[]` array

Tasks and maintenance:
- `tasks`: assigned_to, created_by
- `maintenance_issues`: reported_by, assigned_to
- `planned_maintenance`: assigned_to, created_by

Orders and shopping:
- `orders`: assigned_to (FK to profiles), created_by
- `order_list_submissions`: submitted_by
- `order_list_draft_lines`: updated_by
- `order_library_items`: created_by
- `shopping_list_items`: created_by, approved_by (FK to profiles)

Checklists:
- `checklist_sessions`: completed_by
- `checklist_comments`: user_id
- `checklist_public_sessions`: created_by
- `checklist_templates`: created_by, `order_recipient_ids[]`

Chat:
- `chat_threads`: created_by, `participant_ids[]`
- `messages`: sender_id, `seen_by[]`
- `message_reactions`: user_id

Calendar and properties:
- `calendar_events`: created_by, `assigned_staff_ids[]`
- `properties`: occupied_by_profile_id (FK to profiles), `occupied_by_profile_ids[]`

Other:
- `property_rules`: created_by, submitted_by, `visible_to_user_ids[]`, `enacted_occupant_ids[]`
- `vehicles`: owner_profile_id, created_by
- `car_wash_bookings`: assigned_staff_id, requested_by
- `ronin_memories`: subject_user_id
- `system_events`: triggered_by
- `manuals`, `vendors`: created_by
- `system_settings`: updated_by

Note: `tasks.assigned_to/created_by`, `messages.sender_id` and `chat_threads.created_by` have foreign keys to the login table. A draft can never own those rows, so only the other columns matter in practice. Most other columns have no foreign key at all, which is why orphaned rows build up without any error.

## 4. Recommended minimal fix

Add one database function, `activate_draft_profile(_draft_id uuid, _new_id uuid)`. It runs as a single transaction, is executable by the service role only, and does this:
1. Checks that the draft exists and has `is_draft = true`, and that `_new_id` exists as a login.
2. Copies the draft's profile fields onto the trigger-made profile and sets `is_draft = false`.
3. Removes the trigger's default `user_roles`, `user_stats` and permission rows for the new id, then moves the draft's rows across.
4. Updates every plain column in section 3 from the draft id to the new id, and every array column using `array_replace`.
5. Deletes the draft profile only at the end. If any step fails, the whole thing rolls back and the draft stays intact.

In `ronin-ai`, replace steps 5–8 with one call to this function. Return an error, without deleting anything, if it fails. Write the profile fields directly rather than overwriting them with nulls from the form. Make the drawer use the returned new id.

Separately, and only with your approval: fix the existing orphans once Wendy's and Mercy's old draft ids are identified. Their earlier conversation history or deleted-row logs may contain them; a data repair can't be done safely without those ids.
