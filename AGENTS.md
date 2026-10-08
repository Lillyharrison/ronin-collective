# Architecture rules

- Keep phone-specific weekly staff schedule rendering in MobileStaffWeek, reusing the existing schedule data and edit callbacks; this preserves desktop rendering and existing visibility permissions.