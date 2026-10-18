
-- 1. Drop plaintext pin_code column
ALTER TABLE public.user_backups DROP COLUMN IF EXISTS pin_code;

-- 2. Add self-only guard to has_role (RLS callers always pass auth.uid(), so no breakage)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND _user_id = auth.uid()
  )
$$;

-- 3. Revoke execute on trigger-only / internal SECURITY DEFINER functions from anon + authenticated.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_backup_updated_at() FROM anon, authenticated, public;
