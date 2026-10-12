import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Linkedin, CheckCircle2, RefreshCw } from "lucide-react";
import { getLinkedInStatus } from "@/lib/linkedin.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — AI Outreach Studio" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("agency_name,agency_phone,agency_email").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        setName(data?.agency_name ?? "");
        setPhone(data?.agency_phone ?? "");
        setEmail(data?.agency_email ?? user.email ?? "");
      });
  }, [user]);

  async function save() {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      agency_name: name, agency_phone: phone, agency_email: email,
    }).eq("user_id", user.id);
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Saved");
  }

  return (
    <div className="mx-auto max-w-2xl p-6 md:p-10">
      <h1 className="font-display text-3xl font-bold mb-6">Settings</h1>
      <LinkedInCard />

      <div className="glass rounded-2xl p-6 space-y-4">
        <div>
          <Label>Agency name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="MA Digital Marketing Agency" />
        </div>
        <div>
          <Label>Contact phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92..." />
        </div>
        <div>
          <Label>Contact email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@agency.com" />
        </div>
        <p className="text-xs text-muted-foreground">These details appear in every AI-generated outreach email.</p>
        <Button onClick={save} disabled={busy} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function LinkedInCard() {
  const [status, setStatus] = useState<{ connected: boolean; profile?: { name?: string; email?: string } | null } | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const s = await getLinkedInStatus();
      setStatus(s);
      if (!s.connected) {
        toast.info("LinkedIn isn't connected yet", {
          description: "Ask me in the chat to connect LinkedIn — I'll open the secure sign-in for you.",
        });
      }
    } catch {
      toast.error("Couldn't check LinkedIn status");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="glass rounded-2xl p-6 mb-6 space-y-3">
      <div className="flex items-center gap-2">
        <Linkedin className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">LinkedIn</h2>
      </div>
      {status?.connected ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>
            Connected{status.profile?.name ? ` as ${status.profile.name}` : ""}
            {status.profile?.email ? ` (${status.profile.email})` : ""}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Connect your LinkedIn account to view your profile and share posts from the app.
        </p>
      )}
      <Button variant="outline" onClick={check} disabled={checking} className="gap-2">
        <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
        {status?.connected ? "Refresh status" : "Connect LinkedIn"}
      </Button>
    </div>
  );
}
