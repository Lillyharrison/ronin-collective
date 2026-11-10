# Security review findings (read-only, nothing changed)

Source: latest database scan (9 Nov 2026, 23:08 UTC) plus the database linter, run 10 Nov. The scan groups 15 findings under 3 rule families. The "2 issues" Lovable is suggesting are most likely the 2 families that contain Critical (error) items. I can't see the exact panel Lilly is looking at, so this matching is my best inference.

Root cause shared by both: **open sign-up**. Sign-up is switched on, and no hook limits who can register. Anyone with the public app key can create an account through the login service, even if the website is private. Any rule that only checks "is signed in" is therefore effectively public.

## Issue 1 - "Some access rules only check that someone is signed in" (Critical)
- `vehicles` - policy "Authenticated users can view vehicles" (Critical): any account can read every car, including make, model, owner and house.
- `gantt_shared_boards` - policy "Authenticated users can update gantt boards" (Critical): any account can overwrite or vandalise every construction timeline.
- `car_wash_bookings` - policy "Authenticated users can create bookings" (Warning): any account can add fake wash bookings. Reading bookings is already limited by house.
- Verdict: **genuine problem**. This is not one of the intended designs (definer functions, private pay tables, admin-only rules).
- Fix (choose one or both):
  - (a) Switch off open sign-up, since staff are invited. Low risk, but check the invite and set-password flows still work, because they create users with the admin key.
  - (b) Tighten the rules: vehicles readable by house access; gantt edits for admins and managers only (shared links already go through a server function); bookings only by people with access to that house. Possible breakage: car-wash staff without house access stop seeing cars, and non-admin timeline editors lose editing.

## Issue 2 - "Rules that let every row through (always true)" (Critical)
- `chat_threads` UPDATE "Participants and admins can update threads", WITH CHECK true (Critical): a participant can rewrite a thread's participant list, for example to add outsiders or remove others. Fix: make the check match the participant/admin rule. Low risk.
- `checklist_items` SELECT "Authenticated users can view checklist items", USING true for role **public** (Critical): even signed-out visitors can read every checklist step, including notes and photo links. Fix: limit to signed-in users with checklist access. Check that the public checklist share links still work, because they now go through a server function.
- `system_settings` SELECT true (Critical): every account can read all app settings. Real risk depends on the contents. Usually low; it would matter if any keys or tokens were ever stored there (tokens live in private_config, which is locked).
- `user_presence` SELECT true (Critical): any account sees who is online and when. Low sensitivity; it's normal for a chat app, but still exposed to self-registered accounts.
- `staff_schedule_publications` SELECT true (Critical): any account can see which weeks were published, but only dates, not shifts. Low real risk; arguably intended.
- Warnings in the same family: `maintenance_categories`, `job_title_suggestions`, `achievements`, `order_library_items` read-all. This is reference data meant to be shared, so effectively **false positives**, except that open sign-up exposes them to strangers.

## Other lower-severity findings
- Storage (Warning): "maintenance" and "order-library" photo uploads aren't tied to the uploader. Any account can add files there. (Info) Any account can list "manuals" files. These are intended shared buckets; the real fix is again closing sign-up.
- Linter: 33 "public can run SECURITY DEFINER function" warnings and 52 "signed-in can run" warnings. These are **the intended design**: each function checks the caller's role itself. 4 functions have no fixed search path and 2 extensions sit in the public area. Both are housekeeping-level.
- Linter info: 2 tables with locks but no rules. These are `private_config` and `time_reminders_sent`, and they are **intentionally locked** (server-only).
- Older scan entries (May/July) are stale but still listed, e.g. checklist_public_sessions, shopping list, vendors and property rules. Several were already addressed in earlier work; a fresh deep scan would clear or re-rate them.

## Recent changes - none are flagged
- `ids_with_login`, `activate_draft_profile` and `archive_profile_core`: not callable by signed-out or signed-in users (server-only). Correct.
- Time tracking and archive functions (clock_in/out, issue/reopen/pay timesheet, archive_profile, unarchive, etc.): callable only by signed-in users, never signed-out ones. Each checks the caller's role internally. This is the intended design; they only appear in the generic definer-function warning count.
- `time_entries`, `timesheets` and the related tables: read-only rules, with writes blocked except through the functions. Not flagged.
- `private_config`: fully locked. Not flagged as a problem.
- `timesheets` storage bucket: private and admin-only. Not flagged.

## Recommendation
1. Close open sign-up first. It removes the "whoever signs up" exposure behind most findings at once.
2. Then fix `checklist_items` (readable while signed out) and the `chat_threads` update check. These are the two real holes.
3. Next tighten `vehicles` and `gantt_shared_boards`.
4. Mark the reference-data and definer-function warnings as intended.

Nothing was changed. Approving this would only mean I prepare the fixes as a separate step.
