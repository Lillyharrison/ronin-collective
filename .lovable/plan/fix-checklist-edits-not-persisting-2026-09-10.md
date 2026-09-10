# Fix checklist edits not persisting

## What will change
- Align checklist item save permissions with the people already allowed to edit checklists in the interface: master admins, admins, managers, and users granted checklist edit access.
- Make the line-item Save action wait for database confirmation before closing the editor.
- Keep the editor open and show an error if persistence fails, rather than briefly showing an unsaved change.

## Verification
- Save “DO NOT PUT IN DISHWASHER” on the Rockingham Kitchen Daily Duties item.
- Reload the checklist and confirm the text remains.
- Confirm unauthorized users still cannot edit checklist items.
