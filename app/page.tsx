import Link from "next/link";
import { TradeAccountApplicationForm } from "../components/TradeAccountApplicationForm";

export default function HomePage() {
  return (
    <main className="page-main">
      <section className="hero-grid">
        <div className="panel">
          <p className="eyebrow">Workshop trade supply</p>
          <h1>Trade parts supply for Chinese-brand vehicles in Australia</h1>
          <p className="lead">
            Search by rego, VIN, part number or vehicle, then build a workshop order through the
            DriveMate trade portal. The V1 application combines public lookup, workshop ordering,
            warehouse inventory, and internal administration in one system.
          </p>
          <div className="form-grid">
            <label>
              Rego, VIN, part number or keyword
              <input defaultValue="GWM Cannon Alpha filters" />
            </label>
            <label>
              Brand
              <select defaultValue="GWM">
                <option>GWM</option>
                <option>BYD</option>
                <option>MG</option>
              </select>
            </label>
          </div>
          <p>
            <Link className="primary-button" href="/catalogue">
              Search parts
            </Link>
          </p>
        </div>
        <aside className="panel">
          <p className="eyebrow">Portal preview</p>
          <h2>Vehicle match</h2>
          <div className="card-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div className="card">
              <span>Make</span>
              <strong>GWM</strong>
            </div>
            <div className="card">
              <span>Model</span>
              <strong>Cannon Alpha 2.4D</strong>
            </div>
            <div className="card">
              <span>Engine</span>
              <strong>GW4D24</strong>
            </div>
            <div className="card">
              <span>Market</span>
              <strong>AU-spec</strong>
            </div>
          </div>
        </aside>
      </section>

      <section className="card-grid" style={{ marginTop: 16 }}>
        {["AU-fitment lookup", "Brisbane stock visibility", "Workshop ordering", "Statements & invoices"].map(
          (title) => (
            <article className="card" key={title}>
              <h3>{title}</h3>
              <p>Designed for repeat trade workflows without exposing internal operating data.</p>
            </article>
          ),
        )}
      </section>
      <TradeAccountApplicationForm />
    </main>
  );
}
