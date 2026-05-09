// Server-only Gmail helpers (shared by server fns and cron route).
const GMAIL_BASE = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

export type Attachment = { filename: string; mimeType: string; dataBase64: string };

export function gmailHeaders() {
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

function b64url(buf: Buffer | string) {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf-8") : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function chunk76(s: string) {
  return s.replace(/(.{76})/g, "$1\r\n");
}

export function buildMime(opts: {
  to: string;
  subject: string;
  body: string;
  attachments?: Attachment[];
}): string {
  const { to, subject, body, attachments = [] } = opts;
  if (attachments.length === 0) {
    return [
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      body,
    ].join("\r\n");
  }
  const boundary = `=_b_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const parts: string[] = [];
  parts.push(`To: ${to}`);
  parts.push(`Subject: ${subject}`);
  parts.push("MIME-Version: 1.0");
  parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  parts.push("");
  parts.push(`--${boundary}`);
  parts.push('Content-Type: text/plain; charset="UTF-8"');
  parts.push("Content-Transfer-Encoding: 7bit");
  parts.push("");
  parts.push(body);
  for (const a of attachments) {
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${a.mimeType}; name="${a.filename}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push(`Content-Disposition: attachment; filename="${a.filename}"`);
    parts.push("");
    // standard base64 (not url-safe), wrapped
    const std = Buffer.from(a.dataBase64, "base64").toString("base64");
    parts.push(chunk76(std));
  }
  parts.push(`--${boundary}--`);
  parts.push("");
  return parts.join("\r\n");
}

export async function sendGmailRaw(opts: {
  to: string;
  subject: string;
  body: string;
  attachments?: Attachment[];
}): Promise<{ id: string; threadId: string }> {
  const mime = buildMime(opts);
  const res = await fetch(`${GMAIL_BASE}/users/me/messages/send`, {
    method: "POST",
    headers: gmailHeaders(),
    body: JSON.stringify({ raw: b64url(Buffer.from(mime, "utf-8")) }),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(`Gmail send failed [${res.status}]: ${JSON.stringify(out)}`);
  return { id: out.id as string, threadId: out.threadId as string };
}
