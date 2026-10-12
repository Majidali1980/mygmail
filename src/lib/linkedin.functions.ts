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
