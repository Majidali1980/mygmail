
-- follow_ups
CREATE TYPE public.follow_up_status AS ENUM ('pending','sent','failed','cancelled');

CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid,
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status public.follow_up_status NOT NULL DEFAULT 'pending',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz,
  error text,
  gmail_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_followups_due ON public.follow_ups (status, scheduled_for);
CREATE INDEX idx_followups_user ON public.follow_ups (user_id, created_at DESC);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fu own select" ON public.follow_ups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fu own insert" ON public.follow_ups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fu own update" ON public.follow_ups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "fu own delete" ON public.follow_ups FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER followups_set_updated BEFORE UPDATE ON public.follow_ups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- poster_templates
CREATE TABLE public.poster_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  source_path text,
  style_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_template text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.poster_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pt own all" ON public.poster_templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- generated_posters
CREATE TABLE public.generated_posters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid,
  template_id uuid REFERENCES public.poster_templates(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.generated_posters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gp own all" ON public.generated_posters FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Storage RLS for posters bucket (private). Users can read/write their own folder.
CREATE POLICY "posters owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'posters' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "posters owner write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'posters' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "posters owner update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'posters' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "posters owner delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'posters' AND auth.uid()::text = (storage.foldername(name))[1]);
