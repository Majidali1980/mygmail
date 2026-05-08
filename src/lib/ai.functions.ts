import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(body: unknown) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "raw",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text}`);
  }
  return res.json();
}

export const extractPoster = createServerFn({ method: "POST" })
  .inputValidator((d: { imageUrl: string }) =>
    z.object({ imageUrl: z.string().min(8) }).parse(d),
  )
  .handler(async ({ data }) => {
    const json = await callAI({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You analyze business posters/flyers. Return ONLY valid JSON matching: {business_name, contact_email, contact_phone, website, services:string[], social_links:{facebook?,instagram?,twitter?,linkedin?,tiktok?}, branding:{primary_color?,secondary_color?,style?}, summary}. Use null for unknown.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract business info from this poster. JSON only." },
            { type: "image_url", image_url: { url: data.imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });
    const content: string = json.choices?.[0]?.message?.content ?? "{}";
    return { json: content };
  });

export const generateEmail = createServerFn({ method: "POST" })
  .inputValidator((d: {
    leadJson: string;
    tone?: string;
    agencyName?: string;
    agencyPhone?: string;
    agencyEmail?: string;
  }) =>
    z.object({
      leadJson: z.string().min(2).max(20000),
      tone: z.string().optional(),
      agencyName: z.string().optional(),
      agencyPhone: z.string().optional(),
      agencyEmail: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const tone = data.tone ?? "professional, persuasive, modern digital agency";
    const agency = {
      name: data.agencyName ?? "MA Digital Marketing Agency",
      phone: data.agencyPhone ?? "+923343233883",
      email: data.agencyEmail ?? "",
    };
    const json = await callAI({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You write cold outreach emails for a digital marketing agency offering: social media post design, 30-day content strategy, Facebook & Instagram management, story creation, Facebook cover redesign, logo redesign, analytics & engagement, lead generation, branding consultation. Output ONLY valid JSON: {\"subject\":string, \"body\":string}. Body uses plain text with line breaks and ✅ bullets, ends with the agency contact block (📞 phone, 📧 email).",
        },
        {
          role: "user",
          content: `Lead JSON:\n${data.leadJson}\n\nAgency: ${JSON.stringify(agency)}\nTone: ${tone}\nWrite a personalized outreach email referencing their business specifically.`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const content: string = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const p = JSON.parse(content) as { subject?: unknown; body?: unknown };
      return { subject: String(p.subject ?? "Grow your business with us"), body: String(p.body ?? "") };
    } catch {
      return { subject: "Grow your business with us", body: content };
    }
  });
