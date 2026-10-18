# Merge guide — NEW app + OLD database

## What this folder is
- **App code**: everything from `new_app.zip` (all new features, widgets, Android flavors, notifications, etc.).
- **Backend connection**: the OLD Supabase project (`znkapwdqnyviudyxlofx`) from `database.zip`
  (`.env` and `supabase/config.toml`). Your old users, profiles, backups and sync data live there,
  so they are untouched — the app simply talks to that project again.
- **One new migration**: `supabase/migrations/20261018000000_new_app_compat.sql`
  (the new edge functions need a `rate_limits` table and a `user_backups.pin_lookup` column that the old DB lacks).
  It only adds things; it does not change or delete any existing rows.

## Steps (do these in order)
1. **Add the missing DB objects** to the old project — Supabase dashboard → SQL Editor → paste and run
   `supabase/migrations/20261018000000_new_app_compat.sql`.
   (Or: `npx supabase link --project-ref znkapwdqnyviudyxlofx` then `npx supabase db push`.)
2. **Deploy the new edge functions** to the old project:
   `npx supabase functions deploy admin-gate admin-manage auth-login backup-manager delete-account shared-backup`
   Keep `admin-manage` with JWT verification off (already set in `supabase/config.toml`).
3. *(Optional)* set a function secret `PIN_PEPPER` to a long random string. If you don't, the service-role key is used.
   Set it once and never change it afterwards.
4. **Build the app**: `npm install && npm run build`, then `npx cap sync android` for the APK (see `BUILD_APK.md`).

## Notes
- Old users can log in with their existing credentials. Old admin-secret hashes keep working and are
  upgraded to salted PBKDF2 the first time they're used.
- Existing PIN backups restore as before. Their `pin_lookup` stays empty, so the "is this PIN taken" check only
  knows about PINs created from now on.
- The `drizzle/` folder and `drizzle.config.ts` come from the new app's Lovable setup. They are not used
  with the old Supabase project — don't run them against it.
- **Security**: the old migrations created an admin account `god@admin.internal` with a password written in plain
  text in the repo. See `supabase/OPTIONAL_security_cleanup.sql` (read its warning first — it is not run automatically).
- Take a backup first (Supabase → Database → Backups, or `pg_dump`) before running anything on the live database.
