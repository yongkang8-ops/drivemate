import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Barcode, Package, ShieldCheck, Truck } from "@phosphor-icons/react/dist/ssr";
import { RevealSection } from "../components/RevealSection";

const servicePoints = [
  { icon: Barcode, title: "Fitment-led lookup", copy: "Search by approved VIN, Part Number, vehicle or engine. Unverified matches are sent for review." },
  { icon: Package, title: "Brisbane stock", copy: "See released availability after workshop sign-in, with batch-controlled warehouse handling." },
  { icon: Truck, title: "Workshop delivery", copy: "Build an order, add a job reference and receive carrier tracking after dispatch." },
  { icon: ShieldCheck, title: "Account records", copy: "Order confirmations, tax invoices, delivery records and statements stay with your account." },
];

export default function HomePage() {
  return (
    <main>
      <section className="public-hero">
        <Image src="/assets/brisbane-dispatch-hero.webp" alt="DriveMate warehouse dispatch preparation in Brisbane" fill priority sizes="100vw" quality={72} />
        <div className="hero-content">
          <p className="eyebrow">Brisbane trade parts supply</p>
          <h1>Parts support built around the workshop job.</h1>
          <p className="lead">Focused supply for Chinese-brand vehicles in Australia, with reviewed fitment, local stock visibility and trade account ordering.</p>
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
        <div className="parts-rail" aria-label="Common parts categories">
          {[["/assets/oil-filter.png", "Service filters"], ["/assets/fuel-filter.png", "Fuel system"], ["/assets/air-filter.png", "Air intake"]].map(([src, label]) => (
            <figure key={label}><Image src={src} alt={label} width={320} height={220} /><figcaption>{label}</figcaption></figure>
          ))}
        </div>
      </RevealSection>

      <RevealSection className="workflow-band page-band" id="delivery">
        <div className="section-heading"><p className="eyebrow">From lookup to dispatch</p><h2>A clear trade workflow with human review where it matters.</h2></div>
        <ol className="workflow-steps">
          <li><span>01</span><h3>Identify</h3><p>Use an approved VIN or send vehicle details for manual review.</p></li>
          <li><span>02</span><h3>Confirm</h3><p>Review Part Number, fitment summary, released stock and trade price.</p></li>
          <li><span>03</span><h3>Order</h3><p>Add workshop references and submit against approved account terms.</p></li>
          <li><span>04</span><h3>Dispatch</h3><p>Receive carrier, tracking, delivery record and tax invoice after pick confirmation.</p></li>
        </ol>
      </RevealSection>

      <RevealSection className="account-cta page-band" id="open-account">
        <div><p className="eyebrow">Workshop accounts</p><h2>Set up access for your team.</h2><p>Apply once, then use one workspace for vehicle lookup, ordering and account documents.</p></div>
        <div className="cta-actions"><Link className="button button-primary" href="/open-account">Open Trade Account<ArrowRight size={18} /></Link><Link className="button button-secondary" href="/portal">Trade Login</Link></div>
      </RevealSection>

      <section className="support-band page-band" id="support"><p><strong>Need a fitment check?</strong> Approved account holders can submit a no-match request from the Trade Portal with VIN, vehicle details and the required part.</p></section>
    </main>
  );
}
