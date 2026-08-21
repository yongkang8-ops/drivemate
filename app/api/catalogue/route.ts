import { NextResponse } from "next/server";
import { getRequestContext } from "../../../lib/serverAuth";
import { createServiceSupabaseClient } from "../../../lib/supabaseClient";

export async function GET(request: Request) {
  const auth = await getRequestContext(request);
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("sellable_catalogue")
    .select("sku, brand, part_name, part_name_zh, category, oem_part_number, image_url, source_fitment_text, available_stock")
    .order("sku");
  if (error) return NextResponse.json({ ok: false, message: "Catalogue is temporarily unavailable." }, { status: 503 });

  const trade = auth.role === "trade";
  let prices = new Map<string, number>();
  if (trade) {
    const { data: pricing } = await supabase.from("pricing_rules").select("sku, unit_price_ex_gst_cents").eq("channel", "trade").eq("status", "active");
    prices = new Map((pricing ?? []).map((row) => [row.sku, row.unit_price_ex_gst_cents]));
  }
  return NextResponse.json({
    ok: true,
    products: (data ?? []).map((product) => ({
      sku: product.sku,
      brand: product.brand,
      name: product.part_name,
      nameZh: product.part_name_zh,
      category: product.category,
      partNumber: product.oem_part_number,
      imageUrl: product.image_url,
      fitment: product.source_fitment_text,
      availability: Number(product.available_stock) > 0 ? "Available" : "Enquire",
      availableStock: trade ? product.available_stock : undefined,
      tradePriceExGstCents: trade ? prices.get(product.sku) : undefined,
    })),
  });
}
