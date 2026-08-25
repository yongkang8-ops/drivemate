"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MagnifyingGlass, Package, Wrench } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";

type CatalogueProduct = {
  sku: string; brand: string; name: string; nameZh?: string; category: string; partNumber?: string;
  imageUrl?: string; fitment?: string; availability: "Available" | "Enquire"; availableStock?: number; tradePriceExGstCents?: number;
};

const categoryImage: Record<string, string> = {
  filter: "/assets/real-parts/oil-filter-main.webp",
  air: "/assets/real-parts/air-filter-main.webp",
  fuel: "/assets/real-parts/fuel-filter-main.webp",
};
function imageFor(product: CatalogueProduct) {
  if (product.imageUrl) return product.imageUrl;
  const value = `${product.name} ${product.category}`.toLowerCase();
  return Object.entries(categoryImage).find(([keyword]) => value.includes(keyword))?.[1] ?? "/assets/real-parts/oil-filter-main.webp";
}

export function CatalogueBrowser({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    async function loadCatalogue() {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch("/api/catalogue", {
            credentials: "include",
          });
          const body = await response.json();
          if (!response.ok || !body.ok) {
            throw new Error("Catalogue unavailable");
          }
          if (active) {
            setProducts(body.products);
            setState("ready");
          }
          return;
        } catch {
          if (attempt === 1 && active) setState("error");
        }
      }
    }

    void loadCatalogue();
    return () => { active = false; };
  }, []);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => [product.sku, product.partNumber, product.name, product.category, product.fitment, product.brand].some((value) => value?.toLowerCase().includes(term)));
  }, [products, query]);

  return <section>
    <div className="catalogue-toolbar"><MagnifyingGlass size={21} aria-hidden="true" /><label className="sr-only" htmlFor="catalogue-query">Search released catalogue</label><input id="catalogue-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Part Number, SKU, vehicle, engine or part name" /><span>{state === "ready" ? `${filtered.length} released items` : "Released stock only"}</span></div>
    {state === "loading" && <div className="catalogue-state" role="status"><Package size={28} /><h2>Loading released catalogue</h2><p>Checking current Brisbane availability.</p></div>}
    {state === "error" && <div className="catalogue-state" role="alert"><Wrench size={28} /><h2>Catalogue is temporarily unavailable</h2><p>Refresh the page or submit a fitment request from your Trade Portal.</p><button className="button button-secondary" onClick={() => location.reload()}>Try again</button></div>}
    {state === "ready" && filtered.length === 0 && <div className="catalogue-state"><Wrench size={28} /><h2>No released match found</h2><p>Try a Part Number or vehicle term. Approved workshops can submit a no-match request.</p><Link className="button button-primary" href="/portal">Open Trade Portal<ArrowRight size={18} /></Link></div>}
    {state === "ready" && filtered.length > 0 && <div className="product-grid">{filtered.map((product) => <article className="product-card" key={product.sku}>
      <div className="product-image"><Image className={product.imageUrl ? "product-image-photo" : "product-image-fallback"} src={imageFor(product)} alt={product.name} fill sizes="(max-width: 700px) 100vw, 25vw" /></div>
      <div className="product-body"><div className="product-meta"><span>{product.brand}</span><span>{product.availability}</span></div><h2>{product.name}</h2><p className="part-number">PN {product.partNumber || "Available on request"}</p><p className="fitment-copy">{product.fitment || "Reviewed fitment available after login"}</p><div className="product-footer"><strong>{product.tradePriceExGstCents === undefined ? "Trade price after login" : `$${(product.tradePriceExGstCents / 100).toFixed(2)} ex GST`}</strong><span>{product.availableStock === undefined ? product.availability : `${product.availableStock} available`}</span></div></div>
    </article>)}</div>}
  </section>;
}
