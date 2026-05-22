# Checklist System Upgrades

Four related improvements to the Checklists section.

## 1. Sections within a checklist

Add named groups (e.g. Bedrooms, Bathrooms, Common Areas) inside a checklist template. Items belong to a section. Sections are reorderable, renameable, deletable.

**DB**: new column `section` (text, nullable) on `checklist_items`. Items with `section = null` render under an "Ungeneral" / default group. Sort by `(section sort, sort_order)`.

**UI** (CareGuideDetailPage / ChecklistDetailPage editor):
- Section headers above their items with rename / delete / "add item to section" actions
- "+ Add Section" button at the bottom (master/admin/manager only)
- Deleting a section moves its items to "Ungrouped" (no data loss)
- Drag-and-drop to reorder items within a section; items can be moved between sections via a small section picker on each row (keep the existing dnd-kit setup)

## 2. Public share links for non-users

Generate a long-lived public link for any checklist template so an outside helper can tick items all day and submit once.

**DB**:
- New table `checklist_public_sessions`:
  - `id uuid pk`
  - `share_token text unique` (URL-safe random)
  - `template_id uuid`
  - `property_id uuid nullable`
  - `assignee_name text` (entered by helper on first open)
  - `checked_item_ids uuid[]` (running state)
  - `notes text`
  - `status text` default `'in_progress'` → `'submitted'`
  - `created_by uuid` (master admin who generated the link)
  - `submitted_at timestamptz`
  - `created_at`, `updated_at`
- RLS: public can `select` + `update` rows by share_token (no auth). Master admin / admin can `select` / `delete` all. No global listing without a token.

**Edge function** `checklist-public-session` (verify_jwt=false) with actions:
- `get` → returns template, items, current session state by token
- `save` → upserts `checked_item_ids` + `notes` + `assignee_name`
- `submit` → sets `status='submitted'`, `submitted_at=now()`, fires a notification to all master_admins
- All writes are backend-first; helper's browser only mirrors saved state. localStorage persists `share_token` only.

**New page** `/checklist-share/:token` (public route, no AppShell auth):
- Shows checklist with checkable items
- Auto-saves on every check (debounced) → DB
- "Complete & Send" button at bottom → submit → confetti via existing `fireConfetti()` → "Submitted" success state
- Reopening the link before submit restores all checked state

**Share UI**: on each template (admin only) a "Share Public Link" button that creates the session row and copies the URL.

## 3. Master Admin archive of completed public submissions

New tab on the Checklists section called **"Submissions"** (visible only to master_admin):
- List of all `status='submitted'` rows with assignee, checklist title, property, submitted_at
- Click row → drawer with item-by-item completion + notes
- Per-row delete + multi-select "Delete selected" + "Delete all older than 30/60/90 days" buttons
- All deletes hit the DB directly (master_admin RLS allows delete)

## 4. Copy a checklist to another property

On any property-scoped template, a "Copy to property…" action in the existing template card menu:
- Modal lists other properties (scoped to user's access)
- On confirm → inserts a clone of the template + all its items + sections into the target property (server-side via a single edge function `checklist-clone` for atomicity, or two sequential supabase inserts client-side — going with client-side inserts inside a single async flow + react-query invalidation since RLS already gates this).
- Toast: "Copied to {Property}"

## Technical notes

- Follow data persistence rule: every check, rename, section add/delete, and clone awaits Supabase before updating React state.
- Public submission notification reuses existing `notifications` insert pattern (type `'checklist_submitted'`, `action_url='checklists'`).
- Confetti reuses `src/lib/confetti.ts → fireConfetti()`.
- Public route registered in `App.tsx` outside the `SECTION_PATHS` AppShell wrapper, similar to how `/share/timeline/:token` works.
- No changes to existing daily-reset session logic — public sessions are a separate table so they don't interfere with the per-day signed-in flow.

## Build order

1. Migration: add `section` column to `checklist_items`; create `checklist_public_sessions` with RLS.
2. Editor UI for sections (add / rename / delete / assign items).
3. Public share page + edge function + share button + notification.
4. Submissions archive tab for master_admin.
5. Copy-to-property action.

Each step is independently testable and shippable.
