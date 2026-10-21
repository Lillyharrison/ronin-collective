# Pre-arrival order lists (checklist for staff, order for managers)

## What you'll get

**1. Build an order list (admins)**
- New list type: "Order list", created for one property (e.g. 502 Park).
- Add items by searching the Orders & Deliveries library and ticking them. The item's photo, size, default quantity and link come from the library, so fixing an item in the library updates every list using it.
- Pick one or more people to receive the order (e.g. Markus and Kelly).
- Only people assigned to that property can see the list.

**2. Housekeeper fills it in**
- Opens the list, ticks the items that are needed.
- For each ticked item: change the quantity (defaults to the library amount), add a comment, and optionally add a photo.
- Presses **Send order request**.

**3. Managers receive it**
- One **Order** is created in Orders & Deliveries for that property, listing the ticked items with quantities, comments, photos and shop links.
- A **task** ("Place order: 502 Park pre-arrival") is assigned to each chosen person, linked to the order.
- Each chosen person gets an in-app notification and phone push that opens the order.
- The housekeeper's ticks reset after sending, so the list is ready for the next visit. Past requests stay in the order history.

**4. Convert the existing 502 Park "Pre arrival shopping list"**
- I match its 18 items to library items by name. Any items with no library match get listed for you to check first. I won't delete or change the old list until you've approved the new one.

## Not changed
Normal checklists, the Shopping List, the Library screen, other orders, and other notifications stay as they are.

## Build order (one step at a time, checked before moving on)
1. Database: store the order list, its library items and recipients, plus each sent request (ticked items, quantity, comment, photo). Property-based access rules, enforced on the server.
2. Admin builder: library item picker and recipient picker.
3. Housekeeper view: tick, quantity, comment, photo, send.
4. Send step: creates the order, tasks and notifications. Sending is all-or-nothing.
5. Convert the 502 Park list and show you any items that didn't match.
6. End-to-end test as a housekeeper and as a manager.

## Technical details
- `checklist_templates.kind` gets a new value `'order_list'` (default `'standard'`, so existing lists behave the same) and `order_recipient_ids uuid[]`.
- New table `order_list_items(template_id, library_item_id, sort_order)` linking to `order_library_items`.
- New table `order_list_submissions(template_id, property_id, submitted_by, lines jsonb, order_id)`. Each line holds library_item_id, qty, comment and photo_url, and photos are saved to the existing `order-library` bucket.
- RLS uses `user_can_access_property` for select/insert. Writes are limited to admins.
- A new edge function `order-list-submit` checks the JWT and property access, then uses the service role to insert the `orders` row (using description/packing_list for lines), one `tasks` row per recipient (category 'orders'), and notifications through the existing `notifyUsers` path.
- The housekeeper's ticked items are saved as a server-side draft until sent, following the data-persistence rule.
