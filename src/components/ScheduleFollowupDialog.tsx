import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { generateEmail } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2, Sparkles, Image as ImageIcon, X, Clock, Eye } from "lucide-react";
import { EmailPreviewDialog } from "@/components/EmailPreviewDialog";

type Lead = {
  id: string;
  business_name: string | null;
  contact_email: string | null;
  raw_extraction: unknown;
};

type Poster = { id: string; storage_path: string };

type Props = {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  lead: Lead | null;
};

function pad(n: number) { return n.toString().padStart(2, "0"); }
function localIsoNoTZ(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleFollowupDialog({ open, onOpenChange, lead }: Props) {
  const { user } = useAuth();
  const generateFn = useServerFn(generateEmail);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 3);
    return localIsoNoTZ(d);
  });
  const [posters, setPosters] = useState<Poster[]>([]);
  const [posterUrls, setPosterUrls] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    if (!open || !lead) return;
    setRecipient(lead.contact_email ?? "");
    setSubject(`Following up — ${lead.business_name ?? "your business"}`);
    setBody("");
    setPicked([]);
    void loadPosters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead]);

  async function loadPosters() {
    if (!lead) return;
    const { data } = await supabase
      .from("generated_posters").select("id,storage_path")
      .eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(8);
    const list = (data ?? []) as Poster[];
    setPosters(list);
    const urls: Record<string, string> = {};
    await Promise.all(list.map(async (p) => {
      const { data: s } = await supabase.storage.from("posters").createSignedUrl(p.storage_path, 3600);
      if (s?.signedUrl) urls[p.id] = s.signedUrl;
    }));
    setPosterUrls(urls);
  }

  async function draftWithAI() {
    if (!lead || !user) return;
    setDrafting(true);
    try {
      const { data: profile } = await supabase
        .from("profiles").select("agency_name,agency_phone,agency_email").eq("user_id", user.id).maybeSingle();
      const gen = await generateFn({
        data: {
          leadJson: JSON.stringify(lead.raw_extraction ?? { business_name: lead.business_name }),
          tone: "polite, brief follow-up that references the previous outreach and invites a quick reply",
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
      setDrafting(false);
    }
  }

  async function fileToBase64(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    let s = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  async function schedule() {
    if (!user || !lead) return;
    if (!recipient || !subject || !body || !when) {
      toast.error("All fields are required");
      return;
    }
    setBusy(true);
    try {
      // resolve attachments to base64
      const attachments: { filename: string; mimeType: string; dataBase64: string }[] = [];
      for (const id of picked) {
        const p = posters.find((x) => x.id === id);
        if (!p) continue;
        const { data, error } = await supabase.storage.from("posters").download(p.storage_path);
        if (error || !data) continue;
        const b64 = await fileToBase64(data);
        const filename = p.storage_path.split("/").pop() ?? "poster.png";
        attachments.push({ filename, mimeType: "image/png", dataBase64: b64 });
      }

      const { error } = await supabase.from("follow_ups").insert({
        user_id: user.id, lead_id: lead.id,
        recipient, subject, body,
        scheduled_for: new Date(when).toISOString(),
        attachments: attachments as never,
      });
      if (error) throw error;
      toast.success(`Scheduled for ${new Date(when).toLocaleString()}`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function preset(days: number) {
    const d = new Date(); d.setDate(d.getDate() + days);
    setWhen(localIsoNoTZ(d));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule follow-up{lead?.business_name ? ` — ${lead.business_name}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>To</Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </div>
            <div>
              <Label>Send at</Label>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              <div className="mt-1 flex gap-1">
                {[1, 3, 7, 14].map((d) => (
                  <Button key={d} type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => preset(d)}>
                    +{d}d
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Subject</Label>
              <Button size="sm" variant="ghost" onClick={draftWithAI} disabled={drafting}>
                {drafting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                AI draft
              </Button>
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div>
            <Label>Body</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          {posters.length > 0 && (
            <div>
              <Label className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Attach generated posters</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {posters.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPicked((v) => on ? v.filter((x) => x !== p.id) : [...v, p.id])}
                      className={`relative aspect-square overflow-hidden rounded-md border-2 ${on ? "border-primary" : "border-transparent"}`}
                    >
                      {posterUrls[p.id] ? <img src={posterUrls[p.id]} alt="" className="h-full w-full object-cover" /> : null}
                      {on && <span className="absolute top-1 right-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
          <Button onClick={schedule} disabled={busy} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Clock />}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
