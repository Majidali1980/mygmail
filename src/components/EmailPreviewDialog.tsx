import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Send, X, Paperclip, Calendar } from "lucide-react";

export type PreviewAttachment = {
  id?: string;
  name: string;
  previewUrl: string;
};

type Props = {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  to: string;
  subject: string;
  body: string;
  attachments: PreviewAttachment[];
  onConfirm: () => void;
  busy?: boolean;
  confirmLabel?: string;
  scheduledFor?: string | null;
};

export function EmailPreviewDialog({
  open, onOpenChange, to, subject, body, attachments,
  onConfirm, busy, confirmLabel = "Send via Gmail", scheduledFor,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review email before {scheduledFor ? "scheduling" : "sending"}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-background/40">
          <div className="border-b border-border px-4 py-2 text-xs space-y-1">
            <div><span className="text-muted-foreground">To: </span><span className="font-medium">{to || "(empty)"}</span></div>
            <div><span className="text-muted-foreground">Subject: </span><span className="font-medium">{subject || "(empty)"}</span></div>
            {scheduledFor && (
              <div className="flex items-center gap-1 text-primary">
                <Calendar className="h-3 w-3" /> Scheduled for {new Date(scheduledFor).toLocaleString()}
              </div>
            )}
          </div>
          <pre className="whitespace-pre-wrap break-words px-4 py-3 text-sm font-sans">
            {body || "(no body)"}
          </pre>
          {attachments.length > 0 && (
            <div className="border-t border-border px-4 py-3">
              <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Paperclip className="h-3 w-3" /> {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {attachments.map((a, i) => (
                  <div key={a.id ?? i} className="overflow-hidden rounded-md border border-border bg-card">
                    <img src={a.previewUrl} alt={a.name} className="aspect-square w-full object-cover" />
                    <div className="px-1.5 py-1 text-[10px] truncate text-muted-foreground">{a.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            <X className="h-4 w-4 mr-1" /> Back to edit
          </Button>
          <Button onClick={onConfirm} disabled={busy} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : (scheduledFor ? <Calendar className="h-4 w-4 mr-1" /> : <Send className="h-4 w-4 mr-1" />)}
            {scheduledFor ? "Confirm schedule" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
