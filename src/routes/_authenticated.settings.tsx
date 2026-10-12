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
