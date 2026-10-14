import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

export const DEMO_FLAG = "aos-demo";
export const DEMO_CONTACT_EMAIL = "alimajid03021980@gmail.com";

export function isDemoMode() {
  try {
    return sessionStorage.getItem(DEMO_FLAG) === "1";
  } catch {
    return false;
  }
}

export function enterDemo() {
  sessionStorage.setItem(DEMO_FLAG, "1");
  window.location.href = "/dashboard";
}

export function exitDemo() {
  sessionStorage.removeItem(DEMO_FLAG);
  window.location.href = "/login";
}

/** Call before any write/AI/send action. Returns true when the action must be blocked. */
export function demoBlocked(isDemo: boolean) {
  if (!isDemo) return false;
  toast.info("Demo account — view only", {
    description: "This is a read-only demo. Contact us to use the real app with your own account.",
  });
  return true;
}

type Lead = Database["public"]["Tables"]["leads"]["Row"];

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

export const DEMO_LEADS: Lead[] = [
  {
    id: "demo-1",
    business_name: "SparkleClean Services",
    contact_email: "hello@sparkleclean.example",
    contact_phone: "+1 555-0101",
    website: "sparkleclean.example",
    status: "interested",
    created_at: new Date(now - 1 * day).toISOString(),
  },
  {
    id: "demo-2",
    business_name: "RapidFlow Plumbing",
    contact_email: "book@rapidflow.example",
    contact_phone: "+1 555-0102",
    website: "rapidflowplumbing.example",
    status: "sent",
    created_at: new Date(now - 2 * day).toISOString(),
  },
  {
    id: "demo-3",
    business_name: "CityMove Movers",
    contact_email: "info@citymove.example",
    contact_phone: "+1 555-0103",
    website: "citymove.example",
    status: "replied",
    created_at: new Date(now - 3 * day).toISOString(),
  },
  {
    id: "demo-4",
    business_name: "Bella Cucina Restaurant",
    contact_email: "ciao@bellacucina.example",
    contact_phone: "+1 555-0104",
    website: "bellacucina.example",
    status: "follow_up",
    created_at: new Date(now - 5 * day).toISOString(),
  },
  {
    id: "demo-5",
    business_name: "PrimeKeys Real Estate",
    contact_email: "team@primekeys.example",
    contact_phone: "+1 555-0105",
    website: "primekeys.example",
    status: "closed",
    created_at: new Date(now - 7 * day).toISOString(),
  },
] as unknown as Lead[];
