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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Image as ImageIcon, Sparkles, Loader2, Upload, Trash2, Pencil, RefreshCw, Save, X, Eye, Download, Paperclip } from "lucide-react";

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
  template_id: string | null;
};

type Lead = { id: string; business_name: string | null; contact_phone: string | null; website: string | null; services: string[] | null };
type PosterFormat = "poster" | "facebook_cover";

function PostersPage() {
  const { user } = useAuth();
  const analyzeFn = useServerFn(analyzePosterStyle);
  const genFn = useServerFn(generatePosterImage);
  const fileRef = useRef<HTMLInputElement>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplUrls, setTplUrls] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<GeneratedRow[]>([]);
  const [genUrls, setGenUrls] = useState<Record<string, string>>({});
  const [leads, setLeads] = useState<Lead[]>([]);

  const [busy, setBusy] = useState<"idle" | "uploading" | "analyzing" | "generating" | "regenerating">("idle");
  const [name, setName] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [refPreview, setRefPreview] = useState<string | null>(null);

  const [pickedTemplate, setPickedTemplate] = useState<string | null>(null);
  const [pickedLead, setPickedLead] = useState<string | null>(null);
  const [posterFormat, setPosterFormat] = useState<PosterFormat>("poster");
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // edit dialog
  const [editing, setEditing] = useState<Template | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // view dialog
  const [viewing, setViewing] = useState<Template | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);

  function downloadDataUrl(dataUrl: string, filename: string) {
    const a = document.createElement("a");
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function downloadFromPath(path: string) {
    const { data, error } = await supabase.storage.from("posters").download(path);
    if (error || !data) { toast.error(error?.message ?? "Download failed"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = path.split("/").pop() ?? "poster.png";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!user) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    const [{ data: t }, { data: g }, { data: l }] = await Promise.all([
      supabase.from("poster_templates").select("*").order("created_at", { ascending: false }),
      supabase.from("generated_posters").select("id,storage_path,prompt,created_at,lead_id,template_id").order("created_at", { ascending: false }).limit(40),
      supabase.from("leads").select("id,business_name,contact_phone,website,services").order("created_at", { ascending: false }).limit(50),
    ]);
    const tList = (t ?? []) as Template[];
    const gList = (g ?? []) as GeneratedRow[];
    setTemplates(tList);
    setGenerated(gList);
    setLeads((l ?? []) as Lead[]);

    // signed URLs (templates + generated)
    const [tplMap, genMap] = await Promise.all([
      (async () => {
        const out: Record<string, string> = {};
        await Promise.all(tList.map(async (row) => {
          if (!row.source_path) return;
          const { data } = await supabase.storage.from("posters").createSignedUrl(row.source_path, 3600);
          if (data?.signedUrl) out[row.id] = data.signedUrl;
        }));
        return out;
      })(),
      (async () => {
        const out: Record<string, string> = {};
        await Promise.all(gList.map(async (row) => {
          const { data } = await supabase.storage.from("posters").createSignedUrl(row.storage_path, 3600);
          if (data?.signedUrl) out[row.id] = data.signedUrl;
        }));
        return out;
      })(),
    ]);
    setTplUrls(tplMap);
    setGenUrls(genMap);
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

      const path = `${user.id}/templates/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("posters").upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const result = await analyzeFn({ data: { imageUrl: dataUrl } });
      setDraftPrompt(result.prompt_template);
      setName(file.name.replace(/\.[^.]+$/, ""));

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
      const referenceImageUrl = tplUrls[tpl.id];
      const { data: profile } = await supabase
        .from("profiles").select("agency_email").eq("user_id", user.id).maybeSingle();
      const res = await genFn({
        data: {
          promptTemplate: tpl.prompt_template,
          business_name: lead?.business_name ?? undefined,
          services: lead?.services?.join(", ") ?? undefined,
          phone: lead?.contact_phone ?? undefined,
          website: lead?.website ?? undefined,
          agency_email: profile?.agency_email ?? user.email ?? undefined,
          format: posterFormat,
          referenceImageUrl,
        },
      });
      setPreviewImg(res.dataUrl);
      setLastPrompt(res.prompt);

      const base64 = res.dataUrl.split(",")[1];
      const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const path = `${user.id}/generated/${pickedLead ?? "free"}/${Date.now()}-${posterFormat}.png`;
      const { error: upErr } = await supabase.storage.from("posters").upload(path, bin, {
        upsert: true, contentType: "image/png",
      });
      if (upErr) throw upErr;
      await supabase.from("generated_posters").insert({
        user_id: user.id, lead_id: pickedLead, template_id: pickedTemplate,
        prompt: res.prompt, storage_path: path,
      });
      toast.success("Personalized image generated");
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

  function openEdit(t: Template) {
    setEditing(t);
    setEditName(t.name);
    setEditPrompt(t.prompt_template);
  }

  async function saveEdit() {
    if (!editing) return;
    setEditBusy(true);
    try {
      const { error } = await supabase.from("poster_templates")
        .update({ name: editName, prompt_template: editPrompt })
        .eq("id", editing.id);
      if (error) throw error;
      toast.success("Template updated");
      setEditing(null);
      await refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setEditBusy(false); }
  }

  async function regenerateFromSource() {
    if (!editing || !editing.source_path) {
      toast.error("This template has no stored source image to re-analyze.");
      return;
    }
    setEditBusy(true);
    try {
      const { data: signed } = await supabase.storage.from("posters").createSignedUrl(editing.source_path, 3600);
      if (!signed?.signedUrl) throw new Error("Failed to access source image");
      const result = await analyzeFn({ data: { imageUrl: signed.signedUrl } });
      setEditPrompt(result.prompt_template);
      // persist immediately
      await supabase.from("poster_templates").update({
        prompt_template: result.prompt_template,
        style_json: result.style as never,
      }).eq("id", editing.id);
      toast.success("Re-analyzed and regenerated style template");
      await refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setEditBusy(false); }
  }

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold">Poster Studio</h1>
        <p className="text-muted-foreground">Upload your reference posters — AI re-creates them personalized for each lead. Footer credit is auto-added.</p>
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
              <p className="text-xs text-muted-foreground">Saved as &quot;{name}&quot;. Will be filled with each lead&apos;s details + footer credit.</p>
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
              {pickedTemplate && (() => {
                const tpl = templates.find((t) => t.id === pickedTemplate);
                if (!tpl) return null;
                const styleEntries = Object.entries(tpl.style_json ?? {});
                return (
                  <div className="mt-2 rounded-md border border-border bg-background/30 p-3 text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium">Analysis details</span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setViewing(tpl)}>
                        <Eye className="h-3 w-3 mr-1" /> View full
                      </Button>
                    </div>
                    {styleEntries.length === 0 ? (
                      <p className="text-muted-foreground">No structured style data.</p>
                    ) : (
                      <ul className="space-y-0.5 text-muted-foreground max-h-32 overflow-y-auto">
                        {styleEntries.slice(0, 6).map(([k, v]) => (
                          <li key={k}><span className="text-foreground">{k}:</span> {Array.isArray(v) ? v.join(", ") : String(v).slice(0, 120)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Format</Label>
                <select
                  value={posterFormat}
                  onChange={(e) => setPosterFormat(e.target.value as PosterFormat)}
                  className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                >
                  <option value="poster" className="bg-background">Poster (1:1)</option>
                  <option value="facebook_cover" className="bg-background">Facebook cover (16:9)</option>
                </select>
              </div>
              <div>
                <Label>Lead</Label>
                <select
                  value={pickedLead ?? ""}
                  onChange={(e) => setPickedLead(e.target.value || null)}
                  className="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">No specific lead</option>
                  {leads.map((l) => <option key={l.id} value={l.id} className="bg-background">{l.business_name ?? "Untitled"}</option>)}
                </select>
              </div>
            </div>
            <Button
              onClick={handleGenerate} disabled={busy !== "idle" || !pickedTemplate}
              className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
            >
              {busy === "generating" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate {posterFormat === "facebook_cover" ? "Facebook cover" : "poster"}
            </Button>
            {previewImg && (
              <img src={previewImg} alt="generated" className="mt-3 w-full rounded-lg" />
            )}
          </div>
        </div>
      </div>

      {/* Templates library with previews */}
      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">Templates</h2>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
        {templates.map((t) => (
          <div key={t.id} className="glass rounded-xl overflow-hidden">
            {tplUrls[t.id]
              ? <img src={tplUrls[t.id]} alt={t.name} className="aspect-square w-full object-cover" />
              : <div className="flex aspect-square w-full items-center justify-center bg-card text-xs text-muted-foreground">No source image</div>}
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium truncate">{t.name}</div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(t)} title="Edit / regenerate">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteTemplate(t.id)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Generated library */}
      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">Recently generated</h2>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {generated.length === 0 && <p className="text-sm text-muted-foreground">Nothing generated yet.</p>}
        {generated.map((g) => {
          const tpl = templates.find((t) => t.id === g.template_id);
          const lead = leads.find((l) => l.id === g.lead_id);
          return (
            <div key={g.id} className="glass rounded-xl overflow-hidden">
              {genUrls[g.id]
                ? <img src={genUrls[g.id]} alt="poster" className="aspect-square w-full object-cover" />
                : <div className="aspect-square w-full bg-card animate-pulse" />}
              <div className="p-2">
                <div className="text-xs truncate">{lead?.business_name ?? "Generic"}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {tpl?.name ?? "—"} · {new Date(g.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit template</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              {editing.source_path && tplUrls[editing.id] && (
                <img src={tplUrls[editing.id]} alt="" className="max-h-48 w-full rounded-lg object-contain bg-background/40" />
              )}
              <div>
                <Label>Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div>
                <Label>Prompt template</Label>
                <Textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={12} className="font-mono text-xs" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Available placeholders: {"{{business_name}}, {{services}}, {{phone}}, {{website}}, {{tagline}}, {{format_instruction}}, {{footer_credit}}"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={regenerateFromSource} disabled={editBusy || !editing.source_path}>
                {editBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Re-analyze source &amp; regenerate prompt
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}><X className="h-4 w-4 mr-1" />Cancel</Button>
            <Button onClick={saveEdit} disabled={editBusy} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              {editBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
