import Image from "next/image";
import Link from "../components/StableLink";
import { ArrowRight, Barcode, Package, ShieldCheck, Truck } from "@phosphor-icons/react/dist/ssr";
import { RevealSection } from "../components/RevealSection";
import { getTradingGate } from "../lib/tradingGate";

const servicePoints = [
  { icon: Barcode, title: "Fitment-led lookup", copy: "Search by approved VIN, Part Number, vehicle or engine. Unverified matches are sent for review." },
  { icon: Package, title: "Brisbane stock", copy: "See released availability after workshop sign-in, with batch-controlled warehouse handling." },
  { icon: Truck, title: "Workshop workflow", copy: "Keep job references with parts activity and receive carrier tracking once dispatch is available." },
  { icon: ShieldCheck, title: "Account records", copy: "Order confirmations, invoices, delivery records and statements stay with your account." },
];

const coverageReferenceParts = [
  { src: "/assets/real-parts/water-pump-main.webp", alt: "Water pump from the initial DriveMate GWM purchase range" },
  { src: "/assets/real-parts/transmission-pan-main.webp", alt: "Transmission pan from the initial DriveMate GWM purchase range" },
  { src: "/assets/real-parts/engine-mount-main.webp", alt: "Engine mount from the initial DriveMate GWM purchase range" },
];

export default function HomePage() {
  const tradingEnabled = getTradingGate().enabled;

  return (
    <main>
      <section className="public-hero">
        <Image src="/assets/brisbane-dispatch-hero-v2.webp" alt="DriveMate warehouse worker scanning and packing automotive parts in Brisbane" fill priority sizes="100vw" quality={72} />
        <div className="hero-content">
          <p className="eyebrow">Brisbane trade parts supply</p>
          <h1>Parts support built around the workshop job.</h1>
          <p className="lead">Focused supply for Chinese-brand vehicles in Australia, with reviewed fitment, local stock visibility and trade account access.</p>
          <form className="hero-search" action="/catalogue">
            <label className="sr-only" htmlFor="parts-search">VIN, Part Number, vehicle or engine</label>
            <input id="parts-search" name="q" placeholder="VIN, Part Number, vehicle or engine" autoComplete="off" />
            <button className="button button-primary" type="submit">Search catalogue<ArrowRight size={18} weight="bold" /></button>
          </form>
          <p className="hero-note">Rego can be saved as a workshop job reference. Automatic Rego decoding is not currently offered.</p>
        </div>
      </section>

      <RevealSection className="service-strip">
        {servicePoints.map(({ icon: Icon, title, copy }) => (
          <article key={title}><Icon size={25} weight="duotone" /><div><h2>{title}</h2><p>{copy}</p></div></article>
        ))}
      </RevealSection>

      <RevealSection className="coverage-band page-band">
        <div className="section-heading">
          <p className="eyebrow">Focused catalogue</p>
          <h2>Chinese-brand vehicle coverage, starting with GWM.</h2>
          <p>Initial coverage spans Cannon Alpha, Cannon, Haval H6, Haval Jolion and Tank 300 service, engine and chassis requirements. Every item remains hidden from ordering until fitment, compliance, price and stock gates are complete.</p>
          <Link className="text-link" href="/catalogue">Browse released catalogue <ArrowRight size={17} /></Link>
        </div>
        <aside className="coverage-showcase" aria-label="Initial GWM purchase range reference photography">
          <header><span>Initial GWM range</span><span>Reference imagery</span></header>
          {coverageReferenceParts.map(({ src, alt }, index) => (
            <figure className={index === 0 ? "coverage-photo coverage-photo-primary" : "coverage-photo"} key={src}>
              <Image src={src} alt={alt} fill sizes="(max-width: 1040px) 90vw, 32vw" quality={75} />
            </figure>
          ))}
          <footer>Service, engine and chassis components from the initial purchase range.</footer>
        </aside>
      </RevealSection>

      <RevealSection className="workflow-band page-band" id="delivery">
        <div className="section-heading"><p className="eyebrow">From lookup to dispatch</p><h2>A clear trade workflow with human review where it matters.</h2></div>
        <ol className="workflow-steps">
          <li><span>01</span><h3>Identify</h3><p>Use an approved VIN or send vehicle details for manual review.</p></li>
          <li><span>02</span><h3>Confirm</h3><p>Review Part Number, fitment summary, released stock and trade price.</p></li>
          <li><span>03</span><h3>{tradingEnabled ? "Order" : "Prepare"}</h3><p>{tradingEnabled ? "Add workshop references and submit against approved account terms." : "Save workshop requirements while live ordering remains closed."}</p></li>
          <li><span>04</span><h3>{tradingEnabled ? "Dispatch" : "Review"}</h3><p>{tradingEnabled ? "Receive carrier, tracking, delivery record and invoice after pick confirmation." : "Use reviewed fitment and account records to prepare for launch."}</p></li>
        </ol>
      </RevealSection>

      <RevealSection className="account-cta page-band" id="open-account">
        <div><p className="eyebrow">Workshop accounts</p><h2>Set up access for your team.</h2><p>Apply once, then use one workspace for vehicle lookup, account records and {tradingEnabled ? "ordering" : "launch preparation"}.</p></div>
        <div className="cta-actions"><Link className="button button-primary" href="/open-account">Open Trade Account<ArrowRight size={18} /></Link><Link className="button button-secondary" href="/portal">Trade Login</Link></div>
      </RevealSection>

      <section className="support-band page-band" id="support"><p><strong>Need a fitment check?</strong> Approved account holders can submit a no-match request from the Trade Portal with VIN, vehicle details and the required part.</p></section>
    </main>
  );
}
