CREATE TABLE IF NOT EXISTS public.user_sync_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sync_data TO authenticated;
GRANT ALL ON public.user_sync_data TO service_role;

ALTER TABLE public.user_sync_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own sync"
  ON public.user_sync_data FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own sync"
  ON public.user_sync_data FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own sync"
  ON public.user_sync_data FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins delete sync"
  ON public.user_sync_data FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_user_sync_data_user_id ON public.user_sync_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sync_data_updated ON public.user_sync_data(updated_at DESC);

CREATE TRIGGER trg_user_sync_data_updated
  BEFORE UPDATE ON public.user_sync_data
  FOR EACH ROW EXECUTE FUNCTION public.update_backup_updated_at();

ALTER TABLE public.user_sync_data REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sync_data;