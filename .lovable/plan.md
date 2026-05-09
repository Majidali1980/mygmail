# Plan: Follow-ups + AI Personalized Poster Attachments

## 1. Follow-up scheduling

**Database (migration)**
- New table `follow_ups`: `id, user_id, lead_id, scheduled_for (timestamptz), subject, body, status ('pending'|'sent'|'failed'|'cancelled'), attachments jsonb, created_at, updated_at, sent_at, error`. RLS: owner-only CRUD.
- Index on `(status, scheduled_for)` for the cron worker.

**Cron**
- Add public route `src/routes/api/public/hooks/run-followups.ts` (POST). Validates Supabase anon `apikey` header, then uses `supabaseAdmin` to:
  - select pending follow-ups where `scheduled_for <= now()`
  - for each, call Gmail send via the same logic in `gmail.functions` (factor a shared `sendGmailRaw(userId, to, subject, body, attachments)` helper into a `gmail.server.ts`)
  - mark sent/failed, insert into `email_sends`, bump lead status to `follow_up`/`sent`
- Schedule with `pg_cron` every 5 minutes (insert tool).

**CRM UI**
- On `_authenticated.leads.tsx`: add "Schedule follow-up" action per row → opens dialog (recipient, subject, body, date/time picker, quick presets: +3d, +7d, +14d, attach posters).
- New page `_authenticated.followups.tsx`: list pending/sent follow-ups with cancel/reschedule.
- "Generate follow-up draft" button calls existing `generateEmail` server fn with a tone hint of "polite follow-up referencing previous outreach".

## 2. AI Personalized Poster Attachments

**Storage**
- Reuse `posters` bucket. New folder convention `generated/{user_id}/{lead_id}/{ts}.png`.
- Add `agency_posters` bucket (private) for user's reference/template posters.

**Server functions** (`src/lib/poster.functions.ts`)
- `analyzePosterStyle({ imageUrl })` → uses `google/gemini-2.5-flash` vision to produce a structured "style template" JSON: layout, color palette, typography, composition, CTA placement, generic prompt with `{{business_name}}`, `{{services}}`, `{{phone}}`, `{{website}}` placeholders.
- `generatePersonalizedPoster({ leadId, styleTemplateId })` →
  1. Load lead extraction + agency profile
  2. Fill placeholders into the prompt
  3. Call `google/gemini-3.1-flash-image-preview` (image gen via AI gateway) to render a poster
  4. Upload PNG to `posters/generated/...`, return signed URL + path
- Persist generated posters in new table `generated_posters (id, user_id, lead_id, template_id, prompt, storage_path, created_at)`.
- New table `poster_templates (id, user_id, name, source_path, style_json, created_at)`.

**Gmail attachments**
- Extend `sendGmail` server fn (`gmail.functions.ts`) to accept `attachments: { filename, mimeType, dataBase64 }[]` and build a multipart MIME with `multipart/mixed` containing `multipart/alternative` (text/html body) + each attachment part. Encode raw with `base64url`.
- Frontend converts selected poster storage paths → download via `supabase.storage.from('posters').download(path)` → base64 → pass to send.

**Dashboard UI**
- Add "Poster studio" panel beside email composer:
  - Tab 1: Upload reference poster → "Analyze style" → save as template
  - Tab 2: Pick template → "Generate for this lead" → preview → "Attach to email"
- Selected attachments show as chips above the Send button; included on send and on follow-up scheduling.

**New page `_authenticated.posters.tsx`**: manage templates and generated posters library; re-attach/regenerate.

## 3. Navigation
- Update `_authenticated.tsx` nav to include `Follow-ups` and `Posters`.

## Technical notes
- AI gateway image gen: POST to `https://ai.gateway.lovable.dev/v1/chat/completions` with `model: google/gemini-3.1-flash-image-preview`, parse `choices[0].message.images[0].image_url.url` (data URL) → strip prefix → upload bytes.
- All server fns use `requireSupabaseAuth` middleware where user-scoped; cron uses `supabaseAdmin`.
- Multipart MIME built manually; ensure CRLF line endings and base64url for Gmail `users.messages.send`.
- Date picker: shadcn `calendar` + `popover` (already installed) plus a native time input.

## Out of scope (confirm if needed)
- Auto-detect "no response" via inbox sync to trigger automatic follow-ups (this plan keeps it manual scheduling; user clicks "schedule follow-up"). Want auto-rules too?
