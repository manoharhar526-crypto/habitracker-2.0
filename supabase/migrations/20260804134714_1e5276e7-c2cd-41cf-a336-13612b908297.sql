-- Ensure Data API grants are explicit for shared_backups
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_backups TO authenticated;
GRANT ALL ON public.shared_backups TO service_role;
REVOKE ALL ON public.shared_backups FROM anon;

ALTER TABLE public.shared_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their shared backups" ON public.shared_backups;
CREATE POLICY "Owners can view their shared backups"
ON public.shared_backups
FOR SELECT
TO authenticated
USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Owners can create shared backups" ON public.shared_backups;
CREATE POLICY "Owners can create shared backups"
ON public.shared_backups
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Owners can update their shared backups" ON public.shared_backups;
CREATE POLICY "Owners can update their shared backups"
ON public.shared_backups
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Owners can delete their shared backups" ON public.shared_backups;
CREATE POLICY "Owners can delete their shared backups"
ON public.shared_backups
FOR DELETE
TO authenticated
USING (auth.uid() = owner_user_id);