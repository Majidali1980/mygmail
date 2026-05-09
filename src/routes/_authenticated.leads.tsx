import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { ScheduleFollowupDialog } from "@/components/ScheduleFollowupDialog";
import { Clock } from "lucide-react";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type Status = Database["public"]["Enums"]["lead_status"];

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — AI Outreach Studio" }] }),
  component: LeadsPage,
});

const STATUS_COLORS: Record<Status, string> = {
  new: "bg-muted text-muted-foreground",
  sent: "bg-primary/20 text-primary",
  replied: "bg-accent/20 text-accent",
  interested: "bg-accent/30 text-accent-foreground",
  follow_up: "bg-secondary text-secondary-foreground",
  closed: "bg-destructive/20 text-destructive",
};
const STATUSES: Status[] = ["new", "sent", "replied", "interested", "follow_up", "closed"];

function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("leads").select("*").order("created_at", { ascending: false })
      .then(({ data }) => setLeads(data ?? []));
  }, [user]);

  async function updateStatus(id: string, status: Status) {
    setLeads((p) => p.map((l) => l.id === id ? { ...l, status } : l));
    await supabase.from("leads").update({ status }).eq("id", id);
  }

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-10">
      <h1 className="font-display text-3xl font-bold mb-6">Leads</h1>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-card/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-4">Business</th>
              <th className="p-4">Contact</th>
              <th className="p-4">Status</th>
              <th className="p-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">No leads yet — upload a poster on the Dashboard.</td></tr>
            )}
            {leads.map((l) => (
              <tr key={l.id} className="border-b border-border/50 hover:bg-card/40">
                <td className="p-4">
                  <div className="font-medium">{l.business_name ?? "—"}</div>
                  {l.website && <div className="text-xs text-muted-foreground">{l.website}</div>}
                </td>
                <td className="p-4 text-muted-foreground">
                  {l.contact_email && <div>{l.contact_email}</div>}
                  {l.contact_phone && <div className="text-xs">{l.contact_phone}</div>}
                </td>
                <td className="p-4">
                  <select
                    value={l.status}
                    onChange={(e) => updateStatus(l.id, e.target.value as Status)}
                    className={`rounded-full px-2.5 py-1 text-xs ${STATUS_COLORS[l.status]} border-0 focus:outline-none`}
                  >
                    {STATUSES.map((s) => <option key={s} value={s} className="bg-background text-foreground">{s.replace("_"," ")}</option>)}
                  </select>
                </td>
                <td className="p-4 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
