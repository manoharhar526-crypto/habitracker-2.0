-- 1. Remove all direct privileges from anonymous visitors and PUBLIC
REVOKE ALL ON public.profiles        FROM anon, PUBLIC;
REVOKE ALL ON public.user_roles      FROM anon, PUBLIC;
REVOKE ALL ON public.user_backups    FROM anon, PUBLIC;
REVOKE ALL ON public.user_sync_data  FROM anon, PUBLIC;
REVOKE ALL ON public.shared_backups  FROM anon, PUBLIC;

-- 2. Least privilege for signed-in users
REVOKE ALL ON public.profiles       FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

REVOKE ALL ON public.user_roles     FROM authenticated;
GRANT SELECT ON public.user_roles TO authenticated;

REVOKE ALL ON public.user_backups   FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_backups TO authenticated;

REVOKE ALL ON public.user_sync_data FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sync_data TO authenticated;

-- shared backups are only ever touched by the edge function (service role)
REVOKE ALL ON public.shared_backups FROM authenticated;

GRANT ALL ON public.profiles       TO service_role;
GRANT ALL ON public.user_roles     TO service_role;
GRANT ALL ON public.user_backups   TO service_role;
GRANT ALL ON public.user_sync_data TO service_role;
GRANT ALL ON public.shared_backups TO service_role;

-- 3. Scope profile policies strictly to signed-in users
DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Function privileges: internal helpers stay server-only
REVOKE ALL ON FUNCTION public.handle_new_user()            FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.update_backup_updated_at()   FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role)     FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;