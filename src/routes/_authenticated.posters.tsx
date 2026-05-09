import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { analyzePosterStyle, generatePosterImage } from "@/lib/poster.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Image as ImageIcon, Sparkles, Loader2, Upload, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/posters")({
  head: () => ({ meta: [{ title: "Poster Studio — AI Outreach Studio" }] }),
  component: PostersPage,
});

type Template = {
  id: string;
  name: string;
  source_path: string | null;
  prompt_template: string;
  style_json: Record<string, unknown>;
  created_at: string;
};

type GeneratedRow = {
  id: string;
  storage_path: string;
  prompt: string;
  created_at: string;
  lead_id: string | null;
};

type Lead = { id: string; business_name: string | null; contact_phone: string | null; website: string | null; services: string[] | null };

function PostersPage() {
  const { user } = useAuth();
  const analyzeFn = useServerFn(analyzePosterStyle);
  const genFn = useServerFn(generatePosterImage);
  const fileRef = useRef<HTMLInputElement>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [generated, setGenerated] = useState<GeneratedRow[]>([]);
  const [genUrls, setGenUrls] = useState<Record<string, string>>({});
  const [leads, setLeads] = useState<Lead[]>([]);

  const [busy, setBusy] = useState<"idle" | "uploading" | "analyzing" | "generating">("idle");
  const [name, setName] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [refPreview, setRefPreview] = useState<string | null>(null);

  const [pickedTemplate, setPickedTemplate] = useState<string | null>(null);
  const [pickedLead, setPickedLead] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    const [{ data: t }, { data: g }, { data: l }] = await Promise.all([
      supabase.from("poster_templates").select("*").order("created_at", { ascending: false }),
      supabase.from("generated_posters").select("id,storage_path,prompt,created_at,lead_id").order("created_at", { ascending: false }).limit(30),
      supabase.from("leads").select("id,business_name,contact_phone,website,services").order("created_at", { ascending: false }).limit(50),
    ]);
    setTemplates((t ?? []) as Template[]);
    setGenerated((g ?? []) as GeneratedRow[]);
    setLeads((l ?? []) as Lead[]);
    // create signed URLs for generated previews
    if (g && g.length) {
      const urls: Record<string, string> = {};
      await Promise.all(g.map(async (row) => {
        const { data } = await supabase.storage.from("posters").createSignedUrl(row.storage_path, 3600);
        if (data?.signedUrl) urls[row.id] = data.signedUrl;
      }));
      setGenUrls(urls);
    }
  }

  async function handleAnalyze(file: File) {
    if (!user) return;
    setBusy("analyzing");
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => {
        reader.onload = () => res(reader.result as string);
        reader.onerror = () => rej(new Error("read failed"));
        reader.readAsDataURL(file);
      });
      setRefPreview(dataUrl);

      // upload reference
      const path = `${user.id}/templates/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("posters").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const result = await analyzeFn({ data: { imageUrl: dataUrl } });
      setDraftPrompt(result.prompt_template);
      setName(file.name.replace(/\.[^.]+$/, ""));

      // save template
      await supabase.from("poster_templates").insert({
        user_id: user.id,
        name: file.name.replace(/\.[^.]+$/, ""),
        source_path: path,
        prompt_template: result.prompt_template,
        style_json: result.style as never,
      });
      toast.success("Style analyzed and saved");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("idle");
    }
  }

  async function handleGenerate() {
    if (!user || !pickedTemplate) return;
    const tpl = templates.find((t) => t.id === pickedTemplate);
    if (!tpl) return;
    const lead = leads.find((l) => l.id === pickedLead);
    setBusy("generating");
    setPreviewImg(null);
    try {
      const res = await genFn({
        data: {
          promptTemplate: tpl.prompt_template,
          business_name: lead?.business_name ?? undefined,
          services: lead?.services?.join(", ") ?? undefined,
          phone: lead?.contact_phone ?? undefined,
          website: lead?.website ?? undefined,
        },
      });
      setPreviewImg(res.dataUrl);

      // upload to storage
      const base64 = res.dataUrl.split(",")[1];
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const path = `${user.id}/generated/${pickedLead ?? "free"}/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from("posters").upload(path, bin, {
        upsert: true, contentType: "image/png",
      });
      if (upErr) throw upErr;
      await supabase.from("generated_posters").insert({
        user_id: user.id, lead_id: pickedLead, template_id: pickedTemplate,
        prompt: res.prompt, storage_path: path,
      });
      toast.success("Personalized poster generated");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("idle");
    }
  }

  async function deleteTemplate(id: string) {
    await supabase.from("poster_templates").delete().eq("id", id);
    await refresh();
  }

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Poster Studio</h1>
        <p className="text-muted-foreground">Upload your reference posters — AI re-creates them personalized for each lead.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload reference */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Upload className="h-4 w-4 text-primary" /> 1. Add a style template
          </div>
          {refPreview ? (
            <img src={refPreview} alt="ref" className="mb-4 max-h-64 w-full rounded-lg object-contain bg-background/40" />
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="mb-4 flex h-64 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-background/20 text-muted-foreground hover:border-primary hover:text-foreground"
            >
              <ImageIcon className="h-10 w-10" />
              <span className="text-sm">Upload one of your existing posters</span>
            </button>
          )}
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleAnalyze(e.target.files[0])}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy !== "idle"}>
            {busy === "analyzing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Choose file
          </Button>
          {draftPrompt && (
            <div className="mt-4 space-y-2">
              <Label>Generated prompt template</Label>
              <Textarea value={draftPrompt} readOnly rows={5} className="text-xs font-mono" />
              <p className="text-xs text-muted-foreground">Saved as &quot;{name}&quot;. Will be filled with each lead&apos;s details.</p>
            </div>
          )}
        </div>

        {/* Generate */}
        <div className="glass rounded-2xl p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" /> 2. Generate for a lead
          </div>
          <div className="space-y-3">
            <div>
              <Label>Template</Label>
              <select
                value={pickedTemplate ?? ""}
                onChange={(e) => setPickedTemplate(e.target.value || null)}
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              >
                <option value="">Select a template…</option>
                {templates.map((t) => <option key={t.id} value={t.id} className="bg-background">{t.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Lead (optional — uses generic placeholders if blank)</Label>
              <select
                value={pickedLead ?? ""}
                onChange={(e) => setPickedLead(e.target.value || null)}
                className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              >
                <option value="">No specific lead</option>
                {leads.map((l) => <option key={l.id} value={l.id} className="bg-background">{l.business_name ?? "Untitled"}</option>)}
              </select>
            </div>
            <Button
              onClick={handleGenerate} disabled={busy !== "idle" || !pickedTemplate}
              className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
            >
              {busy === "generating" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate poster
            </Button>
            {previewImg && (
              <img src={previewImg} alt="generated" className="mt-3 w-full rounded-lg" />
            )}
          </div>
        </div>
      </div>

      {/* Templates library */}
      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">Templates</h2>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
        {templates.map((t) => (
          <div key={t.id} className="glass rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium truncate">{t.name}</div>
              <Button size="icon" variant="ghost" onClick={() => deleteTemplate(t.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</div>
          </div>
        ))}
      </div>

      {/* Generated library */}
      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">Recently generated</h2>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {generated.length === 0 && <p className="text-sm text-muted-foreground">Nothing generated yet.</p>}
        {generated.map((g) => (
          <div key={g.id} className="glass rounded-xl overflow-hidden">
            {genUrls[g.id]
              ? <img src={genUrls[g.id]} alt="poster" className="aspect-square w-full object-cover" />
              : <div className="aspect-square w-full bg-card animate-pulse" />}
            <div className="p-2 text-xs text-muted-foreground">{new Date(g.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
