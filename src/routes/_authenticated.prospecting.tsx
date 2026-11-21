import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Sparkles, Trash2, Pencil, Send, AlertTriangle } from "lucide-react";
import {
  summarizeBusiness, suggestSegments, findCompanies, findPeople, findEmails, writeEmails, startOutreach,
} from "@/lib/prospect.functions";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/prospecting")({
  head: () => ({
    meta: [
      { title: "Prospecting — AI Outreach Studio" },
      { name: "description", content: "Find companies, decision makers and verified emails, then run outreach." },
    ],
  }),
  component: ProspectingPage,
});

type Campaign = Tables<"campaigns">;
type Company = Tables<"companies">;
type Person = Tables<"people"> & { companies?: { name: string } | null };

const statusVariant: Record<string, string> = {
  valid: "bg-primary/20 text-primary border-primary/40",
  risky: "bg-accent/20 text-accent-foreground border-accent/40",
  invalid: "bg-destructive/20 text-destructive border-destructive/40",
  pending: "bg-muted text-muted-foreground border-border",
};

function ProspectingPage() {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [offer, setOffer] = useState("");
  const [summary, setSummary] = useState("");
  const [bizName, setBizName] = useState("");
  const [address, setAddress] = useState("");
  const [limit, setLimit] = useState(30);   
  const [count, setCount] = useState(25);   
    const [location, setLocation] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [activePerson, setActivePerson] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [suppressed, setSuppressed] = useState<string[]>([]);

  const fns = {
    summarize: useServerFn(summarizeBusiness), suggest: useServerFn(suggestSegments),
    companies: useServerFn(findCompanies), people: useServerFn(findPeople),
    emails: useServerFn(findEmails), write: useServerFn(writeEmails), outreach: useServerFn(startOutreach),
  };

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (!data) return;
      setWebsite(data.website ?? ""); setOffer(data.offer ?? ""); setSummary(data.business_summary ?? "");
      setBizName(data.sender_business_name ?? data.agency_name ?? ""); setAddress(data.sender_address ?? "");
      setLimit(data.daily_limit ?? 30);
    });
    loadCampaigns();
    supabase.from("suppression_list").select("email").then(({ data }) => setSuppressed((data ?? []).map((s) => s.email)));
  }, [user]);

  async function loadCampaigns() {
    const { data } = await supabase.from("campaigns").select("*").order("created_at");
    setCampaigns(data ?? []);
    setSelected((s) => s ?? data?.[0]?.id ?? null);
  }

  const loadCampaignData = useCallback(async () => {
    if (!selected) { setCompanies([]); setPeople([]); return; }
    const [c, p] = await Promise.all([
      supabase.from("companies").select("*").eq("campaign_id", selected).order("created_at"),
      supabase.from("people").select("*, companies(name)").eq("campaign_id", selected).order("created_at"),
    ]);
    setCompanies(c.data ?? []); setPeople((p.data ?? []) as Person[]);
  }, [selected]);
  useEffect(() => { loadCampaignData(); }, [loadCampaignData]);

  const [roles, setRoles] = useState("Founder, CEO, Owner, Marketing Director, Head of Marketing");
  const [personEdit, setPersonEdit] = useState<Partial<Person> | null>(null);
  async function savePerson() {
    if (!personEdit || !user || !selected) return;
    if (!personEdit.company_id) return toast.error("Pick a company");
    const row = { first_name: personEdit.first_name || null, last_name: personEdit.last_name || null, title: personEdit.title || null,
      email: personEdit.email || null, company_id: personEdit.company_id,
      email_status: (personEdit.email ? "pending" : (personEdit.email_status ?? "pending")) as Person["email_status"], email_source: "manual" };
    const { error } = personEdit.id
      ? await supabase.from("people").update(row).eq("id", personEdit.id)
      : await supabase.from("people").insert({ ...row, user_id: user.id, campaign_id: selected });
    if (error) return toast.error(error.message);
    toast.success("Person saved"); setPersonEdit(null); loadCampaignData();
  }

  async function run<T>(key: string, fn: () => Promise<T>, done?: (r: T) => void) {
    setBusy(key);
    try { const r = await fn(); done?.(r); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  async function saveProfile(extra: Record<string, unknown> = {}) {
    if (!user) return;
    const payload = {
      website, offer, business_summary: summary, sender_business_name: bizName, sender_address: address,
      daily_limit: limit, ...extra,
    };
    const { data, error } = await supabase.from("profiles").update(payload).eq("user_id", user.id).select("user_id");
    if (error) return toast.error(error.message);
    if (!data?.length) {
      const { error: insErr } = await supabase.from("profiles").insert({ user_id: user.id, ...payload } as never);
      if (insErr) return toast.error(insErr.message);
    }
    toast.success("Profile saved");
  }

  async function addCampaign(name = "New segment", description = "", est_count: number | null = null) {
    if (!user) return;
    const { data, error } = await supabase.from("campaigns").insert({ user_id: user.id, name, description, est_count }).select().single();
    if (error) return toast.error(error.message);
    setCampaigns((c) => [...c, data]); setSelected(data.id);
  }
  async function renameCampaign(c: Campaign) {
    const name = window.prompt("Segment name", c.name);
    if (!name) return;
    await supabase.from("campaigns").update({ name }).eq("id", c.id);
    loadCampaigns();
  }
  async function deleteCampaign(c: Campaign) {
    if (!window.confirm(`Delete "${c.name}" and its companies and people?`)) return;
    await supabase.from("campaigns").delete().eq("id", c.id);
    if (selected === c.id) setSelected(null);
    loadCampaigns();
  }

  const person = people.find((p) => p.id === activePerson) ?? null;
  async function updatePerson(id: string, patch: Partial<Tables<"people">>) {
    setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    await supabase.from("people").update(patch).eq("id", id);
  }

  const sentToday = people.filter((p) => p.sent_at && new Date(p.sent_at).toDateString() === new Date().toDateString()).length;
  const ready = people.filter((p) => p.email_status === "valid" && p.outreach_status === "draft" && p.body).length;
  const words = (s?: string | null) => (s ?? "").trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="p-6 md:p-10 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Prospecting</h1>
        <p className="text-sm text-muted-foreground">Describe your business, pick segments, find companies and decision makers, then send outreach.</p>
      </div>

      {/* Step 1 & 2 */}
      <div className="glass rounded-2xl p-6 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-semibold">1. Your business</h2>
          <div><Label>Website</Label><Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourwebsite.com" /></div>
          <div><Label>Your offer</Label><Textarea rows={3} value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. Social media management for pet brands, $500/month" /></div>
          <Button disabled={!!busy || (!website && !offer)} onClick={() => run("sum", () => fns.summarize({ data: { website, offer } }), (r) => { setSummary(r.summary); toast.success("Summary ready — review it"); })}>
            {busy === "sum" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Analyze my business
          </Button>
        </div>
        <div className="space-y-3">
          <h2 className="font-semibold">2. Review business profile</h2>
          <Textarea rows={6} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Your AI summary appears here. Edit anything." />
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Business name (email footer)</Label><Input value={bizName} onChange={(e) => setBizName(e.target.value)} /></div>
            <div><Label>Daily sending limit</Label><Input type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 30)} /></div>
          </div>
          <div><Label>Business postal address (email footer)</Label><Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, country" /></div>
          <Button variant="secondary" onClick={() => saveProfile()}>Confirm & save profile</Button>
        </div>
      </div>

      {/* Step 3+ */}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="glass rounded-2xl p-4 space-y-3 h-fit">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">3. Campaigns</h2>
            <Button size="icon" variant="ghost" onClick={() => addCampaign()}><Plus className="h-4 w-4" /></Button>
          </div>
          <Button size="sm" className="w-full" disabled={!!busy || summary.length < 10}
            onClick={() => run("seg", () => fns.suggest({ data: { summary } }), async (r) => {
              for (const s of r.segments) await addCampaign(s.name, s.description, s.est_count);
              toast.success(`${r.segments.length} segments added`);
            })}>
            {busy === "seg" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} AI suggest segments
          </Button>
          <div className="space-y-1">
            {campaigns.map((c) => (
              <div key={c.id} onClick={() => setSelected(c.id)}
                className={`group cursor-pointer rounded-lg p-2 text-sm ${selected === c.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"}`}>
                <div className="flex items-start justify-between gap-1">
                  <span className="font-medium">{c.name}</span>
                  <span className="flex opacity-0 group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); renameCampaign(c); }}><Pencil className="h-3.5 w-3.5 m-1" /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteCampaign(c); }}><Trash2 className="h-3.5 w-3.5 m-1 text-destructive" /></button>
                  </span>
                </div>
                {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                {c.est_count != null && <p className="text-xs text-muted-foreground">~{c.est_count.toLocaleString()} companies</p>}
              </div>
            ))}
            {!campaigns.length && <p className="text-xs text-muted-foreground">No segments yet.</p>}
          </div>
        </aside>

        <section className="glass rounded-2xl p-4 min-w-0">
          {!selected ? <p className="text-sm text-muted-foreground p-6">Select or create a campaign.</p> : (
            <Tabs defaultValue="companies">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <TabsList>
                  <TabsTrigger value="companies">Companies ({companies.length})</TabsTrigger>
                  <TabsTrigger value="people">People ({people.length} · {people.filter((p) => p.email_status === "valid").length} verified)</TabsTrigger>
                  <TabsTrigger value="emails">Emails</TabsTrigger>
                  <TabsTrigger value="suppression">Suppression ({suppressed.length})</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="companies" className="space-y-3">
                <div className="flex flex-wrap items-end gap-2"><div><Label>Count</Label><Input type="number" min={1} max={25} value={count} onChange={(e) => setCount(Math.min(25, Math.max(1, Number(e.target.value) || 25)))} className="w-20" /></div><div><Label>City / location (optional)</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City / location" /></div><Button size="sm" disabled={!!busy} onClick={() => run("co", () => fns.companies({ data: { campaignId: selected, count, location: location || undefined } }), (r) => { toast.success(`${r.added} companies added`); loadCampaignData(); })}>
                  {busy === "co" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 4. Find companies
                </Button>
                </div><p className="text-xs text-muted-foreground">Companies are researched by AI — double-check before sending.</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Deep search roles:</span>
                  <Input className="h-8 max-w-md text-xs" value={roles} onChange={(e) => setRoles(e.target.value)} />
                </div>
                <SimpleTable head={["Company", "Website", "Size", "Country", "Deep search people"]}
                  rows={companies.map((c) => {
                    const roleQ = roles.split(",").map((r) => `"${r.trim()}"`).filter((r) => r.length > 2).join(" OR ");
                    const li = encodeURIComponent(`site:linkedin.com/in "${c.name}" (${roleQ})`);
                    const team = c.domain ? encodeURIComponent(`site:${c.domain} (team OR leadership OR about OR founder)`) : "";
                    return [c.name, c.website ? <a className="text-primary underline" href={c.website.startsWith("http") ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer">{c.domain ?? c.website}</a> : "—", c.size ?? "—", c.country ?? "—",
                      <div className="flex flex-wrap gap-2 text-xs">
                        <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${li}`}>LinkedIn people</a>
                        {team && <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${team}`}>Team page</a>}
                        <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(c.name)}`}>LinkedIn search</a>
                        <button className="text-primary underline" onClick={() => setPersonEdit({ company_id: c.id })}>+ Add person</button>
                      </div>];
                  })} />
              </TabsContent>

              <TabsContent value="people" className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!!busy || !companies.length} onClick={() => run("pp", () => fns.people({ data: { campaignId: selected } }), (r) => { toast.success(`${r.added} people found`); loadCampaignData(); })}>
                    {busy === "pp" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 5. Find decision makers
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!!busy || !people.length} onClick={() => run("em", () => fns.emails({ data: { campaignId: selected } }), (r) => { toast.success(`${r.updated} emails checked${r.hunter ? "" : " (no Hunter key — marked risky)"}`); loadCampaignData(); })}>
                    {busy === "em" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} 6. Find & verify emails
                  </Button>
                </div>
                <Button size="sm" variant="outline" disabled={!companies.length} onClick={() => setPersonEdit({ company_id: companies[0]?.id })}><Plus className="mr-1 h-3 w-3" />Add real person</Button>
                <SimpleTable head={["Name", "Title", "Company", "Email", "Status", "Profile"]}
                  rows={people.map((p) => {
                    const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
                    const q = encodeURIComponent([name, p.companies?.name].filter(Boolean).join(" "));
                    return [
                      name || "—", p.title ?? "—", p.companies?.name ?? "—", p.email ?? "—",
                      <Badge variant="outline" className={statusVariant[p.email_status] ?? ""}>{p.email_status}</Badge>,
                      <div className="flex gap-2 text-xs">
                        <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${q}`}>LinkedIn</a>
                        <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/search?q=${q}`}>Google</a>
                        <button className="text-primary underline" onClick={() => setPersonEdit(p)}>Edit</button>
                      </div>,
                    ];
                  })} />
              </TabsContent>

              <TabsContent value="emails" className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" disabled={!!busy || !people.length} onClick={() => run("wr", () => fns.write({ data: { campaignId: selected } }), (r) => { toast.success(`${r.written} emails written`); loadCampaignData(); })}>
                    {busy === "wr" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} 7. Write emails
                  </Button>
                  <Button size="sm" className="bg-gradient-primary text-primary-foreground" disabled={!!busy || !ready}
                    onClick={() => {
                      if (!window.confirm(`Send up to ${Math.min(ready, Math.max(0, limit - sentToday))} emails now from your Gmail?`)) return;
                      run("out", () => fns.outreach({ data: { campaignId: selected, origin: window.location.origin } }), (r) => {
                        toast.success(`Sent ${r.sent}, skipped ${r.skipped}, failed ${r.failed}. ${r.remaining} left today.`); loadCampaignData();
                      });
                    }}>
                    {busy === "out" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Start outreach ({ready} ready)
                  </Button>
                  <span className="text-xs text-muted-foreground">{sentToday}/{limit} sent today</span>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent/10 p-3 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Warm-up: if this Gmail account is new to cold outreach, start with 10–20 per day and increase slowly over 2–4 weeks. Only contacts with a <b>valid</b> email are sent. Every email adds your business name, address and an unsubscribe link.</span>
                </div>
                <div className="grid gap-4 md:grid-cols-[240px_1fr]">
                  <div className="space-y-1 max-h-[480px] overflow-y-auto">
                    {people.map((p) => (
                      <button key={p.id} onClick={() => { setActivePerson(p.id); setEditing(false); }}
                        className={`w-full text-left rounded-lg p-2 text-sm ${activePerson === p.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"}`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate">{[p.first_name, p.last_name].filter(Boolean).join(" ") || p.title}</span>
                          <Badge variant="outline" className={`text-[10px] ${statusVariant[p.email_status] ?? ""}`}>{p.email_status}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{p.companies?.name} · {p.outreach_status}</div>
                      </button>
                    ))}
                  </div>
                  <div>
                    {!person ? <p className="text-sm text-muted-foreground">Pick a contact.</p> : !person.body ? <p className="text-sm text-muted-foreground">No email written yet — click “Write emails”.</p> : editing ? (
                      <div className="space-y-2">
                        <Input value={person.subject ?? ""} onChange={(e) => updatePerson(person.id, { subject: e.target.value })} />
                        <Textarea rows={10} value={person.body ?? ""} onChange={(e) => updatePerson(person.id, { body: e.target.value })} />
                        <div className="flex justify-between text-xs text-muted-foreground"><span>{words(person.body)} words (aim under 90)</span><Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Done</Button></div>
                      </div>
                    ) : (
                      <div onClick={() => person.outreach_status === "draft" && setEditing(true)} className="cursor-text rounded-lg border border-dashed border-border p-4 hover:border-primary/60">
                        <p className="text-xs text-muted-foreground mb-2">To: {person.email ?? "—"} · {person.outreach_status === "draft" ? "Click to edit" : person.outreach_status}</p>
                        <p className="font-semibold mb-2">{person.subject}</p>
                        <p className="whitespace-pre-wrap text-sm">{person.body}</p>
                        <p className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap">--{"\n"}{bizName}{"\n"}{address}{"\n"}Unsubscribe link added automatically</p>
                        {person.error && <p className="mt-2 text-xs text-destructive">{person.error}</p>}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="suppression">
                <p className="text-xs text-muted-foreground mb-2">People who unsubscribed. They will never be emailed again.</p>
                <SimpleTable head={["Email"]} rows={suppressed.map((e) => [e])} />
              </TabsContent>
            </Tabs>
          )}
        </section>
      </div>
      <Dialog open={!!personEdit} onOpenChange={(o) => !o && setPersonEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{personEdit?.id ? "Edit person" : "Add real person"}</DialogTitle></DialogHeader>
          {personEdit && <div className="grid gap-3">
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={personEdit.company_id ?? ""} onChange={(e) => setPersonEdit({ ...personEdit, company_id: e.target.value })}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First name" value={personEdit.first_name ?? ""} onChange={(e) => setPersonEdit({ ...personEdit, first_name: e.target.value })} />
              <Input placeholder="Last name" value={personEdit.last_name ?? ""} onChange={(e) => setPersonEdit({ ...personEdit, last_name: e.target.value })} />
            </div>
            <Input placeholder="Job title" value={personEdit.title ?? ""} onChange={(e) => setPersonEdit({ ...personEdit, title: e.target.value })} />
            <Input placeholder="Email (verified in step 6)" value={personEdit.email ?? ""} onChange={(e) => setPersonEdit({ ...personEdit, email: e.target.value })} />
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setPersonEdit(null)}>Cancel</Button><Button onClick={savePerson}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="p-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((r, i) => (
            <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="p-2">{c}</td>)}</tr>
          )) : <tr><td className="p-4 text-muted-foreground" colSpan={head.length}>Nothing yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
