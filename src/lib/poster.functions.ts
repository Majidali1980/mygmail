import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const FOOTER_CREDIT = "alimajid03021980@gmail.com";

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
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "system",
          content:
            'You are a senior brand designer. Analyze a reference marketing poster in extreme detail and return a re-usable style guide that another model can use to recreate the SAME visual identity for any business. Output ONLY valid JSON: {"style":{"layout":string,"palette":string[],"typography":string,"mood":string,"composition":string,"cta_style":string,"background":string,"imagery":string,"shapes":string},"prompt_template":string}. The "prompt_template" must be a richly-detailed image-generation prompt that recreates the EXACT visual style of the reference (layout, hero focal area, hierarchy, color palette in hex when possible, font weights, decorative elements, background treatment, photo treatment) but personalized for a NEW business. Use these EXACT placeholders inside the prompt: {{business_name}}, {{services}}, {{phone}}, {{website}}, {{tagline}}, {{format_instruction}}, {{footer_credit}}. The prompt MUST instruct the model to: (1) reproduce the reference layout and color palette faithfully, (2) render large legible text for the business name and services, (3) include the phone number and website prominently, (4) add a small footer line at the bottom that reads exactly "designed by: {{footer_credit}}" in a small but legible font, (5) follow the {{format_instruction}} for canvas size/orientation, (6) produce ad-ready output suitable for social media. Do NOT hardcode any business details — only the placeholders.',
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this reference poster and produce the JSON style guide and prompt_template. Be precise about colors (hex), fonts, and layout regions." },
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

const FORMAT_INSTRUCTIONS: Record<string, string> = {
  poster: "Render a square 1:1 poster suitable for Instagram (1024x1024). Composition should be balanced for a square frame.",
  facebook_cover: "Render a wide 16:9 Facebook cover banner (1536x864). Composition should be horizontal, with the focal text and CTA arranged for a banner format.",
};

/**
 * Generate a personalized poster image (returns a base64 PNG data URL).
 * If `referenceImageUrl` is provided, the generator uses it as visual reference
 * to better match the original style.
 */
export const generatePosterImage = createServerFn({ method: "POST" })
  .inputValidator((d: {
    promptTemplate: string;
    business_name?: string;
    services?: string;
    phone?: string;
    website?: string;
    tagline?: string;
    agency_email?: string;
    format?: "poster" | "facebook_cover";
    referenceImageUrl?: string;
  }) =>
    z.object({
      promptTemplate: z.string().min(10).max(8000),
      business_name: z.string().optional(),
      services: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      tagline: z.string().optional(),
      agency_email: z.string().optional(),
      format: z.enum(["poster", "facebook_cover"]).optional(),
      referenceImageUrl: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const fmt = data.format ?? "poster";
    const footerLine = `designed by: ${FOOTER_CREDIT}${data.agency_email ? ` | ${data.agency_email}` : ""}`;
    const prompt = fillTemplate(data.promptTemplate, {
      business_name: data.business_name ?? "the business",
      services: data.services ?? "their services",
      phone: data.phone ?? "",
      website: data.website ?? "",
      tagline: data.tagline ?? "",
      format_instruction: FORMAT_INSTRUCTIONS[fmt],
      footer_credit: FOOTER_CREDIT,
    });

    // Always append a hard footer instruction so it's never missed,
    // and a hard format instruction.
    const finalPrompt =
      `${prompt}\n\nIMPORTANT: ${FORMAT_INSTRUCTIONS[fmt]}\n` +
      `IMPORTANT: At the very bottom of the image, render a small (but readable) one-line footer text exactly: "${footerLine}". Use a clean sans-serif font in a color that contrasts with the footer background. Do not omit this footer.\n` +
      (data.referenceImageUrl
        ? `IMPORTANT: Closely match the visual style, layout, color palette, typography weight, decorative shapes and overall composition of the provided reference image. Treat the reference as a hard style guide — only change the textual content (business name, services, phone, website) to the new business details above.`
        : "");

    const userContent: Array<unknown> = [{ type: "text", text: finalPrompt }];
    if (data.referenceImageUrl) {
      userContent.push({ type: "image_url", image_url: { url: data.referenceImageUrl } });
    }

    const json = await callAI({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: userContent }],
      modalities: ["image", "text"],
    });
    const msg = json.choices?.[0]?.message ?? {};
    const dataUrl: string | undefined =
      msg.images?.[0]?.image_url?.url ??
      msg.images?.[0]?.url ??
      undefined;
    if (!dataUrl) {
      throw new Error("Image generation returned no image. Raw: " + JSON.stringify(json).slice(0, 500));
    }
    return { dataUrl, prompt: finalPrompt };
  });
