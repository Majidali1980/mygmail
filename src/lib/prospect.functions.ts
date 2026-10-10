import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendGmailRaw } from "./gmail.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function aiJson(system: string, user: string): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "raw" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system + " Respond with valid JSON only." },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    if (res.status === 402) throw new Error("AI credits are used up. Please add credits and try again.");
    if (res.status === 429) throw new Error("AI is busy right now. Please wait a moment and try again.");
    throw new Error(`AI error ${res.status}: ${t.slice(0, 300)}`);
  }
  const j = await res.json();
  const c: string = j.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(c.replace(/^```json\s*|```$/g, "")); } catch { return {}; }
}

// Step 1: website + offer -> business summary
export const summarizeBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { website?: string; offer?: string }) =>
    z.object({ website: z.string().max(300).optional(), offer: z.string().max(3000).optional() }).parse(d))
  .handler(async ({ data }) => {
    let siteText = "";
    if (data.website) {
      try {
        const url = data.website.startsWith("http") ? data.website : `https://${data.website}`;
        const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const html = await r.text();
        siteText = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
      } catch { siteText = ""; }
    }
    const out = await aiJson(
      'You summarize a business for B2B outreach. Return {"summary": string} — 3-5 sentences: what they do, who they serve, their offer, what makes them different.',
      `Website: ${data.website ?? "none"}\nWebsite text: ${siteText || "(could not read)"}\nOffer described by owner: ${data.offer ?? "none"}`,
    );
    return { summary: String(out.summary ?? "") };
  });

// Step 3: suggest target segments
export const suggestSegments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { summary: string }) => z.object({ summary: z.string().min(10).max(5000) }).parse(d))
  .handler(async ({ data }) => {
    const out = await aiJson(
      'Suggest 5 B2B target segments that would buy this offer. Return {"segments":[{"name":string,"description":string,"est_count":number}]}. est_count = rough number of companies in that segment worldwide.',
      data.summary,
    );
    const segs = Array.isArray(out.segments) ? out.segments : [];
    return {
      segments: segs.slice(0, 6).map((s: any) => ({
        name: String(s.name ?? "Segment"),
        description: String(s.description ?? ""),
        est_count: Number.isFinite(Number(s.est_count)) ? Math.round(Number(s.est_count)) : null,
      })),
    };
  });

// Step 4: find companies (AI research)
export const findCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; count?: number }) =>
    z.object({ campaignId: z.string().uuid(), count: z.number().int().min(1).max(25).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: camp, error } = await sb.from("campaigns").select("*").eq("id", data.campaignId).single();
    if (error || !camp) throw new Error("Campaign not found");
    const { data: existing } = await sb.from("companies").select("name").eq("campaign_id", camp.id);
    const skip = (existing ?? []).map((c) => c.name).join(", ");
    const out = await aiJson(
      'You are a B2B researcher. List real, existing companies that match the segment. Only include companies you are confident exist, with their real website. Return {"companies":[{"name":string,"website":string,"size":string,"country":string,"description":string}]}. size like "11-50".',
      `Segment: ${camp.name}\nDescription: ${camp.description ?? ""}\nReturn ${data.count ?? 10} companies.${skip ? ` Exclude: ${skip}` : ""}`,
    );
    const rows = (Array.isArray(out.companies) ? out.companies : []).map((c: any) => {
      const website = String(c.website ?? "").trim();
      let domain: string | null = null;
      try { domain = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, ""); } catch { /* */ }
      return {
        user_id: context.userId, campaign_id: camp.id, name: String(c.name ?? "Unknown"),
        website: website || null, domain, size: c.size ? String(c.size) : null,
        country: c.country ? String(c.country) : null, description: c.description ? String(c.description) : null,
      };
    });
    if (rows.length) {
      const { error: e } = await sb.from("companies").insert(rows);
      if (e) throw new Error(e.message);
    }
    return { added: rows.length };
  });

// Step 5: find decision makers for companies in a campaign
export const findPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; roles?: string }) =>
    z.object({ campaignId: z.string().uuid(), roles: z.string().max(300).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: companies } = await sb.from("companies").select("id,name,domain,website").eq("campaign_id", data.campaignId);
    const { data: ppl } = await sb.from("people").select("company_id").eq("campaign_id", data.campaignId);
    const done = new Set((ppl ?? []).map((p) => p.company_id));
    const todo = (companies ?? []).filter((c) => !done.has(c.id)).slice(0, 15);
    if (!todo.length) return { added: 0 };
    const hunter = process.env.HUNTER_API_KEY;
    const roles = data.roles || "Marketing Director, Social Media Manager, Founder, CEO, Owner";
    const rows: any[] = [];
    const needAi: typeof todo = [];
    for (const c of todo) {
      if (hunter && c.domain) {
        try {
          const r = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(c.domain)}&limit=5&type=personal&api_key=${hunter}`);
          const j = await r.json();
          const emails: any[] = j?.data?.emails ?? [];
          const picked = emails.filter((e) => e.first_name).slice(0, 2);
          if (picked.length) {
            for (const e of picked) rows.push({
              user_id: context.userId, campaign_id: data.campaignId, company_id: c.id,
              first_name: e.first_name, last_name: e.last_name, title: e.position ?? null,
              email: e.value, email_status: "pending", email_source: "hunter",
            });
            continue;
          }
        } catch { /* fall back to AI */ }
      }
      needAi.push(c);
    }
    if (needAi.length) {
      const out = await aiJson(
        'For each company, name the most likely decision maker for buying marketing services. Only give a real person if you are confident; otherwise give first_name null and the title only. Return {"people":[{"company":string,"first_name":string|null,"last_name":string|null,"title":string}]}.',
        `Preferred roles: ${roles}\nCompanies:\n${needAi.map((c) => `- ${c.name} (${c.domain ?? c.website ?? ""})`).join("\n")}`,
      );
      for (const p of Array.isArray(out.people) ? out.people : []) {
        const c = needAi.find((x) => x.name.toLowerCase() === String(p.company ?? "").toLowerCase());
        if (!c) continue;
        rows.push({
          user_id: context.userId, campaign_id: data.campaignId, company_id: c.id,
          first_name: p.first_name ?? null, last_name: p.last_name ?? null, title: p.title ?? null,
          email_status: "pending",
        });
      }
    }
    if (rows.length) {
      const { error } = await sb.from("people").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { added: rows.length };
  });

async function hunterVerify(email: string, key: string): Promise<string> {
  const r = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${key}`);
  if (!r.ok) return "pending";
  const j = await r.json();
  const s = j?.data?.status as string | undefined;
  if (s === "valid") return "valid";
  if (s === "invalid") return "invalid";
  if (s) return "risky";
  return "pending";
}

// Step 6: find & verify emails. Hunter first, then pattern-guess fallback.
export const findEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const hunter = process.env.HUNTER_API_KEY;
    const { data: ppl } = await sb.from("people")
      .select("id,first_name,last_name,email,email_status,companies(domain)")
      .eq("campaign_id", data.campaignId).eq("email_status", "pending").limit(20);
    let updated = 0;
    for (const p of ppl ?? []) {
      const domain = (p as any).companies?.domain as string | null;
      let email = p.email;
      let source: string | null = email ? "hunter" : null;
      let status = "pending";
      if (!email && hunter && domain && p.first_name) {
        try {
          const r = await fetch(`https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(p.first_name)}&last_name=${encodeURIComponent(p.last_name ?? "")}&api_key=${hunter}`);
          const j = await r.json();
          if (j?.data?.email) { email = j.data.email; source = "hunter"; }
        } catch { /* */ }
      }
      if (!email && domain) {
        // Fallback provider: common pattern guess (unverified)
        const f = (p.first_name ?? "").toLowerCase().replace(/[^a-z]/g, "");
        const l = (p.last_name ?? "").toLowerCase().replace(/[^a-z]/g, "");
        email = f && l ? `${f}.${l}@${domain}` : f ? `${f}@${domain}` : `info@${domain}`;
        source = "pattern";
      }
      if (!email) { status = "invalid"; }
      else if (hunter) { try { status = await hunterVerify(email, hunter); } catch { status = "risky"; } }
      else status = "risky";
      await sb.from("people").update({ email, email_status: status, email_source: source }).eq("id", p.id);
      updated++;
    }
    return { updated, hunter: Boolean(hunter) };
  });

// Step 7: write personalized emails (<90 words)
export const writeEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string }) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: prof } = await sb.from("profiles").select("*").eq("user_id", context.userId).maybeSingle();
    const { data: ppl } = await sb.from("people")
      .select("id,first_name,title,companies(name,description,website)")
      .eq("campaign_id", data.campaignId).is("body", null).limit(20);
    let written = 0;
    for (const p of ppl ?? []) {
      const c = (p as any).companies ?? {};
      const out = await aiJson(
        'Write a personalized cold email. Rules: body UNDER 90 words, plain text, no hype words, no exclamation marks, mention something specific about their company, end with a soft call to action question. Do not add a signature or footer. Return {"subject":string,"body":string}. Subject under 7 words, lowercase-friendly.',
        `Sender business: ${prof?.sender_business_name || prof?.agency_name || ""}\nSender summary: ${prof?.business_summary ?? ""}\nOffer: ${prof?.offer ?? ""}\nRecipient: ${p.first_name ?? "there"}, ${p.title ?? ""}\nCompany: ${c.name ?? ""} — ${c.description ?? ""} (${c.website ?? ""})`,
      );
      await sb.from("people").update({ subject: String(out.subject ?? "Quick idea"), body: String(out.body ?? "") }).eq("id", p.id);
      written++;
    }
    return { written };
  });

// Outreach: send to valid, non-suppressed contacts within the daily limit.
export const startOutreach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { campaignId: string; origin: string }) =>
    z.object({ campaignId: z.string().uuid(), origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: prof } = await sb.from("profiles").select("*").eq("user_id", context.userId).maybeSingle();
    const bizName = prof?.sender_business_name || prof?.agency_name;
    if (!bizName || !prof?.sender_address) throw new Error("Add your business name and postal address on the Prospecting page first.");
    const limit = prof.daily_limit ?? 30;
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const { count } = await sb.from("people").select("id", { count: "exact", head: true })
      .eq("outreach_status", "sent").gte("sent_at", since.toISOString());
    const remaining = Math.max(0, limit - (count ?? 0));
    if (!remaining) return { sent: 0, skipped: 0, failed: 0, remaining: 0 };
    const { data: sup } = await sb.from("suppression_list").select("email");
    const blocked = new Set((sup ?? []).map((s) => s.email.toLowerCase()));
    const { data: ppl } = await sb.from("people").select("*")
      .eq("campaign_id", data.campaignId).eq("email_status", "valid").eq("outreach_status", "draft")
      .not("body", "is", null).limit(remaining);
    let sent = 0, skipped = 0, failed = 0;
    for (const p of ppl ?? []) {
      if (!p.email || blocked.has(p.email.toLowerCase())) {
        await sb.from("people").update({ outreach_status: "suppressed" }).eq("id", p.id);
        skipped++; continue;
      }
      const unsub = `${data.origin}/api/public/unsubscribe?t=${p.unsubscribe_token}`;
      const body = `${p.body}\n\n--\n${bizName}\n${prof.sender_address}\n\nDon't want these emails? Unsubscribe: ${unsub}`;
      try {
        await sendGmailRaw({ to: p.email, subject: p.subject ?? "Quick idea", body });
        await sb.from("people").update({ outreach_status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", p.id);
        sent++;
      } catch (e) {
        await sb.from("people").update({ error: (e as Error).message.slice(0, 500) }).eq("id", p.id);
        failed++;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return { sent, skipped, failed, remaining: remaining - sent };
  });
