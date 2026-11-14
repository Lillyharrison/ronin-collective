# Spanish language audit (read-only)

Goal: one honest report, `spanish-audit-report.md` at the project root, plus a summary in chat. No code, data or settings change. Saving the report file is the only write.

## What is already confirmed
- Translations use three methods side by side: a shared dictionary (`src/lib/i18n.ts`, 546 lines, falls back to English when a key is missing), `language === "es" ? … : …` ternaries (about 50 files), and copies inside each component. About 189 files use the language system in some way.
- The Home subtitle already has a Spanish version ("Que tengas un gran día"). Lilly still sees English, so the cause could be elsewhere, for example where the language is read or a second subtitle. This is not confirmed yet; the audit will check it.
- Typed content today: tasks 54 (none with `title_es`), repairs 73, library items 40, house requests 5, calendar events 26, checklist templates 110, checklist items 1,076, house rules 2, orders 2, messages 164, notifications 380, manuals 0. Only 1 of 23 profiles is set to Spanish.
- A `translate-entries` function exists (Lovable AI, English to Spanish, on demand). Only `useEntryTranslation` uses it.
- Server text: only `ronin-ai` and `time-tracking-reminders` read `language_pref`.

## Audit steps
1. **Hard-coded English**: scan every component for text outside the dictionary (labels, buttons, placeholders, toasts, aria-labels, dialogs, empty states, PDFs and exports, print views). List results by file with the exact string and a count. Priority order: bottom nav, Home, Orders, Tasks, Checklists, Maintenance, Calendar, Messages, Properties, Profile, notifications; admin screens come after. Also check why the nav labels and Home subtitle show English.
2. **Spanish quality**: read every Spanish string. Flag mistakes, awkward wording, mixed languages and inconsistent terms (house/property, task, repair/issue, checklist, order, shift, leave). Propose a glossary in plain Latin American Spanish using "tú" (for example: casa, tarea, reparación, lista de control, pedido, turno, permiso/vacaciones) and list every place that differs from it.
3. **Typed content**: for each table, record whether it stores both languages, whether and when translation happens, what a Spanish reader sees today, the screens affected and the row counts above.
4. **Server text**: go through every function that creates notifications, push messages, reminders, emails or assistant replies. Mark each as language-aware or English-only.
5. **Formatting**: dates, times, numbers, currency, day and month names, and plurals such as "activa(s)" and "1 visits". Each found case gets a file and line.
6. **Recommendation**: compare translating when text is saved (both languages stored) with translating on demand and caching the result. Cover edits, cost, quality, offline use and a "show original" option. Then give a phased fix plan with effort and credit estimates. Housekeeper daily screens come first. Uncertain points will be marked.

## Technical notes
- Database access is read-only counts and samples. Database structures are not touched.
- Credit estimates are rough and labelled as estimates.
