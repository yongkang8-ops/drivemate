import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const sensitiveTerms = [
  "conservative",
  "scenario",
  "rebate",
  "price plus",
  "Southport",
  "Net 30",
  "credit limit",
  "Available credit",
  "Open balance",
  "Current rebate",
  "gross margin",
  "GST",
];

const publicPages = [
  { path: "/", label: "public home", expectedText: ["DriveMate Parts", "Trade parts supply"] },
  { path: "/catalogue", label: "catalogue", expectedText: ["Catalogue", "Search AU-fitment parts"] },
  { path: "/portal", label: "trade portal", expectedText: ["Trade portal", "Workshop lookup"], noindex: true },
  { path: "/warehouse", label: "warehouse", expectedText: ["Warehouse", "Scan-based"], noindex: true },
  { path: "/admin", label: "admin", expectedText: ["Admin backend", "operating queues"], noindex: true },
];

const expectedHealthChecks = ["repository", "auth", "navigation", "supabase_env", "document_bucket", "business_profile"];
const expectedSecurityHeaders = [
  { name: "x-content-type-options", value: "nosniff" },
  { name: "x-frame-options", value: "DENY" },
  { name: "referrer-policy", value: "strict-origin-when-cross-origin" },
  { name: "cross-origin-opener-policy", value: "same-origin" },
  { name: "permissions-policy", includes: ["camera=()", "microphone=()", "geolocation=()", "payment=()"] },
  { name: "strict-transport-security", includes: ["max-age=63072000", "includeSubDomains"] },
];

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function createResultTracker() {
  const failures = [];
  const warnings = [];

  return {
    pass(message) {
      console.log(`PASS ${message}`);
    },
    warn(message) {
      warnings.push(message);
      console.warn(`WARN ${message}`);
    },
    fail(message, details) {
      const line = details ? `${message}: ${details}` : message;
      failures.push(line);
      console.error(`FAIL ${line}`);
    },
    finish() {
      console.log("");
      console.log(`Summary: ${failures.length} failure(s), ${warnings.length} warning(s)`);
      if (failures.length) process.exitCode = 1;
    },
  };
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function expectedSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
}

async function request(baseUrl, path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
    headers: {
      ...(options.headers ?? {}),
    },
  });
}

async function readResponseText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function checkPublicPage(baseUrl, page, tracker) {
  const response = await request(baseUrl, page.path);
  const text = await readResponseText(response);

  if (response.status !== 200) {
    tracker.fail(`${page.label} should return 200`, `received ${response.status}`);
    return;
  }

  tracker.pass(`${page.label} returned 200`);
  checkSecurityHeaders(response, page.label, tracker);

  for (const expected of page.expectedText) {
    if (text.includes(expected)) tracker.pass(`${page.label} contains "${expected}"`);
    else tracker.fail(`${page.label} missing expected text`, expected);
  }

  const lowerText = text.toLowerCase();
  for (const term of sensitiveTerms) {
    if (lowerText.includes(term.toLowerCase())) {
      tracker.fail(`${page.label} exposes internal term`, term);
    }
  }

  if (page.noindex) {
    if (lowerText.includes('name="robots"') && lowerText.includes("noindex") && lowerText.includes("nofollow")) {
      tracker.pass(`${page.label} is marked noindex/nofollow`);
    } else {
      tracker.fail(`${page.label} missing noindex/nofollow robots metadata`);
    }
    checkNoIndexHeader(response, page.label, tracker);
  }
}

function checkNoIndexHeader(response, label, tracker) {
  const value = response.headers.get("x-robots-tag") ?? "";
  if (value.toLowerCase().includes("noindex") && value.toLowerCase().includes("nofollow")) {
    tracker.pass(`${label} X-Robots-Tag is noindex/nofollow`);
  } else {
    tracker.fail(`${label} missing X-Robots-Tag noindex/nofollow`, value || "not present");
  }
}

async function checkRobotsTxt(baseUrl, tracker) {
  const response = await request(baseUrl, "/robots.txt");
  const text = await readResponseText(response);
  if (response.status !== 200) {
    tracker.fail("robots.txt should return 200", `received ${response.status}`);
    return;
  }

  tracker.pass("robots.txt returned 200");
  for (const path of ["/portal", "/warehouse", "/admin", "/api"]) {
    if (text.includes(`Disallow: ${path}`)) tracker.pass(`robots.txt disallows ${path}`);
    else tracker.fail("robots.txt missing disallow rule", path);
  }
}

async function checkSitemap(baseUrl, tracker) {
  const response = await request(baseUrl, "/sitemap.xml");
  const text = await readResponseText(response);
  const siteUrl = expectedSiteUrl();
  if (response.status !== 200) {
    tracker.fail("sitemap.xml should return 200", `received ${response.status}`);
    return;
  }

  tracker.pass("sitemap.xml returned 200");

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("xml")) tracker.pass("sitemap.xml returned XML content type");
  else tracker.fail("sitemap.xml should return XML content type", contentType || "not present");

  if (siteUrl) {
    if (text.includes(`<loc>${siteUrl}/</loc>`)) tracker.pass("sitemap.xml uses NEXT_PUBLIC_SITE_URL for home page");
    else tracker.fail("sitemap.xml home page does not match NEXT_PUBLIC_SITE_URL", siteUrl);

    if (text.includes(`<loc>${siteUrl}/catalogue</loc>`) || text.includes(`<loc>${siteUrl}/catalogue/</loc>`)) {
      tracker.pass("sitemap.xml uses NEXT_PUBLIC_SITE_URL for catalogue page");
    } else {
      tracker.fail("sitemap.xml catalogue page does not match NEXT_PUBLIC_SITE_URL", siteUrl);
    }
  } else {
    if (/<loc>https?:\/\/[^<]+\/<\/loc>/.test(text)) tracker.pass("sitemap.xml includes public home page");
    else tracker.fail("sitemap.xml missing public home page");

    if (/<loc>https?:\/\/[^<]+\/catalogue\/?<\/loc>/.test(text)) {
      tracker.pass("sitemap.xml includes catalogue page");
    } else {
      tracker.fail("sitemap.xml missing catalogue page");
    }
  }

  for (const path of ["/portal", "/warehouse", "/admin", "/api"]) {
    if (text.includes(path)) tracker.fail("sitemap.xml exposes internal path", path);
    else tracker.pass(`sitemap.xml excludes ${path}`);
  }
}

function checkSecurityHeaders(response, label, tracker) {
  for (const expected of expectedSecurityHeaders) {
    const value = response.headers.get(expected.name);
    if (!value) {
      tracker.fail(`${label} missing security header`, expected.name);
      continue;
    }

    if ("value" in expected && value !== expected.value) {
      tracker.fail(`${label} security header has unexpected value`, `${expected.name}: ${value}`);
      continue;
    }

    if ("includes" in expected) {
      const missingParts = expected.includes.filter((part) => !value.includes(part));
      if (missingParts.length) {
        tracker.fail(`${label} security header is incomplete`, `${expected.name}: missing ${missingParts.join(", ")}`);
        continue;
      }
    }

    tracker.pass(`${label} security header present: ${expected.name}`);
  }

  if (response.headers.has("x-powered-by")) {
    tracker.fail(`${label} exposes framework header`, "x-powered-by");
  } else {
    tracker.pass(`${label} hides x-powered-by`);
  }
}

async function checkStatus(baseUrl, input, tracker) {
  const response = await request(baseUrl, input.path, {
    method: input.method ?? "GET",
    headers: input.headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });

  if (response.status === input.status) {
    tracker.pass(`${input.label} returned ${input.status}`);
  } else {
    tracker.fail(`${input.label} should return ${input.status}`, `received ${response.status}`);
  }

  return response;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function checkHealth(baseUrl, tracker) {
  const response = await request(baseUrl, "/api/health");
  const body = await readJson(response);

  if (response.status === 200) tracker.pass("health endpoint returned 200");
  else {
    tracker.fail("health endpoint should return 200", `received ${response.status}`);
    return;
  }

  if (body?.app === "DriveMate Parts") tracker.pass("health endpoint identifies the application");
  else tracker.fail("health endpoint returned an unexpected app name");
  checkNoIndexHeader(response, "health API", tracker);

  const checkNames = new Set(Array.isArray(body?.checks) ? body.checks.map((check) => check.name) : []);
  for (const name of expectedHealthChecks) {
    if (checkNames.has(name)) tracker.pass(`health check present: ${name}`);
    else tracker.fail(`health check missing: ${name}`);
  }
}

async function runAdminExportReadCheck(baseUrl, adminHeaders, tracker) {
  if (!requireRoleHeaders("admin export check", adminHeaders, tracker)) return;

  const catalogueResponse = await checkStatus(
    baseUrl,
    {
      label: "admin export inventory CSV",
      path: "/api/admin-export?type=catalogue",
      headers: adminHeaders,
      status: 200,
    },
    tracker,
  );

  const contentType = catalogueResponse.headers.get("content-type") ?? "";
  const disposition = catalogueResponse.headers.get("content-disposition") ?? "";
  const text = await readResponseText(catalogueResponse);

  if (contentType.includes("text/csv")) tracker.pass("admin export returned CSV content type");
  else tracker.fail("admin export should return CSV content type", contentType);

  if (disposition.includes("drivemate-catalogue-export.csv")) tracker.pass("admin export returned attachment filename");
  else tracker.fail("admin export should return the catalogue attachment filename", disposition);

  if (text.includes("sku,barcode,oem_part_number") && text.includes("DM-GWM-OF-001")) {
    tracker.pass("admin export contains inventory CSV rows");
  } else {
    tracker.fail("admin export CSV body is missing expected inventory data");
  }

  const batchResponse = await checkStatus(
    baseUrl,
    {
      label: "admin export purchase batch CSV",
      path: "/api/admin-export?type=purchase_batches",
      headers: adminHeaders,
      status: 200,
    },
    tracker,
  );
  const batchDisposition = batchResponse.headers.get("content-disposition") ?? "";
  const batchText = await readResponseText(batchResponse);

  if (batchDisposition.includes("drivemate-purchase-batches-export.csv")) {
    tracker.pass("admin export returned purchase batch attachment filename");
  } else {
    tracker.fail("admin export should return the purchase batch attachment filename", batchDisposition);
  }

  if (batchText.includes("batch_no,sku,received_quantity") && batchText.includes("BNE-2026-06-PILOT")) {
    tracker.pass("admin export contains purchase batch CSV rows");
  } else {
    tracker.fail("admin export purchase batch CSV body is missing expected data");
  }
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function roleHeaders(role, token, useDemoHeaders) {
  if (token) return authHeaders(token);
  if (useDemoHeaders) return { "x-drivemate-role": role };
  return null;
}

function requireRoleHeaders(label, headers, tracker) {
  if (headers) return true;
  tracker.fail(`${label} requires auth headers`, "set real smoke token env vars or use DRIVEMATE_SMOKE_USE_DEMO_HEADERS=true locally");
  return false;
}

async function runE2eWriteCheck(baseUrl, input, tracker) {
  const tradeHeaders = roleHeaders("trade", input.tradeToken, input.useDemoHeaders);
  const warehouseHeaders = roleHeaders("warehouse", input.warehouseToken, input.useDemoHeaders);
  const adminHeaders = roleHeaders("admin", input.adminToken, input.useDemoHeaders);

  const hasRequiredHeaders =
    requireRoleHeaders("e2e trade order check", tradeHeaders, tracker) &&
    requireRoleHeaders("e2e warehouse dispatch check", warehouseHeaders, tracker) &&
    requireRoleHeaders("e2e admin review check", adminHeaders, tracker);

  if (!hasRequiredHeaders) return;

  const poNumber = `SMOKE-${Date.now()}`;
  const lookupQuery = `${poNumber} GWM Cannon Alpha filters`;
  const lookupResponse = await checkStatus(
    baseUrl,
    {
      label: "e2e trade vehicle lookup",
      path: "/api/vehicle-lookup",
      method: "POST",
      headers: { "Content-Type": "application/json", ...tradeHeaders },
      body: {
        vin: "LGWDCF196RM608238",
        rego: "SMK001",
        query: lookupQuery,
      },
      status: 200,
    },
    tracker,
  );
  const lookupBody = await readJson(lookupResponse);
  if (Array.isArray(lookupBody?.matches)) tracker.pass("e2e trade vehicle lookup returned matched parts");
  else tracker.fail("e2e trade vehicle lookup returned an invalid body");

  const orderResponse = await checkStatus(
    baseUrl,
    {
      label: "e2e trade order submit",
      path: "/api/orders",
      method: "POST",
      headers: { "Content-Type": "application/json", ...tradeHeaders },
      body: {
        poNumber,
        vehicleVin: "LGWDCF196RM608238",
        vehicleRego: "SMK001",
        lines: [{ sku: input.sku, quantity: input.quantity }],
      },
      status: 200,
    },
    tracker,
  );
  const orderBody = await readJson(orderResponse);
  const orderId = orderBody?.order?.id;
  if (!orderBody?.ok || !orderId) {
    tracker.fail("e2e trade order submit returned an invalid body");
    return;
  }
  tracker.pass(`e2e order created: ${orderId}`);

  const cancelOrderResponse = await checkStatus(
    baseUrl,
    {
      label: "e2e trade cancellation order submit",
      path: "/api/orders",
      method: "POST",
      headers: { "Content-Type": "application/json", ...tradeHeaders },
      body: {
        poNumber: `SMOKE-CANCEL-${Date.now()}`,
        vehicleVin: "LGWDCF196RM608238",
        vehicleRego: "SMK002",
        lines: [{ sku: input.sku, quantity: input.quantity }],
      },
      status: 200,
    },
    tracker,
  );
  const cancelOrderBody = await readJson(cancelOrderResponse);
  const cancelOrderId = cancelOrderBody?.order?.id;
  if (!cancelOrderBody?.ok || !cancelOrderId) {
    tracker.fail("e2e trade cancellation order submit returned an invalid body");
    return;
  }

  const cancelResponse = await checkStatus(
    baseUrl,
    {
      label: "e2e trade order cancellation",
      path: `/api/orders/${cancelOrderId}/cancel`,
      method: "POST",
      headers: tradeHeaders,
      status: 200,
    },
    tracker,
  );
  const cancelBody = await readJson(cancelResponse);
  if (cancelBody?.order?.status === "cancelled") tracker.pass(`e2e order cancelled: ${cancelOrderId}`);
  else tracker.fail("e2e trade order cancellation returned an invalid status");

  const dispatchResponse = await checkStatus(
    baseUrl,
    {
      label: "e2e warehouse dispatch",
      path: `/api/orders/${orderId}/dispatch`,
      method: "POST",
      headers: { "Content-Type": "application/json", ...warehouseHeaders },
      body: { scans: [{ sku: input.sku, quantity: input.quantity }] },
      status: 200,
    },
    tracker,
  );
  const dispatchBody = await readJson(dispatchResponse);
  if (dispatchBody?.order?.status === "dispatched") {
    tracker.pass(`e2e order dispatched: ${orderId}`);
  } else {
    tracker.fail("e2e warehouse dispatch returned an invalid status");
    return;
  }

  const tradeStateResponse = await checkStatus(
    baseUrl,
    {
      label: "e2e trade account state after dispatch",
      path: "/api/trade-state",
      headers: tradeHeaders,
      status: 200,
    },
    tracker,
  );
  const tradeState = await readJson(tradeStateResponse);
  const documents = Array.isArray(tradeState?.accountDocuments) ? tradeState.accountDocuments : [];
  const invoice = documents.find((document) => document.type === "invoice" && document.reference === `INV-${orderId}`);
  const delivery = documents.find((document) => document.type === "delivery_record" && document.reference === `DEL-${orderId}`);
  const statement = documents.find((document) => document.type === "statement");

  if (invoice) tracker.pass("e2e invoice document is visible to trade account");
  else tracker.fail("e2e invoice document missing from trade account state");
  if (delivery) tracker.pass("e2e delivery record is visible to trade account");
  else tracker.fail("e2e delivery record missing from trade account state");
  if (statement) tracker.pass("e2e monthly statement is visible to trade account");
  else tracker.fail("e2e monthly statement missing from trade account state");

  if (invoice?.id) {
    const accessResponse = await checkStatus(
      baseUrl,
      {
        label: "e2e trade invoice access",
        path: `/api/account-documents/${invoice.id}`,
        headers: tradeHeaders,
        status: 200,
      },
      tracker,
    );
    const accessBody = await readJson(accessResponse);
    if (accessBody?.ok && accessBody.downloadUrl) tracker.pass("e2e invoice download URL issued");
    else tracker.fail("e2e invoice download URL missing");
  }

  const adminStateResponse = await checkStatus(
    baseUrl,
    {
      label: "e2e admin state after dispatch",
      path: "/api/admin-state",
      headers: adminHeaders,
      status: 200,
    },
    tracker,
  );
  const adminState = await readJson(adminStateResponse);
  const adminOrder = Array.isArray(adminState?.orders)
    ? adminState.orders.find((order) => order.id === orderId)
    : null;

  if (adminOrder?.status === "dispatched") tracker.pass("e2e dispatched order is visible in admin state");
  else tracker.fail("e2e dispatched order missing from admin state");

  const adminDocuments = Array.isArray(adminState?.accountDocuments) ? adminState.accountDocuments : [];
  const adminInvoice = adminDocuments.find((document) => document.reference === `INV-${orderId}`);
  const adminDelivery = adminDocuments.find((document) => document.reference === `DEL-${orderId}`);
  if (adminInvoice && adminDelivery) tracker.pass("e2e account documents are visible in admin state");
  else tracker.fail("e2e account documents missing from admin state");

  const lookupRequests = Array.isArray(adminState?.lookupRequests) ? adminState.lookupRequests : [];
  const adminLookup = lookupRequests.find((lookup) => lookup.query === lookupQuery && lookup.rego === "SMK001");
  if (adminLookup) tracker.pass("e2e trade lookup demand is visible in admin state");
  else tracker.fail("e2e trade lookup demand missing from admin state");
}

async function runWarehouseQaWriteCheck(baseUrl, input, tracker) {
  const warehouseHeaders = roleHeaders("warehouse", input.warehouseToken, input.useDemoHeaders);
  const adminHeaders = roleHeaders("admin", input.adminToken, input.useDemoHeaders);

  const hasRequiredHeaders =
    requireRoleHeaders("warehouse QA movement check", warehouseHeaders, tracker) &&
    requireRoleHeaders("warehouse QA admin review check", adminHeaders, tracker);

  if (!hasRequiredHeaders) return;

  const reference = `SMOKE-QA-${Date.now()}`;
  const quarantineResponse = await checkStatus(
    baseUrl,
    {
      label: "warehouse QA quarantine movement",
      path: "/api/inventory-movement",
      method: "POST",
      headers: { "Content-Type": "application/json", ...warehouseHeaders },
      body: {
        type: "quarantine",
        sku: input.sku,
        quantity: 3,
        reference,
        location: "BNE quarantine",
      },
      status: 200,
    },
    tracker,
  );
  const quarantineBody = await readJson(quarantineResponse);
  if (quarantineBody?.movement?.movement === "Quarantine") {
    tracker.pass("warehouse QA quarantine movement recorded");
  } else {
    tracker.fail("warehouse QA quarantine movement returned an invalid body");
    return;
  }

  const releaseResponse = await checkStatus(
    baseUrl,
    {
      label: "warehouse QA quarantine release",
      path: "/api/inventory-movement",
      method: "POST",
      headers: { "Content-Type": "application/json", ...warehouseHeaders },
      body: {
        type: "adjustment",
        sku: input.sku,
        quantity: 1,
        reference: `${reference}-REL`,
        location: "BNE quarantine",
        quarantineAction: "release",
      },
      status: 200,
    },
    tracker,
  );
  const releaseBody = await readJson(releaseResponse);
  if (releaseBody?.movement?.movement === "Quarantine Release") {
    tracker.pass("warehouse QA quarantine release recorded");
  } else {
    tracker.fail("warehouse QA quarantine release returned an invalid body");
  }

  const writeoffResponse = await checkStatus(
    baseUrl,
    {
      label: "warehouse QA quarantine write-off",
      path: "/api/inventory-movement",
      method: "POST",
      headers: { "Content-Type": "application/json", ...warehouseHeaders },
      body: {
        type: "adjustment",
        sku: input.sku,
        quantity: 1,
        reference: `${reference}-WO`,
        location: "BNE quarantine",
        quarantineAction: "writeoff",
      },
      status: 200,
    },
    tracker,
  );
  const writeoffBody = await readJson(writeoffResponse);
  if (writeoffBody?.movement?.movement === "Quarantine Write-off") {
    tracker.pass("warehouse QA quarantine write-off recorded");
  } else {
    tracker.fail("warehouse QA quarantine write-off returned an invalid body");
  }

  const adminStateResponse = await checkStatus(
    baseUrl,
    {
      label: "warehouse QA admin audit review",
      path: "/api/admin-state",
      headers: adminHeaders,
      status: 200,
    },
    tracker,
  );
  const adminState = await readJson(adminStateResponse);
  const movements = Array.isArray(adminState?.stockMovements) ? adminState.stockMovements : [];
  const hasRelease = movements.some((movement) => movement.reference === `${reference}-REL` && movement.movement === "Quarantine Release");
  const hasWriteoff = movements.some((movement) => movement.reference === `${reference}-WO` && movement.movement === "Quarantine Write-off");

  if (hasRelease && hasWriteoff) tracker.pass("warehouse QA movements are visible in admin audit state");
  else tracker.fail("warehouse QA movements missing from admin audit state");
}

async function runMasterDataWriteCheck(baseUrl, input, tracker) {
  const tradeHeaders = roleHeaders("trade", input.tradeToken, input.useDemoHeaders);
  const adminHeaders = roleHeaders("admin", input.adminToken, input.useDemoHeaders);
  const warehouseHeaders = roleHeaders("warehouse", input.warehouseToken, input.useDemoHeaders);

  const hasRequiredHeaders =
    requireRoleHeaders("master data lookup check", tradeHeaders, tracker) &&
    requireRoleHeaders("master data create check", adminHeaders, tracker) &&
    requireRoleHeaders("master data receiving check", warehouseHeaders, tracker);

  if (!hasRequiredHeaders) return;

  const suffix = Date.now().toString().slice(-8);
  const sku = `DM-GWM-SMK-${suffix}`;
  const barcode = `DMPGWMSMK${suffix}`;
  const oemPartNumber = `GWM-OEM-SMK-${suffix}`;

  const createResponse = await checkStatus(
    baseUrl,
    {
      label: "master data SKU bulk import",
      path: "/api/products/import",
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders },
      body: {
        rows: [
          {
            sku,
            brand: "GWM",
            name: "Smoke Test Service Part",
            category: "Service Filter",
            barcode,
            oemPartNumber,
            status: "active",
          },
        ],
      },
      status: 200,
    },
    tracker,
  );
  const createBody = await readJson(createResponse);
  const importedProduct = Array.isArray(createBody?.products)
    ? createBody.products.find((product) => product.sku === sku)
    : null;
  if (createBody?.summary?.created === 1 && importedProduct?.onHand === 0) {
    tracker.pass("master data SKU import is visible with zero starting stock");
  } else {
    tracker.fail("master data SKU import returned an invalid body");
    return;
  }

  const fitmentResponse = await checkStatus(
    baseUrl,
    {
      label: "master data fitment bulk import",
      path: "/api/fitment-rules/import",
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders },
      body: {
        rows: [
          {
            sku,
            make: "GWM",
            model: "Cannon Alpha",
            yearFrom: 2024,
            engine: "GW4D24",
            confidence: "confirm_vin",
          },
        ],
      },
      status: 200,
    },
    tracker,
  );
  const fitmentBody = await readJson(fitmentResponse);
  const importedRule = Array.isArray(fitmentBody?.rules) ? fitmentBody.rules.find((rule) => rule.sku === sku) : null;
  if (fitmentBody?.summary?.created === 1 && importedRule) tracker.pass("master data fitment import is visible to admin");
  else {
    tracker.fail("master data fitment import returned an invalid body");
    return;
  }

  const inboundResponse = await checkStatus(
    baseUrl,
    {
      label: "master data bulk receiving",
      path: "/api/inventory-movement/import",
      method: "POST",
      headers: { "Content-Type": "application/json", ...warehouseHeaders },
      body: {
        rows: [
          {
            type: "inbound",
            sku: barcode,
            quantity: 2,
            reference: `SMOKE-MASTER-${suffix}`,
            location: "BNE receiving",
          },
        ],
      },
      status: 200,
    },
    tracker,
  );
  const inboundBody = await readJson(inboundResponse);
  const inboundMovement = Array.isArray(inboundBody?.movements)
    ? inboundBody.movements.find((movement) => movement.sku === sku)
    : null;
  if (inboundBody?.summary?.created === 1 && inboundMovement) tracker.pass("master data barcode resolved through bulk receiving");
  else {
    tracker.fail("master data bulk receiving returned an invalid movement");
    return;
  }

  const adminStateResponse = await checkStatus(
    baseUrl,
    {
      label: "master data admin stock review",
      path: "/api/admin-state",
      headers: adminHeaders,
      status: 200,
    },
    tracker,
  );
  const adminState = await readJson(adminStateResponse);
  const row = Array.isArray(adminState?.catalogue)
    ? adminState.catalogue.find((product) => product.sku === sku)
    : null;

  if (row?.onHand >= 2 && row?.available >= 2) tracker.pass("master data created SKU is stocked in admin state");
  else tracker.fail("master data created SKU stock missing from admin state");

  const lookupResponse = await checkStatus(
    baseUrl,
    {
      label: "master data trade lookup",
      path: "/api/vehicle-lookup",
      method: "POST",
      headers: { "Content-Type": "application/json", ...tradeHeaders },
      body: { query: "GWM Cannon Alpha filters" },
      status: 200,
    },
    tracker,
  );
  const lookupBody = await readJson(lookupResponse);
  const match = Array.isArray(lookupBody?.matches)
    ? lookupBody.matches.find((product) => product.sku === sku)
    : null;
  if (match?.available >= 2) tracker.pass("master data created SKU is returned by trade lookup");
  else tracker.fail("master data created SKU missing from trade lookup");
}

async function runAccountProvisioningCheck(baseUrl, input, tracker) {
  const adminHeaders = roleHeaders("admin", input.adminToken, input.useDemoHeaders);
  if (!requireRoleHeaders("account provisioning check", adminHeaders, tracker)) return;

  const suffix = Date.now();
  const email = `smoke-provision-${suffix}@example.com`;
  const applicationResponse = await checkStatus(
    baseUrl,
    {
      label: "account provisioning application create",
      path: "/api/trade-account-applications",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        accountName: `Smoke Provision Workshop ${suffix}`,
        contactName: "Smoke Provisioner",
        contactEmail: email,
        contactPhone: "0400000000",
        postcode: "4000",
        notes: "Automated login provisioning check.",
      },
      status: 200,
    },
    tracker,
  );
  const applicationBody = await readJson(applicationResponse);
  const applicationId = applicationBody?.application?.id;
  if (!applicationBody?.ok || !applicationId) {
    tracker.fail("account provisioning application returned an invalid body");
    return;
  }

  const provisionResponse = await checkStatus(
    baseUrl,
    {
      label: "account provisioning login create",
      path: `/api/trade-account-applications/${applicationId}/provision-login`,
      method: "POST",
      headers: adminHeaders,
      status: 200,
    },
    tracker,
  );
  const provisionBody = await readJson(provisionResponse);
  if (
    provisionBody?.ok &&
    provisionBody.application?.status === "approved" &&
    provisionBody.login?.email === email
  ) {
    tracker.pass("account provisioning created an approved trade login profile");
  } else {
    tracker.fail("account provisioning returned an invalid body");
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const tracker = createResultTracker();
const baseUrl = normalizeBaseUrl(process.env.DRIVEMATE_BASE_URL ?? "http://127.0.0.1:3100");
const isLocalUrl = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
const useDemoHeaders = process.env.DRIVEMATE_SMOKE_USE_DEMO_HEADERS === "true";
const writeCheck = process.env.DRIVEMATE_SMOKE_WRITE_CHECK === "true";
const e2eCheck = process.env.DRIVEMATE_SMOKE_E2E_CHECK === "true";
const masterDataCheck = process.env.DRIVEMATE_SMOKE_MASTERDATA_CHECK === "true" || useDemoHeaders;
const accountProvisioningCheck = process.env.DRIVEMATE_SMOKE_ACCOUNT_PROVISION_CHECK === "true" || useDemoHeaders;
const e2eSku = process.env.DRIVEMATE_SMOKE_E2E_SKU ?? "DM-GWM-OF-001";
const e2eQuantity = Number.parseInt(process.env.DRIVEMATE_SMOKE_E2E_QTY ?? "1", 10);
const tradeToken = process.env.DRIVEMATE_SMOKE_TRADE_TOKEN;
const warehouseToken = process.env.DRIVEMATE_SMOKE_WAREHOUSE_TOKEN;
const adminToken = process.env.DRIVEMATE_SMOKE_ADMIN_TOKEN;

console.log("DriveMate staging application verification");
console.log(`Base URL: ${baseUrl}`);
console.log("");

if (isLocalUrl) {
  tracker.warn("verifying a local URL; run again with DRIVEMATE_BASE_URL set to the Vercel staging URL before launch");
}

await checkHealth(baseUrl, tracker);

for (const page of publicPages) {
  await checkPublicPage(baseUrl, page, tracker);
}
await checkRobotsTxt(baseUrl, tracker);
await checkSitemap(baseUrl, tracker);

await checkStatus(
  baseUrl,
  {
    label: "public admin API boundary",
    path: "/api/admin-state",
    status: 403,
  },
  tracker,
);
await checkStatus(
  baseUrl,
  {
    label: "public warehouse API boundary",
    path: "/api/warehouse-state",
    status: 403,
  },
  tracker,
);
await checkStatus(
  baseUrl,
  {
    label: "public vehicle lookup API boundary",
    path: "/api/vehicle-lookup",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { vin: "LGWDCF196RM608238" },
    status: 403,
  },
  tracker,
);
await checkStatus(
  baseUrl,
  {
    label: "public product import API boundary",
    path: "/api/products/import",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { rows: [] },
    status: 403,
  },
  tracker,
);
await checkStatus(
  baseUrl,
  {
    label: "public inventory movement import API boundary",
    path: "/api/inventory-movement/import",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { rows: [] },
    status: 403,
  },
  tracker,
);
await checkStatus(
  baseUrl,
  {
    label: "public fitment import API boundary",
    path: "/api/fitment-rules/import",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { rows: [] },
    status: 403,
  },
  tracker,
);
if (!isLocalUrl) {
  await checkStatus(
    baseUrl,
    {
      label: "deployed test reset API boundary",
      path: "/api/test/reset",
      method: "POST",
      status: 404,
    },
    tracker,
  );
}

if (useDemoHeaders) {
  await checkStatus(
    baseUrl,
    {
      label: "demo trade vehicle lookup",
      path: "/api/vehicle-lookup",
      method: "POST",
      headers: { "Content-Type": "application/json", "x-drivemate-role": "trade" },
      body: { vin: "LGWDCF196RM608238" },
      status: 200,
    },
    tracker,
  );
  await checkStatus(
    baseUrl,
    {
      label: "demo warehouse state",
      path: "/api/warehouse-state",
      headers: { "x-drivemate-role": "warehouse" },
      status: 200,
    },
    tracker,
  );
  await checkStatus(
    baseUrl,
    {
      label: "demo admin state",
      path: "/api/admin-state",
      headers: { "x-drivemate-role": "admin" },
      status: 200,
    },
    tracker,
  );
  await runAdminExportReadCheck(baseUrl, { "x-drivemate-role": "admin" }, tracker);
} else {
  tracker.warn("demo role checks skipped; set DRIVEMATE_SMOKE_USE_DEMO_HEADERS=true for local prototype checks only");
}

if (tradeToken) {
  await checkStatus(
    baseUrl,
    {
      label: "trade token vehicle lookup",
      path: "/api/vehicle-lookup",
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tradeToken) },
      body: { vin: "LGWDCF196RM608238" },
      status: 200,
    },
    tracker,
  );
  await checkStatus(
    baseUrl,
    {
      label: "trade token cannot read admin state",
      path: "/api/admin-state",
      headers: authHeaders(tradeToken),
      status: 403,
    },
    tracker,
  );
} else {
  tracker.warn("trade token check skipped; set DRIVEMATE_SMOKE_TRADE_TOKEN for staging auth verification");
}

if (warehouseToken) {
  await checkStatus(
    baseUrl,
    {
      label: "warehouse token state",
      path: "/api/warehouse-state",
      headers: authHeaders(warehouseToken),
      status: 200,
    },
    tracker,
  );
  await checkStatus(
    baseUrl,
    {
      label: "warehouse token cannot submit trade order",
      path: "/api/orders",
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(warehouseToken) },
      body: { lines: [{ sku: e2eSku, quantity: 1 }] },
      status: 403,
    },
    tracker,
  );
} else {
  tracker.warn("warehouse token check skipped; set DRIVEMATE_SMOKE_WAREHOUSE_TOKEN for staging auth verification");
}

if (adminToken) {
  await checkStatus(
    baseUrl,
    {
      label: "admin token state",
      path: "/api/admin-state",
      headers: authHeaders(adminToken),
      status: 200,
    },
    tracker,
  );
  await runAdminExportReadCheck(baseUrl, authHeaders(adminToken), tracker);
} else {
  tracker.warn("admin token check skipped; set DRIVEMATE_SMOKE_ADMIN_TOKEN for staging auth verification");
}

if (writeCheck) {
  await checkStatus(
    baseUrl,
    {
      label: "public trade account application write check",
      path: "/api/trade-account-applications",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: {
        accountName: `Smoke Test Workshop ${Date.now()}`,
        contactName: "Smoke Tester",
        contactEmail: `smoke-${Date.now()}@example.com`,
        contactPhone: "0400000000",
        postcode: "4000",
        notes: "Automated staging write check.",
      },
      status: 200,
    },
    tracker,
  );
} else {
  tracker.warn("write check skipped; set DRIVEMATE_SMOKE_WRITE_CHECK=true only when staging can accept test records");
}

if (e2eCheck) {
  if (!Number.isInteger(e2eQuantity) || e2eQuantity <= 0) {
    tracker.fail("DRIVEMATE_SMOKE_E2E_QTY must be a positive integer");
  } else {
    await runE2eWriteCheck(
      baseUrl,
      {
        tradeToken,
        warehouseToken,
        adminToken,
        useDemoHeaders,
        sku: e2eSku,
        quantity: e2eQuantity,
      },
      tracker,
    );
    await runWarehouseQaWriteCheck(
      baseUrl,
      {
        warehouseToken,
        adminToken,
        useDemoHeaders,
        sku: e2eSku,
      },
      tracker,
    );
  }
} else {
  tracker.warn("e2e write check skipped; set DRIVEMATE_SMOKE_E2E_CHECK=true only when staging can accept a test order and dispatch");
}

if (masterDataCheck) {
  await runMasterDataWriteCheck(
    baseUrl,
    {
      warehouseToken,
      adminToken,
      tradeToken,
      useDemoHeaders,
    },
    tracker,
  );
} else {
  tracker.warn("master data write check skipped; set DRIVEMATE_SMOKE_MASTERDATA_CHECK=true only when staging can accept a test SKU and inbound movement");
}

if (accountProvisioningCheck) {
  await runAccountProvisioningCheck(
    baseUrl,
    {
      adminToken,
      useDemoHeaders,
    },
    tracker,
  );
} else {
  tracker.warn("account provisioning check skipped; set DRIVEMATE_SMOKE_ACCOUNT_PROVISION_CHECK=true only when staging can accept a test workshop login");
}

tracker.finish();
