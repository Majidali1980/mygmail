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
    lead: Record<string, unknown>;
    tone?: string;
    agency?: { name?: string; phone?: string; email?: string };
  }) =>
    z.object({
      lead: z.record(z.string(), z.unknown()),
      tone: z.string().optional(),
      agency: z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const tone = data.tone ?? "professional, persuasive, modern digital agency";
    const agency = data.agency ?? {};
    const json = await callAI({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You write cold outreach emails for a digital marketing agency offering: social media post design, 30-day content strategy, Facebook & Instagram management, story creation, Facebook cover redesign, logo redesign, analytics & engagement, lead generation, branding consultation. Output ONLY valid JSON: {subject, body}. Body should use plain text with line breaks and ✅ bullets, end with the agency contact block.",
        },
        {
          role: "user",
          content: `Lead JSON:\n${JSON.stringify(data.lead)}\n\nAgency: ${JSON.stringify(agency)}\nTone: ${tone}\nWrite a personalized outreach email referencing their business specifically.`,
        },
      ],
      response_format: { type: "json_object" },
    });
    const content = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const p = JSON.parse(content);
      return { subject: String(p.subject ?? ""), body: String(p.body ?? "") };
    } catch {
      return { subject: "Grow your business with us", body: content };
    }
  });
