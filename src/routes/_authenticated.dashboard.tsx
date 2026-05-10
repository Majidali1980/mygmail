import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { extractPoster, generateEmail } from "@/lib/ai.functions";
import { generatePosterImage } from "@/lib/poster.functions";
import { sendGmail } from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Upload, Sparkles, Send, Loader2, Image as ImageIcon, Wand2, X, Eye } from "lucide-react";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";

type PosterTpl = { id: string; name: string; prompt_template: string; source_path: string | null };
type PosterFormat = "poster" | "facebook_cover";

// Note: not under _authenticated/ folder for simplicity — guard inline.
export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AI Outreach Studio" }] }),
  component: Dashboard,
});

type Extraction = {
  business_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website?: string | null;
  services?: string[] | null;
  social_links?: Record<string, string> | null;
  branding?: Record<string, string> | null;
  summary?: string | null;
};

function Dashboard() {
  const { session, user, loading } = useAuth();
  const extractFn = useServerFn(extractPoster);
  const generateFn = useServerFn(generateEmail);
  const sendFn = useServerFn(sendGmail);
  const genPosterFn = useServerFn(generatePosterImage);
  const fileRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("");
  const [step, setStep] = useState<"idle" | "extracting" | "generating" | "sending" | "poster">("idle");

  const [templates, setTemplates] = useState<PosterTpl[]>([]);
  const [pickedTemplate, setPickedTemplate] = useState<string>("");
  const [posterFormat, setPosterFormat] = useState<PosterFormat>("poster");
  const [attachments, setAttachments] = useState<{ id: string; name: string; dataBase64: string; previewUrl: string; templateName?: string; format?: PosterFormat }[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) window.location.href = "/login";
  }, [loading, session]);

  useEffect(() => {
    if (!user) return;
    supabase.from("poster_templates").select("id,name,prompt_template").order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as PosterTpl[];
        setTemplates(list);
        if (list.length && !pickedTemplate) setPickedTemplate(list[0].id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading || !session) return <div className="p-10 text-muted-foreground">Loading…</div>;

  async function handleFile(f: File) {
    if (!user) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setStep("extracting");
      try {
        // upload to storage
        const path = `${user.id}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("posters").upload(path, f, { upsert: true });
        if (upErr) throw upErr;
        setPosterPath(path);

        // extract using data URL (works without public bucket)
        const { json } = await extractFn({ data: { imageUrl: dataUrl } });
        let parsed: Extraction = {};
        try { parsed = JSON.parse(json) as Extraction; } catch { /* */ }
        setExtraction(parsed);
        setRecipient(parsed.contact_email ?? "");

        // create lead
        const { data: lead, error: leadErr } = await supabase
          .from("leads")
          .insert({
            user_id: user.id,
            business_name: parsed.business_name ?? null,
            contact_email: parsed.contact_email ?? null,
            contact_phone: parsed.contact_phone ?? null,
            website: parsed.website ?? null,
            services: parsed.services ?? null,
            social_links: parsed.social_links ?? {},
            branding: parsed.branding ?? {},
            poster_url: path,
            raw_extraction: parsed as never,
          })
          .select("id")
          .single();
        if (leadErr) throw leadErr;
        setLeadId(lead.id);
        toast.success("Poster analyzed");

        // auto-generate email
        setStep("generating");
        const { data: profile } = await supabase
          .from("profiles").select("agency_name,agency_phone,agency_email").eq("user_id", user.id).maybeSingle();
        const gen = await generateFn({
          data: {
            leadJson: JSON.stringify(parsed),
            agencyName: profile?.agency_name ?? undefined,
            agencyPhone: profile?.agency_phone ?? undefined,
            agencyEmail: profile?.agency_email ?? user.email ?? undefined,
          },
        });
        setSubject(gen.subject);
        setBody(gen.body);
        await supabase.from("generated_emails").insert({
          user_id: user.id, lead_id: lead.id, subject: gen.subject, body: gen.body,
        });
        toast.success("Email drafted");
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setStep("idle");
      }
    };
    reader.readAsDataURL(f);
  }

  async function handleRegenerate() {
    if (!extraction || !user) return;
    setStep("generating");
    try {
      const { data: profile } = await supabase
        .from("profiles").select("agency_name,agency_phone,agency_email").eq("user_id", user.id).maybeSingle();
      const gen = await generateFn({
        data: {
          leadJson: JSON.stringify(extraction),
          agencyName: profile?.agency_name ?? undefined,
          agencyPhone: profile?.agency_phone ?? undefined,
          agencyEmail: profile?.agency_email ?? user.email ?? undefined,
        },
      });
      setSubject(gen.subject);
      setBody(gen.body);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStep("idle");
    }
  }

  async function handleGeneratePoster() {
    if (!user || !extraction || !pickedTemplate) return;
    const tpl = templates.find((t) => t.id === pickedTemplate);
    if (!tpl) { toast.error("Pick a poster template first"); return; }
    setStep("poster");
    try {
      const res = await genPosterFn({
        data: {
          promptTemplate: tpl.prompt_template,
          business_name: extraction.business_name ?? undefined,
          services: extraction.services?.join(", ") ?? undefined,
          phone: extraction.contact_phone ?? undefined,
          website: extraction.website ?? undefined,
        },
      });
      // upload to storage + persist
      const base64 = res.dataUrl.split(",")[1];
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const path = `${user.id}/generated/${leadId ?? "free"}/${Date.now()}.png`;
      await supabase.storage.from("posters").upload(path, bin, { upsert: true, contentType: "image/png" });
      await supabase.from("generated_posters").insert({
        user_id: user.id, lead_id: leadId, template_id: pickedTemplate,
        prompt: res.prompt, storage_path: path,
      });
      const id = crypto.randomUUID();
      setAttachments((a) => [...a, { id, name: `poster-${a.length + 1}.png`, dataBase64: base64, previewUrl: res.dataUrl }]);
      toast.success("Personalized poster ready & attached");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStep("idle");
    }
  }

  function removeAttachment(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  async function handleSend() {
    if (!recipient || !subject || !body || !user) return;
    setStep("sending");
    try {
      const res = await sendFn({
        data: {
          to: recipient, subject, body,
          attachments: attachments.map((a) => ({ filename: a.name, mimeType: "image/png", dataBase64: a.dataBase64 })),
        },
      });
      await supabase.from("email_sends").insert({
        user_id: user.id, lead_id: leadId, recipient, subject, body,
        gmail_message_id: res.id, status: "sent",
      });
      if (leadId) {
        await supabase.from("leads").update({ status: "sent" }).eq("id", leadId);
      }
      toast.success("Email sent via Gmail");
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(msg);
      await supabase.from("email_sends").insert({
        user_id: user.id, lead_id: leadId, recipient, subject, body,
        status: "failed", error: msg,
      });
    } finally {
      setStep("idle");
    }
  }

  const busy = step !== "idle";

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Generate outreach</h1>
        <p className="text-muted-foreground">Upload a business poster — get a personalized email in seconds.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload + extraction */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Upload className="h-4 w-4 text-primary" /> Poster
          </div>
          {previewUrl ? (
            <img src={previewUrl} alt="poster" className="mb-4 max-h-72 w-full rounded-lg object-contain bg-background/40" />
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="mb-4 flex h-72 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-background/20 text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <ImageIcon className="h-10 w-10" />
              <span className="text-sm">Click to upload poster, flyer or ad</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              {previewUrl ? "Choose another" : "Choose file"}
            </Button>
            {previewUrl && (
              <Button variant="ghost" size="sm" onClick={() => { setPreviewUrl(null); setExtraction(null); setSubject(""); setBody(""); setLeadId(null); setPosterPath(null); }}>
                Reset
              </Button>
            )}
          </div>

          {step === "extracting" && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing with AI vision…
            </div>
          )}

          {extraction && (
            <div className="mt-6 space-y-2 text-sm">
              <div className="font-display text-lg font-semibold text-gradient">{extraction.business_name ?? "Unknown business"}</div>
              {extraction.contact_email && <div>📧 {extraction.contact_email}</div>}
              {extraction.contact_phone && <div>📞 {extraction.contact_phone}</div>}
              {extraction.website && <div>🌐 {extraction.website}</div>}
              {extraction.services && extraction.services.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {extraction.services.map((s) => (
                    <span key={s} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs">{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Email composer */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> AI email draft
            </div>
            {extraction && (
              <Button size="sm" variant="ghost" onClick={handleRegenerate} disabled={busy}>
                {step === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Regenerate"}
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="to">To</Label>
              <Input id="to" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="recipient@example.com" />
            </div>
            <div>
              <Label htmlFor="subj">Subject</Label>
              <Input id="subj" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="AI subject will appear here" />
            </div>
            <div>
              <Label htmlFor="body">Body</Label>
              <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} placeholder="Upload a poster to generate the email…" />
            </div>
          </div>

          {/* Personalized poster */}
          {extraction && (
            <div className="mt-4 rounded-lg border border-border/60 bg-background/30 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Wand2 className="h-3 w-3 text-primary" /> Attach AI poster for this lead
              </div>
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No templates yet — add one in <a className="underline" href="/posters">Poster Studio</a>.
                </p>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={pickedTemplate}
                    onChange={(e) => setPickedTemplate(e.target.value)}
                    className="flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                  >
                    {templates.map((t) => <option key={t.id} value={t.id} className="bg-background">{t.name}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={handleGeneratePoster} disabled={busy || !pickedTemplate}>
                    {step === "poster" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    Generate
                  </Button>
                </div>
              )}
              {attachments.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="relative">
                      <img src={a.previewUrl} alt="" className="aspect-square w-full rounded-md object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button
            onClick={handleSend}
            disabled={busy || !recipient || !subject || !body}
            className="mt-4 w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
          >
            {step === "sending" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send via Gmail
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">Sent from your connected Gmail account</p>
        </div>
      </div>
    </div>
  );
}
