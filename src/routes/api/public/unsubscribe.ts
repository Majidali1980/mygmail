import { createFileRoute } from "@tanstack/react-router";

const page = (msg: string) =>
  new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Unsubscribe</title></head><body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:0 20px;text-align:center"><h2>${msg}</h2></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t = new URL(request.url).searchParams.get("t") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(t)) return page("Invalid unsubscribe link.");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: p } = await supabaseAdmin.from("people").select("id,user_id,email").eq("unsubscribe_token", t).maybeSingle();
        if (!p) return page("Invalid unsubscribe link.");
        if (p.email) {
          await supabaseAdmin.from("suppression_list")
            .upsert({ user_id: p.user_id, email: p.email.toLowerCase(), reason: "unsubscribed" }, { onConflict: "user_id,email" });
        }
        await supabaseAdmin.from("people").update({ outreach_status: "unsubscribed" }).eq("id", p.id);
        return page("You've been unsubscribed. You won't receive further emails from us.");
      },
    },
  },
});
