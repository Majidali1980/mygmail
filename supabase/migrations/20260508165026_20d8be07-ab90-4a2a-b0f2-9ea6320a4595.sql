
-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  agency_name TEXT,
  agency_phone TEXT,
  agency_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.raw_user_meta_data->>'avatar_url');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- lead status enum
CREATE TYPE public.lead_status AS ENUM ('new','sent','replied','interested','follow_up','closed');

-- leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  services TEXT[],
  social_links JSONB DEFAULT '{}'::jsonb,
  branding JSONB DEFAULT '{}'::jsonb,
  poster_url TEXT,
  raw_extraction JSONB,
  status public.lead_status NOT NULL DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads own select" ON public.leads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "leads own insert" ON public.leads FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "leads own update" ON public.leads FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "leads own delete" ON public.leads FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_leads_user ON public.leads(user_id, created_at DESC);

-- generated emails (drafts)
CREATE TABLE public.generated_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  tone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.generated_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ge own all" ON public.generated_emails FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_ge_updated BEFORE UPDATE ON public.generated_emails
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- email sends
CREATE TABLE public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  gmail_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "es own select" ON public.email_sends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "es own insert" ON public.email_sends FOR INSERT WITH CHECK (auth.uid() = user_id);

-- storage
INSERT INTO storage.buckets (id, name, public) VALUES ('posters','posters', false);
CREATE POLICY "posters own read" ON storage.objects FOR SELECT
USING (bucket_id='posters' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "posters own write" ON storage.objects FOR INSERT
WITH CHECK (bucket_id='posters' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "posters own update" ON storage.objects FOR UPDATE
USING (bucket_id='posters' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "posters own delete" ON storage.objects FOR DELETE
USING (bucket_id='posters' AND auth.uid()::text = (storage.foldername(name))[1]);
