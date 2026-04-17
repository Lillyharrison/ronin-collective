---
name: Scaling Rules
description: Mandatory rules for every database query and list rendering — paginate, limit, narrow columns, window by date
type: preference
---
This app must remain instant as data grows from hundreds to hundreds of thousands of rows. Apply these rules to EVERY new feature without being asked.

## Rule 1 — Always cap list queries
Every Supabase `.from(...).select(...)` that returns a list MUST include either `.limit(N)` (default 50) or `.range(from, to)` for pagination. Never return unbounded lists. Exception: tiny lookup tables (`properties`, `vendors`, `maintenance_categories`, `achievements`) where the row count is bounded by business logic.

## Rule 2 — Date-window time-series tables
Any query against `messages`, `notifications`, `calendar_events`, `system_events`, `staff_shifts`, `checklist_sessions`, `maintenance_issues`, `tasks`, `staff_leave_requests` MUST include a date filter (`.gte("created_at", ...)` or equivalent) bounded to the visible window — usually the current month or the last 7/30/90 days.

## Rule 3 — Never `select("*")` on list views
Always specify exact columns. List views need 4–8 fields, not 14. Never pull large text/JSON columns (`description`, `payload`, `content_text`, `reactions`, `notes`, `attachments`) unless rendered.

## Rule 4 — Cache with React Query
Data fetches that re-run on every mount belong in `useQuery`, not `useEffect`. The `QueryClient` in `App.tsx` already has 2-min staleTime + 5-min gcTime — use it so tab switches feel instant.

## Rule 5 — Prefer count queries over fetching to count
For badge counts use `.select("id", { count: "exact", head: true })` — it returns a number, not rows.

## Rule 6 — Long lists need virtualization
Any list expected to exceed ~200 visible rows (messages, notifications, large calendars) must use `react-window` / `@tanstack/react-virtual`. Don't render thousands of DOM nodes.

## Rule 7 — Realtime is a budget
Each `supabase.channel()` is a websocket. Consolidate where possible; avoid duplicate subscriptions to the same table from multiple components on the same page.

## Reference apps
WhatsApp, Linear, Notion: pagination + date windows + virtualization + smart caching are why they stay fast at billions of rows.
