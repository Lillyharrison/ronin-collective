# Accessible text size

## What will change
- Keep the default appearance unchanged; make all existing pixel-based text sizes scale at the same proportions.
- Match iPhone Larger Text automatically, with Normal, Large and Extra large overrides on your own Profile and an admin-only setting in the member editor.
- Save to the existing `profiles.text_size` column; no database or function changes.
- Check the named phone screens at Extra large and fix wrapping, button clipping and unwanted sideways scrolling only where needed.

## Technical details
- One root `--text-scale`, applied before rendering from a local cache, then refreshed from the signed-in person's cached profile query and on focus/visibility changes.
- iOS Dynamic Type probe uses `-apple-system-body`, divides by 17 and clamps to 1–1.5. Explicit scales are 1, 1.2 and 1.4.
- Convert font-size pixels and text line heights to rem with up to four decimals, preserving icon, border and other pixel dimensions. Add a file-and-line regression guard.
- Bilingual controls, persistence/helper tests, and 390px phone checks. At large sizes, the member editor may scroll vertically to keep every field and button accessible; the default-size layout stays unchanged.

## Verification limits
- A real installed iPhone and its Larger Text setting cannot be tested here; mocked device detection and browser scale checks will cover the implementation.