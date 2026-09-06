import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sendGmailRaw, gmailHeaders } from "./gmail.server";

const GMAIL_BASE = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const attachmentSchema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  dataBase64: z.string().min(1),
});

export const sendGmail = createServerFn({ method: "POST" })
  .inputValidator((d: {
    to: string;
    subject: string;
    body: string;
    attachments?: { filename: string; mimeType: string; dataBase64: string }[];
  }) =>
    z.object({
      to: z.string().email(),
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(50000),
      attachments: z.array(attachmentSchema).max(5).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    return sendGmailRaw(data);
  });

// Bulk send: one separate email per recipient so nobody sees the other
// recipients (safer than CC/BCC for deliverability). Capped per call; the
// client sends the list in small chunks with pauses to avoid spam filters.
export const sendGmailBulk = createServerFn({ method: "POST" })
  .inputValidator((d: {
    recipients: string[];
    subject: string;
    body: string;
    attachments?: { filename: string; mimeType: string; dataBase64: string }[];
    delayMs?: number;
  }) =>
    z.object({
      recipients: z.array(z.string().email()).min(1).max(20),
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(50000),
      attachments: z.array(attachmentSchema).max(5).optional(),
      delayMs: z.number().int().min(0).max(5000).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const delay = data.delayMs ?? 800;
    const results: { to: string; ok: boolean; id?: string; error?: string }[] = [];
    const seen = new Set<string>();
    for (const raw of data.recipients) {
      const to = raw.trim().toLowerCase();
      if (seen.has(to)) continue;
      seen.add(to);
      try {
        const r = await sendGmailRaw({
          to,
          subject: data.subject,
          body: data.body,
          attachments: data.attachments,
        });
        results.push({ to, ok: true, id: r.id });
      } catch (e) {
        results.push({ to, ok: false, error: (e as Error).message });
      }
      if (delay) await new Promise((res) => setTimeout(res, delay));
    }
    return { results };
  });

export const listInbox = createServerFn({ method: "GET" })
  .inputValidator((d: { max?: number }) =>
    z.object({ max: z.number().int().min(1).max(50).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const max = data.max ?? 15;
    const listRes = await fetch(
      `${GMAIL_BASE}/users/me/messages?maxResults=${max}&labelIds=INBOX`,
      { headers: gmailHeaders() },
    );
    const list = await listRes.json();
    if (!listRes.ok) throw new Error(`Gmail list failed [${listRes.status}]: ${JSON.stringify(list)}`);
    const ids: { id: string }[] = list.messages ?? [];
    const messages = await Promise.all(
      ids.slice(0, max).map(async (m) => {
        const r = await fetch(
          `${GMAIL_BASE}/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: gmailHeaders() },
        );
        const j = await r.json();
        const headers: { name: string; value: string }[] = j.payload?.headers ?? [];
        const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
        return {
          id: j.id as string,
          snippet: (j.snippet ?? "") as string,
          from: h("From"),
          subject: h("Subject"),
          date: h("Date"),
          unread: (j.labelIds ?? []).includes("UNREAD"),
        };
      }),
    );
    return { messages };
  });
