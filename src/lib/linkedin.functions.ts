import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLinkedInStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const connected = Boolean(process.env.LINKEDIN_API_KEY);
    if (!connected) return { connected: false as const };

    try {
      const res = await fetch("https://connector-gateway.lovable.dev/linkedin/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": process.env.LINKEDIN_API_KEY!,
        },
      });
      if (!res.ok) return { connected: true as const, profile: null };
      const profile = (await res.json()) as { name?: string; email?: string; picture?: string };
      return { connected: true as const, profile };
    } catch {
      return { connected: true as const, profile: null };
    }
  });

const LI = "https://connector-gateway.lovable.dev/linkedin";
function liHeaders() {
  const a = process.env.LOVABLE_API_KEY, b = process.env.LINKEDIN_API_KEY;
  if (!a || !b) throw new Error("LinkedIn is not connected");
  return { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b, "Content-Type": "application/json" };
}

export const draftLinkedInPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { business: string; industry?: string; notes?: string; website?: string }) => d)
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI not configured");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "raw" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You write LinkedIn posts for a digital marketing agency. 80-150 words, friendly and professional, no hype, short paragraphs, 2-4 relevant hashtags at the end. Never invent results or client claims. Return only the post text." },
          { role: "user", content: `Write a post inspired by this business (a ${data.industry ?? "local"} business): ${data.business}${data.website ? ` (${data.website})` : ""}. Notes: ${data.notes ?? "none"}. Share a useful marketing tip for businesses like this.` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
    const j = await res.json();
    return { text: String(j.choices?.[0]?.message?.content ?? "").trim() };
  });

export const publishLinkedInPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; approved: boolean }) => {
    if (!d.approved) throw new Error("Post must be approved first");
    const text = String(d.text ?? "").trim();
    if (!text || text.length > 3000) throw new Error("Post must be 1–3000 characters");
    return { text, approved: true };
  })
  .handler(async ({ data }) => {
    const h = liHeaders();
    const me = await fetch(`${LI}/v2/userinfo`, { headers: h });
    if (!me.ok) throw new Error(`LinkedIn profile ${me.status}: ${await me.text()}`);
    const { sub } = (await me.json()) as { sub: string };
    const res = await fetch(`${LI}/v2/ugcPosts`, {
      method: "POST",
      headers: { ...h, "X-Restli-Protocol-Version": "2.0.0" },
      body: JSON.stringify({
        author: `urn:li:person:${sub}`,
        lifecycleState: "PUBLISHED",
        specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: data.text }, shareMediaCategory: "NONE" } },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      }),
    });
    if (!res.ok) throw new Error(`LinkedIn post failed ${res.status}: ${await res.text()}`);
    return { id: res.headers.get("x-restli-id") ?? "" };
  });
