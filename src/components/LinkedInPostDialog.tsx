import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { draftLinkedInPost, publishLinkedInPost } from "@/lib/linkedin.functions";

type LeadLike = { business_name: string | null; website?: string | null; category?: string | null; notes?: string | null } | null;

export function LinkedInPostDialog({ lead, onClose }: { lead: LeadLike; onClose: () => void }) {
  const draft = useServerFn(draftLinkedInPost);
  const publish = useServerFn(publishLinkedInPost);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"draft" | "post" | null>(null);

  async function makeDraft() {
    if (!lead) return;
    setBusy("draft");
    try {
      const r = await draft({ data: { business: lead.business_name ?? "a local business", website: lead.website ?? undefined, industry: lead.category ?? undefined, notes: lead.notes ?? undefined } });
      setText(r.text);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  useEffect(() => { setText(""); if (lead) makeDraft(); }, [lead]); // eslint-disable-line react-hooks/exhaustive-deps

  async function approve() {
    setBusy("post");
    try { await publish({ data: { text, approved: true } }); toast.success("Posted to LinkedIn"); onClose(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Review LinkedIn post — {lead?.business_name}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Nothing is posted until you click Approve & publish.</p>
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={busy === "draft" ? "Writing draft…" : "Post text"} />
        <div className="text-right text-xs text-muted-foreground">{text.length}/3000</div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={makeDraft} disabled={!!busy}>{busy === "draft" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Rewrite</Button>
          <Button variant="outline" onClick={onClose} disabled={busy === "post"}>Reject</Button>
          <Button onClick={approve} disabled={!!busy || !text.trim()}>{busy === "post" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Approve & publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
