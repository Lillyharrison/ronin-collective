# Lean Spanish follow-up

## Result
- Named navigation/header/push/offline/Home labels use bilingual copy; proper counts and selected-language notification dates. Custom Home messages remain untouched.
- Language switches immediately, stores device choice, and best-effort updates only the signed-in person’s language_pref. Without explicit device choice, the profile language is read. No bulk updates.
- Existing Photo request names display as Solicitud con foto in Spanish; new Spanish photo-only requests use that name. No existing records rewritten.
- Orders list/detail, requester My list/On the way, PA queue, library cards/rows/request sheets and task card/modal/family view translate view-only content. Existing nonempty task Spanish fields win. Original edit values and saved records remain unchanged; editable order notes/packing lists have translated read-only previews.
- Each translated surface has one quiet original/translation switch. Requests and library mutations retain original records.
- Successful changed translations persist by signed-in user + source hash + target; sign-out clears translation caches. Failures, blanks and unchanged originals are never stored as translations. Calls only run for signed-in Spanish UI online, after 300 ms debounce, with unique eligible strings in chunks of 40.
- translate-entries validates at most 50 strings and 2000 characters per input; prompt explicitly preserves identifiers, numbers, units, quantities, names, URLs, line breaks and all information. Deployed; unsigned request returns 401.
- Library phone rows stack their existing fields instead of overflowing; desktop columns unchanged.

## Verification
- Full suite: 514 tests passed; final focused suite after refinements: 80 passed. Build log: OK.
- Isolated browser fixtures at 390px and 1280px: translated order, detail, library and original toggle checked, no phone horizontal overflow, no runtime errors. Fixtures use representative supplied wording, not live order records, and synthetic translations.
- No database objects or live records/settings changed during verification. Only the requested edge function deployed.

## Credits
Usage rose from 426 to 436 credits: **10 credits observed so far**. Final processing may post later, and account-level usage can include concurrent activity; this is a measured difference, not an exact finalized per-message invoice. No paid live AI translation was invoked during verification.

## Unverified / limits
- A live signed-in preview session could not be obtained: no auth account matches the requesting user. Live profile-toggle readback, signed-in deployed validation 400, real staff request/PA/task data flows remain unverified; automated tests cover behavior.
- Lilly should judge actual translation quality and latency on her phone with the two supplied orders; real iPhone/PWA behavior was not verified.
- Cache avoids re-paying for successful changed translations retained on this device. Clearing browser storage, sign-out (as requested), another device or a changed source can require new translations; unchanged already-Spanish output is deliberately not cached.
- Global missing-key English fallback was left unchanged; the earlier placeholder-Spanish rule mismatch was raised separately. No unrelated screens or database localization changed.

## Changed files
- `AGENTS.md`
- `roadmap.md`
- `src/components/AppShell.tsx`
- `src/components/BottomNav.tsx`
- `src/components/ContentTranslation.test.tsx`
- `src/components/ContentTranslation.tsx`
- `src/components/Header.tsx`
- `src/components/OfflineBanner.tsx`
- `src/components/orders/OrderDetailModal.tsx`
- `src/components/orders/library/AddToShoppingListSheet.tsx`
- `src/components/orders/library/LibraryItemCard.tsx`
- `src/components/orders/library/LibraryItemRow.tsx`
- `src/components/orders/library/LibraryListHeader.tsx`
- `src/components/orders/library/OrderLibraryTab.tsx`
- `src/components/orders/requests/RequestForms.tsx`
- `src/components/orders/requests/RequesterOrders.tsx`
- `src/components/orders/requests/RequestsQueue.tsx`
- `src/components/orders/requests/logic.ts`
- `src/components/orders/requests/useHouseRequests.ts`
- `src/components/sections/Dashboard.tsx`
- `src/components/sections/OrdersSection.tsx`
- `src/components/sections/TasksSection.tsx`
- `src/components/tasks/FamilyTasksView.tsx`
- `src/components/tasks/TaskCard.tsx`
- `src/components/tasks/TaskModal.tsx`
- `src/contexts/AuthContext.tsx`
- `src/contexts/LanguageContext.test.tsx`
- `src/contexts/LanguageContext.tsx`
- `src/hooks/useEntryTranslation.test.tsx`
- `src/hooks/useEntryTranslation.ts`
- `src/lib/i18n.ts`
- `src/lib/spanishDisplay.test.ts`
- `src/lib/spanishDisplay.ts`
- `src/lib/translationCache.test.ts`
- `src/lib/translationCache.ts`
- `supabase/functions/translate-entries/index.ts`
- `supabase/functions/translate-entries/rules.ts`
