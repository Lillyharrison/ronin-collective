# Ronin Spanish audit — read only

**Audit date:** 14 November 2026 (UTC). **Audience:** Lilly and the team maintaining Ronin.

## Executive summary

1. **The Home subtitle has an exact, verified cause.** The live `system_settings` row `dashboard_tagline` contains `{"text":"Have a great day","expiresAt":null}`. `Dashboard.tsx:258–260,297–303,379` gives that shared, permanent, single-language message precedence over the existing Spanish default at line 146. Spanish is selected correctly; this is not evidence that the default translation is missing or the toggle is broken. The current signed-in phone page reproduced **“Buenos días, Lilly” + “Have a great day”** together.
2. **Bottom navigation is not connected to translations.** `BottomNav.tsx:12–16` defines Home, Properties, Messages, Maintenance and Profile in English; lines 50,64,87 reuse English accessible names. `useLanguage` is imported but unused. Only Properties/Maintenance/Profile have visible word labels in the current five-slot design; Home and Messages are icons with English accessible names. The Spanish dictionary already has these navigation keys.
3. **The top-bar page titles are also English**, independently of the bottom navigation: `AppShell.tsx:60–84,205` supplies its English `sectionTitles` map to Header. The signed-in Orders page showed **Orders** above **Pedidos & Entregas**.
4. **The header toggle does not save account language.** `Header.tsx:84` changes LanguageContext state; `LanguageContext.tsx:10–22,35–39` saves only `localStorage["ronin.language"]`. It neither reads nor updates `profiles.language_pref`. The live database has **22 profiles: 21 en, 1 es**; active non-draft/non-archived profiles are **16 en, 1 es**. Mercy is the sole Spanish profile; Lilly Harrison is **en**. Spanish UI and English server preference can therefore coexist indefinitely, on different devices too.
5. **The Orders screenshot is English stored content, not just untranslated controls.** Both live orders were read and their current Spanish page reproduced the supplied titles and descriptions verbatim. There are no bilingual columns or translation-hook consumers for orders, order-library items or request lines.
6. **All 54 tasks have English-named titles and no Spanish titles; all 50 populated English-named descriptions lack Spanish descriptions.** Columns exist but current writers do not fill them. Names of columns are not reliable language detection: Spanish typed into the app is also saved into English-named task fields.
7. **Content translation exists, but only for selected checklist and repair display paths.** It is an online English→Spanish AI request with a memory-only cache, no stored translations and silent original-text fallback. It does not translate Orders, requests, chat, notifications, planned maintenance or arbitrary guide content.
8. **Server localization is uneven.** Clock/monthly review reminders use each recipient’s profile language; the two acknowledgement RPCs do too. General notification/push delivery forwards the same supplied wording to everyone. Many producers and all five owner-identified order/calendar/occupancy/birthday database functions remain English-only.
9. **Formatting is inconsistent.** English dates/months, fixed decimal dots, untranslated plural fragments and English exports survive within Spanish screens. `2 activa(s)` is reproduced; the current TimesheetDetail visit count already handles singular/plural correctly—this audit does **not** claim it currently renders “1 visits”.

### What was and was not changed

Only **`spanish-audit-report.md`** is written to the repository. No app source, database object, record, permission, setting, deployment or language preference was changed. No roadmap/AGENTS amendment was necessary. Database inspection used SELECTs and catalog reads only; no notification, translation, email, reminder, dismissal or save was invoked.

Browser checks used the existing signed-in session at **390×844** and **1280×1800**, in a disposable browser context. All data mutations, all RPC POSTs and all edge-function calls were intercepted and refused before forwarding; service workers were disabled for this inspection. The only blocked application calls observed were `my_clock_status`. Language toggles changed disposable browser-local state only, not Lilly’s actual device/settings or profile. Auth-session storage was restored only on the local app origin; no credentials or tokens appear in this report.

### Evidence and completeness — read this before using the counts

- **Confirmed:** source logic, live schema and aggregate counts, the saved subtitle override, Lilly’s account preference, and the current Spanish Home/Orders appearance.
- **Source-audited, not exercised:** editing, errors, onboarding, admin-only dialogs, PDFs, exports, server generation and translation paths.
- **Candidate inventory:** Appendix A deliberately includes a broad static file/line ledger plus supplementary manual findings. It gives exact source strings/templates and source occurrence counts, not “times shown” or a certified total of English defects. Some entries are data examples, neutral words, internal exceptions, fallback paths or arrays requiring reachability review. The distinction is called out rather than concealed.
- **Cannot honestly certify “every string” or “every deviation”:** runtime-composed text, third-party controls, historical snapshots, all arbitrary database content, AI output and remote email templates cannot be exhaustively classified by literal scanning. The large-file manual reviews were supplemented by whole-source syntax scans, not every role-specific screen state being opened. Appendices identify the broad coverage and its limits. No grand total is presented as an exact defect count.
- Line references refer to the source checked during this audit; future edits can move them. Exact text is retained so findings remain searchable.

## 1. Translation mechanisms and hard-coded UI

### Mechanisms in use

| Mechanism | Actual behavior | Consistency / risk |
|---|---|---|
| `src/lib/i18n.ts` shared `en` / `es` dictionaries | `t(key)` selects UI labels | Static scan found **232 English and 232 Spanish keys, no missing counterpart keys**. Several Spanish values need editorial improvement. This dictionary is not applied everywhere. |
| `LanguageContext.tsx:12–22` | URL `?lang=en/es`, then device-local stored choice, otherwise **English** | Does not detect phone/browser language; does not hydrate from profile; storage is not user-keyed. Public share URL language can win on first load. No storage-event account preference sync. |
| `LanguageContext.tsx:41–42` | Missing selected-language key → English value → raw key | English fallback is real, but **no current missing static dictionary key was found**. Do not blame the supplied screenshots on missing keys. This differs from the standing preference for Spanish placeholders; this audit preserves existing behavior without choosing a replacement. |
| Inline `language === "es"`, `isL`, `es`, `isEN`, `isES` ternaries | Two copies maintained at individual sites | Usually works when correctly used, but easy to omit aria labels, error paths, plural forms or sibling controls. |
| Per-component `t(en,es)`, `text(es,en)`, dictionaries/tuples/`labelEs` | Separate local copies, not shared dictionary keys | Function names/order differ. The local Profile `t` is not the global dictionary `t`. English literals inside correctly selected pairs are **not** untranslated defects. |
| `useEntryTranslation` / `useBatchTranslation` | Selected database strings translated after render, Spanish only | Separate from static UI translation; does not persist bilingual records. |
| Stored bilingual fields (`tasks`, `manuals`, `achievements`) | Reader chooses a field where implemented | Presence of columns does not guarantee writers populate them or all readers use them. |

### Priority findings by daily surface

| Priority | Surface / files | Confirmed English or mixed result | Why first |
|---|---|---|---|
| P0 | BottomNav; Header; AppShell | Home/Properties/Messages/Maintenance/Profile; Open menu/Go back/Notifications; all page-title map entries; enable-notifications banner | Every daily screen inherits these. |
| P0 | Dashboard | Shared English subtitle override; `Added` and English notification date; admin message editor: Type a message…, Today only, Until date, Until I clear it, Save, Cancel, Edit message, Clear override | First page; exact screenshot cause. |
| P0 | Orders / requests / order library | Orders names/descriptions raw; library hook success/error toasts English; older order-list editor English; PDF English | Staff must identify the correct item and quantities. New private draft/send screens mostly have valid Spanish controls. |
| P0 | Tasks | Delete this task?; Back to view; DRAFT; Linked; English task notification templates; original titles/descriptions | Bilingual title fields not filled; family/draft readers bypass Spanish selection. |
| P0 | Checklists | Many item/comment/product/editor and completion-table labels English, despite translated ordinary titles/items | Daily instructions and reporting are not one uniformly translated flow. |
| P0 | Maintenance | English status badges, archive actions, planned-maintenance list/forms and hooks; PDF English | Repair list content translation does not cover chrome/status or planned work. |
| P0 | Calendar and staff roster | Filters/types, dialogs, reschedule toasts, leave, mobile shifts, publication state and date names English | Large coverage gap on a daily screen, including phone-specific roster. |
| P0 | Messages | Message info/content/status/read-by; Confirm/Cancel action cards; group/chat information; search actions | Chat content itself remains original. |
| P0 | Properties | Entire main component has no language-context import; statuses, rooms, assigned people, editor English | Spanish navigation enters an English page. |
| P0 | Profile | Profile alt; Save/Saving… shared row; Not allowed + English preview error instructions; raw roles/errors | Self-service settings should be intelligible. |
| P0 | Notifications / offline | Notifications, Mark all read, No notifications yet, Updates and alerts will appear here, View; all offline/sync messages | Alerts are essential operational communication, not cosmetic. |
| P1 | Sign-in, invitations/password setup | AuthPage and ResetPassword English-only normal flow | New staff may be blocked before reaching Spanish settings. |
| P1 | Admin/team/vendors/rules/timesheets/exports | English failure messages and substantial untranslated tools/export copy | Lilly works in Spanish; managers must train from the same vocabulary. |
| P2 | Construction timeline, placeholder/admin utilities, secondary exports | English samples, prompts, print/export views and shared library accessibility | Still needs finishing; less immediate than staff task/request instructions. |

**Appendix A is the detailed file-by-file exact-string ledger**, ordered daily surfaces first, then supporting/admin screens. It includes labels, render text, display dictionaries, placeholders, aria/alt/title attributes, error/toast/validation candidates and manually verified export omissions. A single source occurrence can feed many dialogs or recipients; repeated source locations are shown, not multiplied by runtime uses.

### New request screens — avoid a false accusation

`RequestForms.tsx`, `RequesterOrders.tsx`, `RequestsQueue.tsx` correctly branch normal buttons, error messages, send/retry confirmations and most accessible names into Spanish. Internal `Not saved`, `Not sent`, `Nothing confirmed` and payload/compression exceptions are **caught by generic Spanish messages in current flows**, rather than leaked verbatim. They are retained in the ledger as non-visible exposure notes, not counted as confirmed English UI defects. The **persisted `Photo request`** default (`requests/logic.ts:25`) is a real data-label gap and is shown later without translation. `PA` remains an unexplained organizational acronym. Library/request names and notes are stored/displayed original text.

## 2. Spanish quality and preferred glossary

### Proposed glossary — recommendation, not an approved rename

Plain Latin American Spanish; tuteo; sentence case; short verbs. Keep personal names, house names, brands, codes, URLs, ASINs, quantities and safety specifications unchanged. “Propiedad” is valid Spanish, not intrinsically wrong; use **casa** consistently for the staff house workflow and reserve “propiedad” for genuinely non-house property/legal contexts.

| Concept | Preferred wording | Notes |
|---|---|---|
| Home / house(s) | Inicio / Casa(s) | Avoid alternating casa/propiedad in the same staff workflow. |
| Task | Tarea | Nueva tarea; En curso; Completada; Sin asignar. |
| Maintenance / repair / report | Mantenimiento / Reparación / Reportar un problema | “Problema” is fine for a report; do not call an order request an issue. |
| Planned maintenance | Mantenimiento programado | Consistent with calendar scheduling; “planificado” also valid but choose one. |
| Checklist / checklist item | Lista de verificación / Paso | Compact label “Listas” where space matters; headings must remain grammatical. |
| Order / delivery | Pedido / Entrega | Requested ≠ ordered ≠ arrived. Avoid literal “colocado”. |
| House request / draft / send list | Solicitud / Borrador / Enviar lista | User-facing “Pedir algo”; Añadir a mi lista already approved in request flow. |
| Sent / ordered / arrived | Enviado / Pedido realizado / Llegó | “Enviado al equipo de compras” clearer than “a la PA”, unless staff already use PA. |
| Library / item | Biblioteca / Artículo | Name could be “Catálogo” later, but no need to invent a rename now. |
| Shift / staff schedule | Turno / Horario del personal | “Visita” retained for time/pay visits; do not confuse with login sessions. |
| Leave | Permiso / Vacaciones / Ausencia por enfermedad | Holiday: Día festivo; request: Solicitar permiso. |
| Clock in/out | Empezar / Terminar | Avoid Spain-specific “fichar” for housekeepers. |
| Timesheet | Registro de horas | Payroll wording may require Lilly’s accountant approval. |
| Notifications / alerts / acknowledge | Notificaciones / Alertas / Confirmar recepción | Keep “read”, “acknowledged” and “clear” as distinct actions. |
| Vendor / department | Proveedor / Área | Company/person names remain original. |
| Care guide / house rules | Guía de cuidado / Reglas de la casa | Avoid alternating Cuidados/Guías without clear hierarchy. |
| Settings / bulk import | Configuración / Importación masiva | Not “Importación Maestra” just because role is master admin. |
| Common commands | Guardar, Cancelar, Volver, Quitar, Reintentar | Specific accessible names: Aumentar cantidad / Reducir cantidad. |

### Confirmed/editorial deviations

| Source | Current Spanish | Proposed treatment / certainty |
|---|---|---|
| `i18n.ts:393`; `ChecklistsSection.tsx:94` | `Listas de` composed with `&` + activity label | Incomplete/awkward heading; render a complete Spanish phrase with “y”. Confirm actual heading composition before changing. |
| `i18n.ts:308,388`; teamConstants:82,110; accessCheckLogic:39 | Listas de Control / Listas / Listas de verificación | Standardize full and short label; case should be sentence case. All are understandable, not security defects. |
| `i18n.ts:395` | Listas operacionales y de actividades | Prefer “Listas de verificación y actividades” or “Listas operativas…”. Editorial. |
| `ChecklistsSection.tsx:25–27,45` | Listas de Equipaje; Eventos & Fiestas; Actividades Infantiles; Entregas | Sentence case; “y”; submissions → “Registros enviados” so not confused with deliveries. |
| `TaskCard.tsx:41–42`; i18n:303 | En Progreso; Completado | En curso; Completada when referring to tarea. |
| `IssueModal.tsx:47,49`; MaintenanceSection:230,232 | En Investigación; Programado/En Progreso | Sentence case; “En revisión” / “Programada / en curso”; pick gender consistent with reparación or trabajo. |
| `OrdersSection.tsx` status/legend copy | No colocado; Colocado / en tránsito | Literal order-placement translation; prefer “Pedido pendiente” / “Pedido realizado / en camino”. Preserve database status IDs. |
| `RequestForms.tsx:15,17` | Menos / Más | Correct but insufficiently specific for a screen reader; “Reducir cantidad” / “Aumentar cantidad”. |
| `RequestForms.tsx:58,65`; RequesterOrders:57,78,80 | La PA / Enviado a la PA | Explain role or use “equipo de compras”; organizational term, requires confirmation before renaming. |
| `RequestForms.tsx:65`; failure:20 | Repetir foto; Toca para hacer una foto; Comprueba tu conexión | Prefer “Tomar otra foto”, “Toca para tomar una foto”, “Revisa tu conexión” for Latin America. Current strings understandable. |
| `PlannedMaintenanceDetail.tsx:28` | Por reservar / Reservado | Prefer “Por programar / Programado” where it means booking a contractor rather than reserving an object. Context-dependent. |
| teamConstants:66; accessCheckLogic:39 | Mantenimiento Planificado / Mantenimiento programado | Choose “Mantenimiento programado”. |
| teamConstants:61,98; FamilyTasksView:235; i18n property labels | Propiedad(es) versus Casa(s) in requests/access check | Valid but inconsistent; use casa on staff screens. Appendix B enumerates matching sites. |
| `Dashboard.tsx:611` | `2 activa(s)` | Actual phone reproduction. Correct singular/plural: “1 activa”, “2 activas”. |
| `Dashboard.tsx:589` | `1 activas` possible | Always “activas” at this counter; select singular for one. |
| `Dashboard.tsx:629`; teamConstants:59 | Ubicación del principal | Administrative role jargon; “Ubicación de [name]” or “Ubicación del propietario” only if that is the actual intended role. |
| `Dashboard.tsx:686` | Todo despejado | Understandable literal “all clear”; “Sin notificaciones nuevas” explains the actual state. |
| `MeetTeamSection.tsx:215` | Master Admin in Spanish role chip | “Administrador principal” (subject to internal role naming choice). |
| `MeetTeamSection.tsx:218`; teamConstants:125 | Familia Extendida | “Familia extensa” more idiomatic; editorial. |
| `MeetTeamSection.tsx:750` | Solo propio | Missing noun; “Solo su horario” in schedule scope. |
| MemberEditDrawer:527,530,541 | no se genera hoja de horas; Nombre en la hoja; fichan entrada y salida | Missing article; unclear shortened noun; avoid fichar. “No se genera un registro de horas”; “Nombre en el registro”; “registran la entrada y la salida”. |
| `MasterImportSection.tsx:78,87`; i18n:327; teamConstants:119 | Importación Maestra; poblará la tabla de tareas | “Importación masiva”; “creará las tareas”. Avoid database jargon. |
| `i18n.ts:438–442` | reglas de propiedad; Cuidados versus guías de cuidado | “Reglas de la casa”; keep one guide label. |
| accessCheckLogic:15 | Ve todo por diseño; comprobación horaria | Literal technical wording; “Puede ver todo por su nivel”; “Revisión automática cada hora”. Proposed, not a rule change. |

**Appendix B lists the additional matching terminology/quality candidates with exact strings and lines.** It is a glossary-deviation candidate list, not a claim every valid Spanish synonym is wrong. Some matches are English bilingual counterparts or field names; whole-source scans cannot adjudicate context or all model-generated Spanish. No live translation quality sample was requested because that would invoke paid AI and potentially affect usage records.

## 3. User-entered content: storage, writers, readers and volumes

**Counts are live exact SELECT aggregates, not estimated pg-statistics counts, as observed during this audit.** They are global audit counts, not the rows any specific staff member may see. Single-language rows are **at risk**, not proven all English; language was not statistically detected or all private texts dumped. Null/blank translation means absent, not necessarily that the original needs translating.

| Content/table | Live volume | Bilingual storage / when translation occurs | What Spanish readers actually see / missing |
|---|---:|---|---|
| `tasks` title/description | **54** titles; **54 missing title_es**; **50** populated description_en, all **50 missing description_es** | title_en/title_es + description_en/description_es exist. Current TaskModal and FamilyTasks writers save only English-named fields. No `translate-entries` consumer or task translation trigger found. | TaskCard:49 prefers title_es only when nonempty, otherwise title_en. TaskModal:106–107 edits English-named title/description. TasksSection:207,282 query does not include description_es; FamilyTasksView:127,282 and DraftTasksWidget:48,122 use title_en directly. Need translation generation, edit invalidation and consistent readers, not just filling one title field. |
| `tasks.acknowledged_note`, attachments/voice | **0** notes; attachments/audio not language-counted | Single note / JSON references / media | Original text/audio; no transcript or bilingual-comment path audited. |
| `maintenance_issues` | **73** rows, **63** descriptions; **0** acknowledged_note values | Single title/description; MaintenanceSection:286–290 translates visible issue title/description on demand through AI memory cache. No stored Spanish fields. | Initially original; successful AI result swaps selected list/board/export display objects. Failure/offline → original. Separate detail/notification/edit paths not universal consumers. location_detail, custom category/vendor names and acknowledgement note remain original. |
| Repair comments | No separate `maintenance_comments` table in live public schema | No repair-comment translation subsystem found. Acknowledgement note and description are existing text fields. | Do not invent comment rows/counts. Any nested JSON/history text not exhaustively enumerated. |
| `planned_maintenance` | **127**, **106** descriptions | Single title/description; no on-demand consumer | Raw in list and `PlannedMaintenanceDetail.tsx:48`; due dates/chrome independently need Spanish. |
| `checklist_templates` | **110**: **109 standard**, **1 order_list**; categories **95 cleaning, 10 activity, 5 care_guide** | Single title, categories, locations, JSON products/sections, manual-link label. ChecklistCard:39 and ChecklistDetailPage:84 translate titles on display. | Titles may translate online; settings/report/submission/order-list readers can remain original; category/location/product labels not covered universally. |
| `checklist_items` | **1,076**, **131** notes | Single title/notes; ChecklistItemRow:48 translates title + notes; ChecklistDetailPage:907–913 translates grouping labels; SharedChecklist:191,193–198 uses same hooks. | Selected operational rows translate online. Not every care-guide renderer, print path, section/container or report is a consumer. |
| `checklist_comments` | **4** | Single content; no translation hook | Raw comment text in checklist detail; no translation label or Show original. |
| Checklist sessions/submissions | **18** public sessions and **32** in-app sessions from stats snapshot (approximate, not exact verified aggregates) | Public session notes, copied titles/names and snapshots single-language | Original notes/snapshots; archive UI also English. Count is explicitly approximate here. |
| `order_library_items` | **40**, **35** notes, **24** sizes | Single name/notes/size, aliases/purchase metadata; no translation consumer | Library cards/rows/request library sheet show original. Preserve dimensions/product codes; translate descriptive terms, not quantity numbers or brand names. |
| `orders` | **2**, both descriptions populated; **0** notes, **0** packing_list | Single title/description/notes/packing_list; no translation consumer | Exact supplied English examples reproduced in Spanish page. Order detail and list stay original. No English/Spanish storage or “show original”. |
| `shopping_list_items` request lines | **5**, **0** notes | Single name/quantity text/notes; RequestScreen and library add write original; photo-only app default is English `Photo request` | My list, On the way and PA queue all show raw row fields. Quiet drafts/send-list behavior does not imply translation. No translation consumer. |
| Reusable shopping lists / order snapshots | **6** `order_list_items`; **2** `order_list_submissions` containing **4** immutable JSON lines; **0** order_list_draft_lines | Template/items and JSON lines carry original text. No dual-language line snapshot mechanism found. | Original shopping-list instructions, names/comments and issued snapshot fields. Do not rewrite historical snapshots as a translation side effect. |
| `calendar_events` | **26**, **24** descriptions, **9** notes | Single title/description/notes/location; no translation consumer | Original external iCal content and custom entries. Calendar also generates English birthday/status/recurrence labels. External read-only events must stay immutable. |
| Care guides | **5** templates categorized care_guide (included above); no independent care_guides table | Actual guides use checklist_templates/items/JSON metadata, not manuals bilingual fields. extract-care-guide explicitly generates English; CareGuideScanModal constructs English Composition/Fabric/Care symbols/Ratings labels. | Guide editor/print uses original strings; shared checklist translations are not a universal guide translation path. Per-guide item count not separately measured. |
| `manuals` | **0** | title_en/title_es + content_en/content_es exist | No populated bilingual manuals to verify. Column presence must not be conflated with the actual five checklist-based care guides. Uploaded PDF/video/image prose is not translated by changing a title. |
| `property_rules` | **2** | Single title/description, keywords/rejection_reason; no translation consumer | RulesSection, RulesManager, PendingRulesWidget, Alerts and Dashboard show original rule content. **“Parking restriction”** was visible in the Spanish Home card. |
| `vendors` / `vendor_contacts` | **50** vendors, **6** notes; **0** vendor_contacts | Single notes/services/company/contact fields; no translation consumer | Original service description/notes; company/person names should remain unchanged. English vendor UI is an independent issue. |
| `messages` / chat titles | **164** messages, **161** nonblank text | Single content_text and thread title; no automatic content translation | MessageBubble:553–571 shows original text; AI reply may follow caller language but old messages do not transform. No message-specific bilingual store or on-demand button. |
| `notifications` | **356**, **66** created in last 14 days | Single title/body; generated language chosen at producer, where implemented. No frontend translation hook | Original stored text on bell/Home/push; no per-reader field selection. **189 repair, 149 planned-maintenance, 8 task, 5 calendar, 3 public-checklist, 1 request, 1 order** records. Counts classify entity type, not text language. |
| Other typed content | **6** staff schedule notes, **180** shift notes; profiles/rooms/assets/vehicle notes not exhaustively counted | Generally single-language | Preserve names; translate instructional free text when scoped/readable. These are secondary coverage beyond the requested list. |
| Shared Dashboard tagline | **1** permanent override found | Single JSON text; no translation consumer | `Have a great day` wins in every language. Clear/translate behavior must be explicitly designed; no setting was changed here. |

### Live Orders examples (the supplied text, not a broad private-data dump)

- Title **Kitchen area**; stored description contains three newline-separated lines: **Pastry brush**, **Pastry scales**, **Ladle**. Card normal whitespace makes these appear together as “Pastry brush Pastry scales Ladle”.
- Title **Tablet Salt for Water Softener Tanks**; description: **Needs to be in tablet form not a block. / 10kg bags (not heavier please!) / PH needs 12 x 10kg bags every 2 months**. No client content translation path exists. Translating this must preserve the **tablet-not-block** constraint, **10kg** maximum, **12 × 10kg**, and **every two months**, rather than summarizing away safety/purchasing requirements.

### Translation service: precise limits

`translate-entries/index.ts:6,9–20,29,34–40,52–69` requires a signed-in caller, accepts an array of strings (no entity/field/source/target version identifiers), calls `google/gemini-3-flash-preview` through Lovable AI, asks **English to Spanish**, uses temperature 0.1, strips fences and parses JSON. It performs **no database writeback**. Input/output array size and item types are not robustly validated; no chunking/maximum string budget was found.

`useEntryTranslation.ts:17–19,23–38,41–42,59–107,120–145` starts with originals, translates for Spanish only, caches by joined text in a module Map and deduplicates identical in-flight batches. Edits change the text key but there is no persistent cache, per-user/house key, translation version or translator review. Switching to English returns whatever source text was supplied—even if that source is actually Spanish. Non-OK HTTP returns originals and can cache those originals as if they were a successful translation; reload clears the cache. Offline behavior is original English, not durable translated instructions.

**Complete consumers found:** MaintenanceSection (title/description); ChecklistCard (template title); ChecklistDetailPage (title + group labels); ChecklistItemRow (title/notes); SharedChecklist (title + item title/notes). No consumers found for Orders, requests, task descriptions, notifications, planned maintenance, messages, rule descriptions or vendors.

**Anonymous shared checklist mismatch:** public data loads under the share-token endpoint, but translation calls use the publishable-key fallback when signed out; translate-entries requires a signed-in user, so anonymous Spanish readers get originals. This is a source-traced failure, not a live anonymous translation invocation.

## 4. Server-generated text, push, email and assistant replies

| Producer / transport | Uses recipient `profiles.language_pref`? | Actual coverage / exact evidence |
|---|---|---|
| `time-tracking-reminders/index.ts:36,49–51,57,63–64`; logic:8–9 | **Yes** | Staff start/end reminders and each admin’s monthly review/nudge. Spanish example: `Hoy trabajas en ${property}` / `¿Ya terminaste?`; localized words used for both stored notice and push. Times still manually format am/pm. |
| `acknowledge_entry`, `acknowledge_notification_receipt` | **Yes** | Owner’s prior audit confirmed it; live function catalog definitions contain language_pref references. Edge wrappers forward their returned title/body. No real acknowledgement performed. |
| `create_order_from_requests`, `send_request_list`, `notify_on_calendar_event_insert`, `notify_on_occupant_change`, `notify_todays_birthdays` | **No, English-only per owner’s checked definitions** | Live catalog confirms no language_pref reference in all five. Absence alone would not prove English, so English classification also relies on the owner’s explicit audit fact. No invocation. |
| `notify-section/index.ts:183–195,209–220` | **No** | Same payload.title/body inserted and pushed to selected recipients. Audience/house filters remain separate from language. |
| `send-push-notification/index.ts:290–326` | **No** | Uses supplied title/body for all subscriptions, not profile languages. Browser cannot translate native push after delivery. |
| Client task completion/assignment/order producers (`TaskModal.tsx:208,225,303,341,356`) | **No** | `You've been assigned a task`, `Task completed`, `Order placed`, `Delivery` templates are English; sends through shared transport. Current audience logic is not audited for modification. |
| Client repair notices (`lib/maintenanceNotifications.ts:28,32`) | **No** | English `New issue reported` / `You've been assigned a repair`; body can localize Location/Reported by according to **actor UI language**, not each recipient. |
| Planned save/booking notices (`maintenanceNotifications.ts:55,60,64`) | **No** | `Scheduled`, `Property`, `Booked`, `You've been assigned planned maintenance` are English. |
| `planned-maintenance-reminder/index.ts:94–104,127–143` | **No** | `Reminder: "${entry.title}" due in ${entry.reminder_days} days`; `Scheduled: ${dateLabel}. Time to confirm arrangements with your contractor.`; English month abbreviations and Property prefix. Same notices/push for everyone. |
| `order-list-submit/index.ts:107–115` | **No** | `Order request: ${title}`; `${senderName} ticked ${snapshot.length} item(s) to order.`; same notification/push wording. Separate older reusable-list flow, not a replacement for send_request_list. |
| `checklist-public-submit/index.ts:76–100` | **No** | `Checklist submitted: ${tpl.title}` / `${assignee_name || "Someone"} completed and submitted this checklist.` |
| `ronin-ai/index.ts:1226,1232,1613–1617` ordinary chat | **Caller’s conversational language instruction, not recipient-profile localization** | Model instructed “Match the caller's language exactly (EN/ES). Never mix.” Output quality not guaranteed or sampled live. |
| `ronin-ai/index.ts:545,888–907` tool confirmations/notices | **No recipient selection** | English confirmations: Maintenance issue logged, Reported by, Approved/Reported, awaiting admin approval; English notice titles. Caller profile language only selects short repair-body prefixes; cannot translate all prose or other recipients. |
| `ronin-event-listener/index.ts:212,250–275,475–556` | **No** | Staff query excludes language_pref. English prompts generate one staff briefing and master-admin briefing, not one per-language result. Creates draft title_en/description_en with Prepare for trip / Guest arrival prep / Coordinate maintenance / Family event prep, without Spanish fields. AI may occasionally output another language; not a verified bilingual policy. |
| `extract-care-guide/index.ts:8–14` | **No** | Prompt explicitly says practical instructions **in English**. |
| `extract-checklists/index.ts:110–160` | **No** | Structured extraction of title/category/subcategory/item title/notes; no recipient language or translation stage. Source language may survive extraction. |
| `calendar-sync` | **No per-recipient translation layer found** | Imported title/description are external originals; event listener/database producers determine alerts. Current deployed definition not invoked. |
| Invitations and recovery emails (`ronin-ai:578,679,719–729`; `_shared/passwordRecovery.ts:4–11`; admin-change-email helper) | **No application locale parameter** | Invite/recovery calls do not choose Spanish by profile. **Actual hosted email template language is unverified**; do not equate absence of code locale with proven delivered English. generateLink + GET is not by itself proof a reset email is sent; mail delivery was not tested. |
| Edge-function/auth errors | Generally **English/raw** | Protected-function errors, Zod/auth failures, rate-limit and password errors may reach raw client toasts. Need stable error codes + UI-localized messages, not translating logs/secrets. |

### Language preference is the prerequisite

Saving a durable preference and reading it consistently is the first server fix. Merely translating reminder templates will still send English to Lilly while her profile says en. Conversely, fixing the profile write alone will **not** fix English-only producers. Browser checks toggled EN→ES in a disposable local session; no profile write was attempted or observed. All account preferences remained unchanged.

## 5. Formatting findings

Do not confuse locale presentation with date storage or house time. Preserve the existing plain DATE helpers and house-zone roster/clock conventions; translate month/day names and grammatical presentation without shifting dates/time zones.

| File:line | Current issue or positive evidence | Recommendation |
|---|---|---|
| Dashboard:125–127 | Explicit es-ES/en-US date; Spanish weekday/month works | Use agreed locale, preserve date source. |
| Dashboard:589,611,718,826 | Always `activas`; `activa(s)`; English `Added` + en-US date; `toLocaleTimeString([])` follows browser, not app | Singular/plural, translated prefix and selected app locale. |
| OrdersSection:128,243,349,437 | Date strings forced en-US in order views | Pass selected locale, keep plain-date helpers. |
| requests/logic:49,76 | Sent/delivery dates explicitly es-ES/en-US using local/plain helpers | Positive; avoid rewriting date semantics. |
| RequestsQueue:36,39 | Sent/created time localized es-ES/en-US; count always `artículos` | Correct locale branch, but `1 artículos` possible; singular artículo/item. |
| RequesterOrders:72; counts/buttons | N añadido(s)/added-style pills and counts scattered | Prefer complete singular/plural messages; inspect quantity versus row-count semantics before changing. |
| CalendarSection:787,789 and date-fns format sites | `h:mm a` / default date-fns weekday/month names with no Spanish locale | Selected locale for displayed text, consistent house-zone/viewer-zone rule. |
| calendar/staff/constants:52–53 | English short/full weekdays | Localized display labels; retain numeric day IDs. |
| PlannedMaintenanceList:10–11,364,578 | English month labels, Weekly/Monthly/Every Nmo | Translate month names and recurrence grammar. |
| plannedExportPDF:15–16,54–61,119 | English month arrays; dd MMM; Generated | Export needs explicit selected language. |
| MobileStaffWeek:49,57,80,100 | Default English EEE/EEE d MMM and English holiday/shift aria copy | Locale-aware phone rendering and full accessible date names. |
| StaffDaysSummary:78,96–106,133–137 | English MMM dates, Days/Hours/Leave YTD/Left, not set, fixed `.toFixed(1)` | Spanish labels, optional number locale; unknown contracted values stay unknown, not zero. |
| calendar/staff/exportUtils:47,72,127; schedulePdfExport:176,183,451 | English-default weekday/month formatting in exports | Supply locale throughout PDF/XLSX and titles; no rules/persistence changes. |
| timesheets/logic:140–145,194–205 | monthName can take Spanish; timeLabel forces en-US/12-hour and strips spacing | Explicit locale for presentation; keep **house** time zone. |
| TimesheetDetail:362,426,488,523; VisitCard:14; TimesheetsTab:150 | Fixed `.toFixed(2)` uses dot decimal | Use one chosen staff locale; es-MX/es-US may intentionally retain dot, generic es may not. A dot is not automatically wrong for all Latin America. |
| TimesheetDetail:303,427 | Money uses Intl.NumberFormat(es ? es : en-US) | Positive, but inconsistent locale choice. Preserve USD/EUR/GBP identity; bare `$` ambiguous. |
| TimesheetDetail:432 | Historical issued date uses device locale, no app locale | Explicit app locale. |
| TimesheetDetail:362,365–366,426 | Current visit/visits + visita/visitas and día/días already handled | **Do not report “1 visits” as a confirmed current defect here.** Other old/export paths may differ; no such live example was reproduced. |
| timesheets/excel:24–30,34–40,61,80–81 | English month/headers/footnotes; mm-dd-yy; fixed currency accounting pattern | Localized presentation per export; do not alter immutable issued snapshot values or overwrite historical files. |
| libraryExportPDF:150–152; MasterImport:143,186 | item/items export English; Spanish filas/tareas counters unconditionally plural | Proper count-aware grammar. |
| RulesSection:507; PropertySection:304; VendorsSection:93,317 | English active rule(s), property word fragments, contacts/properties counters | Complete translated plural sentences, not suffix concatenation. |
| OfflineBanner:55,67 | English item(s)/change(s) composed from suffixes | Localized whole messages. |
| ui/calendar.tsx:7–11 | React Day Picker locale prop can be passed; wrapper provides no automatic LanguageContext locale | Audit each picker caller; third-party calendar labels remain potentially English. |

**Appendix C lists 258 discovered formatter call sites** (positive, neutral storage-key uses and defects together) with exact expressions and lines. It is a coverage ledger, not 258 formatting bugs. Raw YYYY-MM-DD keys and numerical PDF font sizes are not localization failures. A consistent **es-MX** or **es-US** staff locale is a reasonable starting point, but Lilly should choose the intended number/time convention before implementing it; Spanish language alone does not define every regional format.

## 6. Recommendation and phased fix plan (not executed)

### Best content approach: persistent derived translations, requested on demand, prewarmed for daily work

A pure “translate all on write” design wastes translations on private drafts/unused records and can block saves; a pure browser-only on-demand design repeats cost, fails offline and flashes English. Prefer a **hybrid**:

1. Preserve the original exactly, record/derive its source language, and treat translated text as a **derived version**, not an edit of the original. Never overwrite purchasing/safety instructions, brand/house/person names or historical export snapshots.
2. For reusable daily instructions (checklists, care guides, repair/planned-work instructions, order-library descriptions), generate both needed languages asynchronously after publication/meaningful edits; backfill existing active content in bounded batches.
3. For private drafts, chat and less-used notes, translate **only when a permitted reader requests it**, then persist a versioned result/cache. Prewarm on send/publication where recipients need Spanish; do not alert anyone or translate every keystroke/private draft.
4. Key persistent translations by entity + field + source hash/version + target language + translator version; an edit invalidates only relevant fields. Old translations must not silently display as current. Cache failures as failures with retry/backoff, not as successful English translations.
5. Read original and translated fields/results only under the same row permissions. Do not make a translation cache a new way to see another house’s data. External calendar text remains read-only. Anonymous checklist sharing needs token-scoped translation retrieval, not an unauthenticated universal AI endpoint.
6. Spanish reader sees translation by default when ready, with a clear **“Ver original”** option; label AI-translated/unreviewed instructions and allow a permitted reviewer to correct them. When unavailable show the original with an honest short state, not pretend it is Spanish.
7. Persist permitted translated content for offline use with user/house-scoped cache and cleanup on sign-out. Current module-only Map does not meet this requirement. Never mix per-user permission/language caches across accounts.
8. Use human review for safety, chemicals, quantities, schedules and money. Include glossary + strict preservation rules in prompts. Translation is not summarization, inference, correction of product quantities or modification of the workflow.

**Storage choice:** tasks/manuals already have EN/ES columns; they still need source/edit freshness semantics and coherent readers. For the many single-language tables a central, permission-scoped, versioned translation store avoids adding pairs to every field, but it requires an owner-approved data design. If Lilly prefers pairs for a fixed two-language app, per-field translations can work with a source hash/version. Either approach requires future database work **not authorized in this audit**. No table, trigger or function is proposed as already built.

### Effort and credit estimates

These are **planning ranges, not quotations, measured credit consumption or platform guarantees**. Engineering effort means focused person-days including tests/review. Build-agent credits depend on iteration and context; AI translation credits depend on model, current rate, text tokens and cache hit rate. No pricing card, billing/usage data or paid AI benchmark was queried; exact credit estimates are therefore **unverified**. Suggested credit ranges are a budgeting envelope only; use one small measured pilot before committing to a bulk budget.

| Phase | Outcome / acceptance | Effort | Provisional build credits | Runtime translation budget / dependency |
|---|---|---:|---:|---|
| 0 — immediate staff quick wins | Nav/header titles/aria/push/offline chrome; fix shared tagline rendering/dual copy without losing override; Spanish request photo default; save own language to profile and hydrate device choice safely; key and plural tests | 1–2 days | 20–50 | No AI needed for static copy; preference/override data writes need separate approval, not done here. |
| 1 — daily UI completion | Orders, Tasks, Checklists, repairs/planned list, Calendar/mobile roster, Messages, Properties, Profile, notifications; consistent glossary; localized error-code mapping; 390px normal/large/extra-large tests | 4–7 days | 60–150 | No runtime AI for UI strings; editorial review included. Broad ledger needs final reachability triage. |
| 2 — staff content pilot | Orders/library/request descriptions + active task/checklist instructions; source-preserving persistent cache, Show original, edit invalidation, batch limits, offline test, one house pilot | 3–5 days | 50–120 | Pilot envelope **2–10 AI credits**, unverified. 20–50 representative strings, measure actual usage/quality; owner approves storage changes first. |
| 3 — backfill + outbound localization | Remaining active content; recipient-language notification templates for tasks/orders/reminders; title/body source-translation handling; owner updates five DB producers; no duplicate notices | 3–6 days | 50–130 | Initial backfill envelope **5–30 AI credits**, very uncertain; roughly 1,500–2,000 records/fields at risk, excluding rewriting chat/history. Text size not token-counted. Ongoing budget depends on new/edited fields + readers. |
| 4 — admin/onboarding/exports | Sign-in/invitation/reset pages; vendors/team/rules/timesheets/timeline; locale-aware PDF/XLSX/print; hosted email-template review | 3–5 days | 40–100 | Minimal AI runtime for static copy; historical exports remain unchanged unless explicitly requested. Hosted email customization capabilities unverified. |
| 5 — quality/regression closeout | Human bilingual review, all daily flows at 390px and enlargement, public links/offline, original/translation comparison; no unlocalized new copy guard | 2–3 days | 25–60 | Human review cost separate; no guaranteed credit cap. |

**Total:** approximately **16–28 focused person-days** and **245–610 provisional build credits**, plus unverified runtime-AI pilot/backfill envelopes. This is an intentionally broad full-remediation estimate, not a demand to rebuild everything. Split phases into small checkpoints and stop if measured pilot costs/quality disagree. A narrower “fix screenshots + save preference” job is Phase 0, not this full budget.

### Quick wins, in order

1. Connect existing navigation dictionary keys to BottomNav and AppShell titles; translate Header accessible labels and push/offline banners.
2. Make Home distinguish a shared custom original message from localized built-in copy; a safe bilingual override or per-reader derived translation avoids silently replacing Lilly’s message.
3. Save/read each person’s actual language preference from Profile/header, keeping immediate UI feedback and persisted-success/error behavior; do not bulk overwrite everyone’s preferences.
4. Fix `activa(s)` and singular item/task counters; keep already-correct timesheet visit/day plurals.
5. Translate hook success/error toasts and Profile Save/Saving; all common dialog/sheet Close accessible names.
6. Add Spanish purchasing descriptions for the two supplied Orders as a **separately authorized** content action with original preserved; translate item safety constraints exactly. No such edit was made here.
7. Repair the content service failure cache and anonymous-share contract when building the persistent translation pilot, rather than silently returning cached English.

## 7. Verification and open questions

- **Verified live:** signed-in Lilly Spanish Home and Orders; exact permanent override; hard-coded nav; English top title; both supplied orders and descriptions; local-only header toggle; profile language distribution; exact counts and bilingual columns; active task trigger definitions do not reference title_es/description_es.
- **Verified visually:** 390px Home/Orders and desktop Orders, no horizontal overflow in those inspected views. Not a claim every other screen is layout-safe.
- **Not verified:** real installed iPhone/PWA caching/session state, every permission-specific daily/admin view, live AI translation output/latency/cost, anonymous share translation call, actual push/email/reminder delivery, hosted email-template language, every historical attachment/JSON snapshot’s language, all third-party control translations, ongoing translation credit usage.
- No tests were changed or run for code changes because there are no code changes. The static dictionary-key scan and controlled read-only browser observations are audit checks, not a new localization test suite.
- The owner’s five English-only database-function findings were preserved and cross-checked for language_pref references; no database function was executed or modified.
- Approximate session counts are labeled as approximate. All other headline table/field totals in §3 came from exact aggregates. Counts can change after the audit as ordinary users work.
- Existing code’s English dictionary fallback conflicts with the standing Spanish-placeholder preference. The report flags the difference; **neither fallback was changed**, and no approval pause was introduced.

---

# Appendix A — exact unlocalized-source candidate ledger

Read the “Evidence and completeness” section before treating a count as a defect total. Counts mean source entries in this ledger; same text at multiple lines is one row with an occurrence count. Templates retain interpolation syntax; JSX fragments may need joining with adjacent content. Some source entries are internal exceptions or generated sample data rather than normal visible UI. Confirmed supporting omissions are included. Names/neutral abbreviations and correctly selected bilingual pairs were excluded where identifiable; some ambiguous candidates remain deliberately flagged for review.

**Ledger coverage:** 1,658 source entries across 111 files after filtering; this is **not an exact English-defect total**.

| File | Priority | Ledger entries | Distinct strings/templates |
|---|---|---:|---:|
| `src/components/BottomNav.tsx` | P0 | 6 | 5 |
| `src/components/AppShell.tsx` | P0 | 24 | 24 |
| `src/components/Header.tsx` | P0 | 3 | 3 |
| `src/components/OfflineBanner.tsx` | P0 | 4 | 4 |
| `src/components/sections/Dashboard.tsx` | P0 | 9 | 9 |
| `src/components/orders/requests/RequestForms.tsx` | P0 | 4 | 2 |
| `src/components/orders/requests/RequesterOrders.tsx` | P0 | 2 | 2 |
| `src/components/orders/requests/logic.ts` | P0 | 6 | 5 |
| `src/components/orders/NewOrderModal.tsx` | P0 | 2 | 2 |
| `src/components/orders/OrderDetailModal.tsx` | P0 | 7 | 7 |
| `src/components/orders/PropertyShoppingLists.tsx` | P0 | 1 | 1 |
| `src/components/orders/library/LibraryItemCard.tsx` | P0 | 1 | 1 |
| `src/components/orders/library/LibraryItemRow.tsx` | P0 | 1 | 1 |
| `src/components/orders/library/libraryExportPDF.ts` | P0 | 20 | 18 |
| `src/components/sections/OrdersSection.tsx` | P0 | 2 | 2 |
| `src/components/checklists/OrderListDetailPage.tsx` | P0 | 13 | 13 |
| `src/components/tasks/FamilyTasksView.tsx` | P0 | 2 | 2 |
| `src/components/tasks/TaskCard.tsx` | P0 | 1 | 1 |
| `src/components/tasks/TaskModal.tsx` | P0 | 9 | 8 |
| `src/components/sections/TasksSection.tsx` | P0 | 1 | 1 |
| `src/components/manuals/ChecklistCard.tsx` | P0 | 11 | 11 |
| `src/components/manuals/ChecklistImportModal.tsx` | P0 | 3 | 3 |
| `src/components/manuals/ChecklistItemRow.tsx` | P0 | 4 | 4 |
| `src/components/checklists/ChecklistCompletionTable.tsx` | P0 | 36 | 33 |
| `src/components/checklists/ChecklistSubmissionsArchive.tsx` | P0 | 21 | 18 |
| `src/components/checklists/CopyChecklistButton.tsx` | P0 | 8 | 8 |
| `src/components/sections/ChecklistDetailPage.tsx` | P0 | 48 | 44 |
| `src/pages/SharedChecklist.tsx` | P0 | 7 | 6 |
| `src/components/maintenance/IssueCard.tsx` | P0 | 7 | 4 |
| `src/components/maintenance/IssueDetailDrawer.tsx` | P0 | 1 | 1 |
| `src/components/maintenance/IssueModal.tsx` | P0 | 5 | 4 |
| `src/components/maintenance/IssueStatusBadge.tsx` | P0 | 10 | 9 |
| `src/components/maintenance/PlannedMaintenanceList.tsx` | P0 | 60 | 45 |
| `src/components/maintenance/PlannedMaintenanceModal.tsx` | P0 | 55 | 54 |
| `src/components/maintenance/plannedExportPDF.ts` | P0 | 26 | 25 |
| `src/components/maintenance/repairsExportPDF.ts` | P0 | 16 | 16 |
| `src/components/sections/MaintenanceSection.tsx` | P0 | 29 | 25 |
| `src/components/calendar/StaffCalendarTab.tsx` | P0 | 19 | 18 |
| `src/components/calendar/staff/CalculatorPanel.tsx` | P0 | 1 | 1 |
| `src/components/calendar/staff/CalendarToolbar.tsx` | P0 | 12 | 12 |
| `src/components/calendar/staff/FamilyOverlayBand.tsx` | P0 | 1 | 1 |
| `src/components/calendar/staff/LeaveCard.tsx` | P0 | 5 | 5 |
| `src/components/calendar/staff/LeaveModal.tsx` | P0 | 23 | 23 |
| `src/components/calendar/staff/LeavePanel.tsx` | P0 | 4 | 4 |
| `src/components/calendar/staff/MobileStaffWeek.tsx` | P0 | 16 | 15 |
| `src/components/calendar/staff/PdfExportModal.tsx` | P0 | 13 | 13 |
| `src/components/calendar/staff/PropertyLegend.tsx` | P0 | 2 | 2 |
| `src/components/calendar/staff/ScheduleManagerDrawer.tsx` | P0 | 24 | 22 |
| `src/components/calendar/staff/ShareWeekDialog.tsx` | P0 | 19 | 19 |
| `src/components/calendar/staff/ShiftChip.tsx` | P0 | 3 | 3 |
| `src/components/calendar/staff/ShiftModal.tsx` | P0 | 44 | 40 |
| `src/components/calendar/staff/StaffDaysSummary.tsx` | P0 | 8 | 6 |
| `src/components/calendar/staff/StaffFilterBar.tsx` | P0 | 8 | 8 |
| `src/components/calendar/staff/StaffMonthGrid.tsx` | P0 | 3 | 3 |
| `src/components/calendar/staff/StaffWeekGrid.tsx` | P0 | 4 | 4 |
| `src/components/calendar/staff/constants.ts` | P0 | 19 | 19 |
| `src/components/calendar/staff/exportUtils.ts` | P0 | 5 | 5 |
| `src/components/calendar/staff/schedulePdfExport.ts` | P0 | 7 | 7 |
| `src/components/sections/CalendarSection.tsx` | P0 | 143 | 111 |
| `src/components/messaging/AddressBook.tsx` | P0 | 3 | 3 |
| `src/components/messaging/ChatInfoPanel.tsx` | P0 | 14 | 13 |
| `src/components/messaging/ChatView.tsx` | P0 | 3 | 3 |
| `src/components/messaging/MessageBubble.tsx` | P0 | 15 | 15 |
| `src/components/sections/PropertySection.tsx` | P0 | 84 | 67 |
| `src/components/sections/ProfileSection.tsx` | P0 | 7 | 6 |
| `src/components/NotificationsPanel.tsx` | P0 | 5 | 5 |
| `src/lib/maintenanceNotifications.ts` | P0 | 4 | 4 |
| `src/components/GanttChart.tsx` | P1/P2 | 120 | 108 |
| `src/components/PendingRulesWidget.tsx` | P1/P2 | 11 | 11 |
| `src/components/PreviewModeBanner.tsx` | P1/P2 | 3 | 3 |
| `src/components/TextSizeControl.tsx` | P1/P2 | 2 | 1 |
| `src/components/checklists/SectionsManager.tsx` | P1/P2 | 9 | 8 |
| `src/components/manuals/CareGuideCard.tsx` | P1/P2 | 10 | 10 |
| `src/components/manuals/CareGuideScanModal.tsx` | P1/P2 | 26 | 26 |
| `src/components/manuals/RulesManager.tsx` | P1/P2 | 21 | 21 |
| `src/components/sections/AchievementsSection.tsx` | P1/P2 | 1 | 1 |
| `src/components/sections/CarWashSection.tsx` | P1/P2 | 86 | 75 |
| `src/components/sections/CareGuideDetailPage.tsx` | P1/P2 | 72 | 66 |
| `src/components/sections/ManualsSection.tsx` | P1/P2 | 6 | 6 |
| `src/components/sections/MasterImportSection.tsx` | P1/P2 | 3 | 3 |
| `src/components/sections/MeetTeamSection.tsx` | P1/P2 | 3 | 3 |
| `src/components/sections/MemorySection.tsx` | P1/P2 | 3 | 3 |
| `src/components/sections/RulesSection.tsx` | P1/P2 | 32 | 30 |
| `src/components/sections/VendorsSection.tsx` | P1/P2 | 20 | 19 |
| `src/components/team/ArchiveMember.tsx` | P1/P2 | 12 | 12 |
| `src/components/team/MemberEditDrawer.tsx` | P1/P2 | 3 | 3 |
| `src/components/team/teamSharedComponents.tsx` | P1/P2 | 1 | 1 |
| `src/components/timesheets/excel.ts` | P1/P2 | 17 | 17 |
| `src/components/ui/breadcrumb.tsx` | P1/P2 | 2 | 2 |
| `src/components/ui/carousel.tsx` | P1/P2 | 2 | 2 |
| `src/components/ui/dialog.tsx` | P1/P2 | 1 | 1 |
| `src/components/ui/pagination.tsx` | P1/P2 | 6 | 6 |
| `src/components/ui/sheet.tsx` | P1/P2 | 1 | 1 |
| `src/components/ui/sidebar.tsx` | P1/P2 | 3 | 1 |
| `src/components/vendors/VendorDetailPanel.tsx` | P1/P2 | 16 | 16 |
| `src/components/vendors/VendorFormModal.tsx` | P1/P2 | 26 | 25 |
| `src/contexts/PermissionsContext.tsx` | P1/P2 | 2 | 1 |
| `src/hooks/useMaintenanceIssues.ts` | P1/P2 | 3 | 3 |
| `src/hooks/useOrderLibrary.ts` | P1/P2 | 10 | 9 |
| `src/hooks/usePlannedMaintenance.ts` | P1/P2 | 8 | 8 |
| `src/hooks/useRoninAI.ts` | P1/P2 | 7 | 7 |
| `src/hooks/useSchedulePublications.ts` | P1/P2 | 4 | 4 |
| `src/hooks/useStaffSchedules.ts` | P1/P2 | 23 | 22 |
| `src/hooks/useVendors.ts` | P1/P2 | 29 | 29 |
| `src/lib/notificationDetail.ts` | P1/P2 | 2 | 2 |
| `src/main.tsx` | P1/P2 | 4 | 4 |
| `src/pages/AuthPage.tsx` | P1/P2 | 27 | 24 |
| `src/pages/NotFound.tsx` | P1/P2 | 2 | 2 |
| `src/pages/ResetPassword.tsx` | P1/P2 | 17 | 17 |
| `src/pages/SharedStaffSchedule.tsx` | P1/P2 | 17 | 17 |
| `src/pages/SharedTimeline.tsx` | P1/P2 | 2 | 2 |

## `src/components/BottomNav.tsx`

6 ledger entries; 5 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Home | 12, 50 | 2 | accessibility / placeholder, display copy |
| Properties | 13 | 1 | display copy |
| Messages | 14 | 1 | display copy |
| Maintenance | 15 | 1 | display copy |
| Profile | 16 | 1 | display copy |

## `src/components/AppShell.tsx`

24 ledger entries; 24 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Properties | 62 | 1 | confirmed supplemental copy |
| Maintenance | 63 | 1 | confirmed supplemental copy |
| Messages | 64 | 1 | confirmed supplemental copy |
| Profile | 65 | 1 | confirmed supplemental copy |
| Manuals | 66 | 1 | confirmed supplemental copy |
| Checklists | 67 | 1 | confirmed supplemental copy |
| Tasks | 68 | 1 | confirmed supplemental copy |
| Contacts | 69 | 1 | confirmed supplemental copy |
| Vendors | 70 | 1 | confirmed supplemental copy |
| Inventory & Assets | 71 | 1 | confirmed supplemental copy |
| Laundry | 72 | 1 | confirmed supplemental copy |
| Orders | 73 | 1 | confirmed supplemental copy |
| Meet the Team | 74 | 1 | confirmed supplemental copy |
| Travel | 75 | 1 | confirmed supplemental copy |
| Calendar | 76 | 1 | confirmed supplemental copy |
| Achievements | 77 | 1 | confirmed supplemental copy |
| Master Import | 78 | 1 | confirmed supplemental copy |
| Alerts | 79 | 1 | confirmed supplemental copy |
| Property Rules | 80 | 1 | confirmed supplemental copy |
| Car Wash | 81 | 1 | confirmed supplemental copy |
| Staff Schedule | 82 | 1 | confirmed supplemental copy |
| Construction Timeline | 83 | 1 | confirmed supplemental copy |
| Enable notifications to get alerts for new messages even when the app is closed. | 168 | 1 | confirmed supplemental copy |
| Enable | 181 | 1 | confirmed supplemental copy |

## `src/components/Header.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Open menu | 56 | 1 | accessibility / placeholder |
| Go back | 64 | 1 | accessibility / placeholder |
| Notifications | 97 | 1 | accessibility / placeholder |

## `src/components/OfflineBanner.tsx`

4 ledger entries; 4 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| You're offline — changes will sync when you reconnect | 49 | 1 | confirmed supplemental copy |
| &#96;Syncing${pendingCount > 0 ? &#96; ${pendingCount} item${pendingCount !== 1 ? "s" : ""}&#96; : ""}…&#96; | 55 | 1 | confirmed supplemental copy |
| All changes synced ✓ | 61 | 1 | confirmed supplemental copy |
| &#96;${pendingCount} change${pendingCount !== 1 ? "s" : ""} waiting to sync&#96; | 67 | 1 | confirmed supplemental copy |

## `src/components/sections/Dashboard.tsx`

9 ledger entries; 9 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Type a message… | 504 | 1 | accessibility / placeholder |
| Today only | 510 | 1 | display copy |
| Until date | 511 | 1 | display copy |
| Until I clear it | 512 | 1 | display copy |
| Save | 538 | 1 | visible text |
| Cancel | 541 | 1 | visible text |
| Edit message | 552 | 1 | accessibility / placeholder |
| Clear override | 558 | 1 | accessibility / placeholder |
| Added | 718 | 1 | visible text |

## `src/components/orders/requests/RequestForms.tsx`

4 ledger entries; 2 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Not saved | 47, 52, 88 | 3 | internal exception caught by localized message; NOT visible English |
| Not sent | 56 | 1 | internal exception caught by localized message; NOT visible English |

## `src/components/orders/requests/RequesterOrders.tsx`

2 ledger entries; 2 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Nothing confirmed | 51 | 1 | internal exception caught by localized message; NOT visible English |
| Nothing sent | 57 | 1 | internal exception caught by localized message; NOT visible English |

## `src/components/orders/requests/logic.ts`

6 ledger entries; 5 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| A house and signed-in person are required | 22 | 1 | data default / internal exception; see exposure qualification; current request/queue boundary shows localized generic error |
| Photo or text required | 23 | 1 | data default / internal exception; see exposure qualification; current request/queue boundary shows localized generic error |
| Photo request | 25 | 1 | data default / internal exception; see exposure qualification; persisted English fallback name, visible later |
| Select requests from one house | 65 | 1 | data default / internal exception; see exposure qualification; current request/queue boundary shows localized generic error |
| Photo could not be prepared | 87, 89 | 2 | data default / internal exception; see exposure qualification; current request/queue boundary shows localized generic error |

## `src/components/orders/NewOrderModal.tsx`

2 ledger entries; 2 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Could not create order. | 77 | 1 | message / validation / export |
| UPS, FedEx… | 153 | 1 | accessibility / placeholder |

## `src/components/orders/OrderDetailModal.tsx`

7 ledger entries; 7 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Could not save order | 79 | 1 | message / validation / export |
| Could not confirm delivery | 96 | 1 | message / validation / export |
| Could not mark order as placed | 114 | 1 | message / validation / export |
| 1Z999AA1... | 207 | 1 | accessibility / placeholder |
| UPS, FedEx, DHL... | 218 | 1 | accessibility / placeholder |
| short | 266 | 1 | rendered expression |
| numeric | 266 | 1 | rendered expression |

## `src/components/orders/PropertyShoppingLists.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Could not create list | 54 | 1 | message / validation / export |

## `src/components/orders/library/LibraryItemCard.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Amazon | 112 | 1 | visible text |

## `src/components/orders/library/LibraryItemRow.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Amazon | 84 | 1 | visible text |

## `src/components/orders/library/libraryExportPDF.ts`

20 ledger entries; 18 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Order Library | 145 | 1 | message / validation / export |
| item | 150, 311 | 2 | message / validation / export |
| items | 150, 311 | 2 | message / validation / export |
| Ronin · Order Library | 171 | 1 | message / validation / export |
| Deprecated | 246 | 1 | display copy |
| Preferred | 248 | 1 | display copy |
| Sub OK | 252 | 1 | display copy |
| No sub | 253 | 1 | display copy |
| Qty | 274 | 1 | confirmed supplemental copy |
| Size | 275 | 1 | confirmed supplemental copy |
| Where | 276 | 1 | confirmed supplemental copy |
| Also | 277 | 1 | confirmed supplemental copy |
| Link | 278 | 1 | confirmed supplemental copy |
| Notes | 279 | 1 | confirmed supplemental copy |
| Select at least one item to export. | 307 | 1 | message / validation / export |
| &#96;Preparing PDF (${items.length} ${items.length === 1 ? "item" : "items"})…&#96; | 311 | 1 | message / validation / export |
| PDF downloaded. | 336 | 1 | message / validation / export |
| Could not generate PDF. | 339 | 1 | message / validation / export |

## `src/components/sections/OrdersSection.tsx`

2 ledger entries; 2 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| request-counts | 493 | 1 | display-array candidate; check consumer/reachability |
| management-header | 493 | 1 | display-array candidate; check consumer/reachability |

## `src/components/checklists/OrderListDetailPage.tsx`

13 ledger entries; 13 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Could not save recipients | 315 | 1 | message / validation / export |
| List saved | 327 | 1 | message / validation / export |
| &#96;Delete "${template.title}"? Past orders are kept.&#96; | 332 | 1 | message / validation / export |
| Could not delete | 334 | 1 | message / validation / export |
| Edit order list | 342 | 1 | visible text |
| Send orders to | 347 | 1 | visible text |
| Unnamed | 355 | 1 | rendered expression |
| Items from library ( | 363 | 1 | visible text |
| selected) | 363 | 1 | visible text |
| Search library… | 367 | 1 | accessibility / placeholder |
|  · no longer preferred | 383 | 1 | rendered expression |
| Saving… | 395 | 1 | rendered expression |
| Save list | 395 | 1 | rendered expression |

## `src/components/tasks/FamilyTasksView.tsx`

2 ledger entries; 2 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| &#96;📋 You've been assigned a task: ${editWhat.trim()}&#96; | 92 | 1 | display copy |
| &#96;📋 You've been assigned a task: ${what.trim()}&#96; | 189 | 1 | display copy |

## `src/components/tasks/TaskCard.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| DRAFT | 72 | 1 | visible text |

## `src/components/tasks/TaskModal.tsx`

9 ledger entries; 8 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| &#96;📋 You've been assigned a task: ${title.trim()}&#96; | 208, 225 | 2 | display copy |
| &#96;✅ Task completed: ${task.title_en}&#96; | 303 | 1 | display copy |
| &#96;📦 Order placed: ${task.title_en}&#96; | 341 | 1 | display copy |
| &#96;📦 Delivery: ${task.title_en}&#96; | 356 | 1 | display copy |
| Delete this task? | 382 | 1 | message / validation / export |
| Back to view | 650 | 1 | accessibility / placeholder |
| DRAFT | 662 | 1 | visible text |
| Unknown | 786 | 1 | rendered expression |

## `src/components/sections/TasksSection.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Property | 407 | 1 | rendered expression |

## `src/components/manuals/ChecklistCard.tsx`

11 ledger entries; 11 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| &#96;Delete "${template.title}"?\n\nThis will permanently remove the checklist, all its items, completion history, and comments. This cannot be undone.&#96; | 56 | 1 | message / validation / export |
| Failed to delete checklist | 64 | 1 | message / validation / export |
| Checklist deleted | 67 | 1 | message / validation / export |
| DRAFT | 110 | 1 | visible text |
| ✓ Complete today | 117 | 1 | visible text |
| done | 121 | 1 | visible text |
| &#96;${totalItems} items&#96; | 125 | 1 | rendered expression |
| Tap to open | 125 | 1 | rendered expression |
| Publish | 161 | 1 | rendered expression |
| Unpublish | 161 | 1 | rendered expression |
| Delete checklist | 173 | 1 | accessibility / placeholder |

## `src/components/manuals/ChecklistImportModal.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Extraction failed | 107 | 1 | message / validation / export |
| Save failed | 204 | 1 | message / validation / export |
| .docx · .xlsx · .csv · .pdf · 15 MB max | 279 | 1 | visible text |

## `src/components/manuals/ChecklistItemRow.tsx`

4 ledger entries; 4 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| View reference photo | 122 | 1 | accessibility / placeholder |
| reference | 124 | 1 | accessibility / placeholder |
| Remove photo | 131 | 1 | accessibility / placeholder |
| Close | 314 | 1 | accessibility / placeholder |

## `src/components/checklists/ChecklistCompletionTable.tsx`

36 ledger entries; 33 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Checklist | 321, 49 | 2 | display-array candidate, rendered expression; check consumer/reachability |
| Property | 49 | 1 | display-array candidate; check consumer/reachability |
| Completed by | 49 | 1 | display-array candidate; check consumer/reachability |
| Date | 49 | 1 | display-array candidate; check consumer/reachability |
| Progress | 49 | 1 | display-array candidate; check consumer/reachability |
| Status | 49 | 1 | display-array candidate; check consumer/reachability |
| Source | 49 | 1 | display-array candidate; check consumer/reachability |
| Delete failed | 195, 216 | 2 | message / validation / export |
| Old public link submissions cleared | 196 | 1 | message / validation / export |
| Deleted | 218 | 1 | message / validation / export |
| Search checklist, person, property | 240 | 1 | accessibility / placeholder |
| All properties | 248 | 1 | visible text |
| All statuses | 255 | 1 | visible text |
| Complete | 256 | 1 | visible text |
| Partial | 257 | 1 | visible text |
| Pending | 258 | 1 | visible text |
| Overdue | 259 | 1 | visible text |
| Refresh | 261 | 1 | accessibility / placeholder |
| Clear &gt; | 270 | 1 | visible text |
| days | 270 | 1 | visible text |
| Applies to public link submissions only | 273 | 1 | visible text |
| Nothing to show. | 281 | 1 | visible text |
| d MMM yyyy | 325 | 1 | rendered expression |
| Public link | 350 | 1 | visible text |
| In-app | 352 | 1 | visible text |
| Outstanding | 353 | 1 | visible text |
| Delete entry | 359, 360 | 2 | accessibility / placeholder |
| Delete this entry? | 378 | 1 | rendered expression |
| &#96;Clear submissions older than ${pendingDelete.days} days?&#96; | 378 | 1 | rendered expression |
| This can't be undone. | 382 | 1 | rendered expression |
| &#96;This will permanently delete public link submissions older than ${pendingDelete.days} days. This can't be undone.&#96; | 383 | 1 | rendered expression |
| Cancel | 387 | 1 | visible text |
| Delete | 392 | 1 | visible text |

## `src/components/checklists/ChecklistSubmissionsArchive.tsx`

21 ledger entries; 18 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Permanently delete this submission? | 81 | 1 | message / validation / export |
| Delete failed | 83, 94, 104 | 3 | message / validation / export |
| Deleted | 85 | 1 | message / validation / export |
| &#96;Permanently delete ${selected.size} submission${selected.size > 1 ? "s" : ""}?&#96; | 91 | 1 | message / validation / export |
| &#96;Deleted ${ids.length}&#96; | 97 | 1 | message / validation / export |
| &#96;Permanently delete all submissions older than ${days} days?&#96; | 101 | 1 | message / validation / export |
| Old submissions cleared | 105 | 1 | message / validation / export |
| Public submissions from share links. Tap a row for full detail. Delete what you no longer need. | 118 | 1 | visible text |
| Delete selected ( | 125 | 1 | visible text |
| Clear &gt; 30 days | 128 | 1 | visible text |
| Clear &gt; 60 days | 129 | 1 | visible text |
| Clear &gt; 90 days | 130 | 1 | visible text |
| No submissions yet. | 138 | 1 | visible text |
| Checklist | 157 | 1 | rendered expression |
| Anonymous | 159, 187 | 2 | rendered expression |
| No items. | 194 | 1 | visible text |
| Notes | 215 | 1 | visible text |
| Delete this submission | 223 | 1 | visible text |

## `src/components/checklists/CopyChecklistButton.tsx`

8 ledger entries; 8 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| &#96;Copied to ${propName} (as draft)&#96; | 75 | 1 | message / validation / export |
| Copy failed:  | 79 | 1 | message / validation / export |
| Copy to another property | 89 | 1 | accessibility / placeholder |
| Copy " | 102 | 1 | visible text |
| " to… | 102 | 1 | visible text |
| No other properties available. | 107 | 1 | visible text |
| Copying… | 119 | 1 | visible text |
| The copy will be saved as a Draft on the target property so you can review before publishing. | 125 | 1 | visible text |

## `src/components/sections/ChecklistDetailPage.tsx`

48 ledger entries; 44 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Sunday | 49 | 1 | display-array candidate; check consumer/reachability |
| Monday | 49 | 1 | display-array candidate; check consumer/reachability |
| Tuesday | 49 | 1 | display-array candidate; check consumer/reachability |
| Wednesday | 49 | 1 | display-array candidate; check consumer/reachability |
| Thursday | 49 | 1 | display-array candidate; check consumer/reachability |
| Friday | 49 | 1 | display-array candidate; check consumer/reachability |
| Saturday | 49 | 1 | display-array candidate; check consumer/reachability |
| Rename checklist | 374 | 1 | accessibility / placeholder |
| Create public share link | 422 | 1 | accessibility / placeholder |
| Admin Settings | 456 | 1 | visible text |
| Published | 463 | 1 | rendered expression |
| Draft | 463 | 1 | rendered expression |
| Visible to assigned staff | 466 | 1 | rendered expression |
| Only visible to you | 466 | 1 | rendered expression |
| Recurrence | 489 | 1 | visible text |
| Trigger Day | 503 | 1 | visible text |
| Assign to Role | 517 | 1 | visible text |
| All Roles | 523 | 1 | rendered expression |
| Assign to Department | 530 | 1 | visible text |
| All Departments | 536 | 1 | rendered expression |
| Notify staff on trigger day | 543 | 1 | visible text |
| 🏠 Only when occupied | 551 | 1 | visible text |
| Disables when the property is vacant | 552 | 1 | visible text |
| Saving… | 561 | 1 | rendered expression |
| Save Settings | 561 | 1 | rendered expression |
| Every | 576 | 1 | visible text |
| Cover | 597 | 1 | accessibility / placeholder |
| Uploading… | 619 | 1 | visible text |
| Add reference image — drag & drop or tap to upload | 623 | 1 | visible text |
| Link manual or SOP | 654 | 1 | visible text |
| Link a Manual or SOP | 660 | 1 | visible text |
| Label (e.g. Oven cleaning cycle guide) | 662 | 1 | accessibility / placeholder |
| URL (https://…) | 665 | 1 | accessibility / placeholder |
| Save | 668 | 1 | visible text |
| Cancel | 669, 751, 842 | 3 | visible text |
| No items yet — add some below. | 689 | 1 | visible text |
| Add | 750, 773, 841 | 3 | visible text |
| Products | 768 | 1 | visible text |
| No products yet — add approved products for this checklist. | 779 | 1 | visible text |
| Notes (optional)… | 813 | 1 | accessibility / placeholder |
| Product name… | 839 | 1 | accessibility / placeholder |
| Notes & Comments | 864 | 1 | visible text |
| No comments yet — add a note below. | 869 | 1 | visible text |
| Add a note or comment… | 894 | 1 | accessibility / placeholder |

## `src/pages/SharedChecklist.tsx`

7 ledger entries; 6 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Toggle language | 253 | 1 | accessibility / placeholder |
| Mark incomplete | 317 | 1 | rendered expression |
| Mark complete | 317 | 1 | rendered expression |
| View reference photo | 328 | 1 | accessibility / placeholder |
| reference | 330, 411 | 2 | accessibility / placeholder |
| Close | 405 | 1 | accessibility / placeholder |

## `src/components/maintenance/IssueCard.tsx`

7 ledger entries; 4 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Recurring issue | 77 | 1 | accessibility / placeholder |
| Unarchive | 128, 187 | 2 | rendered expression |
| Archive | 128, 187 | 2 | rendered expression |
| &#96;${daysOpen}d open&#96; | 147, 217 | 2 | rendered expression |

## `src/components/maintenance/IssueDetailDrawer.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Close-out | 199 | 1 | accessibility / placeholder |

## `src/components/maintenance/IssueModal.tsx`

5 ledger entries; 4 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| &#96;Issue ${i + 1}&#96; | 203 | 1 | rendered expression |
| Remove photo | 205 | 1 | accessibility / placeholder |
| maintenance | 389, 394 | 2 | rendered expression |
| Close-out | 465 | 1 | accessibility / placeholder |

## `src/components/maintenance/IssueStatusBadge.tsx`

10 ledger entries; 9 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Reported | 5 | 1 | display copy |
| Under Investigation | 6 | 1 | display copy |
| On hold | 7 | 1 | display copy |
| Scheduled/In Progress | 8, 9 | 2 | display copy |
| Resolved | 10 | 1 | display copy |
| 🔴 Urgent | 14 | 1 | display copy |
| 🟠 High | 15 | 1 | display copy |
| 🟡 Medium | 16 | 1 | display copy |
| ⚪ Low | 17 | 1 | display copy |

## `src/components/maintenance/PlannedMaintenanceList.tsx`

60 ledger entries; 45 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Jan | 10 | 1 | display-array candidate; check consumer/reachability |
| Feb | 10 | 1 | display-array candidate; check consumer/reachability |
| Mar | 10 | 1 | display-array candidate; check consumer/reachability |
| Apr | 10 | 1 | display-array candidate; check consumer/reachability |
| May | 10 | 1 | display-array candidate; check consumer/reachability |
| Jun | 10 | 1 | display-array candidate; check consumer/reachability |
| Jul | 11 | 1 | display-array candidate; check consumer/reachability |
| Aug | 11 | 1 | display-array candidate; check consumer/reachability |
| Sep | 11 | 1 | display-array candidate; check consumer/reachability |
| Oct | 11 | 1 | display-array candidate; check consumer/reachability |
| Nov | 11 | 1 | display-array candidate; check consumer/reachability |
| Dec | 11 | 1 | display-array candidate; check consumer/reachability |
| Search planned maintenance… | 221 | 1 | accessibility / placeholder |
| All Properties | 235 | 1 | visible text |
| Tile view | 242 | 1 | accessibility / placeholder |
| List view | 246 | 1 | accessibility / placeholder |
| Download current view as PDF | 264 | 1 | accessibility / placeholder |
| entry | 276 | 1 | rendered expression |
| entries | 276 | 1 | rendered expression |
| All | 289 | 1 | rendered expression |
| No planned maintenance entries | 302 | 1 | visible text |
| + Add the first entry | 305 | 1 | visible text |
| (approx.) | 356 | 1 | visible text |
| &#96;${entry.reminder_days}d reminder&#96; | 360 | 1 | rendered expression |
| No reminder | 360 | 1 | rendered expression |
| Weekly | 364, 578 | 2 | rendered expression |
| Monthly | 364, 578 | 2 | rendered expression |
| &#96;Every ${entry.recurrence_months}mo&#96; | 364, 578 | 2 | rendered expression |
| Future (Too Early) | 378, 524 | 2 | visible text |
| To Be Booked | 379, 525 | 2 | visible text |
| Booked | 380, 526 | 2 | visible text |
| Initiated by Vendor | 381, 527 | 2 | visible text |
| Recurring | 382, 528 | 2 | visible text |
| As Needed | 383, 529 | 2 | visible text |
| Completed | 384, 530 | 2 | visible text |
| Cancelled | 385, 531 | 2 | visible text |
| Copy to another property | 394, 591 | 2 | accessibility / placeholder |
| Copy to… | 400, 596 | 2 | visible text |
| No other properties | 402, 598 | 2 | visible text |
| Confirm | 418, 614 | 2 | visible text |
| Cancel | 422 | 1 | visible text |
| Clear secondary sorts | 480 | 1 | accessibility / placeholder |
| Clear sort | 481 | 1 | visible text |
| (est.) | 550 | 1 | visible text |
| Off | 573 | 1 | rendered expression |

## `src/components/maintenance/PlannedMaintenanceModal.tsx`

55 ledger entries; 54 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| January | 34 | 1 | display-array candidate; check consumer/reachability |
| February | 34 | 1 | display-array candidate; check consumer/reachability |
| March | 34 | 1 | display-array candidate; check consumer/reachability |
| April | 34 | 1 | display-array candidate; check consumer/reachability |
| May | 34 | 1 | display-array candidate; check consumer/reachability |
| June | 34 | 1 | display-array candidate; check consumer/reachability |
| July | 35 | 1 | display-array candidate; check consumer/reachability |
| August | 35 | 1 | display-array candidate; check consumer/reachability |
| September | 35 | 1 | display-array candidate; check consumer/reachability |
| October | 35 | 1 | display-array candidate; check consumer/reachability |
| November | 35 | 1 | display-array candidate; check consumer/reachability |
| December | 35 | 1 | display-array candidate; check consumer/reachability |
| One-off (no repeat) | 39 | 1 | display copy |
| Weekly | 40 | 1 | display copy |
| Monthly | 41 | 1 | display copy |
| Every 3 months (Quarterly) | 42 | 1 | display copy |
| Every 6 months (Semi-annual) | 43 | 1 | display copy |
| Every year (Annual) | 44 | 1 | display copy |
| Custom interval… | 45 | 1 | display copy |
| Edit Planned Maintenance | 176 | 1 | rendered expression |
| Add Planned Maintenance | 176 | 1 | rendered expression |
| Title * | 183 | 1 | visible text |
| e.g. HVAC service, Pool maintenance… | 184 | 1 | accessibility / placeholder |
| Description | 189 | 1 | visible text |
| Scope of work, notes… | 190 | 1 | accessibility / placeholder |
| Location (Property) | 195 | 1 | visible text |
| — Select property — | 198 | 1 | visible text |
| Contractor (Vendor) | 205 | 1 | visible text |
| — Select vendor — | 228 | 1 | visible text |
| Search company or property… | 244 | 1 | accessibility / placeholder |
| No vendors found. | 246 | 1 | visible text |
| — None — | 253 | 1 | visible text |
| No linked properties | 273 | 1 | visible text |
| Assigned To | 289 | 1 | visible text |
| — Select staff — | 292 | 1 | visible text |
| maintenance | 296 | 1 | rendered expression |
| Last Service Date | 301 | 1 | visible text |
| Month Only | 319 | 1 | visible text |
| Specific Date | 327 | 1 | visible text |
| PPP | 348, 368 | 2 | rendered expression |
| Pick a date | 348 | 1 | rendered expression |
| End Date (optional — for multi-day jobs) | 362 | 1 | visible text |
| Same day | 368 | 1 | rendered expression |
| Clear end date | 388 | 1 | accessibility / placeholder |
| Time (optional) | 396 | 1 | visible text |
| Reminder | 412 | 1 | visible text |
| days before | 438 | 1 | visible text |
| Off | 441 | 1 | visible text |
| Recurrence | 448 | 1 | visible text |
| months between services | 464 | 1 | visible text |
| Cancel | 471 | 1 | visible text |
| Saving… | 473 | 1 | rendered expression |
| Update | 473 | 1 | rendered expression |
| Add Entry | 473 | 1 | rendered expression |

## `src/components/maintenance/plannedExportPDF.ts`

26 ledger entries; 25 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Jan | 15 | 1 | display-array candidate; check consumer/reachability |
| Feb | 15 | 1 | display-array candidate; check consumer/reachability |
| Mar | 15 | 1 | display-array candidate; check consumer/reachability |
| Apr | 15 | 1 | display-array candidate; check consumer/reachability |
| May | 15 | 1 | display-array candidate; check consumer/reachability |
| Jun | 15 | 1 | display-array candidate; check consumer/reachability |
| Jul | 16 | 1 | display-array candidate; check consumer/reachability |
| Aug | 16 | 1 | display-array candidate; check consumer/reachability |
| Sep | 16 | 1 | display-array candidate; check consumer/reachability |
| Oct | 16 | 1 | display-array candidate; check consumer/reachability |
| Nov | 16 | 1 | display-array candidate; check consumer/reachability |
| Dec | 16 | 1 | display-array candidate; check consumer/reachability |
| Planned Maintenance | 104 | 1 | message / validation / export |
| Ronin · Planned Maintenance | 141 | 1 | message / validation / export |
| Title | 157 | 1 | confirmed supplemental copy |
| Status | 157 | 1 | confirmed supplemental copy |
| Last Service | 157 | 1 | confirmed supplemental copy |
| Date | 157 | 1 | confirmed supplemental copy |
| Contractor | 157 | 1 | confirmed supplemental copy |
| Property | 157 | 1 | confirmed supplemental copy |
| Assigned | 157 | 1 | confirmed supplemental copy |
| Reminder | 157 | 1 | confirmed supplemental copy |
| Recurrence | 157 | 1 | confirmed supplemental copy |
| PDF downloaded | 253, 331 | 2 | message / validation / export |
| Nothing to export — no entries match the current filters | 383 | 1 | message / validation / export |

## `src/components/maintenance/repairsExportPDF.ts`

16 ledger entries; 16 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| NEW | 152 | 1 | display copy |
| UPDATED | 153 | 1 | display copy |
| Repairs | 233 | 1 | message / validation / export |
| &#96;Highlighting ${changedCount} change${changedCount === 1 ? "" : "s"} since last family report (${sinceDate})&#96; | 262 | 1 | message / validation / export |
| Ronin · Repairs | 283 | 1 | message / validation / export |
| No photo | 491 | 1 | message / validation / export |
| center | 491 | 1 | message / validation / export |
| reported | 519 | 1 | display-array candidate; check consumer/reachability |
| approved | 521 | 1 | display-array candidate; check consumer/reachability |
| scheduled | 522 | 1 | display-array candidate; check consumer/reachability |
| resolved | 524 | 1 | display-array candidate; check consumer/reachability |
| Nothing to export — no issues match the current filters | 764 | 1 | message / validation / export |
| Preparing PDF (loading photos)… | 769 | 1 | message / validation / export |
| Preparing PDF… | 769 | 1 | message / validation / export |
| PDF downloaded | 785 | 1 | message / validation / export |
| Failed to generate PDF | 788 | 1 | message / validation / export |

## `src/components/sections/MaintenanceSection.tsx`

29 ledger entries; 25 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| &#96;🔧 You've been assigned a repair: ${editIssue.title}&#96; | 324 | 1 | display copy |
| &#96;Issue marked for On hold: ${issue.title}&#96; | 359 | 1 | display copy |
| &#96;Copied "${entry.title}" to ${targetName}&#96; | 418 | 1 | message / validation / export |
| Add Entry | 643 | 1 | visible text |
| Repairs | 659 | 1 | visible text |
| Planned | 669 | 1 | visible text |
| Download current view as PDF | 728 | 1 | accessibility / placeholder |
| Kanban board | 736 | 1 | accessibility / placeholder |
| Spreadsheet | 740 | 1 | accessibility / placeholder |
| List | 744 | 1 | accessibility / placeholder |
| Quick approve | 887 | 1 | accessibility / placeholder |
| Loading… | 907, 925, 1007 | 3 | rendered expression |
| Load more | 907, 925, 1007 | 3 | rendered expression |
| Download repairs report | 1065 | 1 | visible text |
| Last family report marked on | 1068 | 1 | visible text |
| No family report baseline set yet. | 1074 | 1 | visible text |
| This is the weekly family report | 1086 | 1 | visible text |
| Updates the baseline so the next report highlights what's new since today. Leave unchecked for personal/interim downloads. | 1088 | 1 | visible text |
| Backdate baseline (optional) | 1095 | 1 | visible text |
| Current baseline: | 1098 | 1 | visible text |
| — everything after this date is highlighted. | 1102 | 1 | visible text |
| Set the baseline to the date of your previous family report so this download highlights everything that's changed since then. | 1106 | 1 | visible text |
| Apply | 1129 | 1 | visible text |
| Cancel | 1138 | 1 | visible text |
| Download PDF | 1186 | 1 | visible text |

## `src/components/calendar/StaffCalendarTab.tsx`

19 ledger entries; 18 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Failed to load staff profiles | 228 | 1 | message / validation / export |
| Cannot schedule before this staff member's start date | 362, 402 | 2 | message / validation / export |
| Shift moved · Recurring pattern unchanged for future weeks | 391 | 1 | message / validation / export |
| Shift rescheduled | 394 | 1 | message / validation / export |
| Failed to cancel shift | 444 | 1 | message / validation / export |
| Shift cancelled for this day | 445 | 1 | message / validation / export |
| No staff to export | 528 | 1 | message / validation / export |
| Failed to load schedule data for PDF | 559 | 1 | message / validation / export |
| Published — staff & family can see this week. | 748 | 1 | rendered expression |
| Draft — this week is hidden from staff & family until you publish it. | 749 | 1 | rendered expression |
| Unpublish week | 756 | 1 | rendered expression |
| Publish week | 756 | 1 | rendered expression |
| This week's schedule hasn't been published yet. | 763 | 1 | visible text |
| Delete recurring shift | 845 | 1 | visible text |
| This shift is part of a recurring schedule. Remove it from just this day, or end the entire series going forward? | 847 | 1 | visible text |
| Cancel | 852 | 1 | visible text |
| Just this day | 857 | 1 | visible text |
| Entire series | 863 | 1 | visible text |

## `src/components/calendar/staff/CalculatorPanel.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| · This month | 22 | 1 | visible text |

## `src/components/calendar/staff/CalendarToolbar.tsx`

12 ledger entries; 12 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| This week | 64 | 1 | visible text |
| This month | 69 | 1 | visible text |
| Week | 90 | 1 | visible text |
| Month | 99 | 1 | visible text |
| From | 105 | 1 | visible text |
| To | 123 | 1 | visible text |
| Request Time Off | 150 | 1 | visible text |
| Shift | 155 | 1 | visible text |
| Manage recurring schedules | 162 | 1 | accessibility / placeholder |
| Download Excel | 167 | 1 | accessibility / placeholder |
| Share this week with a non-user | 172 | 1 | accessibility / placeholder |
| Download PDF | 176 | 1 | accessibility / placeholder |

## `src/components/calendar/staff/FamilyOverlayBand.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Family | 39 | 1 | visible text |

## `src/components/calendar/staff/LeaveCard.tsx`

5 ledger entries; 5 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| 1 day | 57 | 1 | rendered expression |
| &#96;${workdays} working days&#96; | 57 | 1 | rendered expression |
| Approve | 78 | 1 | visible text |
| Reject | 86 | 1 | visible text |
| Withdraw request | 96 | 1 | visible text |

## `src/components/calendar/staff/LeaveModal.tsx`

23 ledger entries; 23 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Cannot request leave before this staff member's start date | 81 | 1 | message / validation / export |
| Edit Leave | 127 | 1 | rendered expression |
| Request Time Off | 127 | 1 | rendered expression |
| Update or remove this leave entry | 129 | 1 | rendered expression |
| Submit a leave request for review | 129 | 1 | rendered expression |
| Staff Member | 142 | 1 | visible text |
| Select staff member… | 144 | 1 | accessibility / placeholder |
| Leave Type | 156 | 1 | visible text |
| Date Range | 181 | 1 | visible text |
| From | 184 | 1 | visible text |
| To | 200 | 1 | visible text |
| 1 day | 217 | 1 | rendered expression |
| &#96;${totalDays} days&#96; | 217 | 1 | rendered expression |
| working) | 220 | 1 | visible text |
| Reason | 232 | 1 | visible text |
| (optional) | 232 | 1 | visible text |
| Any details you'd like to share with your manager… | 237 | 1 | accessibility / placeholder |
| Your request will be sent to management for review. You'll see the status update in the leave panel below the schedule. | 248 | 1 | visible text |
| Delete leave | 259 | 1 | visible text |
| Cancel | 266 | 1 | visible text |
| Saving… | 268 | 1 | rendered expression |
| Save Changes | 271 | 1 | rendered expression |
| Submit Request | 271 | 1 | rendered expression |

## `src/components/calendar/staff/LeavePanel.tsx`

4 ledger entries; 4 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| My Leave Requests | 36 | 1 | visible text |
| New | 38 | 1 | visible text |
| All Leave Requests | 58 | 1 | visible text |
| pending | 61 | 1 | visible text |

## `src/components/calendar/staff/MobileStaffWeek.tsx`

16 ledger entries; 15 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| No staff scheduled this week | 42 | 1 | visible text |
| — day off or day in lieu | 49 | 1 | visible text |
| &#96;Manage schedules for ${getDisplayName(person)}&#96; | 72 | 1 | rendered expression |
| d MMM | 80 | 1 | rendered expression |
| Pending | 94 | 1 | visible text |
| &#96;Add shift for ${getDisplayName(person)} on ${format(day, "EEE d MMM")}&#96; | 100 | 1 | rendered expression |
| No shifts this week | 106 | 1 | visible text |
| Shift | 113, 125 | 2 | rendered expression, visible text |
| &#96; · ${format(new Date(&#96;${selected.shift_date}T12:00:00&#96;), "EEE d MMM yyyy")}&#96; | 114 | 1 | rendered expression |
| Awaiting approval | 118 | 1 | rendered expression |
| Approved | 118 | 1 | rendered expression |
| Checklist attached | 120 | 1 | visible text |
| Close | 123 | 1 | visible text |
| Review leave | 124 | 1 | rendered expression |
| Edit shift | 124 | 1 | rendered expression |

## `src/components/calendar/staff/PdfExportModal.tsx`

13 ledger entries; 13 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Download Schedule PDF | 76 | 1 | visible text |
| Date Range | 83 | 1 | visible text |
| to | 97 | 1 | visible text |
| This week | 111 | 1 | visible text |
| This month | 112 | 1 | visible text |
| Next 3 months | 113 | 1 | visible text |
| This year | 114 | 1 | visible text |
| Start date must be before end date. | 117 | 1 | visible text |
| Layout | 124 | 1 | visible text |
| Include staff hours tracking | 137 | 1 | visible text |
| Appends a compact summary table (days, hours, leave) after the calendars. | 140 | 1 | visible text |
| Cancel | 152 | 1 | visible text |
| Download PDF | 153 | 1 | visible text |

## `src/components/calendar/staff/PropertyLegend.tsx`

2 ledger entries; 2 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Other | 39 | 1 | visible text |
| Leave | 42 | 1 | visible text |

## `src/components/calendar/staff/ScheduleManagerDrawer.tsx`

24 ledger entries; 22 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Recurring Schedules | 107 | 1 | visible text |
| Staff member | 110 | 1 | rendered expression |
| Staff Member | 120 | 1 | visible text |
| Select staff… | 122 | 1 | accessibility / placeholder |
| No recurring schedules set. | 133 | 1 | visible text |
| No property | 149 | 1 | rendered expression |
| · From | 149 | 1 | visible text |
| Edit Schedule | 171 | 1 | rendered expression |
| Add Recurring Schedule | 171, 230 | 2 | rendered expression, visible text |
| Editing will close the current schedule and create a new one from today — past shifts remain unchanged. | 174 | 1 | visible text |
| Day of Week | 179 | 1 | visible text |
| Property | 190 | 1 | visible text |
| None | 195, 197 | 2 | accessibility / placeholder, visible text |
| Start Time | 205 | 1 | visible text |
| End Time | 209 | 1 | visible text |
| Notes | 214 | 1 | visible text |
| Optional | 215 | 1 | accessibility / placeholder |
| Cancel | 218 | 1 | visible text |
| Saving… | 220 | 1 | rendered expression |
| Update | 220 | 1 | rendered expression |
| Add | 220 | 1 | rendered expression |
| Done | 235 | 1 | visible text |

## `src/components/calendar/staff/ShareWeekDialog.tsx`

19 ledger entries; 19 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| End date must be on or after start date | 65 | 1 | message / validation / export |
| Couldn't create share link | 79 | 1 | message / validation / export |
| Share link ready | 83 | 1 | message / validation / export |
| Couldn't revoke | 92 | 1 | message / validation / export |
| Link revoked | 93 | 1 | message / validation / export |
| Link copied | 101 | 1 | message / validation / export |
| Couldn't copy — long-press to copy:  | 103 | 1 | message / validation / export |
| Share the schedule | 117 | 1 | visible text |
| Generates a link that lets a non-user edit shifts within the date range you choose. Changes save live. You can revoke anytime. | 119 | 1 | visible text |
| Start date | 128 | 1 | visible text |
| End date | 138 | 1 | visible text |
| Label (optional) | 150 | 1 | visible text |
| e.g. Maria — cover weeks | 155 | 1 | accessibility / placeholder |
| Create share link | 160 | 1 | visible text |
| Recent share links | 166 | 1 | visible text |
| No links yet. | 169 | 1 | visible text |
| Untitled link | 182 | 1 | rendered expression |
| (revoked) | 183 | 1 | visible text |
| Copy | 197 | 1 | visible text |

## `src/components/calendar/staff/ShiftChip.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
|  · Pending | 42 | 1 | rendered expression |
| Double-click to edit | 70 | 1 | rendered expression |
| &#96;Checklist: ${checklistTitle}&#96; | 89 | 1 | rendered expression |

## `src/components/calendar/staff/ShiftModal.tsx`

44 ledger entries; 40 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Cannot schedule before this staff member's start date | 114, 200 | 2 | message / validation / export |
| Edit Shift | 247 | 1 | rendered expression |
| Add Shift | 247, 433 | 2 | rendered expression |
| Single | 264 | 1 | rendered expression |
| Date Range | 264 | 1 | rendered expression |
| Recurring | 264 | 1 | rendered expression |
| Staff Member | 272 | 1 | visible text |
| Select staff… | 274 | 1 | accessibility / placeholder |
| Location | 285 | 1 | visible text |
| Select location… | 300 | 1 | accessibility / placeholder |
| No location | 302 | 1 | visible text |
| 🏢 Office | 303 | 1 | visible text |
| 🏠 Remote | 304 | 1 | visible text |
| Checklist | 314 | 1 | visible text |
| No checklist | 322, 324 | 2 | accessibility / placeholder, visible text |
| Select a property first | 332 | 1 | accessibility / placeholder |
| From | 350 | 1 | visible text |
| To | 357 | 1 | visible text |
| Days of Week | 367 | 1 | visible text |
| Select at least one day | 385 | 1 | visible text |
| Effective From | 391 | 1 | visible text |
| Until (optional) | 395 | 1 | visible text |
| No end date | 396 | 1 | accessibility / placeholder |
| Summary: | 402 | 1 | visible text |
| Every | 403 | 1 | visible text |
| from | 405 | 1 | visible text |
| today | 405 | 1 | rendered expression |
| &#96; until ${form.effective_to}&#96; | 406 | 1 | rendered expression |
|  (ongoing) | 406 | 1 | rendered expression |
| Start Time | 415 | 1 | visible text |
| End Time | 419 | 1 | visible text |
| Notes | 425 | 1 | visible text |
| Cancel | 431, 448 | 2 | visible text |
| Saving… | 433 | 1 | rendered expression |
| Save Changes | 433 | 1 | rendered expression |
| Set Recurring | 433 | 1 | rendered expression |
| Edit recurring shift | 441 | 1 | visible text |
| This shift is part of a recurring schedule. Apply your changes to just this day, or to every occurrence going forward? | 443 | 1 | visible text |
| Just this day | 450 | 1 | visible text |
| Entire series | 453 | 1 | visible text |

## `src/components/calendar/staff/StaffDaysSummary.tsx`

8 ledger entries; 6 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Days Tracking | 83 | 1 | visible text |
| Days | 96 | 1 | visible text |
| Hours | 100 | 1 | visible text |
| Leave YTD | 104 | 1 | visible text |
| Left | 106 | 1 | visible text |
| not set | 133, 135, 137 | 3 | rendered expression |

## `src/components/calendar/staff/StaffFilterBar.tsx`

8 ledger entries; 8 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Search staff… | 37 | 1 | accessibility / placeholder |
| Department | 42 | 1 | accessibility / placeholder |
| All departments | 45 | 1 | visible text |
| Property | 53 | 1 | accessibility / placeholder |
| All properties | 56 | 1 | visible text |
| Clear | 64 | 1 | visible text |
| person | 68 | 1 | rendered expression |
| people | 68 | 1 | rendered expression |

## `src/components/calendar/staff/StaffMonthGrid.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| No staff scheduled in this range | 68 | 1 | visible text |
| Set Up Schedules | 71 | 1 | visible text |
| Leave | 170 | 1 | accessibility / placeholder |

## `src/components/calendar/staff/StaffWeekGrid.tsx`

4 ledger entries; 4 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| No staff scheduled this week | 93 | 1 | visible text |
| Set Up Schedules | 96 | 1 | visible text |
| Drag to reorder | 123 | 1 | accessibility / placeholder |
| Manage schedules | 151 | 1 | accessibility / placeholder |

## `src/components/calendar/staff/constants.ts`

19 ledger entries; 19 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Sun | 52 | 1 | confirmed supplemental copy |
| Mon | 52 | 1 | confirmed supplemental copy |
| Tue | 52 | 1 | confirmed supplemental copy |
| Wed | 52 | 1 | confirmed supplemental copy |
| Thu | 52 | 1 | confirmed supplemental copy |
| Fri | 52 | 1 | confirmed supplemental copy |
| Sat | 52 | 1 | confirmed supplemental copy |
| Sunday | 53 | 1 | confirmed supplemental copy |
| Monday | 53 | 1 | confirmed supplemental copy |
| Tuesday | 53 | 1 | confirmed supplemental copy |
| Wednesday | 53 | 1 | confirmed supplemental copy |
| Thursday | 53 | 1 | confirmed supplemental copy |
| Friday | 53 | 1 | confirmed supplemental copy |
| Saturday | 53 | 1 | confirmed supplemental copy |
| Vacation | 56 | 1 | display copy |
| Sick Leave | 57 | 1 | display copy |
| Personal Day | 58 | 1 | display copy |
| Public Holiday | 59 | 1 | display copy |
| Other | 60 | 1 | display copy |

## `src/components/calendar/staff/exportUtils.ts`

5 ledger entries; 5 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| 1D4ED8 | 11 | 1 | display copy |
| Staff | 78 | 1 | display-array candidate; check consumer/reachability |
| Excel file downloaded | 103 | 1 | message / validation / export |
| &#96;Staff Schedule — ${weekLabel}&#96; | 125 | 1 | message / validation / export |
| PDF downloaded | 238 | 1 | message / validation / export |

## `src/components/calendar/staff/schedulePdfExport.ts`

7 ledger entries; 7 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| 1D4ED8 | 17 | 1 | display copy |
| PROPERTIES | 97 | 1 | message / validation / export |
| &#96;Week of ${format(wkStart, "MMM d")} – ${format(wkEnd, "MMM d, yyyy")}&#96; | 176 | 1 | message / validation / export |
| top | 354 | 1 | message / validation / export |
| Days / Hours = worked vs contracted for the selected range. Leave YTD = approved leave days taken this calendar year vs allowance. Δ shows over/under-time. | 662 | 1 | message / validation / export |
| No staff to export | 686 | 1 | message / validation / export |
| PDF downloaded | 723 | 1 | message / validation / export |

## `src/components/sections/CalendarSection.tsx`

143 ledger entries; 111 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| All | 97 | 1 | display copy |
| Birthdays | 98 | 1 | display copy |
| Maintenance | 99, 110, 768 | 3 | display copy, visible text |
| Deliveries | 100 | 1 | display copy |
| Travel | 101, 107 | 2 | display copy |
| Construction | 102 | 1 | display copy |
| Guest Stay | 108 | 1 | display copy |
| Event / Party | 109 | 1 | display copy |
| Construction / Design | 111 | 1 | display copy |
| Failed to reschedule maintenance issue | 187 | 1 | message / validation / export |
| Maintenance rescheduled | 188 | 1 | message / validation / export |
| Failed to reschedule delivery | 197 | 1 | message / validation / export |
| Delivery date updated | 198 | 1 | message / validation / export |
| Failed to move event | 212, 228 | 2 | message / validation / export |
| Event moved | 213, 229 | 2 | message / validation / export |
| Synced from iCal · read-only | 263 | 1 | rendered expression |
| All day | 529, 530 | 2 | accessibility / placeholder, visible text |
| Start date | 533 | 1 | rendered expression |
| Start | 533 | 1 | rendered expression |
| End date | 537 | 1 | rendered expression |
| End | 537 | 1 | rendered expression |
| (optional) | 537, 1076 | 2 | visible text |
| Times are | 541 | 1 | visible text |
| time | 541 | 1 | visible text |
| Add a start date | 595, 1014 | 2 | message / validation / export |
| Failed to save changes | 617 | 1 | message / validation / export |
| Event updated | 618 | 1 | message / validation / export |
| Edit Event | 628 | 1 | visible text |
| Title | 631, 1059 | 2 | visible text |
| Event title | 632, 1060 | 2 | accessibility / placeholder |
| Repeat | 636, 1064 | 2 | visible text |
| Type | 647, 1081 | 2 | visible text |
| Location | 663, 1097 | 2 | visible text |
| Optional | 664, 1098 | 2 | accessibility / placeholder |
| Property | 667, 1101 | 2 | visible text |
| Select… | 669, 943, 1103 | 3 | accessibility / placeholder |
| None | 671, 945, 1105 | 3 | visible text |
| Notes | 677, 1111 | 2 | visible text |
| Optional notes… | 681, 1115 | 2 | accessibility / placeholder |
| Private | 688, 771, 1122 | 3 | visible text |
| Admins only | 689, 1123 | 2 | visible text |
| Cancel | 694, 842, 977, 1128 | 4 | visible text |
| Saving… | 696, 978, 1130 | 3 | rendered expression |
| Save Changes | 696 | 1 | rendered expression |
| Birthday | 767 | 1 | visible text |
| Delivery | 769 | 1 | visible text |
| Synced | 772 | 1 | visible text |
| recurrence: | 773 | 1 | rendered expression |
| ↗ Linked to Maintenance section — drag to reschedule | 806 | 1 | visible text |
| ↗ Linked to Orders section — drag to update delivery date | 811 | 1 | visible text |
| Edit event | 835 | 1 | visible text |
| &#96;Delete ${sourceLabel}&#96; | 848 | 1 | rendered expression |
| Delete event | 848, 860 | 2 | rendered expression |
| Delete maintenance issue | 858 | 1 | rendered expression |
| Delete delivery order | 859 | 1 | rendered expression |
| Settings saved | 906 | 1 | message / validation / export |
| Save an iCal URL first | 911 | 1 | message / validation / export |
| Please sign in again | 915 | 1 | message / validation / export |
| Sync failed | 921, 926 | 2 | message / validation / export |
| &#96;Synced ${data.synced} events&#96; | 925 | 1 | message / validation / export |
| Family Calendar Sync | 933 | 1 | visible text |
| iCal / WebCal URL | 936 | 1 | visible text |
| Apple Calendar → Share → Copy Link. Google → Settings → Secret iCal address. | 937 | 1 | visible text |
| Default Property | 941 | 1 | visible text |
| Privacy Filter | 951 | 1 | visible text |
| Always-Private Keywords | 953 | 1 | visible text |
| doctor, gym, school… | 954 | 1 | accessibility / placeholder |
| Estate-Relevant Keywords | 957 | 1 | visible text |
| montana, hamptons, dinner party… | 958 | 1 | accessibility / placeholder |
| Manual Sync | 963 | 1 | visible text |
| Last: | 964 | 1 | visible text |
| Syncing… | 968 | 1 | rendered expression |
| Sync Now | 968 | 1 | rendered expression |
| Agent Ronin will analyse estate-relevant events and post briefings to staff chat threads. | 973 | 1 | visible text |
| Save | 978 | 1 | rendered expression |
| Does not repeat | 988 | 1 | display copy |
| Daily | 989 | 1 | display copy |
| Weekly | 990 | 1 | display copy |
| Monthly | 991 | 1 | display copy |
| Yearly | 992 | 1 | display copy |
| Failed to save | 1043 | 1 | message / validation / export |
| Event added | 1044 | 1 | message / validation / export |
| New Event | 1056 | 1 | visible text |
| Repeat until | 1076 | 1 | visible text |
| 📅 General | 1085 | 1 | visible text |
| ✈️ Travel | 1086 | 1 | visible text |
| 🏗️ Construction / Design | 1087 | 1 | visible text |
| 🏠 Guest Stay | 1088 | 1 | visible text |
| 🎉 Event / Party | 1089 | 1 | visible text |
| 🔧 Maintenance | 1090 | 1 | visible text |
| 📦 Delivery | 1091 | 1 | visible text |
| 🎂 Birthday | 1092 | 1 | visible text |
| Add Event | 1130 | 1 | rendered expression |
| Upcoming | 1189 | 1 | rendered expression |
| event | 1191 | 1 | visible text |
| No events | 1195 | 1 | visible text |
| &#96;🎂 ${p.full_name}'s Birthday&#96; | 1395 | 1 | display copy |
| &#96;Priority: ${issue.priority} · Status: ${issue.status}&#96; | 1420 | 1 | display copy |
| &#96;Status: ${order.status}&#96; | 1443 | 1 | display copy |
| Maintenance issue deleted | 1541 | 1 | message / validation / export |
| Delivery order deleted | 1547 | 1 | message / validation / export |
| Event deleted | 1553 | 1 | message / validation / export |
| Calendar | 1563 | 1 | visible text |
| Family calendar · synced from iCal | 1565 | 1 | rendered expression |
| Ronin calendar · smart & operational | 1565 | 1 | rendered expression |
| Add | 1577 | 1 | visible text |
| Family | 1594 | 1 | visible text |
| All properties | 1612, 1615 | 2 | accessibility / placeholder, visible text |
| Today | 1687 | 1 | visible text |
| Calendar Sync | 1780 | 1 | visible text |
| Connect Apple, Google, or Skylight via iCal → Settings | 1782 | 1 | visible text |

## `src/components/messaging/AddressBook.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| · Agent Ronin included | 146 | 1 | visible text |
| Agent Ronin | 199 | 1 | visible text |
| Unknown | 254 | 1 | rendered expression |

## `src/components/messaging/ChatInfoPanel.tsx`

14 ledger entries; 13 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Group Info | 185 | 1 | rendered expression |
| Chat Info | 185 | 1 | rendered expression |
| AI Agent · Always available | 233 | 1 | rendered expression |
| &#96;${participants.length} members&#96; | 235 | 1 | rendered expression |
| Direct message | 236 | 1 | rendered expression |
| Search | 250 | 1 | visible text |
| Rename Group | 263 | 1 | visible text |
| Members | 273 | 1 | visible text |
| Add Member | 285 | 1 | visible text |
| Search contacts... | 297 | 1 | accessibility / placeholder |
| No contacts to add | 304 | 1 | visible text |
| Unknown | 320, 340 | 2 | rendered expression |
| You | 342 | 1 | visible text |

## `src/components/messaging/ChatView.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Search messages… | 481 | 1 | accessibility / placeholder |
| Cancel | 494 | 1 | visible text |
| From | 680 | 1 | visible text |

## `src/components/messaging/MessageBubble.tsx`

15 ledger entries; 15 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| 📷 Image unavailable | 42 | 1 | visible text |
| Message Info | 156 | 1 | visible text |
| Content | 164 | 1 | visible text |
| Sent | 172 | 1 | visible text |
| Status | 176 | 1 | visible text |
| Read by | 182 | 1 | visible text |
| person | 183 | 1 | rendered expression |
| people | 183 | 1 | rendered expression |
| Duration | 188 | 1 | visible text |
| Type | 194 | 1 | visible text |
| · WhatsApp | 562 | 1 | visible text |
| Action: | 587 | 1 | visible text |
| Confirm | 595 | 1 | visible text |
| Cancel | 602 | 1 | visible text |
| Action confirmed — executing… | 610 | 1 | visible text |

## `src/components/sections/PropertySection.tsx`

84 ledger entries; 67 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Occupied | 41, 1107 | 2 | display copy, visible text |
| Vacant | 42, 1108 | 2 | display copy, visible text |
| Maintenance | 43, 50, 1109 | 3 | display copy, visible text |
| Under Construction | 44, 1110 | 2 | display copy, visible text |
| For Sale | 45, 1111 | 2 | display copy, visible text |
| Tasks | 49 | 1 | display copy |
| Open & assigned tasks | 49 | 1 | display copy |
| Issues & requests | 50 | 1 | display copy |
| Users | 51 | 1 | display copy |
| Assigned people | 51 | 1 | display copy |
| Occupants | 52, 611 | 2 | display copy, visible text |
| Who's staying here | 52 | 1 | display copy |
| Rooms | 53, 1193 | 2 | display copy, visible text |
| Manage property rooms | 53 | 1 | display copy |
| Checklists | 54 | 1 | display copy |
| SOPs & procedures | 54 | 1 | display copy |
| Manuals | 55 | 1 | display copy |
| Care guides & rules | 55 | 1 | display copy |
| Schedule | 56 | 1 | display copy |
| Events & bookings | 56 | 1 | display copy |
| Delete " | 286, 363 | 2 | visible text |
| This action cannot be undone. | 287 | 1 | visible text |
| Cancel | 290, 367, 1136, 1254 | 4 | visible text |
| Delete | 291, 368 | 2 | visible text |
| propert | 304 | 1 | visible text |
| ies | 304 | 1 | rendered expression |
| Hold and drag to reorder | 306 | 1 | visible text |
| Add Property | 311, 1080, 1138 | 3 | rendered expression, visible text |
| No properties assigned yet. | 323 | 1 | visible text |
| This action cannot be undone. All linked data may be affected. | 364 | 1 | visible text |
| ★ Primary | 404 | 1 | visible text |
| Back to property | 471 | 1 | visible text |
| Assigned Users | 473 | 1 | visible text |
| No staff assigned | 479 | 1 | visible text |
| Assign staff to this property via the team management section. | 480 | 1 | visible text |
| Unknown | 493, 647 | 2 | rendered expression |
| No role assigned | 495 | 1 | rendered expression |
| Occupants updated | 594 | 1 | message / validation / export |
| Saving… | 616, 1138 | 2 | rendered expression |
| Save | 616 | 1 | rendered expression |
| No profiles found. | 625 | 1 | visible text |
| Sections | 753 | 1 | visible text |
| That file isn't an image. Please choose a photo. | 790 | 1 | message / validation / export |
| Photo upload failed. Please try again. | 800 | 1 | message / validation / export |
| Property | 821 | 1 | accessibility / placeholder |
| Drop image or tap to upload | 840 | 1 | visible text |
| Select timezone… | 1037 | 1 | rendered expression |
| Search city, state, or timezone… | 1043 | 1 | accessibility / placeholder |
| No timezones found | 1047 | 1 | visible text |
| United States | 1052 | 1 | visible text |
| All Timezones | 1055 | 1 | visible text |
| Edit Property | 1080 | 1 | rendered expression |
| Name * | 1085 | 1 | visible text |
| Address * | 1089 | 1 | visible text |
| City | 1094 | 1 | visible text |
| Country | 1098 | 1 | visible text |
| Status | 1103 | 1 | visible text |
| Timezone | 1116 | 1 | visible text |
| Set as Primary Residence | 1128 | 1 | visible text |
| Save Changes | 1138 | 1 | rendered expression |
| e.g. Master Bedroom, Kitchen, Pool… | 1204 | 1 | accessibility / placeholder |
| Add | 1213 | 1 | visible text |
| No rooms yet | 1224 | 1 | visible text |
| Add rooms above so staff can select them when logging issues. | 1225 | 1 | visible text |
| Remove room? | 1248 | 1 | visible text |
| This room will no longer appear in the issue report form. | 1250 | 1 | visible text |
| Remove | 1256 | 1 | visible text |

## `src/components/sections/ProfileSection.tsx`

7 ledger entries; 6 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Not allowed | 95, 118 | 2 | display copy |
| Email is auth-bound — exit preview to change your own email, or set it from User Management. | 95 | 1 | display copy |
| Use User Management to set this user's password. | 118 | 1 | display copy |
| Profile | 185 | 1 | accessibility / placeholder |
| Saving… | 571 | 1 | rendered expression |
| Save | 572 | 1 | visible text |

## `src/components/NotificationsPanel.tsx`

5 ledger entries; 5 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Notifications | 222 | 1 | visible text |
| Mark all read | 236 | 1 | visible text |
| No notifications yet | 259 | 1 | visible text |
| Updates and alerts will appear here | 260 | 1 | visible text |
| View | 316 | 1 | visible text |

## `src/lib/maintenanceNotifications.ts`

4 ledger entries; 4 distinct strings/templates. Priority P0 — daily/supporting.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| &#96;🔧 New issue reported: ${issue.title}&#96; | 28 | 1 | display copy |
| &#96;🔧 You've been assigned a repair: ${issue.title}&#96; | 32 | 1 | display copy |
| &#96;🔧 Booked: ${current.title}&#96; | 60 | 1 | display copy |
| &#96;🔧 You've been assigned planned maintenance: ${current.title}&#96; | 64 | 1 | display copy |

## `src/components/GanttChart.tsx`

120 ledger entries; 108 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Jan | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Feb | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Mar | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Apr | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| May | 34, 35 | 2 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Jun | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Jul | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Aug | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Sep | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Oct | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Nov | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Dec | 34 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| January | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| February | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| March | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| April | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| June | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| July | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| August | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| September | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| October | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| November | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| December | 35 | 1 | display-array candidate; English seeded/sample project content, not chrome; check consumer/reachability |
| Furniture removal (crane) | 56 | 1 | display copy; English seeded/sample project content, not chrome |
| Aug occupancy target | 57 | 1 | display copy; English seeded/sample project content, not chrome |
| Licence to Alter + design (extensive) | 59 | 1 | display copy; English seeded/sample project content, not chrome |
| Accessories / AV / lighting | 62 | 1 | display copy; English seeded/sample project content, not chrome |
| May 18th target | 63 | 1 | display copy; English seeded/sample project content, not chrome |
| 8 Jul occupancy | 63 | 1 | display copy; English seeded/sample project content, not chrome |
| ~2 year programme | 65, 116 | 2 | display copy; English seeded/sample project content, not chrome |
| On site — drywall, electrics, millwork | 68 | 1 | display copy; English seeded/sample project content, not chrome |
| Target completion | 69 | 1 | display copy; English seeded/sample project content, not chrome |
| Preliminary designs | 71 | 1 | display copy; English seeded/sample project content, not chrome |
| Early investor — land TBC | 74 | 1 | display copy; English seeded/sample project content, not chrome |
| Interior finishing → install | 79 | 1 | display copy; English seeded/sample project content, not chrome |
| Jun/Jul install target | 80 | 1 | display copy; English seeded/sample project content, not chrome |
| Design input | 83 | 1 | display copy; English seeded/sample project content, not chrome |
| Structural & mechanical | 84 | 1 | display copy; English seeded/sample project content, not chrome |
| Target 2027 | 86 | 1 | display copy; English seeded/sample project content, not chrome |
| Construction | 89, 508, 628 | 3 | display copy; English seeded/sample project content, not chrome |
| Clean & install | 90 | 1 | display copy; English seeded/sample project content, not chrome |
| Jun 15 completion | 92 | 1 | display copy; English seeded/sample project content, not chrome |
| Exterior works | 95 | 1 | display copy; English seeded/sample project content, not chrome |
| Furniture install | 96 | 1 | display copy; English seeded/sample project content, not chrome |
| May 15 furniture ready | 98 | 1 | display copy; English seeded/sample project content, not chrome |
| Maintenance / feedback pending | 100 | 1 | display copy; English seeded/sample project content, not chrome |
| HVAC + kitchen door/window | 103 | 1 | display copy; English seeded/sample project content, not chrome |
| 26 Mar HVAC | 104 | 1 | display copy; English seeded/sample project content, not chrome |
| Long-range planning | 108 | 1 | display copy; English seeded/sample project content, not chrome |
| Erosion repair & perimeter works | 111, 125 | 2 | display copy; English seeded/sample project content, not chrome |
| Long range planning | 119 | 1 | display copy; English seeded/sample project content, not chrome |
| Generator works TBC | 122 | 1 | display copy; English seeded/sample project content, not chrome |
| Type | 259 | 1 | display copy |
| Start | 268 | 1 | display copy |
| End | 273 | 1 | display copy |
| Label | 278 | 1 | display copy |
| Notes (shown on hover over the bar) | 290 | 1 | visible text |
| Optional — longer details shown when hovering the bar on the timeline | 294 | 1 | accessibility / placeholder |
| Remove | 299 | 1 | visible text |
| Timeline not loaded | 360, 364 | 2 | display copy |
| Timeline not saved | 394, 400 | 2 | display copy |
| Delete this project? | 444 | 1 | message / validation / export |
| City / location? | 452 | 1 | message / validation / export |
| &#96;Property name in ${location}?&#96; | 454 | 1 | message / validation / export |
| Works | 459 | 1 | display copy |
| Install / Fit-out | 509, 629 | 2 | display copy |
| Maintenance | 510, 630 | 2 | display copy |
| Design / Planning | 511, 631 | 2 | display copy |
| Complete | 512, 632 | 2 | display copy |
| Loading timeline... | 681 | 1 | rendered expression |
| Click any project name to edit | 681 | 1 | rendered expression |
| View | 686 | 1 | visible text |
| Export PDF | 707 | 1 | visible text |
| Link Copied! | 717 | 1 | rendered expression |
| Share Link | 717 | 1 | rendered expression |
| Editing: | 726 | 1 | visible text |
| ✕ Close | 727 | 1 | visible text |
| City / Location | 732 | 1 | display copy |
| Property Name | 733 | 1 | display copy |
| Status | 734 | 1 | display copy |
| Timeline Phases | 749 | 1 | visible text |
| + Add Phase | 757 | 1 | visible text |
| Milestones | 760 | 1 | visible text |
| &mdash; leave the date blank for a note-only milestone | 760 | 1 | visible text |
| Leave blank for a note with no date | 765 | 1 | accessibility / placeholder |
| Milestone description | 768 | 1 | accessibility / placeholder |
| + Add Milestone | 775 | 1 | visible text |
| Saving... | 779 | 1 | rendered expression |
| ✓ Save Changes | 779 | 1 | rendered expression |
| Delete | 780 | 1 | visible text |
| Cancel | 781, 917 | 2 | visible text |
| Drag to reorder | 842 | 1 | accessibility / placeholder |
| + Add project in | 876 | 1 | visible text |
| Print / Export to PDF | 891 | 1 | visible text |
| Choose a date range — fewer months gives wider columns and cleaner text. | 892 | 1 | visible text |
| From | 894 | 1 | display copy |
| To | 894 | 1 | display copy |
| Quick ranges | 901 | 1 | visible text |
| months | 906 | 1 | visible text |
| In the print dialog: | 911 | 1 | visible text |
| Paper → | 912 | 1 | visible text |
| &bull; Orientation → | 912 | 1 | visible text |
| Landscape | 912 | 1 | visible text |
| Margins → | 913 | 1 | visible text |
| Minimum | 913 | 1 | visible text |
| &bull; Enable | 913 | 1 | visible text |
| Background graphics | 913 | 1 | visible text |
| Open Print Preview → | 920 | 1 | visible text |

## `src/components/PendingRulesWidget.tsx`

11 ledger entries; 11 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| pending rule | 165 | 1 | visible text |
| Rules | 171 | 1 | visible text |
| Pending Approvals | 185 | 1 | visible text |
| View all rules → | 196 | 1 | visible text |
| No pending rules | 209 | 1 | visible text |
| All caught up! | 210 | 1 | visible text |
| From | 229 | 1 | visible text |
| Reason for rejection (optional) | 254 | 1 | accessibility / placeholder |
| Approve | 266 | 1 | visible text |
| Confirm Reject | 274 | 1 | visible text |
| Reject | 281 | 1 | visible text |

## `src/components/PreviewModeBanner.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Viewing as | 39 | 1 | visible text |
| · writes affect their real data | 41 | 1 | visible text |
| Exit | 47 | 1 | visible text |

## `src/components/TextSizeControl.tsx`

2 ledger entries; 1 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Aa | 22, 29 | 2 | visible text |

## `src/components/checklists/SectionsManager.tsx`

9 ledger entries; 8 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Section already exists | 36, 44 | 2 | message / validation / export |
| &#96;Delete section "${name}"? Items in it will become ungrouped (no data lost).&#96; | 58 | 1 | message / validation / export |
| Sections | 73 | 1 | visible text |
| Rename section | 91 | 1 | accessibility / placeholder |
| Delete section | 95 | 1 | accessibility / placeholder |
| Section name… | 108 | 1 | accessibility / placeholder |
| Add section | 117 | 1 | visible text |
| — Ungrouped — | 141 | 1 | visible text |

## `src/components/manuals/CareGuideCard.tsx`

10 ledger entries; 10 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| &#96;Delete "${template.title}"? This can't be undone.&#96; | 37 | 1 | message / validation / export |
| Couldn't delete this care guide | 40 | 1 | message / validation / export |
| Care guide deleted | 41 | 1 | message / validation / export |
| DRAFT | 79 | 1 | visible text |
| Tap to view care guide | 86 | 1 | visible text |
| Publish this care guide | 94 | 1 | rendered expression |
| Unpublish (hide from staff) | 94 | 1 | rendered expression |
| PUBLISH | 102 | 1 | visible text |
| LIVE | 102 | 1 | visible text |
| Delete care guide | 106 | 1 | accessibility / placeholder |

## `src/components/manuals/CareGuideScanModal.tsx`

26 ledger entries; 26 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Remove line | 41 | 1 | accessibility / placeholder |
| Add line | 44 | 1 | visible text |
| Couldn't read this sheet | 68 | 1 | message / validation / export |
| Add a title | 78 | 1 | message / validation / export |
| Care guide was not saved | 92 | 1 | message / validation / export |
| &#96;Composition: ${draft.composition}&#96; | 95 | 1 | display copy |
| Guide created but some lines failed to save | 102 | 1 | message / validation / export |
| Draft care guide created — add the item photo for the back | 104 | 1 | message / validation / export |
| Scan manufacturer sheet | 113 | 1 | visible text |
| Upload a fabric or spec sheet and we'll draft the care guide for you to check. | 114 | 1 | visible text |
| Reading the sheet… | 121 | 1 | visible text |
| &#96;Replace (${file.name})&#96; | 122 | 1 | rendered expression |
| Tap to upload sheet (image or PDF) | 122 | 1 | rendered expression |
| Fabric swatch (front of card) | 128 | 1 | visible text |
| Fabric swatch | 130 | 1 | accessibility / placeholder |
| Use a different swatch | 133 | 1 | rendered expression |
| Add swatch image | 133 | 1 | rendered expression |
| No swatch | 134 | 1 | visible text |
| Swatches can't be cut from PDFs automatically — add a screenshot of it instead. | 137 | 1 | visible text |
| Title | 141 | 1 | visible text |
| Fabric code | 146 | 1 | visible text |
| Composition | 150 | 1 | visible text |
| Ratings line | 157 | 1 | visible text |
| Cancel | 164 | 1 | visible text |
| Saving… | 165 | 1 | rendered expression |
| Create care guide | 165 | 1 | rendered expression |

## `src/components/manuals/RulesManager.tsx`

21 ledger entries; 21 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| maintenance | 20 | 1 | display-array candidate; check consumer/reachability |
| travel | 20 | 1 | display-array candidate; check consumer/reachability |
| general | 20 | 1 | display-array candidate; check consumer/reachability |
| No rules set for this property. | 129 | 1 | visible text |
| Add rules to automatically surface alerts on the Dashboard. | 130 | 1 | visible text |
| All properties | 154 | 1 | visible text |
| Edit Rule | 172 | 1 | rendered expression |
| New Rule | 172 | 1 | rendered expression |
| Rule title (e.g. No parking in driveway) | 192 | 1 | accessibility / placeholder |
| Description / details (optional) | 198 | 1 | accessibility / placeholder |
| Alert colour | 204 | 1 | visible text |
| Active when this person is at the property | 216 | 1 | visible text |
| Add occupant… | 226 | 1 | accessibility / placeholder |
| Triggered by calendar event type | 256 | 1 | visible text |
| Triggered by keywords in event title (comma-separated) | 272 | 1 | visible text |
| e.g. Owner visit, School run | 274 | 1 | accessibility / placeholder |
| Apply to all properties | 284 | 1 | visible text |
| Save Changes | 290 | 1 | rendered expression |
| Add Rule | 290 | 1 | rendered expression |
| Cancel | 294 | 1 | visible text |
| Add rule | 301 | 1 | visible text |

## `src/components/sections/AchievementsSection.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| New! | 169 | 1 | visible text |

## `src/components/sections/CarWashSection.tsx`

86 ledger entries; 75 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Quick Wash | 57 | 1 | display copy |
| Full Detail | 58 | 1 | display copy |
| Requested | 62 | 1 | display copy |
| Confirmed | 63 | 1 | display copy |
| Completed | 64 | 1 | display copy |
| Cancelled | 65 | 1 | display copy |
| Wash | 151, 548 | 2 | visible text |
| Failed to book wash | 192 | 1 | message / validation / export |
| Wash request submitted! | 193 | 1 | message / validation / export |
| Book a Wash | 216 | 1 | visible text |
| Service Type | 229, 464 | 2 | visible text |
| Wash Location | 253, 486 | 2 | visible text |
| Select location… | 261 | 1 | visible text |
|  (Home) | 264 | 1 | rendered expression |
| Preferred Date | 276, 506 | 2 | visible text |
| Preferred Time | 288, 516 | 2 | visible text |
| Notes (optional) | 302, 528 | 2 | visible text |
| Any special instructions… | 307 | 1 | accessibility / placeholder |
| Request Wash | 321 | 1 | visible text |
| Select at least one vehicle | 364 | 1 | message / validation / export |
| Failed to book washes | 381 | 1 | message / validation / export |
| Book Multiple Washes | 403 | 1 | visible text |
| of | 404 | 1 | visible text |
| selected | 404 | 1 | visible text |
| Vehicles | 418 | 1 | visible text |
| Deselect all | 420 | 1 | rendered expression |
| Select all | 420 | 1 | rendered expression |
| (defaults to each vehicle's home) | 486 | 1 | visible text |
| Each vehicle's home property | 494 | 1 | visible text |
| Any special instructions for all vehicles… | 532 | 1 | accessibility / placeholder |
| Book | 548 | 1 | visible text |
| Failed to save vehicle | 614 | 1 | message / validation / export |
| Vehicle updated | 615 | 1 | message / validation / export |
| Vehicle added | 615 | 1 | message / validation / export |
| Edit Vehicle | 630 | 1 | rendered expression |
| Add Vehicle | 630, 724, 1120, 1137 | 4 | rendered expression, visible text |
| Tap to upload photo | 651 | 1 | visible text |
| Make * | 662 | 1 | visible text |
| e.g. Range Rover | 663 | 1 | accessibility / placeholder |
| Model * | 667 | 1 | visible text |
| e.g. Autobiography | 668 | 1 | accessibility / placeholder |
| Colour | 676 | 1 | visible text |
| e.g. Midnight Black | 677 | 1 | accessibility / placeholder |
| Year | 681 | 1 | visible text |
| Owner | 689 | 1 | visible text |
| Select owner… | 693 | 1 | visible text |
| Unknown | 694, 949 | 2 | rendered expression |
| Kept at Property | 702 | 1 | visible text |
| Select property… | 706 | 1 | visible text |
| Notes | 715 | 1 | visible text |
| Any notes about this vehicle… | 716 | 1 | accessibility / placeholder |
| Save Changes | 724 | 1 | rendered expression |
| Failed to update | 766 | 1 | message / validation / export |
| Marked complete! 🚗✨ | 767 | 1 | message / validation / export |
| Status updated | 767 | 1 | message / validation / export |
| car_wash_bookings | 808 | 1 | message / validation / export |
| confirmed | 809 | 1 | message / validation / export |
| requested | 809 | 1 | message / validation / export |
| id | 810 | 1 | message / validation / export |
| Failed to assign | 811 | 1 | message / validation / export |
| Staff assigned & confirmed | 812 | 1 | message / validation / export |
| Staff removed | 812 | 1 | message / validation / export |
| 🚿 Car Wash Assigned | 824 | 1 | display copy |
| Fleet | 847, 1083 | 2 | visible text |
| No washes this week | 871 | 1 | visible text |
| Bookings will appear here once submitted. | 872 | 1 | visible text |
| Today | 882 | 1 | rendered expression |
| Assign staff… | 948 | 1 | visible text |
| Complete | 959 | 1 | visible text |
| Completed by | 969 | 1 | visible text |
| vehicle | 1085 | 1 | visible text |
| Book All | 1096 | 1 | visible text |
| Schedule | 1106 | 1 | visible text |
| No vehicles yet | 1133 | 1 | visible text |
| Add the fleet to start booking washes. | 1134 | 1 | visible text |

## `src/components/sections/CareGuideDetailPage.tsx`

72 ledger entries; 66 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Left | 26 | 1 | display copy |
| Under Basic | 26 | 1 | display copy |
| Under Deep | 26 | 1 | display copy |
| Right | 26 | 1 | display copy |
| Emoji | 148 | 1 | visible text |
| Library | 148 | 1 | visible text |
| Uploading… | 172, 1106 | 2 | rendered expression, visible text |
| Upload icon (PNG/SVG/JPG) | 172 | 1 | visible text |
| No icons uploaded yet | 179 | 1 | visible text |
| + add reference image | 324 | 1 | visible text |
| Mark as instruction | 336 | 1 | rendered expression |
| Mark as equipment | 336 | 1 | rendered expression |
| EQ | 339, 1120 | 2 | rendered expression |
| INST | 339, 1120 | 2 | rendered expression |
| Move to container | 352, 364 | 2 | accessibility / placeholder, visible text |
| GRP | 357 | 1 | rendered expression |
| No container | 367 | 1 | visible text |
| Empty | 453 | 1 | visible text |
| Equipment | 504 | 1 | visible text |
| No equipment | 510 | 1 | visible text |
| Add equipment | 515 | 1 | visible text |
| Instructions | 524 | 1 | visible text |
| No instructions | 533 | 1 | visible text |
| Add instruction | 556 | 1 | visible text |
| Container name… | 565 | 1 | accessibility / placeholder |
| Add | 568, 1106, 1137 | 3 | visible text |
| Add container | 584 | 1 | visible text |
| Images were not saved | 760 | 1 | message / validation / export |
| Some images failed to upload | 775 | 1 | message / validation / export |
| Care Guides | 946 | 1 | visible text |
| Print 2-sided A5 card | 962 | 1 | accessibility / placeholder |
| Care guide | 999 | 1 | visible text |
| DRAFT | 1002 | 1 | visible text |
| Admin Settings | 1012 | 1 | visible text |
| Status | 1016 | 1 | visible text |
| Draft — only visible to Master Admin | 1017 | 1 | rendered expression |
| Published — visible to assigned users | 1017 | 1 | rendered expression |
| Publish | 1023 | 1 | visible text |
| Unpublish | 1023 | 1 | visible text |
| Property | 1029 | 1 | visible text |
| Universal — all properties | 1032 | 1 | visible text |
| Only people with access to this property will see it. | 1035 | 1 | visible text |
| Location (optional) | 1040 | 1 | visible text |
| e.g. Master Bedroom, Kitchen Marble... | 1044 | 1 | accessibility / placeholder |
| Assign to role | 1051 | 1 | visible text |
| All roles | 1054 | 1 | visible text |
| Assign to dept. | 1059 | 1 | visible text |
| All departments | 1062 | 1 | visible text |
| Saving… | 1070 | 1 | rendered expression |
| Save Settings | 1070 | 1 | visible text |
| Card images — choose Front (beside the instructions) or Back (reverse side) | 1075 | 1 | visible text |
| &#96;Card image ${idx + 1}&#96; | 1079 | 1 | rendered expression |
| Remove image | 1087 | 1 | accessibility / placeholder |
| Position on front | 1091 | 1 | accessibility / placeholder |
| image | 1106 | 1 | visible text |
| Basic | 1120 | 1 | rendered expression |
| Deep | 1120 | 1 | rendered expression |
| Enter text… | 1135 | 1 | accessibility / placeholder |
| Hover items to assign columns, toggle EQ/Instruction, or move to containers | 1150 | 1 | visible text |
| Basic Clean | 1164 | 1 | accessibility / placeholder |
| Deep Clean | 1178 | 1 | accessibility / placeholder |
| Front of card | 1200 | 1 | visible text |
| Front | 1201 | 1 | accessibility / placeholder |
| Back of card | 1204 | 1 | visible text |
| Back | 1205 | 1 | accessibility / placeholder |
| Prints as 2-sided A5 landscape card — instructions and front images on the front, item photo on the back | 1213 | 1 | visible text |

## `src/components/sections/ManualsSection.tsx`

6 ledger entries; 6 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Filter care guides | 180 | 1 | accessibility / placeholder |
| All guides | 182 | 1 | visible text |
| Universal only | 183 | 1 | visible text |
| Sort care guides | 186 | 1 | accessibility / placeholder |
| By property | 189 | 1 | visible text |
| Scan sheet | 230 | 1 | visible text |

## `src/components/sections/MasterImportSection.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Only CSV files are supported. | 33 | 1 | message / validation / export |
| &#96;${r.task_count} tasks imported successfully!&#96; | 57 | 1 | message / validation / export |
| title,description,category,priority,property\n"Deep clean kitchen","All surfaces",housekeeping,urgent,Malibu\n"Fix heating unit","HVAC issue",maintenance,normal,Montana\n"Restock pantry","Order supplies",housekeeping,low, | 204 | 1 | rendered expression |

## `src/components/sections/MeetTeamSection.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Draft Account | 325 | 1 | rendered expression |
| Draft | 328 | 1 | visible text |
| Add name to send invitation | 340 | 1 | visible text |

## `src/components/sections/MemorySection.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Failed to delete memory | 92 | 1 | message / validation / export |
| Failed to save memory | 114 | 1 | message / validation / export |
| &#96; · referenced ${memory.reference_count}×&#96; | 274 | 1 | rendered expression |

## `src/components/sections/RulesSection.tsx`

32 ledger entries; 30 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| maintenance | 40 | 1 | display-array candidate; check consumer/reachability |
| travel | 40 | 1 | display-array candidate; check consumer/reachability |
| general | 40 | 1 | display-array candidate; check consumer/reachability |
| Edit Rule | 98 | 1 | rendered expression |
| New Rule | 98, 517 | 2 | rendered expression, visible text |
| Rule title (e.g. No parking in driveway) | 123 | 1 | accessibility / placeholder |
| Description / details (optional) | 132 | 1 | accessibility / placeholder |
| Alert colour | 139 | 1 | visible text |
| Apply to all properties (universal) | 165 | 1 | visible text |
| — Specific property (optional) — | 173 | 1 | visible text |
| Auto-deactivate when property is unoccupied | 191 | 1 | visible text |
| Triggered by calendar event type | 198 | 1 | visible text |
| Triggered by keywords (comma-separated) | 219 | 1 | visible text |
| e.g. Behdad, Owner visit, Party | 223 | 1 | accessibility / placeholder |
| Visible to roles (leave empty = all) | 230 | 1 | visible text |
| Save Changes | 255 | 1 | rendered expression |
| Add Rule | 255 | 1 | rendered expression |
| Cancel | 261 | 1 | visible text |
| Inactive | 300, 550 | 2 | rendered expression, visible text |
| 🏠 Occupancy-linked | 304 | 1 | visible text |
| Deactivate rule | 328 | 1 | rendered expression |
| Activate rule | 328 | 1 | rendered expression |
| Deactivate | 337 | 1 | visible text |
| Activate | 339 | 1 | visible text |
| Permanently delete this rule? | 466 | 1 | message / validation / export |
| active rule | 507 | 1 | visible text |
| All | 550 | 1 | rendered expression |
| Active | 550 | 1 | rendered expression |
| No rules yet | 563 | 1 | visible text |
| Add rules to surface alerts on the dashboard | 566 | 1 | visible text |

## `src/components/sections/VendorsSection.tsx`

20 ledger entries; 19 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Vendors | 92 | 1 | visible text |
| contacts | 93 | 1 | visible text |
| Export CSV | 96 | 1 | accessibility / placeholder |
| Add | 102 | 1 | visible text |
| Search vendors... | 113 | 1 | accessibility / placeholder |
| Category | 126, 256 | 2 | accessibility / placeholder, display copy |
| All categories | 129 | 1 | visible text |
| Property | 137 | 1 | accessibility / placeholder |
| All properties | 140 | 1 | visible text |
| Unlinked | 141 | 1 | visible text |
| No vendors found | 161 | 1 | visible text |
| Add your first vendor | 165 | 1 | visible text |
| Company | 254 | 1 | display copy |
| Name | 255 | 1 | display copy |
| Properties | 257 | 1 | display copy |
| What they do | 258 | 1 | display copy |
| Phone | 259 | 1 | display copy |
| Inactive | 298 | 1 | visible text |
| properties | 317 | 1 | visible text |

## `src/components/team/ArchiveMember.tsx`

12 ledger entries; 12 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Sun | 208 | 1 | display-array candidate; check consumer/reachability |
| Mon | 208 | 1 | display-array candidate; check consumer/reachability |
| Tue | 208 | 1 | display-array candidate; check consumer/reachability |
| Wed | 208 | 1 | display-array candidate; check consumer/reachability |
| Thu | 208 | 1 | display-array candidate; check consumer/reachability |
| Fri | 208 | 1 | display-array candidate; check consumer/reachability |
| Sat | 208 | 1 | display-array candidate; check consumer/reachability |
| Dom | 209 | 1 | display-array candidate; check consumer/reachability |
| Lun | 209 | 1 | display-array candidate; check consumer/reachability |
| Mar | 209 | 1 | display-array candidate; check consumer/reachability |
| Jue | 209 | 1 | display-array candidate; check consumer/reachability |
| Vie | 209 | 1 | display-array candidate; check consumer/reachability |

## `src/components/team/MemberEditDrawer.tsx`

3 ledger entries; 3 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| An unexpected error occurred. | 186 | 1 | message / validation / export |
| Failed to send invitation. | 292 | 1 | message / validation / export |
| Failed to set password. | 355 | 1 | message / validation / export |

## `src/components/team/teamSharedComponents.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| No properties yet | 15 | 1 | visible text |

## `src/components/timesheets/excel.ts`

17 ledger entries; 17 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| &#96;${name} timesheet ${YYYY-MM}${version}.xlsx&#96; | 5 | 1 | confirmed supplemental copy |
| Time sheet | 9 | 1 | message / validation / export |
| day | 25 | 1 | confirmed supplemental copy |
| days | 25 | 1 | confirmed supplemental copy |
| &#96; — Corrected version ${t.version} (replaces version ${t.version - 1})&#96; | 27 | 1 | confirmed supplemental copy |
| Date | 30 | 1 | confirmed supplemental copy |
| Time | 30 | 1 | confirmed supplemental copy |
| Hours | 30 | 1 | confirmed supplemental copy |
| Day rate | 30 | 1 | confirmed supplemental copy |
| Per hour | 30 | 1 | confirmed supplemental copy |
| Amount | 30 | 1 | confirmed supplemental copy |
| Notes | 30 | 1 | confirmed supplemental copy |
| Expense | 61 | 1 | confirmed supplemental copy |
| Adjustment | 61 | 1 | confirmed supplemental copy |
| Total | 68 | 1 | confirmed supplemental copy |
| Paid by the day: one full day's pay for each day worked. Hours are shown for reference. | 80 | 1 | confirmed supplemental copy |
| &#96;Hours rounded to the nearest ${t.rounding_minutes} minutes.&#96; | 81 | 1 | confirmed supplemental copy |

## `src/components/ui/breadcrumb.tsx`

2 ledger entries; 2 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| breadcrumb | 12 | 1 | accessibility / placeholder |
| More | 77 | 1 | visible text |

## `src/components/ui/carousel.tsx`

2 ledger entries; 2 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Previous slide | 189 | 1 | visible text |
| Next slide | 217 | 1 | visible text |

## `src/components/ui/dialog.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Close | 56 | 1 | visible text |

## `src/components/ui/pagination.tsx`

6 ledger entries; 6 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| pagination | 10 | 1 | accessibility / placeholder |
| Go to previous page | 50 | 1 | accessibility / placeholder |
| Previous | 52 | 1 | visible text |
| Go to next page | 58 | 1 | accessibility / placeholder |
| Next | 59 | 1 | visible text |
| More pages | 68 | 1 | visible text |

## `src/components/ui/sheet.tsx`

1 ledger entries; 1 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Close | 73 | 1 | visible text |

## `src/components/ui/sidebar.tsx`

3 ledger entries; 1 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Toggle Sidebar | 237, 252, 255 | 3 | accessibility / placeholder, visible text |

## `src/components/vendors/VendorDetailPanel.tsx`

16 ledger entries; 16 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Copied | 29 | 1 | message / validation / export |
| &#96;Delete ${vendor.name}? This will remove all associated contacts.&#96; | 49 | 1 | message / validation / export |
| Inactive | 91 | 1 | visible text |
| Contacts | 129 | 1 | visible text |
| Add contact | 136 | 1 | visible text |
| No contacts yet | 161 | 1 | visible text |
| Edit contact | 279 | 1 | rendered expression |
| New contact | 279 | 1 | rendered expression |
| Name * | 282 | 1 | visible text |
| Full name | 283 | 1 | accessibility / placeholder |
| Job title | 286 | 1 | visible text |
| e.g. Site Manager | 287 | 1 | accessibility / placeholder |
| Phone | 290 | 1 | visible text |
| Primary contact | 301 | 1 | visible text |
| Cancel | 304 | 1 | visible text |
| Save | 306 | 1 | rendered expression |

## `src/components/vendors/VendorFormModal.tsx`

26 ledger entries; 25 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Edit Vendor | 80 | 1 | rendered expression |
| Add Vendor | 80, 189 | 2 | rendered expression |
| Company | 90 | 1 | visible text |
| e.g. Smith Landscaping | 91 | 1 | accessibility / placeholder |
| This is the main identifier — individual technicians can be added as contacts below. | 92 | 1 | visible text |
| Primary Contact Name | 95 | 1 | visible text |
| Optional — e.g. John Smith | 96 | 1 | accessibility / placeholder |
| Category | 99 | 1 | visible text |
| Phone | 110 | 1 | visible text |
| name@company.com | 115 | 1 | accessibility / placeholder |
| Website | 118 | 1 | visible text |
| What they do for us | 122 | 1 | visible text |
| Brief description of services... | 124 | 1 | accessibility / placeholder |
| Address | 132 | 1 | visible text |
| Street, City, State | 133 | 1 | accessibility / placeholder |
| Linked Properties | 136 | 1 | visible text |
| Select the properties this vendor services. | 137 | 1 | visible text |
| No properties available | 140 | 1 | visible text |
| Notes | 164 | 1 | visible text |
| Internal notes... | 166 | 1 | accessibility / placeholder |
| Active | 176 | 1 | visible text |
| Show in vendor lists | 177 | 1 | visible text |
| Cancel | 187 | 1 | visible text |
| Saving… | 189 | 1 | rendered expression |
| Save Changes | 189 | 1 | rendered expression |

## `src/contexts/PermissionsContext.tsx`

2 ledger entries; 1 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Couldn't load your profile. Check your connection and try again. | 338, 384 | 2 | display copy |

## `src/hooks/useMaintenanceIssues.ts`

3 ledger entries; 3 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Repair changes queued to sync | 223 | 1 | message / validation / export |
| Repair changes were not saved | 229 | 1 | message / validation / export |
| Repair changes saved | 231 | 1 | message / validation / export |

## `src/hooks/useOrderLibrary.ts`

10 ledger entries; 9 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Could not load order library. | 56 | 1 | message / validation / export |
| You must be signed in. | 83, 135 | 2 | message / validation / export |
| Could not create item. | 93 | 1 | message / validation / export |
| Library item added. | 96 | 1 | message / validation / export |
| Could not update item. | 110 | 1 | message / validation / export |
| Library item updated. | 113 | 1 | message / validation / export |
| Could not delete item. | 123 | 1 | message / validation / export |
| Library item removed. | 126 | 1 | message / validation / export |
| Image upload failed. | 146 | 1 | message / validation / export |

## `src/hooks/usePlannedMaintenance.ts`

8 ledger entries; 8 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Failed to create planned maintenance entry | 121 | 1 | message / validation / export |
| Planned maintenance entry added | 128 | 1 | message / validation / export |
| Entry changes queued to sync | 198 | 1 | message / validation / export |
| Failed to load entry | 207 | 1 | message / validation / export |
| Failed to update entry | 209 | 1 | message / validation / export |
| Entry updated | 216 | 1 | message / validation / export |
| Failed to delete entry | 228 | 1 | message / validation / export |
| Entry deleted | 229 | 1 | message / validation / export |

## `src/hooks/useRoninAI.ts`

7 ledger entries; 7 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Network error | 46 | 1 | display copy |
| Rate limit exceeded. | 47 | 1 | message / validation / export |
| AI credits exhausted. | 48 | 1 | message / validation / export |
| Ronin AI error. | 49 | 1 | message / validation / export |
| Failed to reach Ronin AI. | 83 | 1 | message / validation / export |
| Import failed. | 114 | 1 | message / validation / export |
| Import request failed. | 119 | 1 | message / validation / export |

## `src/hooks/useSchedulePublications.ts`

4 ledger entries; 4 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Failed to publish week | 50 | 1 | message / validation / export |
| Week published — now visible to staff & family | 51 | 1 | message / validation / export |
| Failed to unpublish week | 62 | 1 | message / validation / export |
| Week hidden from staff & family | 63 | 1 | message / validation / export |

## `src/hooks/useStaffSchedules.ts`

23 ledger entries; 22 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Failed to create schedule | 138 | 1 | message / validation / export |
| Recurring schedule created | 139 | 1 | message / validation / export |
| Failed to update schedule | 158, 171 | 2 | message / validation / export |
| Failed to create updated schedule | 162 | 1 | message / validation / export |
| Schedule updated — future shifts adjusted, past shifts unchanged | 163 | 1 | message / validation / export |
| Recurring schedule updated | 172 | 1 | message / validation / export |
| Failed to deactivate schedule | 183 | 1 | message / validation / export |
| Schedule deactivated — future shifts removed | 184 | 1 | message / validation / export |
| Failed to add shift | 195 | 1 | message / validation / export |
| Shift added | 196 | 1 | message / validation / export |
| Failed to update shift | 203 | 1 | message / validation / export |
| Failed to delete shift | 210 | 1 | message / validation / export |
| Shift removed | 211 | 1 | message / validation / export |
| Failed to submit leave request | 222 | 1 | message / validation / export |
| Leave request submitted | 223 | 1 | message / validation / export |
| Failed to review request | 237 | 1 | message / validation / export |
| Leave approved | 238 | 1 | message / validation / export |
| Leave rejected | 238 | 1 | message / validation / export |
| Failed to delete leave request | 245 | 1 | message / validation / export |
| Leave request removed | 246 | 1 | message / validation / export |
| Failed to update leave request | 259 | 1 | message / validation / export |
| Leave request updated | 260 | 1 | message / validation / export |

## `src/hooks/useVendors.ts`

29 ledger entries; 29 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Art | 39 | 1 | display copy |
| Catering & Events | 40 | 1 | display copy |
| Cleaning | 41 | 1 | display copy |
| Construction | 42 | 1 | display copy |
| Electrical | 43 | 1 | display copy |
| Exterminator | 44 | 1 | display copy |
| Furniture | 45 | 1 | display copy |
| Landscaping | 46 | 1 | display copy |
| Legal & Finance | 47 | 1 | display copy |
| Maintenance | 48 | 1 | display copy |
| Medical | 49 | 1 | display copy |
| Security | 50 | 1 | display copy |
| Services | 51 | 1 | display copy |
| Tech & AV | 52 | 1 | display copy |
| Transport | 53 | 1 | display copy |
| Other | 54 | 1 | display copy |
| Failed to load vendors | 91 | 1 | message / validation / export |
| Failed to create vendor | 104 | 1 | message / validation / export |
| Vendor added | 105 | 1 | message / validation / export |
| Failed to update vendor | 112 | 1 | message / validation / export |
| Vendor updated | 113 | 1 | message / validation / export |
| Failed to delete vendor | 120 | 1 | message / validation / export |
| Vendor deleted | 121 | 1 | message / validation / export |
| Failed to add contact | 128 | 1 | message / validation / export |
| Contact added | 129 | 1 | message / validation / export |
| Failed to update contact | 136 | 1 | message / validation / export |
| Contact updated | 137 | 1 | message / validation / export |
| Failed to delete contact | 144 | 1 | message / validation / export |
| Contact removed | 145 | 1 | message / validation / export |

## `src/lib/notificationDetail.ts`

2 ledger entries; 2 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| task | 5 | 1 | display-array candidate; check consumer/reachability |
| birthday | 5 | 1 | display-array candidate; check consumer/reachability |

## `src/main.tsx`

4 ledger entries; 4 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| /sw.js | 36 | 1 | message / validation / export |
| updatefound | 50 | 1 | message / validation / export |
| visibilitychange | 62 | 1 | message / validation / export |
| [SW] registration failed: | 72 | 1 | message / validation / export |

## `src/pages/AuthPage.tsx`

27 ledger entries; 24 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Account created! | 40 | 1 | display copy |
| Please check your email to confirm your account. | 41 | 1 | display copy |
| Something went wrong | 54 | 1 | message / validation / export |
| Property Management | 68 | 1 | visible text |
| Check your inbox | 78 | 1 | visible text |
| We've sent a password reset link to | 80 | 1 | visible text |
| Back to sign in | 86, 103 | 2 | visible text |
| Reset password | 91 | 1 | visible text |
| Enter your email and we'll send a reset link. | 92 | 1 | visible text |
| Sending… | 99 | 1 | rendered expression |
| Send reset link | 99 | 1 | rendered expression |
| Welcome back | 110 | 1 | rendered expression |
| Create account | 110, 139 | 2 | rendered expression |
| Sign in to your Ronin account. | 113 | 1 | rendered expression |
| Sign up to get started. | 113 | 1 | rendered expression |
| Full name | 119 | 1 | visible text |
| Your name | 120 | 1 | accessibility / placeholder |
| Password | 129 | 1 | visible text |
| Forgot password? | 132 | 1 | visible text |
| Please wait… | 139 | 1 | rendered expression |
| Sign in | 139, 150 | 2 | rendered expression, visible text |
| Don't have an account? | 145 | 1 | visible text |
| Sign up | 146 | 1 | visible text |
| Already have an account? | 149 | 1 | visible text |

## `src/pages/NotFound.tsx`

2 ledger entries; 2 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Oops! Page not found | 15 | 1 | visible text |
| Return to Home | 17 | 1 | visible text |

## `src/pages/ResetPassword.tsx`

17 ledger entries; 17 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Passwords don't match | 49 | 1 | display copy |
| Password too short | 53 | 1 | display copy |
| Use at least 8 characters. | 53 | 1 | display copy |
| Password set! | 75 | 1 | visible text |
| Your account is ready. You can now sign in. | 76 | 1 | visible text |
| Open Ronin | 77 | 1 | visible text |
| Verifying your invite link… | 82 | 1 | visible text |
| Link expired or invalid | 87 | 1 | visible text |
| This invite link has expired or already been used. Ask your admin to resend the invitation. | 89 | 1 | visible text |
| Go to Sign In | 92 | 1 | visible text |
| Set your password | 97 | 1 | visible text |
| Choose a strong password to complete your account setup. | 98 | 1 | visible text |
| Password | 101 | 1 | visible text |
| Min. 8 characters | 108 | 1 | accessibility / placeholder |
| Confirm password | 113 | 1 | visible text |
| Setting password… | 124 | 1 | rendered expression |
| Set Password & Continue | 124 | 1 | rendered expression |

## `src/pages/SharedStaffSchedule.tsx`

17 ledger entries; 17 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Couldn't load | 93 | 1 | message / validation / export |
| Shared staff schedule | 173 | 1 | visible text |
| Editable range: | 187 | 1 | visible text |
| No shifts scheduled this week. | 192 | 1 | visible text |
| Shift removed | 341 | 1 | message / validation / export |
| Shift saved | 341 | 1 | message / validation / export |
| Couldn't save | 344 | 1 | message / validation / export |
| Edit shift | 369 | 1 | rendered expression |
| Override recurring shift | 369 | 1 | rendered expression |
| Add shift | 369 | 1 | rendered expression |
| Start | 377 | 1 | visible text |
| End | 381 | 1 | visible text |
| Property | 386 | 1 | visible text |
| No property | 390 | 1 | visible text |
| Notes | 398 | 1 | visible text |
| Cancel | 413 | 1 | visible text |
| Save | 415 | 1 | rendered expression |

## `src/pages/SharedTimeline.tsx`

2 ledger entries; 2 distinct strings/templates. Priority P1/P2 — admin/secondary/supporting; see surface.

| Exact source string/template | Line(s) | Count | Classification / exposure |
|---|---|---:|---|
| Invalid share link | 11 | 1 | visible text |
| The link you opened is missing or malformed. | 12 | 1 | visible text |

# Appendix B — glossary / Spanish quality matching sites

Whole-source matching ledger of original strings; use §2 for editorial judgment. English counterpart strings and internal text can match; occurrence does not itself prove defective Spanish. This is not a complete list of every possible awkward runtime sentence.

| File:line | Exact matching text |
|---|---|
| `src/components/sections/Dashboard.tsx:82` | Propiedades |
| `src/components/sections/Dashboard.tsx:103` | Importación Maestra |
| `src/components/sections/Dashboard.tsx:266` | principal_user_id |
| `src/components/sections/Dashboard.tsx:310` | principal |
| `src/components/sections/Dashboard.tsx:319` | Principal |
| `src/components/sections/Dashboard.tsx:611` | activa(s) |
| `src/components/sections/Dashboard.tsx:623` | principal-location |
| `src/components/sections/Dashboard.tsx:629` | Ubicación del principal no disponible |
| `src/components/sections/Dashboard.tsx:629` | Principal location unknown |
| `src/components/sections/Dashboard.tsx:650` | principal-location |
| `src/components/orders/requests/RequestForms.tsx:20` | No se pudo guardar. Comprueba tu conexión y vuelve a intentarlo; tu solicitud sigue aquí. |
| `src/components/orders/requests/RequestForms.tsx:58` | Enviado. La PA tiene tu solicitud. |
| `src/components/orders/requests/RequestForms.tsx:58` | Sent. The PA has your request. |
| `src/components/orders/requests/RequestForms.tsx:65` | Repetir foto |
| `src/components/orders/requests/RequestForms.tsx:65` | Toca para hacer una foto |
| `src/components/orders/requests/RequesterOrders.tsx:57` | Enviado. La PA tiene tu lista. |
| `src/components/orders/requests/RequesterOrders.tsx:57` | Sent. The PA has your list. |
| `src/components/orders/requests/RequesterOrders.tsx:57` | No se pudo enviar. Tu lista sigue aquí. Comprueba tu conexión y reintenta. |
| `src/components/orders/requests/RequesterOrders.tsx:78` | Prepara tu lista y pulsa Enviar lista. La PA solo la verá cuando la envíes. |
| `src/components/orders/requests/RequesterOrders.tsx:78` | Build your list, then press Send list. The PA only sees it once you send it. |
| `src/components/orders/requests/RequesterOrders.tsx:80` | Enviado a la PA |
| `src/components/orders/requests/RequesterOrders.tsx:80` | Sent to the PA |
| `src/components/orders/NewOrderModal.tsx:108` | Propiedad |
| `src/components/orders/NewOrderModal.tsx:112` | Sin propiedad |
| `src/components/orders/OrderDetailModal.tsx:241` | Lista de empaque |
| `src/components/orders/PropertyShoppingLists.tsx:65` | Propiedad |
| `src/components/orders/PropertyShoppingLists.tsx:66` | Todas las propiedades |
| `src/components/orders/PropertyShoppingLists.tsx:76` | No hay listas para esta propiedad. |
| `src/components/orders/PropertyShoppingLists.tsx:82` | Propiedad |
| `src/components/orders/PropertyShoppingLists.tsx:82` | Selecciona una propiedad |
| `src/components/orders/ShoppingList.tsx:173` | Lista de compras |
| `src/components/orders/library/LibraryItemFormModal.tsx:354` | Propiedades |
| `src/components/orders/library/LibraryItemFormModal.tsx:358` | Vacío = disponible en todas las propiedades. |
| `src/components/orders/library/LibraryItemFormModal.tsx:373` | Todas las propiedades |
| `src/components/orders/library/OrderLibraryTab.tsx:265` | Todas las propiedades |
| `src/components/orders/library/OrderLibraryTab.tsx:269` | Todas las propiedades |
| `src/components/sections/OrdersSection.tsx:661` | Lista de compras |
| `src/components/checklists/OrderListDetailPage.tsx:153` | Lista de pedido |
| `src/components/tasks/FamilyTasksView.tsx:31` | Completado |
| `src/components/tasks/FamilyTasksView.tsx:235` | Propiedad |
| `src/components/tasks/FamilyTasksView.tsx:346` | Propiedad |
| `src/components/tasks/TaskCard.tsx:41` | En Progreso |
| `src/components/tasks/TaskCard.tsx:42` | Completado |
| `src/components/tasks/TaskModal.tsx:63` | principal |
| `src/components/tasks/TaskModal.tsx:563` | Lista de empaque |
| `src/components/tasks/TaskModal.tsx:625` | Marcar Completado |
| `src/components/tasks/TaskModal.tsx:762` | Propiedad |
| `src/components/tasks/TaskModal.tsx:769` | Sin propiedad específica |
| `src/components/sections/ChecklistsSection.tsx:25` | Listas de Equipaje |
| `src/components/sections/ChecklistsSection.tsx:131` | Selecciona una propiedad… |
| `src/hooks/useChecklists.ts:82` | principal |
| `src/components/maintenance/IssueDetailDrawer.tsx:29` | En Investigación |
| `src/components/maintenance/IssueDetailDrawer.tsx:31` | Programado/En Progreso |
| `src/components/maintenance/IssueModal.tsx:47` | En Investigación |
| `src/components/maintenance/IssueModal.tsx:49` | Programado/En Progreso |
| `src/components/maintenance/IssueModal.tsx:369` | ej. Cocina, Baño principal |
| `src/components/maintenance/PlannedMaintenanceDetail.tsx:28` | Por reservar |
| `src/components/maintenance/PlannedMaintenanceDetail.tsx:28` | Reservado |
| `src/components/maintenance/PlannedMaintenanceDetail.tsx:28` | Completado |
| `src/components/maintenance/PlannedMaintenanceDetail.tsx:41` | Propiedad |
| `src/components/sections/MaintenanceSection.tsx:230` | En Investigación |
| `src/components/sections/MaintenanceSection.tsx:232` | Programado/En Progreso |
| `src/components/sections/MaintenanceSection.tsx:940` | Propiedad |
| `src/components/messaging/AddressBook.tsx:63` | principal |
| `src/components/sections/PropertySection.tsx:528` | principal |
| `src/components/NotificationRecordDialog.tsx:47` | Completado |
| `src/components/NotificationRecordDialog.tsx:78` | Propiedad |
| `src/components/NotificationRecordDialog.tsx:82` | Propiedad |
| `src/components/sections/CareGuideDetailPage.tsx:57` | principal |
| `src/components/sections/ManualsSection.tsx:176` | Guías universales de cuidado de superficies para todas las propiedades. |
| `src/components/sections/MasterImportSection.tsx:78` | Importación Maestra |
| `src/components/sections/MasterImportSection.tsx:87` | Sube un CSV con tareas. Ronin AI identificará la propiedad, categoría y urgencia, luego poblará la tabla de tareas y publicará un resumen en el chat. |
| `src/components/sections/MasterImportSection.tsx:95` | Propiedad (opcional) |
| `src/components/sections/MeetTeamSection.tsx:213` | principal |
| `src/components/sections/MeetTeamSection.tsx:217` | Familia Principal |
| `src/components/sections/MeetTeamSection.tsx:218` | Familia Extendida |
| `src/components/sections/MeetTeamSection.tsx:636` | Propiedades Asignadas |
| `src/components/sections/MemorySection.tsx:36` | Principal Preference |
| `src/components/sections/MemorySection.tsx:36` | Preferencia del Principal |
| `src/components/sections/MemorySection.tsx:37` | SOP de Propiedad |
| `src/components/sections/MemorySection.tsx:298` | Ej: El Principal prefiere habitaciones frías |
| `src/components/sections/MemorySection.tsx:298` | e.g. Principal prefers cool rooms at night |
| `src/components/sections/MemorySection.tsx:341` | Propiedad |
| `src/components/sections/MemorySection.tsx:370` | comida, alergia, principal |
| `src/components/sections/MemorySection.tsx:370` | food, allergy, principal |
| `src/components/sections/RulesSection.tsx:39` | principal |
| `src/components/sections/RulesSection.tsx:504` | Reglas de la Propiedad |
| `src/components/sections/StaffSchedulingSection.tsx:28` | principal |
| `src/components/team/AccessCheckPage.tsx:67` | Administradora principal |
| `src/components/team/MemberEditDrawer.tsx:35` | Administrador principal |
| `src/components/team/MemberEditDrawer.tsx:97` | principal_user_id |
| `src/components/team/MemberEditDrawer.tsx:466` | principal |
| `src/components/team/MemberEditDrawer.tsx:468` | Principal (shown as main location on home screen) |
| `src/components/team/MemberEditDrawer.tsx:468` | Principal (ubicación principal en inicio) |
| `src/components/team/MemberEditDrawer.tsx:469` | Principal |
| `src/components/team/MemberEditDrawer.tsx:473` | principal_user_id |
| `src/components/team/MemberEditDrawer.tsx:474` | principal_user_id |
| `src/components/team/MemberEditDrawer.tsx:527` | Se paga por TriNet. Aquí no se genera hoja de horas. |
| `src/components/team/MemberEditDrawer.tsx:541` | Cada día que fichan entrada y salida se paga completo. Las horas se siguen registrando. |
| `src/components/team/MemberEditDrawer.tsx:669` | Les permite fichar en la casa desde su teléfono. Desactívalo si sus horas se registran en TriNet. |
| `src/components/team/MemberEditDrawer.tsx:671` | Aún no hay tarifa. Añádela en la pestaña Contrato antes de emitir su hoja de horas. |
| `src/components/team/MemberEditDrawer.tsx:707` | Fichar (añadido por el interruptor de fichaje) |
| `src/components/team/accessCheckLogic.ts:39` | Listas de verificación |
| `src/components/team/memberAccess.ts:13` | principal-location |
| `src/components/team/teamConstants.ts:4` | principal |
| `src/components/team/teamConstants.ts:6` | principal |
| `src/components/team/teamConstants.ts:59` | principal-location |
| `src/components/team/teamConstants.ts:59` |    ↳ Principal Location |
| `src/components/team/teamConstants.ts:59` |    ↳ Ubicación del Principal |
| `src/components/team/teamConstants.ts:61` | Propiedad |
| `src/components/team/teamConstants.ts:98` | Propiedades |
| `src/components/team/teamConstants.ts:119` | Importación Maestra |
| `src/components/team/teamConstants.ts:124` | principal |
| `src/components/team/teamConstants.ts:124` | Familia Principal |
| `src/components/team/teamConstants.ts:125` | Familia Extendida |
| `src/components/team/teamConstants.ts:133` | principal |
| `src/components/team/teamConstants.ts:134` | principal |
| `src/components/timesheets/TimesheetDetail.tsx:366` | Después puedes emitir la hoja de horas |
| `src/components/timesheets/TimesheetDetail.tsx:369` | Emitir hoja de horas |
| `src/components/timesheets/TimesheetDetail.tsx:516` | Emitir hoja de horas |
| `src/components/timesheets/TimesheetDetail.tsx:519` | Reabrir hoja de horas |
| `src/contexts/PermissionsContext.tsx:4` | principal |
| `src/contexts/PermissionsContext.tsx:6` | principal |
| `src/contexts/PermissionsContext.tsx:165` | principal |
| `src/lib/assignableStaff.ts:14` | principal |
| `src/lib/i18n.ts:270` | Layered calendar: principal arrivals, vendor visits, and project timelines. |
| `src/lib/i18n.ts:278` | Propiedades |
| `src/lib/i18n.ts:303` | En Progreso |
| `src/lib/i18n.ts:304` | Completado |
| `src/lib/i18n.ts:308` | Listas de Control |
| `src/lib/i18n.ts:320` | Seleccionar Propiedad |
| `src/lib/i18n.ts:321` | Todas las Propiedades |
| `src/lib/i18n.ts:327` | Importación Maestra |
| `src/lib/i18n.ts:344` | Propiedad |
| `src/lib/i18n.ts:356` | Todas las propiedades |
| `src/lib/i18n.ts:377` | Agregar Propiedad |
| `src/lib/i18n.ts:378` | Sin propiedades asignadas. |
| `src/lib/i18n.ts:393` | Listas de |
| `src/lib/i18n.ts:395` | Listas operacionales y de actividades |
| `src/lib/i18n.ts:396` | Selecciona una propiedad |
| `src/lib/i18n.ts:397` | Elige una propiedad arriba para ver sus listas. |
| `src/lib/i18n.ts:398` | Sin listas para esta propiedad. |
| `src/lib/i18n.ts:438` | Guías de cuidado y reglas de propiedad |
| `src/lib/i18n.ts:439` | Cuidados |
| `src/lib/i18n.ts:444` | Seleccionar propiedad |
| `src/lib/i18n.ts:476` | Las reglas activas de las propiedades aparecerán aquí |
| `src/lib/i18n.ts:537` | Calendario con llegadas del principal, visitas de proveedores y cronogramas de proyectos. |
| `src/lib/i18n.ts:538` | Proveedores de confianza, contratistas y contactos de emergencia para cada propiedad. |
| `src/lib/i18n.ts:539` | Rastrea vehículos, arte, electrodomésticos y tecnología en todas las propiedades con códigos QR. |
| `src/lib/i18n.ts:541` | Listas de equipaje, itinerarios y preparación de propiedades para próximos viajes. |

# Appendix C — date/time/number formatter call-site ledger

All discovered formatting calls, including correct locale branches and neutral plain-date keys. Do not mass-replace these: preserve DATE keys, house-time clock/roster presentation and immutable snapshot semantics.

| File:line | Exact formatter expression |
|---|---|
| `src/components/sections/Dashboard.tsx:125` | new Date().toLocaleDateString(language === "es" ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric", }) |
| `src/components/sections/Dashboard.tsx:718` | new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) |
| `src/components/sections/Dashboard.tsx:826` | new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) |
| `src/components/orders/requests/RequestsQueue.tsx:36` | new Date(batchRows[0].sent_at ?? batchRows[0].created_at).toLocaleString(es?'es-ES':'en-US',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}) |
| `src/components/orders/requests/RequestsQueue.tsx:39` | new Date(r.created_at).toLocaleString(es?'es-ES':'en-US',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}) |
| `src/components/orders/requests/logic.ts:76` | plainDateToLocal(date).toLocaleDateString(es ? 'es-ES' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }) |
| `src/components/orders/OrderDetailModal.tsx:160` | new Date(order.delivered_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) |
| `src/components/orders/OrderDetailModal.tsx:266` | new Date(order.expected_delivery).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) |
| `src/components/orders/library/libraryExportPDF.ts:152` | format(new Date(), "dd MMM yyyy, HH:mm") |
| `src/components/orders/library/libraryExportPDF.ts:334` | format(new Date(), "yyyy-MM-dd-HHmm") |
| `src/components/sections/OrdersSection.tsx:128` | deliveryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) |
| `src/components/sections/OrdersSection.tsx:243` | deliveredAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) |
| `src/components/sections/OrdersSection.tsx:349` | deliveryDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) |
| `src/components/sections/OrdersSection.tsx:437` | deliveredAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) |
| `src/components/tasks/DraftTasksWidget.tsx:130` | plainDateToLocal(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) |
| `src/components/tasks/FamilyTasksView.tsx:300` | plainDateToLocal(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) |
| `src/components/tasks/TaskCard.tsx:95` | plainDateToLocal(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) |
| `src/components/tasks/TaskModal.tsx:343` | new Date(&#96;${expectedDelivery.slice(0, 10)}T12:00:00&#96;).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) |
| `src/components/tasks/TaskModal.tsx:450` | plainDateToLocal(task.due_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) |
| `src/components/checklists/ChecklistCompletionTable.tsx:325` | format(parseISO(r.completion_date), "d MMM yyyy") |
| `src/components/checklists/ChecklistSubmissionsArchive.tsx:143` | new Date(r.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) |
| `src/components/checklists/ChecklistSubmissionsArchive.tsx:187` | new Date(detail.submitted_at).toLocaleString() |
| `src/components/sections/ChecklistDetailPage.tsx:274` | new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }) |
| `src/components/sections/ChecklistDetailPage.tsx:315` | new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) |
| `src/components/sections/ChecklistDetailPage.tsx:316` | items.map(item => { const done = completedIds.has(item.id); const session = sessionMap.get(item.id); const timeStr = session?.completed_at ? new Date(session.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""; return &#96;<tr><td>${done ? "☑" : "☐"}</td><td>${item.icon} ${item.title}${item.is_required ? " *" : ""}</td><td>${timeStr}</td></tr>&#96;; }).join("") |
| `src/components/sections/ChecklistDetailPage.tsx:319` | new Date(session.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) |
| `src/components/sections/ChecklistDetailPage.tsx:693` | (() => { const sectionList = template.sections ?? []; const groupKeys = [...sectionList, ...Array.from(new Set(items.map(i => i.section).filter((s): s is string => !!s && !sectionList.includes(s)))), null as unknown as string]; return groupKeys.map((group, gIdx) => { const groupItems = items.filter(i => (group === null ? !i.section : i.section === group)); if (groupItems.length === 0) return null; return ( <div key={group ?? "__ungrouped__"} className="mb-4"> {group && ( <TranslatedSectionHeader label={group} language={language} /> )} <div className="bg-card border border-border rounded-xl mx-4 overflow-hidden"> {groupItems.map((item, idx) => { const session = sessionMap.get(item.id); const completedAt = session?.completed_at ? new Date(session.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null; return ( <div key={item.id} className={idx > 0 ? "border-t border-border" : ""}> <SortableChecklistItem item={item} isCompleted={completedIds.has(item.id)} isAdmin={!!isAdmin} onToggle={() => toggle(item.id, completedIds.has(item.id))} onUpdate={handleUpdate} onDelete={handleDelete} onPhotoUpload={handlePhotoUpload} /> {isAdmin && (template.sections ?? []).length > 0 && ( <div className="px-12 pb-2"> <ItemSectionPicker item={item} sections={template.sections ?? []} onChange={async (next) => { await supabase.from("checklist_items").update({ section: next }).eq("id", item.id); setItems(prev => prev.map(i => i.id === item.id ? { ...i, section: next } : i)); }} /> </div> )} {completedAt && <p className="px-12 pb-1.5 text-[0.625rem] text-[hsl(var(--status-done))] opacity-70">✓ {completedAt}</p>} </div> ); })} </div> </div> ); }); })() |
| `src/components/sections/ChecklistDetailPage.tsx:708` | new Date(session.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) |
| `src/components/sections/ChecklistDetailPage.tsx:881` | new Date(c.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) |
| `src/components/maintenance/IssueCard.tsx:154` | format(plainDateToLocal(issue.scheduled_date), "MMM d, yyyy") |
| `src/components/maintenance/IssueCard.tsx:200` | format(plainDateToLocal(issue.scheduled_date), "MMM d, yyyy") |
| `src/components/maintenance/IssueDetailDrawer.tsx:166` | format(plainDateToLocal(issue.scheduled_date), "MMM d, yyyy") |
| `src/components/maintenance/IssueDetailDrawer.tsx:174` | format(new Date(issue.resolved_at), "MMM d, yyyy") |
| `src/components/maintenance/IssueDetailDrawer.tsx:236` | format(scheduledDate, "EEEE, MMM d, yyyy") |
| `src/components/maintenance/PlannedMaintenanceDetail.tsx:11` | date.toLocaleString(language === "es" ? "es" : "en-US", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "numeric" as const, minute: "2-digit" as const } : {}), }) |
| `src/components/maintenance/PlannedMaintenanceDetail.tsx:31` | new Date(entry.scheduled_year, entry.scheduled_month - 1, 1).toLocaleDateString(es ? "es" : "en-US", { month: "short", year: "numeric" }) |
| `src/components/maintenance/PlannedMaintenanceList.tsx:188` | format(parseISO(entry.scheduled_date), "dd MMM yyyy") |
| `src/components/maintenance/PlannedMaintenanceList.tsx:190` | format(parseISO(entry.scheduled_end_date), "dd MMM yyyy") |
| `src/components/maintenance/PlannedMaintenanceList.tsx:543` | format(parseISO(entry.last_service_date), "dd MMM yyyy") |
| `src/components/maintenance/PlannedMaintenanceModal.tsx:155` | format(specificDate, "yyyy-MM-dd") |
| `src/components/maintenance/PlannedMaintenanceModal.tsx:156` | format(specificEndDate, "yyyy-MM-dd") |
| `src/components/maintenance/PlannedMaintenanceModal.tsx:348` | format(specificDate, "PPP") |
| `src/components/maintenance/PlannedMaintenanceModal.tsx:368` | format(specificEndDate, "PPP") |
| `src/components/maintenance/plannedExportPDF.ts:54` | format(parseISO(entry.scheduled_date), "dd MMM yyyy") |
| `src/components/maintenance/plannedExportPDF.ts:56` | format(parseISO(entry.scheduled_end_date), "dd MMM yyyy") |
| `src/components/maintenance/plannedExportPDF.ts:119` | format(new Date(), "dd MMM yyyy, HH:mm") |
| `src/components/maintenance/plannedExportPDF.ts:161` | format(parseISO(e.last_service_date), "dd MMM yyyy") |
| `src/components/maintenance/plannedExportPDF.ts:252` | format(new Date(), "yyyy-MM-dd") |
| `src/components/maintenance/plannedExportPDF.ts:278` | format(parseISO(e.last_service_date), "dd MMM yyyy") |
| `src/components/maintenance/plannedExportPDF.ts:330` | format(new Date(), "yyyy-MM-dd") |
| `src/components/maintenance/repairsExportPDF.ts:247` | format(new Date(), "dd MMM yyyy, HH:mm") |
| `src/components/maintenance/repairsExportPDF.ts:260` | format(parseISO(ctx.sinceTimestamp), "dd MMM yyyy") |
| `src/components/maintenance/repairsExportPDF.ts:320` | format(parseISO(i.created_at), "dd MMM yyyy") |
| `src/components/maintenance/repairsExportPDF.ts:322` | format(parseISO(i.resolved_at), "dd MMM yyyy") |
| `src/components/maintenance/repairsExportPDF.ts:324` | format(plainDateToLocal(i.scheduled_date), "dd MMM yyyy") |
| `src/components/maintenance/repairsExportPDF.ts:663` | format(parseISO(issue.created_at), "dd MMM yyyy") |
| `src/components/maintenance/repairsExportPDF.ts:666` | format(parseISO(issue.resolved_at), "dd MMM yyyy") |
| `src/components/maintenance/repairsExportPDF.ts:668` | format(plainDateToLocal(issue.scheduled_date), "dd MMM yyyy") |
| `src/components/maintenance/repairsExportPDF.ts:784` | format(new Date(), "dd MMM yyyy") |
| `src/components/sections/MaintenanceSection.tsx:997` | format(new Date(issue.created_at), "dd/MM/yy") |
| `src/components/sections/MaintenanceSection.tsx:1070` | format(parseISO(lastFamilyReportAt), "dd MMM yyyy, HH:mm") |
| `src/components/sections/MaintenanceSection.tsx:1100` | format(parseISO(lastFamilyReportAt), "dd MMM yyyy, HH:mm") |
| `src/components/sections/MaintenanceSection.tsx:1125` | format(parseISO(iso), "dd MMM yyyy") |
| `src/components/calendar/StaffCalendarTab.tsx:471` | format(rangeStart, "MMM yyyy") |
| `src/components/calendar/StaffCalendarTab.tsx:471` | format(rangeEnd, "MMM yyyy") |
| `src/components/calendar/StaffCalendarTab.tsx:472` | format(rangeStart, "MMMM yyyy") |
| `src/components/calendar/StaffCalendarTab.tsx:473` | format(weekStart, "MMM d") |
| `src/components/calendar/StaffCalendarTab.tsx:473` | format(endOfWeek(weekStart, { weekStartsOn: 1 }), "MMM d, yyyy") |
| `src/components/calendar/StaffCalendarTab.tsx:475` | format(rangeStart, "yyyy-MM") |
| `src/components/calendar/StaffCalendarTab.tsx:475` | format(new Date(), "yyyy-MM") |
| `src/components/calendar/StaffCalendarTab.tsx:531` | format(opts.rangeStart, "yyyy-MM-dd") |
| `src/components/calendar/StaffCalendarTab.tsx:532` | format(opts.rangeEnd, "yyyy-MM-dd") |
| `src/components/calendar/StaffCalendarTab.tsx:700` | format(mStart, "MMMM yyyy") |
| `src/components/calendar/staff/CalculatorPanel.tsx:32` | stats.hoursWorked.toFixed(1) |
| `src/components/calendar/staff/CalculatorPanel.tsx:32` | stats.hoursExpected.toFixed(0) |
| `src/components/calendar/staff/CalendarToolbar.tsx:110` | format(rangeStart!, "d MMM yyyy") |
| `src/components/calendar/staff/CalendarToolbar.tsx:128` | format(rangeEnd!, "d MMM yyyy") |
| `src/components/calendar/staff/FamilyOverlayBand.tsx:44` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/LeaveModal.tsx:40` | format(new Date(), "yyyy-MM-dd") |
| `src/components/calendar/staff/LeavePanel.tsx:25` | format(new Date(), "yyyy-MM-dd") |
| `src/components/calendar/staff/MobileStaffWeek.tsx:38` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/MobileStaffWeek.tsx:49` | format(day, "EEE d MMM") |
| `src/components/calendar/staff/MobileStaffWeek.tsx:57` | format(day, "EEEEE") |
| `src/components/calendar/staff/MobileStaffWeek.tsx:58` | format(day, "d") |
| `src/components/calendar/staff/MobileStaffWeek.tsx:80` | format(day, "EEE") |
| `src/components/calendar/staff/MobileStaffWeek.tsx:80` | format(day, "d MMM") |
| `src/components/calendar/staff/MobileStaffWeek.tsx:100` | format(day, "EEE d MMM") |
| `src/components/calendar/staff/MobileStaffWeek.tsx:114` | format(new Date(&#96;${selected.shift_date}T12:00:00&#96;), "EEE d MMM yyyy") |
| `src/components/calendar/staff/PdfExportModal.tsx:90` | format(start, "d MMM yyyy") |
| `src/components/calendar/staff/PdfExportModal.tsx:102` | format(end, "d MMM yyyy") |
| `src/components/calendar/staff/ScheduleManagerDrawer.tsx:85` | format(new Date(), "yyyy-MM-dd") |
| `src/components/calendar/staff/ShareWeekDialog.tsx:39` | format(weekStart, "yyyy-MM-dd") |
| `src/components/calendar/staff/ShareWeekDialog.tsx:40` | format(addDays(weekStart, 6), "yyyy-MM-dd") |
| `src/components/calendar/staff/ShareWeekDialog.tsx:46` | format(weekStart, "yyyy-MM-dd") |
| `src/components/calendar/staff/ShareWeekDialog.tsx:47` | format(addDays(weekStart, 6), "yyyy-MM-dd") |
| `src/components/calendar/staff/ShareWeekDialog.tsx:110` | format(start, "d MMM") |
| `src/components/calendar/staff/ShareWeekDialog.tsx:110` | format(end, "d MMM yyyy") |
| `src/components/calendar/staff/ShiftModal.tsx:57` | format(new Date(), "yyyy-MM-dd") |
| `src/components/calendar/staff/ShiftModal.tsx:58` | format(new Date(), "yyyy-MM-dd") |
| `src/components/calendar/staff/ShiftModal.tsx:61` | format(new Date(), "yyyy-MM-dd") |
| `src/components/calendar/staff/ShiftModal.tsx:83` | format(new Date(), "yyyy-MM-dd") |
| `src/components/calendar/staff/ShiftModal.tsx:84` | format(new Date(), "yyyy-MM-dd") |
| `src/components/calendar/staff/ShiftModal.tsx:86` | format(new Date(), "yyyy-MM-dd") |
| `src/components/calendar/staff/ShiftModal.tsx:180` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/StaffDaysSummary.tsx:33` | format(rangeStart, "yyyy-MM-dd") |
| `src/components/calendar/staff/StaffDaysSummary.tsx:34` | format(rangeEnd, "yyyy-MM-dd") |
| `src/components/calendar/staff/StaffDaysSummary.tsx:78` | format(rangeStart, "MMM d") |
| `src/components/calendar/staff/StaffDaysSummary.tsx:78` | format(rangeEnd, "MMM d, yyyy") |
| `src/components/calendar/staff/StaffDaysSummary.tsx:135` | r.hoursWorked.toFixed(1) |
| `src/components/calendar/staff/StaffMonthGrid.tsx:90` | format(monthStart, "MMMM yyyy") |
| `src/components/calendar/staff/StaffMonthGrid.tsx:108` | format(day, "EEE") |
| `src/components/calendar/staff/StaffMonthGrid.tsx:114` | format(day, "d") |
| `src/components/calendar/staff/StaffMonthGrid.tsx:151` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/StaffWeekGrid.tsx:69` | format(day, "EEE") |
| `src/components/calendar/staff/StaffWeekGrid.tsx:75` | format(day, "d") |
| `src/components/calendar/staff/StaffWeekGrid.tsx:159` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/exportUtils.ts:45` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/exportUtils.ts:47` | format(day, "EEE d/M") |
| `src/components/calendar/staff/exportUtils.ts:72` | format(d, "EEE d/M") |
| `src/components/calendar/staff/exportUtils.ts:86` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/exportUtils.ts:102` | format(weekStart, "yyyy-MM-dd") |
| `src/components/calendar/staff/exportUtils.ts:127` | format(d, "EEE d/M") |
| `src/components/calendar/staff/exportUtils.ts:199` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/exportUtils.ts:237` | format(weekStart, "yyyy-MM-dd") |
| `src/components/calendar/staff/leaveMath.ts:12` | format(date, "yyyy-MM-dd") |
| `src/components/calendar/staff/leaveMath.ts:118` | value.toFixed(1) |
| `src/components/calendar/staff/publicHolidays.ts:19` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:176` | format(wkStart, "MMM d") |
| `src/components/calendar/staff/schedulePdfExport.ts:176` | format(wkEnd, "MMM d, yyyy") |
| `src/components/calendar/staff/schedulePdfExport.ts:183` | format(d, "EEE d/M") |
| `src/components/calendar/staff/schedulePdfExport.ts:188` | format(d, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:202` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:234` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:285` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:323` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:451` | format(mStart, "MMMM yyyy") |
| `src/components/calendar/staff/schedulePdfExport.ts:457` | format(d, "d") |
| `src/components/calendar/staff/schedulePdfExport.ts:467` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:524` | format(day, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:576` | format(rangeStart, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:577` | format(rangeEnd, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:607` | hoursWorked.toFixed(1) |
| `src/components/calendar/staff/schedulePdfExport.ts:690` | format(rangeStart, "MMM d, yyyy") |
| `src/components/calendar/staff/schedulePdfExport.ts:690` | format(rangeEnd, "MMM d, yyyy") |
| `src/components/calendar/staff/schedulePdfExport.ts:722` | format(rangeStart, "yyyy-MM-dd") |
| `src/components/calendar/staff/schedulePdfExport.ts:722` | format(rangeEnd, "yyyy-MM-dd") |
| `src/components/calendar/staff/utils.ts:54` | format(day, "yyyy-MM-dd") |
| `src/components/sections/CalendarSection.tsx:195` | format(newStart, "yyyy-MM-dd") |
| `src/components/sections/CalendarSection.tsx:391` | format(day, "d") |
| `src/components/sections/CalendarSection.tsx:787` | format(start, "EEEE, MMMM d, yyyy") |
| `src/components/sections/CalendarSection.tsx:787` | format(start, "h:mm a") |
| `src/components/sections/CalendarSection.tsx:789` | format(end, "EEEE, MMMM d, yyyy") |
| `src/components/sections/CalendarSection.tsx:789` | format(end, "h:mm a") |
| `src/components/sections/CalendarSection.tsx:964` | format(parseISO(lastSync), "MMM d, h:mm a") |
| `src/components/sections/CalendarSection.tsx:1008` | format(new Date(), "yyyy-MM-dd'T'HH:mm") |
| `src/components/sections/CalendarSection.tsx:1022` | format(parseISO(form.recurrence_end), "MMM d, yyyy") |
| `src/components/sections/CalendarSection.tsx:1189` | format(selectedDay, "MMMM d") |
| `src/components/sections/CalendarSection.tsx:1217` | format(start, "MMM") |
| `src/components/sections/CalendarSection.tsx:1218` | format(start, "d") |
| `src/components/sections/CalendarSection.tsx:1242` | format(end, "MMM d") |
| `src/components/sections/CalendarSection.tsx:1328` | format(monthStart, "yyyy-MM-dd") |
| `src/components/sections/CalendarSection.tsx:1329` | format(monthEnd, "yyyy-MM-dd") |
| `src/components/sections/CalendarSection.tsx:1684` | format(currentMonth, "MMMM yyyy") |
| `src/components/messaging/ChatInfoPanel.tsx:418` | format(new Date(m.created_at), "d MMM") |
| `src/components/messaging/ChatInfoPanel.tsx:447` | format(new Date(m.created_at), "d MMM") |
| `src/components/messaging/ChatView.tsx:380` | format(d, "yyyy-MM-dd") |
| `src/components/messaging/ChatView.tsx:392` | format(d, "d MMM yyyy", { locale: language === "es" ? es : undefined }) |
| `src/components/messaging/MessageBubble.tsx:149` | format(new Date(message.created_at), "d MMM yyyy, HH:mm:ss") |
| `src/components/messaging/MessageBubble.tsx:306` | format(new Date(message.created_at), "HH:mm") |
| `src/components/messaging/ThreadList.tsx:30` | format(date, "HH:mm") |
| `src/components/messaging/ThreadList.tsx:31` | format(date, "EEEE", { locale }) |
| `src/components/messaging/ThreadList.tsx:32` | format(date, "EEEE", { locale }) |
| `src/components/messaging/ThreadList.tsx:33` | format(date, "dd/MM") |
| `src/components/messaging/ThreadList.tsx:34` | format(date, "dd/MM/yy") |
| `src/components/sections/PropertySection.tsx:979` | new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }) .formatToParts(new Date()).find(p => p.type === "timeZoneName") |
| `src/components/sections/PropertySection.tsx:979` | new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }) .formatToParts(new Date()) |
| `src/components/sections/PropertySection.tsx:986` | new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }) .formatToParts(new Date()).find(p => p.type === "timeZoneName") |
| `src/components/sections/PropertySection.tsx:986` | new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }) .formatToParts(new Date()) |
| `src/components/sections/PropertySection.tsx:1025` | (() => { try { return new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName")?.value ?? ""; } catch { return ""; } })() |
| `src/components/sections/PropertySection.tsx:1025` | new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName") |
| `src/components/sections/PropertySection.tsx:1025` | new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()) |
| `src/components/sections/ProfileSection.tsx:334` | new Date(localBirthday + "T12:00:00").toLocaleDateString(language === "es" ? "es-MX" : "en-US", { month: "long", day: "numeric" }) |
| `src/components/NotificationsPanel.tsx:309` | new Date(n.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", }) |
| `src/lib/maintenanceNotifications.ts:51` | new Date(&#96;${current.scheduled_date}T12:00:00Z&#96;).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) |
| `src/lib/maintenanceNotifications.ts:53` | new Date(Date.UTC(current.scheduled_year, current.scheduled_month - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) |
| `src/components/EntryAcknowledgement.tsx:81` | format(new Date(current.acknowledged_at), "d MMM", { locale: es ? esLocale : undefined }) |
| `src/components/GanttChart.tsx:639` | new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) |
| `src/components/clock/ClockCard.tsx:48` | new Intl.DateTimeFormat(es?'es-US':'en-US',{timeZone:zone,hour:'numeric',minute:'2-digit'}).format(new Date(at)) |
| `src/components/clock/ClockCard.tsx:100` | format(String(lastEnd.data.clock_out)) |
| `src/components/clock/ClockCard.tsx:100` | format(String(lastEnd.data.clock_out)) |
| `src/components/clock/ClockCard.tsx:112` | format(s.open.clock_in,zones.data?.[s.open.property_id]\|\|'UTC') |
| `src/components/clock/ClockCard.tsx:113` | new Intl.DateTimeFormat(es?'es-US':'en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date(&#96;2000-01-01T${v.start_time}Z&#96;)) |
| `src/components/clock/ClockCard.tsx:113` | new Intl.DateTimeFormat(es?'es-US':'en-US',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(new Date(&#96;2000-01-01T${v.end_time}Z&#96;)) |
| `src/components/clock/clockLogic.ts:6` | new Intl.DateTimeFormat('en', { timeZone: zone \|\| 'UTC' }).format() |
| `src/components/clock/clockLogic.ts:7` | new Intl.DateTimeFormat('en-CA', { timeZone: safeTimezone(zone), year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date) |
| `src/components/sections/CarWashSection.tsx:94` | format(parseISO(nextBooking.requested_date), "MMM d") |
| `src/components/sections/CarWashSection.tsx:171` | format(addDays(new Date(), 1), "yyyy-MM-dd") |
| `src/components/sections/CarWashSection.tsx:281` | format(new Date(), "yyyy-MM-dd") |
| `src/components/sections/CarWashSection.tsx:343` | format(addDays(new Date(), 1), "yyyy-MM-dd") |
| `src/components/sections/CarWashSection.tsx:510` | format(new Date(), "yyyy-MM-dd") |
| `src/components/sections/CarWashSection.tsx:819` | format(parseISO(booking.requested_date), "EEE, MMM d") |
| `src/components/sections/CarWashSection.tsx:855` | format(weekStart, "MMM d") |
| `src/components/sections/CarWashSection.tsx:855` | format(days[6], "MMM d, yyyy") |
| `src/components/sections/CarWashSection.tsx:882` | format(day, "EEEE, MMM d") |
| `src/components/sections/CarWashSection.tsx:1014` | format(subWeeks(new Date(), 4), "yyyy-MM-dd") |
| `src/components/sections/CarWashSection.tsx:1144` | format(new Date(), "yyyy-MM-dd") |
| `src/components/team/ArchiveMember.tsx:38` | format(parseISO(d), "d MMM yyyy") |
| `src/components/team/ArchiveMember.tsx:49` | format(new Date(), "yyyy-MM-dd") |
| `src/components/team/ArchiveMember.tsx:59` | format(new Date(), "yyyy-MM-dd") |
| `src/components/team/accessCheckLogic.ts:43` | new Intl.DateTimeFormat(en ? "en-US" : "es", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date) |
| `src/components/timesheets/TimesheetDetail.tsx:303` | new Intl.NumberFormat(es ? "es" : "en-US", { style: "currency", currency, }).format(n) |
| `src/components/timesheets/TimesheetDetail.tsx:323` | new Intl.DateTimeFormat("sv-SE", { timeZone: safeZone( d.properties.find((p) => p.id === v.property_id)?.timezone, ), }).format(new Date()) |
| `src/components/timesheets/TimesheetDetail.tsx:362` | hours.toFixed(2) |
| `src/components/timesheets/TimesheetDetail.tsx:381` | new Date(active.issued_at).toLocaleDateString(es ? "es" : "en-US") |
| `src/components/timesheets/TimesheetDetail.tsx:426` | Number(s.total_hours).toFixed(2) |
| `src/components/timesheets/TimesheetDetail.tsx:427` | new Intl.NumberFormat(es ? "es" : "en-US", { style: "currency", currency: s.currency, }).format(Number(s.total_amount)) |
| `src/components/timesheets/TimesheetDetail.tsx:432` | new Date(s.issued_at).toLocaleDateString() |
| `src/components/timesheets/TimesheetDetail.tsx:459` | new Date(a.created_at).toLocaleString(es ? "es" : "en-US") |
| `src/components/timesheets/TimesheetDetail.tsx:488` | (snap?.[selectedVisit.id]?.hours ?? hoursFor(selectedVisit, rounding)).toFixed(2) |
| `src/components/timesheets/TimesheetDetail.tsx:523` | hours.toFixed(2) |
| `src/components/timesheets/TimesheetsTab.tsx:150` | Number(row.total_hours).toFixed(2) |
| `src/components/timesheets/VisitCard.tsx:7` | new Intl.DateTimeFormat(es ? "es" : "en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: long ? "long" : "short" }).format(new Date(&#96;${date}T12:00:00Z&#96;)) |
| `src/components/timesheets/VisitCard.tsx:14` | (hours ?? hoursFor(entry, rounding)).toFixed(2) |
| `src/components/timesheets/logic.ts:141` | new Intl.DateTimeFormat(es ? "es" : "en-US", { month: "long", year: "numeric", timeZone: "UTC", }).format(new Date(&#96;${period}T12:00:00Z&#96;)) |
| `src/components/timesheets/logic.ts:163` | new Intl.DateTimeFormat("en", { timeZone: zone \|\| "UTC" }).format() |
| `src/components/timesheets/logic.ts:171` | new Intl.DateTimeFormat("en-CA", { timeZone: safeZone(zone), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", }).formatToParts(new Date(instant)) |
| `src/components/timesheets/logic.ts:196` | new Intl.DateTimeFormat("en-US", { timeZone: safeZone(zone), hour: "numeric", minute: "2-digit", hour12: true, }) .format(new Date(instant)) .replace(/\s/g, "") .toLowerCase() |
| `src/components/timesheets/logic.ts:196` | new Intl.DateTimeFormat("en-US", { timeZone: safeZone(zone), hour: "numeric", minute: "2-digit", hour12: true, }) .format(new Date(instant)) .replace(/\s/g, "") |
| `src/components/timesheets/logic.ts:196` | new Intl.DateTimeFormat("en-US", { timeZone: safeZone(zone), hour: "numeric", minute: "2-digit", hour12: true, }) .format(new Date(instant)) |
| `src/components/ui/chart.tsx:212` | item.value.toLocaleString() |
| `src/hooks/useSchedulePublications.ts:9` | format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd") |
| `src/hooks/useSchedulePublications.ts:21` | format(rangeEnd, "yyyy-MM-dd") |
| `src/hooks/useStaffSchedules.ts:60` | format(weekStart, "yyyy-MM-dd") |
| `src/hooks/useStaffSchedules.ts:61` | format(weekEnd, "yyyy-MM-dd") |
| `src/hooks/useStaffSchedules.ts:62` | format(startOfYear(weekStart), "yyyy-MM-dd") |
| `src/hooks/useStaffSchedules.ts:150` | format( new Date(Date.now() - 86400000), "yyyy-MM-dd" ) |
| `src/hooks/useStaffSchedules.ts:161` | format(new Date(), "yyyy-MM-dd") |
| `src/hooks/useStaffSchedules.ts:181` | format(new Date(), "yyyy-MM-dd") |
| `src/lib/calendarTime.ts:118` | s.toLocaleDateString(locale, dateOpts) |
| `src/lib/calendarTime.ts:119` | r.end.toLocaleDateString(locale, dateOpts) |
| `src/lib/calendarTime.ts:121` | s.toLocaleString(locale, timeOpts) |
| `src/lib/calendarTime.ts:125` | e.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) |
| `src/lib/calendarTime.ts:125` | e.toLocaleString(locale, timeOpts) |
| `src/lib/calendarTime.ts:142` | Intl.DateTimeFormat().resolvedOptions() |
| `src/lib/calendarTime.ts:142` | Intl.DateTimeFormat() |
| `src/lib/calendarTime.ts:160` | new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", }).formatToParts(new Date(ms)) |
| `src/pages/SharedStaffSchedule.tsx:105` | format(addDays(parseISO(data.week_start), -7), "yyyy-MM-dd") |
| `src/pages/SharedStaffSchedule.tsx:110` | format(addDays(parseISO(data.week_start), 7), "yyyy-MM-dd") |
| `src/pages/SharedStaffSchedule.tsx:148` | format(s, "d") |
| `src/pages/SharedStaffSchedule.tsx:149` | format(s, "d MMM") |
| `src/pages/SharedStaffSchedule.tsx:149` | format(s, "d MMM yyyy") |
| `src/pages/SharedStaffSchedule.tsx:150` | format(e, "d MMM yyyy") |
| `src/pages/SharedStaffSchedule.tsx:187` | format(parseISO(data.range_start), "d MMM yyyy") |
| `src/pages/SharedStaffSchedule.tsx:187` | format(parseISO(data.range_end), "d MMM yyyy") |
| `src/pages/SharedStaffSchedule.tsx:207` | format(day, "EEE") |
| `src/pages/SharedStaffSchedule.tsx:213` | format(day, "d") |
| `src/pages/SharedStaffSchedule.tsx:242` | format(day, "yyyy-MM-dd") |
| `src/pages/SharedStaffSchedule.tsx:371` | format(parseISO(editing.shift_date), "EEE d MMM") |

## End of audit

Only this report is a deliverable. All proposed remediation remains unimplemented and requires a separate build request.
