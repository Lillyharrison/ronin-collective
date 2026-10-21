# Architecture rules

- Keep phone-specific weekly staff schedule rendering in MobileStaffWeek, reusing the existing schedule data and edit callbacks; this preserves desktop rendering and existing visibility permissions.- Order lists are checklist_templates with kind='order_list' linking library items via order_list_items; sending goes through the order-list-submit edge function so one Order, recipient tasks and notifications are created server-side together.
