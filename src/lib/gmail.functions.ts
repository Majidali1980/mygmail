import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GMAIL_BASE = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function gmailHeaders() {
  const lk = process.env.LOVABLE_API_KEY;
  const gk = process.env.GOOGLE_MAIL_API_KEY;
  if (!lk) throw new Error("Missing LOVABLE_API_KEY");
  if (!gk) throw new Error("Missing GOOGLE_MAIL_API_KEY");
  return {
    Authorization: `Bearer ${lk}`,
    "X-Connection-Api-Key": gk,
    "Content-Type": "application/json",
  };
}

function b64url(s: string) {
  return Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const sendGmail = createServerFn({ method: "POST" })
  .inputValidator((d: { to: string; subject: string; body: string }) =>
    z.object({
      to: z.string().email(),
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(20000),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const mime = [
      `To: ${data.to}`,
      `Subject: ${data.subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      data.body,
    ].join("\r\n");

    const res = await fetch(`${GMAIL_BASE}/users/me/messages/send`, {
      method: "POST",
      headers: gmailHeaders(),
      body: JSON.stringify({ raw: b64url(mime) }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(`Gmail send failed [${res.status}]: ${JSON.stringify(out)}`);
    return { id: out.id as string, threadId: out.threadId as string };
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
