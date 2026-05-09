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

/**
 * Analyze an uploaded reference poster and return a re-usable style template
 * with placeholders for the lead's specifics.
 */
export const analyzePosterStyle = createServerFn({ method: "POST" })
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
            'You analyze marketing poster designs. Output ONLY valid JSON: {"style":{"layout":string,"palette":string[],"typography":string,"mood":string,"composition":string,"cta_style":string},"prompt_template":string}. The "prompt_template" must be a detailed image-generation prompt that recreates the SAME visual style of the reference but personalized for a NEW business. Use these exact placeholders inside the prompt: {{business_name}}, {{services}}, {{phone}}, {{website}}, {{tagline}}. The prompt must instruct the model to render large, legible text for the business name and services, keep brand colors specified by the user when provided, include the phone and website, and produce a clean, ad-ready poster suitable for social media (1024x1024).',
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this reference poster and produce the JSON." },
            { type: "image_url", image_url: { url: data.imageUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });
    const content: string = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { style?: unknown; prompt_template?: string } = {};
    try { parsed = JSON.parse(content); } catch { /* */ }
    return {
      style: parsed.style ?? {},
      prompt_template: parsed.prompt_template ?? content,
    };
  });

function fillTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

/**
 * Generate a personalized poster image (returns a base64 PNG data URL).
 */
export const generatePosterImage = createServerFn({ method: "POST" })
  .inputValidator((d: {
    promptTemplate: string;
    business_name?: string;
    services?: string;
    phone?: string;
    website?: string;
    tagline?: string;
  }) =>
    z.object({
      promptTemplate: z.string().min(10).max(8000),
      business_name: z.string().optional(),
      services: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      tagline: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const prompt = fillTemplate(data.promptTemplate, {
      business_name: data.business_name ?? "the business",
      services: data.services ?? "their services",
      phone: data.phone ?? "",
      website: data.website ?? "",
      tagline: data.tagline ?? "",
    });
    const json = await callAI({
      model: "google/gemini-2.5-flash-image-preview",
      messages: [
        { role: "user", content: prompt },
      ],
      modalities: ["image", "text"],
    });
    const msg = json.choices?.[0]?.message ?? {};
    // The gateway returns generated images on message.images[0].image_url.url as a data URL.
    const dataUrl: string | undefined =
      msg.images?.[0]?.image_url?.url ??
      msg.images?.[0]?.url ??
      undefined;
    if (!dataUrl) {
      throw new Error("Image generation returned no image. Raw: " + JSON.stringify(json).slice(0, 500));
    }
    return { dataUrl, prompt };
  });
