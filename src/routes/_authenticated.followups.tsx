import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, X, Mail } from "lucide-react";

type Row = {
  id: string;
  recipient: string;
  subject: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  scheduled_for: string;
  sent_at: string | null;
  error: string | null;
  attachments: { filename: string }[] | null;
};

export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({ meta: [{ title: "Follow-ups — AI Outreach Studio" }] }),
  component: FollowupsPage,
});

const STATUS_COLORS: Record<Row["status"], string> = {
  pending: "bg-primary/20 text-primary",
  sent: "bg-accent/20 text-accent",
  failed: "bg-destructive/20 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function FollowupsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => { if (user) void load(); /* eslint-disable-next-line */ }, [user]);

  async function load() {
    const { data } = await supabase
      .from("follow_ups").select("id,recipient,subject,status,scheduled_for,sent_at,error,attachments")
      .order("scheduled_for", { ascending: true });
    setRows((data ?? []) as Row[]);
  }

  async function cancel(id: string) {
    await supabase.from("follow_ups").update({ status: "cancelled" }).eq("id", id);
    toast.success("Cancelled");
    void load();
  }

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <div className="mb-6 flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h1 className="font-display text-3xl font-bold">Scheduled follow-ups</h1>
      </div>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-card/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-4">Recipient / Subject</th>
              <th className="p-4">Scheduled</th>
              <th className="p-4">Status</th>
              <th className="p-4">Attachments</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">
                No follow-ups scheduled. Schedule one from the Leads page.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-card/40">
                <td className="p-4">
                  <div className="font-medium flex items-center gap-2"><Mail className="h-3 w-3" />{r.recipient}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-md">{r.subject}</div>
                  {r.error && <div className="text-xs text-destructive mt-1">{r.error}</div>}
                </td>
                <td className="p-4 text-xs">
                  {new Date(r.scheduled_for).toLocaleString()}
                  {r.sent_at && <div className="text-muted-foreground">sent {new Date(r.sent_at).toLocaleString()}</div>}
                </td>
                <td className="p-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                </td>
                <td className="p-4 text-xs text-muted-foreground">
                  {r.attachments?.length ? `${r.attachments.length} file(s)` : "—"}
                </td>
                <td className="p-4 text-right">
                  {r.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => cancel(r.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
