CREATE TABLE public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  apk_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  release_notes text,
  is_published boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_releases TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_releases TO authenticated;
GRANT ALL ON public.app_releases TO service_role;

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_app_releases_updated_at
  BEFORE UPDATE ON public.app_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_backup_updated_at();

CREATE POLICY "Anyone reads published releases" ON public.app_releases
  FOR SELECT USING (is_published);
CREATE POLICY "Admins read all releases" ON public.app_releases
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert releases" ON public.app_releases
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update releases" ON public.app_releases
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete releases" ON public.app_releases
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Signed-in users download app updates" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'app-updates');
CREATE POLICY "Admins upload app updates" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'app-updates' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins edit app updates" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'app-updates' AND public.has_role(auth.uid(), 'admin')) WITH CHECK (bucket_id = 'app-updates' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete app updates" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'app-updates' AND public.has_role(auth.uid(), 'admin'));