-- When this account first opened Lanyard from a home-screen icon, so we stop
-- showing the "add to home screen" guide in the browser.
ALTER TABLE users ADD COLUMN app_installed_at INTEGER;
