-- OPTIONAL — run manually in the Supabase SQL editor, only AFTER you have:
--   (a) signed up your own real account in the app, and
--   (b) given it the admin role:
--       INSERT INTO public.user_roles (user_id, role)
--       SELECT id, 'admin' FROM auth.users WHERE email = '<your-account-email>' ON CONFLICT DO NOTHING;
--
-- Why: the OLD migrations created a built-in admin account (god@admin.internal) whose password is
-- written in plain text in the old repo. Anyone who has seen that file can sign in as admin.
-- Do NOT run this if that GOD account is currently your only admin — you would lock yourself out.

DELETE FROM auth.users WHERE email = 'god@admin.internal';  -- cascades to its profile and role

-- Then change the admin secret code from inside the app (Admin → Reset secret code).
-- The new admin-gate function re-hashes it with salted PBKDF2 (the old one was a plain SHA-256
-- that is also visible in the old repo).
