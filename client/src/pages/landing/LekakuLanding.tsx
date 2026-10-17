// Lekaku by FiscalStack — Lesotho homepage.
// NOTE (lekaku branch only): this branch serves a completely different public
// homepage for Lesotho (RSL / LEKAKU compliant) while sharing the full app
// codebase. main keeps the Zimbabwe (ZIMRA) homepages; this branch diverges
// here on purpose for separate Lesotho hosting.
import { useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { LesothoMark } from "@/components/lesotho-logo";

const WHATSAPP_LS = "26658123456";
const waUrl = (msg: string) =>
  `https://wa.me/${WHATSAPP_LS}?text=${encodeURIComponent(msg)}`;

const BLUE = "#1B4F9C";
const BLUE_DARK = "#143A75";
const GREEN = BLUE;
const GREEN_DARK = BLUE_DARK;
const INK = "#0F2440";
const PAPER = "#FAF8F2";
const STONE = "#EDE9DD";

const fontHead = "'Fraunces', Georgia, serif";
const fontBody = "'Public Sans', system-ui, sans-serif";
const fontMono = "'IBM Plex Mono', ui-monospace, monospace";

function Fonts() {
  return (
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
    />
  );
}

// Basotho-blanket inspired stripe
function BlanketStripe({ flip = false }: { flip?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        height: 10,
        background: flip
          ? `linear-gradient(90deg, ${BLUE} 0 22%, #fff 22% 26%, ${GREEN} 26% 48%, #111 48% 52%, ${GREEN} 52% 74%, #fff 74% 78%, ${BLUE} 78% 100%)`
          : `linear-gradient(90deg, ${GREEN} 0 22%, #fff 22% 26%, ${BLUE} 26% 48%, #111 48% 52%, ${BLUE} 52% 74%, #fff 74% 78%, ${GREEN} 78% 100%)`,
      }}
    />
  );
}

function Nav() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const link: CSSProperties = {
    fontFamily: fontBody,
    fontSize: 14,
    fontWeight: 600,
    color: INK,
    textDecoration: "none",
  };
  return (
    <header style={{ background: PAPER, position: "sticky", top: 0, zIndex: 50, borderBottom: `1px solid ${STONE}` }}>
      <BlanketStripe />
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer" }}
        >
          <LesothoMark />
          <span style={{ textAlign: "left", lineHeight: 1.1 }}>
            <span style={{ display: "block", fontFamily: fontHead, fontWeight: 700, fontSize: 20, color: INK }}>
              FiscalStack
            </span>
            <span style={{ display: "block", fontFamily: fontMono, fontSize: 10, letterSpacing: "0.14em", color: GREEN }}>
              LESOTHO · RSL COMPLIANT
            </span>
          </span>
        </button>
        <nav className="lk-nav-links" style={{ display: "flex", gap: 22 }}>
          {["Solutions", "Features", "Integrations", "Pricing", "FAQ"].map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`} style={link}>
              {l}
            </a>
          ))}
        </nav>
        <div className="lk-nav-cta" style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setLocation("/auth")}
            style={{ ...link, background: "none", border: "none", cursor: "pointer" }}
          >
            Sign in
          </button>
          <button
            onClick={() => setLocation("/auth?mode=signup")}
            style={{
              fontFamily: fontBody,
              fontWeight: 700,
              fontSize: 14,
              background: GREEN,
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "10px 22px",
              cursor: "pointer",
            }}
          >
            Get started
          </button>
          <button
            className="lk-burger"
            onClick={() => setOpen((o) => !o)}
            style={{ display: "none", background: "none", border: "none", fontSize: 22, cursor: "pointer", color: INK }}
            aria-label="Menu"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>
      {open && (
        <div style={{ padding: "8px 24px 18px", display: "flex", flexDirection: "column", gap: 12, background: PAPER }}>
          {["Solutions", "Features", "Integrations", "Pricing", "FAQ"].map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`} onClick={() => setOpen(false)} style={link}>
              {l}
            </a>
          ))}
        </div>
      )}
      <style>{`@media(max-width:820px){.lk-nav-links,.lk-nav-cta button:first-child,.lk-nav-cta button:nth-child(2){display:none!important}.lk-burger{display:block!important}}`}</style>
    </header>
  );
}

function Hero() {
  const [, setLocation] = useLocation();
  return (
    <section style={{ background: PAPER, overflow: "hidden" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "72px 24px 56px",
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 48,
          alignItems: "center",
        }}
        className="lk-hero-grid"
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#fff",
              border: `1px solid ${STONE}`,
              borderRadius: 999,
              padding: "6px 14px",
              marginBottom: 22,
              fontFamily: fontMono,
              fontSize: 11,
              letterSpacing: "0.1em",
              color: GREEN_DARK,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: GREEN, display: "inline-block" }} />
            RSL LEKAKU READY · KINGDOM OF LESOTHO
          </div>
          <h1
            style={{
              fontFamily: fontHead,
              fontSize: "clamp(2.6rem, 5.4vw, 4.3rem)",
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: INK,
              margin: "0 0 18px",
              fontWeight: 700,
            }}
          >
            Fiscalisation software for{" "}
            <em style={{ color: GREEN, fontWeight: 400 }}>Lesotho businesses.</em>
          </h1>
          <p style={{ fontFamily: fontBody, fontSize: 17, lineHeight: 1.7, color: "#3D4A43", maxWidth: 520 }}>
            Connect your business to RSL, automate compliant fiscal invoices,
            and run point of sale through one seamless system — in loti,
            online or off.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 28 }}>
            <button
              onClick={() => setLocation("/auth?mode=signup")}
              style={{
                fontFamily: fontBody, fontWeight: 700, fontSize: 15,
                background: GREEN_DARK, color: "#fff", border: "none",
                borderRadius: 999, padding: "14px 30px", cursor: "pointer",
              }}
            >
              Start free trial →
            </button>
            <button
              onClick={() => window.open(waUrl("Lumela FiscalStack! I would like to talk to sales about Lesotho."), "_blank")}
              style={{
                fontFamily: fontBody, fontWeight: 700, fontSize: 15,
                background: "#fff", color: INK, border: `1.5px solid ${INK}`,
                borderRadius: 999, padding: "12px 26px", cursor: "pointer",
              }}
            >
              Contact sales
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 26 }}>
            {["LEKAKU connected", "LSL native", "Cash, cards & bank", "Offline POS", "Sesotho + English"].map((b) => (
              <span
                key={b}
                style={{
                  fontFamily: fontMono, fontSize: 11, background: "#fff",
                  border: `1px solid ${STONE}`, borderRadius: 999, padding: "5px 12px", color: "#3D4A43",
                }}
              >
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* LSL fiscal invoice card */}
        <div
          style={{
            background: INK, borderRadius: 28, padding: 28, color: "#fff",
            fontFamily: fontBody, position: "relative", overflow: "hidden",
            boxShadow: "0 30px 80px rgba(16,35,26,0.35)",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse 70% 60% at 80% 10%, rgba(27,79,156,0.45) 0%, transparent 65%), radial-gradient(ellipse 60% 55% at 10% 95%, rgba(27,79,156,0.5) 0%, transparent 60%)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Maluti Crafts (Pty) Ltd</div>
                <div style={{ fontFamily: fontMono, fontSize: 11, opacity: 0.65 }}>RSL TIN: L1234567 · Maseru</div>
              </div>
              <span style={{ background: "rgba(59,130,246,0.16)", border: "1px solid rgba(59,130,246,0.5)", color: "#60A5FA", fontFamily: fontMono, fontSize: 10, letterSpacing: "0.1em", borderRadius: 6, padding: "4px 8px" }}>
                LEKAKU FISCALIZED
              </span>
            </div>
            <div style={{ fontFamily: fontMono, fontSize: 11, color: "#93C5FD", marginBottom: 12 }}>#INV-LS-2026-0314</div>
            {[
              ["Basotho blanket (Seana Marena)", "2", "M1,598.00"],
              ["Mohair scarf", "4", "M880.00"],
              ["Courier to Leribe", "1", "M150.00"],
            ].map(([d, q, a]) => (
              <div key={d} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.1)", fontSize: 13 }}>
                <span style={{ opacity: 0.85 }}>{d} <span style={{ opacity: 0.5 }}>× {q}</span></span>
                <span style={{ fontFamily: fontMono }}>{a}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 13, opacity: 0.75 }}>
              <span>Subtotal</span><span style={{ fontFamily: fontMono }}>M2,628.00</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 13, opacity: 0.75 }}>
              <span>VAT (15%)</span><span style={{ fontFamily: fontMono }}>M394.20</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: "baseline" }}>
              <span style={{ fontFamily: fontHead, fontSize: 18, fontWeight: 700 }}>Total</span>
              <span style={{ fontFamily: fontMono, fontSize: 24, fontWeight: 500, color: "#93C5FD" }}>M3,022.20</span>
            </div>
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed rgba(255,255,255,0.2)", display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>▦</div>
              <div style={{ fontFamily: fontMono, fontSize: 10, opacity: 0.7, lineHeight: 1.6 }}>
                Scan to verify with RSL<br />lekaku.rsl.co.ls/verify
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          borderTop: `1px solid ${STONE}`, background: "#fff",
        }}
      >
        <div
          style={{
            maxWidth: 1180, margin: "0 auto", padding: "18px 24px",
            display: "flex", flexWrap: "wrap", gap: 28, justifyContent: "space-between",
          }}
        >
          {[
            ["Maseru", "Local support, local time"],
            ["LSL", "Loti-first accounting"],
            ["15%", "RSL VAT handled"],
            ["Offline", "Built for the highlands"],
            ["4.9/5", "Merchant satisfaction"],
          ].map(([v, l]) => (
            <div key={l} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontFamily: fontHead, fontWeight: 700, fontSize: 22, color: GREEN_DARK }}>{v}</span>
              <span style={{ fontFamily: fontBody, fontSize: 13, color: "#5A6660" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:900px){.lk-hero-grid{grid-template-columns:1fr!important}}`}</style>
    </section>
  );
}

function Mission() {
  return (
    <section style={{ background: "#fff", padding: "72px 24px", borderTop: `1px solid ${STONE}` }}>
      <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: GREEN }}>WHY FISCALSTACK</div>
        <h2 style={{ fontFamily: fontHead, fontSize: "clamp(1.8rem,3.6vw,2.6rem)", color: INK, margin: "12px 0 14px", letterSpacing: "-0.02em" }}>
          Simplifying fiscalisation for modern businesses.
        </h2>
        <p style={{ fontFamily: fontBody, fontSize: 16, lineHeight: 1.75, color: "#3D4A43" }}>
          Reporting to the revenue authority matters — but it shouldn't slow
          you down or add extra work. FiscalStack keeps you compliant quietly
          in the background, so you can get on with serving customers from
          Maseru to Mokhotlong.
        </p>
      </div>
    </section>
  );
}

function Solutions() {
  const [, setLocation] = useLocation();
  const cards = [
    {
      tag: "CLOUD FISCALISATION",
      title: "Virtual Fiscalisation",
      desc: "Fully cloud-based RSL compliance. Every invoice is signed and submitted to LEKAKU automatically — no fiscal hardware to buy, install or maintain.",
      points: ["Automatic signing & submission", "QR-coded fiscal invoices", "Works with your existing devices"],
      cta: "Start fiscalising",
    },
    {
      tag: "POINT OF SALE",
      title: "Point of Sale",
      desc: "Run the whole shop from one powerful POS that fiscalises every sale instantly — takings, stock and customers on a single screen.",
      points: ["Instant fiscal receipts", "Cash, cards & bank takings", "Stock & customer management"],
      cta: "Explore POS",
    },
  ];
  return (
    <section id="solutions" style={{ background: PAPER, padding: "88px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: GREEN }}>OUR SOLUTIONS</div>
        <h2 style={{ fontFamily: fontHead, fontSize: "clamp(2rem,4vw,3rem)", color: INK, margin: "10px 0 12px", letterSpacing: "-0.02em" }}>
          Two products, one seamless system.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, marginTop: 40 }}>
          {cards.map((c) => (
            <div key={c.title} style={{ background: INK, color: "#fff", borderRadius: 24, padding: "36px 32px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.14em", color: "#93C5FD", marginBottom: 12 }}>{c.tag}</div>
              <h3 style={{ fontFamily: fontHead, fontSize: 28, margin: "0 0 10px", color: "#fff" }}>{c.title}</h3>
              <p style={{ fontFamily: fontBody, fontSize: 14.5, lineHeight: 1.7, opacity: 0.7, margin: "0 0 20px" }}>{c.desc}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                {c.points.map((pt) => (
                  <li key={pt} style={{ fontFamily: fontBody, fontSize: 13.5, display: "flex", gap: 9, opacity: 0.85 }}>
                    <span style={{ color: "#93C5FD" }}>✓</span>{pt}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setLocation("/auth?mode=signup")}
                style={{ fontFamily: fontBody, fontWeight: 700, fontSize: 14, padding: "13px", borderRadius: 999, background: GREEN, color: "#fff", border: "none", cursor: "pointer", width: "100%" }}
              >
                {c.cta} →
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { t: "Real-time LEKAKU sync", d: "The moment you generate an invoice it is fiscalised — no manual uploads, no duplicate submissions, no month-end scramble.", tag: "INTEGRATION" },
  { t: "Auto compliance", d: "Duplicate detection, instant error reports, QR-coded invoices, autogenerated VAT summaries and end-of-day reports.", tag: "COMPLIANCE" },
  { t: "Smart POS", d: "Cloud POS combining sales, instant fiscal invoicing, multiple payment kinds, inventory and customers on one screen.", tag: "POINT OF SALE" },
  { t: "Multi-currency", d: "Compliant invoicing in loti with ZAR and USD support for cross-border trade, plus consolidated reporting.", tag: "CURRENCY" },
  { t: "Data security", d: "Every transaction encrypted end to end and uniquely tracked, with bank-level storage and a clear audit trail.", tag: "SECURITY" },
  { t: "Network resilience", d: "Power cuts and poor signal don't stop you. Sales queue offline and sync to LEKAKU automatically when you're back.", tag: "RELIABILITY" },
  { t: "Analytics & reports", d: "Watch performance live, track sales in real time, and report by product, branch, currency or date — from anywhere.", tag: "INSIGHT" },
  { t: "Loti-first ledger", d: "Full double-entry accounting in LSL, with 15% VAT handled automatically and export-ready RSL returns.", tag: "ACCOUNTING" },
];

function Features() {
  return (
    <section id="features" style={{ background: "#fff", padding: "88px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: GREEN }}>CAPABILITIES</div>
        <h2 style={{ fontFamily: fontHead, fontSize: "clamp(2rem,4vw,3rem)", color: INK, margin: "10px 0 12px", letterSpacing: "-0.02em" }}>
          Everything compliance needs, nothing it doesn't.
        </h2>
        <p style={{ fontFamily: fontBody, fontSize: 16, color: "#5A6660", maxWidth: 560 }}>
          Leading software features that keep Basotho businesses selling.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14, marginTop: 40 }}>
          {FEATURES.map((f) => (
            <div key={f.t} style={{ background: PAPER, border: `1px solid ${STONE}`, borderRadius: 20, padding: "26px 24px" }}>
              <div style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.14em", color: BLUE, marginBottom: 10 }}>{f.tag}</div>
              <h3 style={{ fontFamily: fontHead, fontSize: 20, color: INK, margin: "0 0 8px" }}>{f.t}</h3>
              <p style={{ fontFamily: fontBody, fontSize: 14, lineHeight: 1.65, color: "#3D4A43", margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const INTEGRATIONS = [
  { name: "QuickBooks", tag: "ACCOUNTING", mark: "Q", brand: "#2CA01C", d: "Push invoices, customers and VAT totals into QuickBooks Online with guided CSV imports your bookkeeper will recognise." },
  { name: "Xero", tag: "ACCOUNTING", mark: "X", brand: "#13B5EA", d: "Export Xero-ready invoices, contacts and bank-friendly statements for fast reconciliation." },
  { name: "Zoho Books", tag: "ACCOUNTING", mark: "Z", brand: "#E42527", d: "Move invoices and customer records into Zoho Books using mapped import templates." },
  { name: "Sage", tag: "ACCOUNTING", mark: "S", brand: "#00A651", d: "Hand your accountant Sage-compatible journals, VAT reports and customer ledgers at month end." },
  { name: "Odoo", tag: "ERP", mark: "O", brand: "#714B67", d: "Keep products, customers and invoices in step with Odoo through CSV and API on Production plans." },
  { name: "ERPNext", tag: "ERP", mark: "E", brand: "#16324F", d: "API-ready JSON exports for sales invoices, items and customers into your ERPNext site." },
  { name: "Oracle NetSuite", tag: "ENTERPRISE ERP", mark: "N", brand: "#C74634", d: "Enterprise-grade journal and invoice exports formatted for NetSuite import and consolidation." },
];

function Integrations() {
  return (
    <section id="integrations" style={{ background: PAPER, padding: "88px 24px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: GREEN }}>INTEGRATIONS</div>
        <h2 style={{ fontFamily: fontHead, fontSize: "clamp(2rem,4vw,3rem)", color: INK, margin: "10px 0 12px", letterSpacing: "-0.02em" }}>
          Plays well with the systems you already use.
        </h2>
        <p style={{ fontFamily: fontBody, fontSize: 16, color: "#5A6660", maxWidth: 600 }}>
          No rip-and-replace. FiscalStack handles RSL fiscalisation and day-to-day
          selling, while invoices, customers and reports flow into your accounting
          system or ERP — through guided exports and API.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14, marginTop: 40 }}>
          {INTEGRATIONS.map((g) => (
            <div key={g.name} style={{ background: "#fff", border: `1px solid ${STONE}`, borderRadius: 20, padding: "26px 24px" }}>
              <div style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.14em", color: BLUE, marginBottom: 12 }}>{g.tag}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div
                  aria-hidden
                  style={{
                    width: 44, height: 44, borderRadius: 12, background: g.brand, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: fontBody, fontWeight: 800, fontSize: 20, flexShrink: 0,
                  }}
                >
                  {g.mark}
                </div>
                <h3 style={{ fontFamily: fontHead, fontSize: 20, color: INK, margin: 0 }}>{g.name}</h3>
              </div>
              <p style={{ fontFamily: fontBody, fontSize: 14, lineHeight: 1.65, color: "#3D4A43", margin: 0 }}>{g.d}</p>
            </div>
          ))}
          <div style={{ background: INK, color: "#fff", borderRadius: 20, padding: "26px 24px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.14em", color: "#93C5FD", marginBottom: 10 }}>CUSTOM / API</div>
            <h3 style={{ fontFamily: fontHead, fontSize: 20, color: "#fff", margin: "0 0 8px" }}>Something else?</h3>
            <p style={{ fontFamily: fontBody, fontSize: 14, lineHeight: 1.65, opacity: 0.7, margin: "0 0 18px" }}>Production and Enterprise plans include API access and onboarding help to connect your exact stack.</p>
            <button
              onClick={() => window.open(waUrl("Lumela! I want to connect FiscalStack to my accounting system."), "_blank")}
              style={{ fontFamily: fontBody, fontWeight: 700, fontSize: 14, padding: "12px", borderRadius: 999, background: GREEN, color: "#fff", border: "none", cursor: "pointer" }}
            >
              Talk to us →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Compliance() {
  const steps = [
    ["1", "Register your business", "Add your company with its RSL Tax Identification Number. We set LSL, 15% VAT and Maseru timezone for you."],
    ["2", "Connect LEKAKU", "Enter your RSL device credentials once. FiscalStack handles signing, submission and receipt chaining."],
    ["3", "Invoice & sell", "Create A4 invoices, thermal receipts and POS sales — all fiscalized automatically, online or offline."],
    ["4", "File with RSL", "Pull VAT reports and verification-ready records whenever RSL asks. No penalties, no paperwork panic."],
  ];
  return (
    <section id="compliance" style={{ background: GREEN_DARK, padding: "88px 24px", color: "#fff" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: "#93C5FD" }}>RSL COMPLIANCE PATH</div>
        <h2 style={{ fontFamily: fontHead, fontSize: "clamp(2rem,4vw,3rem)", margin: "10px 0 12px", color: "#fff" }}>
          From signup to fiscalized in a day.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14, marginTop: 36 }}>
          {steps.map(([n, t, d]) => (
            <div key={n} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 20, padding: "24px 22px" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", color: GREEN_DARK, fontFamily: fontHead, fontWeight: 700, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>{n}</div>
              <h3 style={{ fontFamily: fontBody, fontWeight: 700, fontSize: 16, margin: "0 0 8px", color: "#fff" }}>{t}</h3>
              <p style={{ fontFamily: fontBody, fontSize: 13.5, lineHeight: 1.65, opacity: 0.75, margin: 0 }}>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Support() {
  return (
    <section style={{ background: "#fff", padding: "88px 24px" }}>
      <div
        style={{
          maxWidth: 1180, margin: "0 auto", background: PAPER,
          border: `1px solid ${STONE}`, borderRadius: 28, padding: "56px 48px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center",
        }}
        className="lk-support-grid"
      >
        <div>
          <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: GREEN }}>SUPPORT</div>
          <h2 style={{ fontFamily: fontHead, fontSize: "clamp(1.8rem,3.4vw,2.6rem)", color: INK, margin: "10px 0 12px" }}>
            Live help from people who know RSL.
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 15, lineHeight: 1.75, color: "#3D4A43" }}>
            Get up and running in minutes with our Maseru-based team beside
            you — setup, remote assistance and guidance through your first
            fiscalisation. From onboarding to troubleshooting, we're committed
            to making your compliance journey smooth and stress-free.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            ["Onboarding in minutes", "RSL device linking done with you, not by you."],
            ["Remote assistance", "Screen-share help when you need it, in Sesotho or English."],
            ["Compliance updates", "RSL rule changes land in the product — never as your problem."],
          ].map(([t, d]) => (
            <div key={t} style={{ background: "#fff", border: `1px solid ${STONE}`, borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ fontFamily: fontBody, fontWeight: 700, fontSize: 15, color: INK, marginBottom: 4 }}>
                <span style={{ color: GREEN, marginRight: 8 }}>✓</span>{t}
              </div>
              <div style={{ fontFamily: fontBody, fontSize: 13.5, color: "#5A6660", lineHeight: 1.6 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
      <style>{`@media(max-width:900px){.lk-support-grid{grid-template-columns:1fr!important;padding:36px 24px!important}}`}</style>
    </section>
  );
}

function Testimonials() {
  const quotes = [
    ["Using FiscalStack is a simple, painless process. When the network drops, nothing gets fiscalised twice — month end is smoother.", "Lineo M.", "Boutique Owner · Maseru"],
    ["Our invoices, VAT and end-of-day reports just happen now. RSL queries take minutes instead of days.", "Thabo K.", "Wholesaler · Leribe"],
    ["No hardware, no engineers on site. We signed up in the morning and fiscalised our first sale the same day.", "Palesa N.", "Café Owner · Mafeteng"],
  ];
  return (
    <section style={{ background: PAPER, padding: "88px 24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: GREEN }}>TESTIMONIALS</div>
          <h2 style={{ fontFamily: fontHead, fontSize: "clamp(2rem,4vw,3rem)", color: INK, margin: "10px 0 8px" }}>
            Trusted by Basotho merchants.
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 14, color: "#5A6660" }}>Rated 4.9/5 for end-user satisfaction.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
          {quotes.map(([q, a, r]) => (
            <div key={a} style={{ background: "#fff", border: `1px solid ${STONE}`, borderRadius: 20, padding: "28px 26px" }}>
              <div style={{ fontFamily: fontHead, fontSize: 40, lineHeight: 1, color: GREEN, opacity: 0.35 }}>"</div>
              <p style={{ fontFamily: fontBody, fontSize: 14.5, lineHeight: 1.7, color: "#10231A", margin: "0 0 20px" }}>{q}</p>
              <div style={{ fontFamily: fontBody, fontWeight: 700, fontSize: 14, color: INK }}>{a}</div>
              <div style={{ fontFamily: fontMono, fontSize: 11, color: "#5A6660" }}>{r}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [, setLocation] = useLocation();
  const plans = [
    { name: "Test mode", price: "Mahala", per: "free forever", desc: "Learn the system with sandboxed LEKAKU.", feats: ["Unlimited test invoices", "Sandboxed LEKAKU", "Sesotho + English support"], hot: false, cta: "Start free" },
    { name: "Production", price: "M2,700", per: "per device / year", desc: "Live RSL fiscalization for real trade.", feats: ["Unlimited live invoices", "Live LEKAKU sync + QR", "Cash, card & bank tracking", "Offline POS + A4 + receipts", "Priority Maseru support"], hot: true, cta: "Get started" },
    { name: "Enterprise", price: "Custom", per: "groups & chains", desc: "Multi-branch, payroll and integrations.", feats: ["Multi-branch + approvals", "PAYE & payroll", "Accountant access", "Onboarding & training"], hot: false, cta: "Talk to us" },
  ];
  return (
    <section id="pricing" style={{ background: PAPER, padding: "88px 24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: GREEN }}>PRICING IN LOTI</div>
          <h2 style={{ fontFamily: fontHead, fontSize: "clamp(2rem,4vw,3rem)", color: INK, margin: "10px 0" }}>Fair prices, no surprises.</h2>
          <p style={{ fontFamily: fontBody, color: "#5A6660" }}>Pay by bank transfer or card, invoiced in loti.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginTop: 40 }}>
          {plans.map((p) => (
            <div key={p.name} style={{ background: p.hot ? INK : "#fff", color: p.hot ? "#fff" : INK, border: `1px solid ${p.hot ? INK : STONE}`, borderRadius: 24, padding: "32px 28px", display: "flex", flexDirection: "column" }}>
              <div style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.14em", color: p.hot ? "#93C5FD" : BLUE }}>{p.name.toUpperCase()}</div>
              <div style={{ fontFamily: fontHead, fontSize: 44, fontWeight: 700, margin: "10px 0 2px" }}>{p.price}</div>
              <div style={{ fontFamily: fontBody, fontSize: 13, opacity: 0.65, marginBottom: 8 }}>{p.per}</div>
              <p style={{ fontFamily: fontBody, fontSize: 14, opacity: 0.8, margin: "0 0 20px" }}>{p.desc}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                {p.feats.map((f) => (
                  <li key={f} style={{ fontFamily: fontBody, fontSize: 13.5, display: "flex", gap: 8 }}>
                    <span style={{ color: GREEN }}>✓</span>{f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => (p.cta === "Talk to us" ? window.open(waUrl("Lumela! I need Enterprise pricing for Lesotho."), "_blank") : setLocation("/auth?mode=signup"))}
                style={{ fontFamily: fontBody, fontWeight: 700, fontSize: 14, padding: 13, borderRadius: 999, border: "none", cursor: "pointer", background: p.hot ? GREEN : INK, color: "#fff" }}
              >
                {p.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const faqs = [
    ["What is LEKAKU and do I need it?", "LEKAKU is Revenue Services Lesotho's fiscalization system. If your business is registered for VAT with RSL, sales must go through a compliant fiscal solution that signs each transaction and produces a verifiable receipt. FiscalStack handles all of that for you."],
    ["How does RSL verification work?", "Every fiscalized invoice carries a QR code. Anyone — including RSL officers — can scan it to confirm the sale on the LEKAKU system. Verification details live on lekaku.rsl.co.ls."],
    ["How do we pay for subscriptions?", "By bank transfer or card, invoiced in loti. Inside the app, cash, card and bank-transfer sales are tracked as native payment methods."],
    ["Do I need to buy fiscal hardware?", "No. FiscalStack is fully virtual — it runs on the phones and computers you already have, plus any receipt printer. No devices to install or maintain."],
    ["Does FiscalStack connect to my accounting system?", "Yes. Export invoices, customers, VAT reports and journals in formats that import cleanly into QuickBooks, Xero, Zoho Books, Sage, Odoo, ERPNext and NetSuite — with API access on Production and Enterprise plans."],
    ["What happens when the internet goes down?", "You keep selling. The POS queues transactions locally with full receipt printing, then submits them to LEKAKU automatically when connectivity returns — critical for areas outside Maseru."],
    ["Is my data safe if I cancel?", "Always yours. Export invoices, reports and records (PDF, CSV, JSON) at any time, with a 90-day window after cancellation."],
  ];
  return (
    <section id="faq" style={{ background: "#fff", padding: "88px 24px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: GREEN }}>LIPOTSO · FAQ</div>
        <h2 style={{ fontFamily: fontHead, fontSize: "clamp(2rem,4vw,2.8rem)", color: INK, margin: "10px 0 28px" }}>Questions, answered.</h2>
        {faqs.map(([q, a], i) => (
          <div key={q} style={{ borderBottom: `1px solid ${STONE}`, padding: "16px 0" }}>
            <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", display: "flex", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", fontFamily: fontHead, fontWeight: 700, fontSize: 17, color: INK, textAlign: "left" }}>
              {q}<span style={{ color: GREEN }}>{open === i ? "−" : "+"}</span>
            </button>
            {open === i && <p style={{ fontFamily: fontBody, fontSize: 14.5, lineHeight: 1.7, color: "#3D4A43" }}>{a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: INK, color: "#fff" }}>
      <BlanketStripe flip />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 24px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 32, marginBottom: 40 }}>
          <div style={{ maxWidth: 300 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
              <LesothoMark size={34} color="#fff" />
              <div>
                <div style={{ fontFamily: fontHead, fontWeight: 700, fontSize: 18 }}>FiscalStack</div>
                <div style={{ fontFamily: fontMono, fontSize: 9, letterSpacing: "0.14em", color: "#93C5FD" }}>LESOTHO</div>
              </div>
            </div>
            <p style={{ fontFamily: fontBody, fontSize: 13, opacity: 0.6, lineHeight: 1.65 }}>
              RSL-compliant fiscalization, accounting and POS for the Kingdom of Lesotho. Khotso · Pula · Nala.
            </p>
            <p style={{ fontFamily: fontMono, fontSize: 11, color: "#93C5FD" }}>lesotho@fiscalstack.co.zw · +266 5812 3456</p>
          </div>
          {[
            ["Product", ["Solutions", "Features", "Integrations", "Pricing", "FAQ"]],
            ["Company", ["Sign in", "Get started", "WhatsApp us"]],
          ].map(([h, items]) => (
            <div key={h as string}>
              <h5 style={{ fontFamily: fontMono, fontSize: 10, letterSpacing: "0.14em", color: "#93C5FD", marginBottom: 14 }}>{h}</h5>
              <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                {(items as string[]).map((it) => (
                  <li key={it}>
                    <a href={it === "Sign in" ? "/auth" : it === "Get started" ? "/auth?mode=signup" : it === "WhatsApp us" ? waUrl("Lumela FiscalStack!") : `#${it.toLowerCase()}`} style={{ fontFamily: fontBody, fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>
                      {it}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 18, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontFamily: fontMono, fontSize: 10, opacity: 0.55 }}>
          <span>© 2026 FiscalStack · Maseru, Lesotho</span>
          <span>RSL LEKAKU · LSL · Sesotho + English</span>
        </div>
      </div>
    </footer>
  );
}

export default function LekakuLanding() {
  return (
    <div style={{ fontFamily: fontBody, background: PAPER, minHeight: "100vh" }}>
      <Fonts />
      <Nav />
      <Hero />
      <Mission />
      <Solutions />
      <Features />
      <Integrations />
      <Compliance />
      <Support />
      <Testimonials />
      <Pricing />
      <Faq />
      {/* Closing CTA */}
      <section style={{ background: PAPER, padding: "88px 24px", textAlign: "center" }}>
        <h2 style={{ fontFamily: fontHead, fontSize: "clamp(2.2rem,4.6vw,3.6rem)", color: INK, margin: "0 0 12px" }}>
          Ready to start?
        </h2>
        <p style={{ fontFamily: fontBody, color: "#5A6660", marginBottom: 28 }}>Rea u amohela — join Basotho businesses invoicing in loti with RSL confidence.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/auth?mode=signup" style={{ fontFamily: fontBody, fontWeight: 700, background: GREEN_DARK, color: "#fff", padding: "14px 32px", borderRadius: 999, textDecoration: "none" }}>
            Start free trial
          </a>
          <a href={waUrl("Lumela! I want a FiscalStack demo.")} target="_blank" rel="noreferrer" style={{ fontFamily: fontBody, fontWeight: 700, background: "#fff", color: INK, border: `1.5px solid ${INK}`, padding: "12px 30px", borderRadius: 999, textDecoration: "none" }}>
            Book a demo
          </a>
        </div>
      </section>
      <Footer />
    </div>
  );
}
