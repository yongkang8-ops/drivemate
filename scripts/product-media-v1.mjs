import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const MEDIA_FILENAME = /^(?<pn>[^_]+)_.+?_(?<kind>产品图片|标签图片)\.(?<extension>png|jpe?g)$/i;
const execAsync = promisify(exec);

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function quoteShell(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

async function postThroughVercel({ endpoint, scope, importToken, metadata, contentType, filePath }) {
  const url = `${endpoint}/api/internal/product-media-import`;
  const command = [
    "npx vercel curl", quoteShell(url), "--scope", quoteShell(scope), "-X", "POST",
    "-H", quoteShell(`content-type: ${contentType}`),
    "-H", quoteShell(`x-drivemate-media-import-token: ${importToken}`),
    "-H", quoteShell(`x-drivemate-media-metadata: ${metadata}`),
    "--data-binary", quoteShell(`@${filePath}`),
  ].join(" ");
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: process.cwd(), maxBuffer: 1024 * 1024, windowsHide: true });
      const matches = `${stdout}\n${stderr}`.match(/\{"ok":(?:true|false),[^\r\n]*\}/g);
      if (!matches?.length) throw new Error("Media import endpoint returned no JSON response.");
      return JSON.parse(matches.at(-1));
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw new Error(`Vercel media upload request failed after 4 attempts (${lastError?.code ?? "unknown"}).`);
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function loadMedia(sourceDirectory) {
  const entries = await (await import("node:fs/promises")).readdir(sourceDirectory, { withFileTypes: true });
  const grouped = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(MEDIA_FILENAME);
    if (!match?.groups) continue;
    const { pn, kind } = match.groups;
    const record = grouped.get(pn) ?? { pn };
    record[kind === "产品图片" ? "product" : "label"] = path.join(sourceDirectory, entry.name);
    grouped.set(pn, record);
  }
  return grouped;
}

async function prepare({ sourceDirectory, piPath, outputDirectory }) {
  const pi = JSON.parse(await readFile(piPath, "utf8"));
  const media = await loadMedia(sourceDirectory);
  const matched = [];
  const missing = [];
  const sourceRows = new Map(pi.items.map((item) => [item.pn, item]));

  for (const item of pi.items) {
    const pair = media.get(item.pn);
    if (!pair?.product || !pair?.label) {
      missing.push({ pn: item.pn, name_en: item.name_en, source_row: item.source_row, reason: "missing_product_or_label_image" });
      continue;
    }
    const destinationDirectory = path.join(outputDirectory, "product-images", item.pn);
    await mkdir(destinationDirectory, { recursive: true });
    const mainPath = path.join(destinationDirectory, "main.webp");
    const info = await sharp(pair.product)
      .rotate()
      .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 6 })
      .toFile(mainPath);

    const labelDirectory = path.join(outputDirectory, "product-evidence", item.pn);
    await mkdir(labelDirectory, { recursive: true });
    const labelPath = path.join(labelDirectory, "label.png");
    const labelInfo = await sharp(pair.label)
      .rotate()
      .png()
      .toFile(labelPath);
    matched.push({
      pn: item.pn,
      source_row: item.source_row,
      name_en: item.name_en,
      product: {
        source_file: path.basename(pair.product),
        source_sha256: await sha256(pair.product),
        prepared_file: path.relative(outputDirectory, mainPath).replaceAll("\\", "/"),
        prepared_sha256: await sha256(mainPath),
        bytes: (await stat(mainPath)).size,
        width: info.width,
        height: info.height,
      },
      label: {
        source_file: path.basename(pair.label),
        source_sha256: await sha256(pair.label),
        prepared_file: path.relative(outputDirectory, labelPath).replaceAll("\\", "/"),
        prepared_sha256: await sha256(labelPath),
        bytes: (await stat(labelPath)).size,
        width: labelInfo.width,
        height: labelInfo.height,
      },
    });
  }

  const sourceOnly = [...media.keys()].filter((pn) => !sourceRows.has(pn));
  const manifest = {
    version: "product-media-v1",
    prepared_at: new Date().toISOString(),
    source_directory: sourceDirectory,
    pi_file: piPath,
    source_contract: pi.metadata?.contract_no,
    expected_pi_part_numbers: pi.items.length,
    matched_count: matched.length,
    missing,
    source_only: sourceOnly,
    items: matched,
  };
  await writeFile(path.join(outputDirectory, "product-media-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function upload({ manifestPath }) {
  const endpoint = required(argument("endpoint"), "--endpoint is required").replace(/\/$/, "");
  const importToken = required(process.env.DRIVEMATE_MEDIA_IMPORT_TOKEN, "DRIVEMATE_MEDIA_IMPORT_TOKEN is required");
  const scope = argument("scope", "yongkang-lis-projects");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const outputDirectory = path.dirname(manifestPath);
  const limit = Number(argument("limit", "0"));
  const partNumber = argument("part-number");
  let items = partNumber
    ? manifest.items.filter((item) => item.pn === partNumber.toUpperCase())
    : manifest.items;
  if (partNumber && !items.length) throw new Error(`Part Number ${partNumber} is not present in the media manifest.`);
  if (Number.isInteger(limit) && limit > 0) items = items.slice(0, limit);
  const report = { uploaded_at: new Date().toISOString(), matched: [], missing: manifest.missing };
  const reportName = partNumber
    ? `product-media-upload-report-${partNumber.toUpperCase()}.json`
    : "product-media-upload-report.json";
  for (const item of items) {
    for (const media of [
      { mediaType: "main_image", contentType: "image/webp", file: item.product.prepared_file, originalFilename: item.product.source_file, sourceSha256: item.product.source_sha256, sha256: item.product.prepared_sha256, byteSize: item.product.bytes, width: item.product.width, height: item.product.height },
      { mediaType: "label_evidence", contentType: "image/png", file: item.label.prepared_file, originalFilename: item.label.source_file, sourceSha256: item.label.source_sha256, sha256: item.label.prepared_sha256, byteSize: item.label.bytes, width: item.label.width, height: item.label.height },
    ]) {
      const metadata = Buffer.from(JSON.stringify({ pn: item.pn, sourceRow: item.source_row, ...media })).toString("base64url");
      const payload = await postThroughVercel({
        endpoint, scope, importToken, metadata, contentType: media.contentType, filePath: path.join(outputDirectory, media.file),
      });
      if (!payload.ok) throw new Error(`Upload failed for ${item.pn}/${media.mediaType}: ${payload.message ?? "unknown error"}`);
      report.matched.push(payload);
      await writeFile(path.join(outputDirectory, reportName), `${JSON.stringify(report, null, 2)}\n`);
    }
  }
  await writeFile(path.join(outputDirectory, reportName), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

const command = required(process.argv[2], "Usage: node scripts/product-media-v1.mjs <prepare|upload>");
if (command === "prepare") {
  const sourceDirectory = required(argument("source"), "--source is required");
  const piPath = required(argument("pi"), "--pi is required");
  const outputDirectory = required(argument("output"), "--output is required");
  const manifest = await prepare({ sourceDirectory, piPath, outputDirectory });
  console.log(JSON.stringify({ matched: manifest.matched_count, missing: manifest.missing, manifest: path.join(outputDirectory, "product-media-manifest.json") }, null, 2));
} else if (command === "upload") {
  const manifestPath = required(argument("manifest"), "--manifest is required");
  const report = await upload({ manifestPath });
  console.log(JSON.stringify({ uploaded_media_records: report.matched.length, missing: report.missing }, null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}
