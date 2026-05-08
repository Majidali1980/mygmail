import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Upload, Send, Mail, BarChart3, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Outreach Studio — Turn Posters Into Client Outreach Emails" },
      { name: "description", content: "Upload any business flyer or poster and AI instantly generates personalized lead-gen emails. Send directly via Gmail." },
      { property: "og:title", content: "AI Outreach Studio" },
      { property: "og:description", content: "Turn business posters into high-converting outreach emails with AI." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold">AI Outreach Studio</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
          <Link to="/login">
            <Button size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              Start Free
            </Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-24 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur">
          <Zap className="h-3.5 w-3.5 text-primary" />
          Powered by AI vision + Gmail
        </div>
        <h1 className="text-balance text-5xl font-bold leading-[1.05] md:text-7xl">
          Turn business posters into{" "}
          <span className="text-gradient">high-converting</span> client emails
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
          Upload any flyer, ad, or service poster — our AI extracts the business
          details and writes a personalized outreach email you can send straight
          from your dashboard via Gmail.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/login">
            <Button size="lg" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
              Start free trial
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline">Connect Gmail</Button>
          </Link>
        </div>

        <div className="relative mt-20 mx-auto max-w-4xl">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-primary opacity-20 blur-3xl" />
          <div className="glass relative rounded-2xl p-2 shadow-elegant">
            <div className="rounded-xl bg-background/60 p-8 text-left">
              <div className="mb-3 text-xs uppercase tracking-wider text-primary">AI generated email · preview</div>
              <div className="font-display text-lg font-semibold">Subject: Grow Your Business with Professional Social Media Marketing</div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p>Hello Sparkle Cleaning,</p>
                <p>I came across your services and noticed real potential to grow your client base online. We specialize in:</p>
                <p>✅ Social media post designing<br />✅ 30-day content planning<br />✅ Facebook & Instagram management<br />✅ Lead generation campaigns</p>
                <p>Looking forward to working with you.</p>
                <p className="text-foreground">— MA Digital Marketing Agency</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-4xl font-bold">Everything you need to run outreach</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">From poster to inbox in under a minute.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { icon: Upload, title: "Smart poster analysis", desc: "AI vision extracts business name, phone, email, services, socials and branding from any flyer." },
            { icon: Sparkles, title: "AI email writer", desc: "Personalized cold outreach in your tone — professional, friendly, or persuasive." },
            { icon: Send, title: "Send via Gmail", desc: "Connect your inbox and send AI-drafted emails directly without copy-paste." },
            { icon: Mail, title: "Inbox & replies", desc: "Sync inbox, drafts and replies. Track campaigns end to end." },
            { icon: BarChart3, title: "Lead CRM", desc: "Status tags: New, Sent, Replied, Interested, Follow-up, Closed." },
            { icon: Zap, title: "Bulk campaigns", desc: "Generate dozens of personalized emails from a folder of posters." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-2xl p-6 transition hover:-translate-y-1 hover:shadow-glow">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-primary">
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-4xl font-bold">Three steps. Real clients.</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { n: "01", t: "Upload poster", d: "Drop any business poster, flyer or screenshot." },
            { n: "02", t: "AI extracts & writes", d: "Get business details + a tailored outreach email instantly." },
            { n: "03", t: "Send & track", d: "Approve, edit and send via Gmail. Track replies in your CRM." },
          ].map((s) => (
            <div key={s.n} className="glass rounded-2xl p-8">
              <div className="text-gradient font-display text-4xl font-bold">{s.n}</div>
              <div className="mt-3 font-semibold">{s.t}</div>
              <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-4xl font-bold">Start free. Scale fast.</h2>
        <p className="mt-3 text-muted-foreground">Generate your first 10 emails on us.</p>
        <Link to="/login">
          <Button size="lg" className="mt-8 bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            Get started
          </Button>
        </Link>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} AI Outreach Studio
      </footer>
    </div>
  );
}
