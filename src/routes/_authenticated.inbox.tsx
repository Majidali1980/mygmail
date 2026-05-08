import { createFileRoute, useServerFn } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listInbox } from "@/lib/gmail.functions";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Inbox — AI Outreach Studio" }] }),
  component: InboxPage,
});

type Msg = { id: string; from: string; subject: string; date: string; snippet: string; unread: boolean };

function InboxPage() {
  const fetchInbox = useServerFn(listInbox);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetchInbox({ data: { max: 20 } });
      setMsgs(r.messages);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Inbox</h1>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>
      <div className="glass rounded-2xl overflow-hidden divide-y divide-border">
        {loading && msgs.length === 0 && <div className="p-10 text-center text-muted-foreground">Loading inbox…</div>}
        {!loading && msgs.length === 0 && <div className="p-10 text-center text-muted-foreground">Inbox is empty.</div>}
        {msgs.map((m) => (
          <div key={m.id} className="flex items-start gap-3 p-4 hover:bg-card/40">
            {m.unread && <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="truncate text-sm font-medium">{m.from}</div>
                <div className="shrink-0 text-xs text-muted-foreground">{m.date}</div>
              </div>
              <div className="truncate text-sm">{m.subject}</div>
              <div className="line-clamp-1 text-xs text-muted-foreground">{m.snippet}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
