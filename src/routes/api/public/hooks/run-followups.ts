import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendGmailRaw, type Attachment } from "@/lib/gmail.server";

type FollowUpRow = {
  id: string;
  user_id: string;
  lead_id: string | null;
  recipient: string;
  subject: string;
  body: string;
  attachments: Attachment[] | null;
};

export const Route = createFileRoute("/api/public/hooks/run-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Lightweight auth: require Supabase anon key in apikey header.
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: due, error } = await supabaseAdmin
          .from("follow_ups")
          .select("id,user_id,lead_id,recipient,subject,body,attachments")
          .eq("status", "pending")
          .lte("scheduled_for", new Date().toISOString())
          .limit(25);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const results: { id: string; ok: boolean; error?: string }[] = [];
        for (const fu of (due ?? []) as FollowUpRow[]) {
          try {
            const sent = await sendGmailRaw({
              to: fu.recipient,
              subject: fu.subject,
              body: fu.body,
              attachments: Array.isArray(fu.attachments) ? fu.attachments : [],
            });
            await supabaseAdmin.from("follow_ups").update({
              status: "sent",
              sent_at: new Date().toISOString(),
              gmail_message_id: sent.id,
            }).eq("id", fu.id);
            await supabaseAdmin.from("email_sends").insert({
              user_id: fu.user_id,
              lead_id: fu.lead_id,
              recipient: fu.recipient,
              subject: fu.subject,
              body: fu.body,
              gmail_message_id: sent.id,
              status: "sent",
            });
            if (fu.lead_id) {
              await supabaseAdmin.from("leads").update({ status: "follow_up" }).eq("id", fu.lead_id);
            }
            results.push({ id: fu.id, ok: true });
          } catch (e) {
            const msg = (e as Error).message;
            await supabaseAdmin.from("follow_ups").update({
              status: "failed", error: msg,
            }).eq("id", fu.id);
            results.push({ id: fu.id, ok: false, error: msg });
          }
        }

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
