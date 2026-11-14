# Text sizing changes

## Separate commits
- Baseline lift: `e59cfc1` — shared text tokens, contrast, touch targets and text-floor aliases.
- Enlargement: the following commit, titled **Add saved Aa text enlargement and phone text matching**.

No table, function, policy or trigger was changed.

## Files
Baseline files: `tailwind.config.ts`, `src/index.css`, shared UI Button/Input/Textarea/Select/Tabs/Dropdown/Context menu/Command/Popover/Checkbox/Switch/Radio controls, Header, BottomNav, AuthPage, CareGuideDetailPage, readabilityTokens.test.ts, AGENTS.md and roadmap.md.

Enlargement additions: `src/lib/textSize.ts`, `textSize.test.ts`, `textSizeGuard.test.ts`; `src/hooks/useTextSize.tsx` and tests; `src/components/TextSizeControl.tsx` and tests.

Integration: main.tsx, App.tsx, Header, ProfileSection, MemberEditDrawer and tests, teamConstants, MeetTeamSection, AppShell, OfflineBanner, NotificationsPanel, MessagesSection, OrdersSection, CalendarSection, Dashboard, requester RequestForms/RequesterOrders, shared calendar and global CSS.

Text-only codemod: existing pixel font sizes and text line heights in 78 app files became rem units. Icons, borders and non-text pixels were not converted. PDF APIs still use numeric point sizes. The full touched-file list is available in the two commits.

## Phone layout fixes
- Header and banners: reserve their measured height; fit Aa beside language and notification controls.
- Bottom navigation: allow long labels to wrap.
- Home: stack the dense snapshot tiles when enlarged.
- Orders management: wrap the four tabs into two columns.
- Requester Orders: allow tile height to grow, stack the house label beneath the title, and stack quantity labels above the stepper.
- Calendar and Team: wrap filter chips; member editor tabs wrap when enlarged, with vertical scrolling allowed.
- Notifications and Messages: use measured header/banner height to keep content below the top bar.

## Verification
- 469 tests passed, including device detection/clamping, mapping, cache/early apply, persistence/failure restoration, Aa/Profile options, admin control, contrast, shared sizes and regression guards.
- Signed-in 390px checks: Home, Orders management, Tasks, Checklists, Calendar, Messages, Properties, Profile and Team at 1.2 and 1.4; no page horizontal overflow or clipped button widths after fixes.
- Notifications, Timesheets and Joselita's member editor checked at 1.4.
- Read-only View as Joselita: Orders tiles, Request, Library, library quantity sheet, My list and On the way checked at both sizes.
- Aa saved Extra large, survived reload at 22.4px root size and the original preference was restored; no requests, orders or pay records were changed.

## Not verified
- A real installed iPhone with Larger Text / Dynamic Type.
- Populated PA request batches and populated staff draft/arrival lists: checked accounts returned empty lists, so only their empty states and automated rule tests were covered.
- Real requester send/receipt actions, which would change records and send alerts.
- Every possible content length, screen combination and phone keyboard state.