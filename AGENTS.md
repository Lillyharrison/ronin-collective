# Architecture rules

- Keep phone-specific weekly staff schedule rendering in MobileStaffWeek, reusing the existing schedule data and edit callbacks; this preserves desktop rendering and existing visibility permissions.
- Reusable property shopping lists live in Orders & Deliveries, but retain checklist_templates with kind='order_list' and order_list_items as their single data source; standard checklist queries exclude that kind to avoid duplicate workflows.
- Sending property shopping lists goes through order-list-submit to create Orders, recipient tasks and notifications server-side; Orders uses same-origin query parameters for list and order deep links so requests survive refresh and notification navigation.
