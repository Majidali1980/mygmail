import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Database } from "@/integrations/supabase/types";

type Send = Database["public"]["Tables"]["email_sends"]["Row"];

export const Route = createFileRoute("/_authenticated/sent")({
  head: () => ({ meta: [{ title: "Sent — AI Outreach Studio" }] }),
  component: SentPage,
});

function SentPage() {
  const { user } = useAuth();
  const [sends, setSends] = useState<Send[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("email_sends").select("*").order("sent_at", { ascending: false })
      .then(({ data }) => setSends(data ?? []));
  }, [user]);

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <h1 className="font-display text-3xl font-bold mb-6">Sent emails</h1>
      <div className="space-y-3">
        {sends.length === 0 && <div className="glass rounded-2xl p-10 text-center text-muted-foreground">No emails sent yet.</div>}
        {sends.map((s) => (
          <div key={s.id} className="glass rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">To {s.recipient}</div>
                <div className="mt-1 font-semibold truncate">{s.subject}</div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground whitespace-pre-wrap">{s.body}</p>
              </div>
              <div className="text-right">
                <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === "sent" ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"}`}>{s.status}</span>
                <div className="mt-1 text-xs text-muted-foreground">{new Date(s.sent_at).toLocaleString()}</div>
              </div>
            </div>
            {s.error && <div className="mt-2 text-xs text-destructive">{s.error}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
