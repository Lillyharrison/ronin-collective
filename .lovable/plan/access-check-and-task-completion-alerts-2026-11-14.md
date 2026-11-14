# Access check and task completion alerts

## Access check
- Add a master-admin-only shield button in Meet the Team and a phone-friendly Access check page.
- Use the existing overview and visibility-report checks; show people, plain-language problems, house/section summaries, record counts and recent alerts in English and Spanish.
- Open the existing member editor on Houses for house/roster fixes; highlight suspicious alerts for alert fixes.
- Read hourly findings, dismiss only after a successful saved update, and show recently resolved findings collapsed.
- Route access-check notifications directly to this page for master admins. No sign-in as another person.

## Completion alerts
- Replace the Tasks-wide completion broadcast with the task creator plus admin/master-admin recipients, excluding the completer. Keep existing house filtering and push delivery.
- Resolve admin recipients server-side through the existing notification service so staff do not need access to the roles list.

## Technical details and verification
- No database tables, database functions, policies or triggers will change. The notification edge service may need a narrow additive recipient option and deployment.
- Cache Access check reads per signed-in user; cap findings queries and use the existing back-navigation and modal patterns.
- Add rule and screen tests, including Spanish, dismissal, notification routing and sender/admin-only audiences.
- Check the signed-in screen on a 390px phone and desktop without changing real tasks or sending real alerts. Report files, commit and any unavailable live checks.
