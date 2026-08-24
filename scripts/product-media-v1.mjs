import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const PRODUCT_SUFFIX = "_产品图片.png";
const LABEL_SUFFIX = "_标签图片.png";
const execAsync = promisify(exec);

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

async function resolveVercelBypassToken(endpoint) {
  const scope = argument("scope", "yongkang-lis-projects");
  const { stdout, stderr } = await execAsync(`npx vercel curl ${endpoint}/api/health --scope ${scope} --debug`, {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  const match = `${stdout}\n${stderr}`.match(/Using existing protection bypass token from project settings:\s*([^\s]+)/);
  if (!match) throw new Error("Unable to obtain a local Vercel deployment-protection bypass token.");
  return match[1];
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function relativePartNumber(name, suffix) {
  return name.endsWith(suffix) ? name.slice(0, -suffix.length).split("_")[0] : null;
}

async function loadMedia(sourceDirectory) {
  const entries = await (await import("node:fs/promises")).readdir(sourceDirectory, { withFileTypes: true });
  const grouped = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".png")) continue;
    const productPn = relativePartNumber(entry.name, PRODUCT_SUFFIX);
    const labelPn = relativePartNumber(entry.name, LABEL_SUFFIX);
    const pn = productPn ?? labelPn;
    if (!pn) continue;
    const record = grouped.get(pn) ?? { pn };
    record[productPn ? "product" : "label"] = path.join(sourceDirectory, entry.name);
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
    await copyFile(pair.label, labelPath);
    const labelMeta = await sharp(pair.label).metadata();
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
        bytes: (await stat(labelPath)).size,
        width: labelMeta.width,
        height: labelMeta.height,
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
  const vercelBypassToken = await resolveVercelBypassToken(endpoint);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const outputDirectory = path.dirname(manifestPath);
  const report = { uploaded_at: new Date().toISOString(), matched: [], missing: manifest.missing };
  for (const item of manifest.items) {
    for (const media of [
      { mediaType: "main_image", contentType: "image/webp", file: item.product.prepared_file, originalFilename: item.product.source_file, sha256: item.product.prepared_sha256, byteSize: item.product.bytes, width: item.product.width, height: item.product.height },
      { mediaType: "label_evidence", contentType: "image/png", file: item.label.prepared_file, originalFilename: item.label.source_file, sha256: item.label.source_sha256, byteSize: item.label.bytes, width: item.label.width, height: item.label.height },
    ]) {
      const metadata = Buffer.from(JSON.stringify({ pn: item.pn, sourceRow: item.source_row, ...media })).toString("base64url");
      const response = await fetch(`${endpoint}/api/internal/product-media-import`, {
        method: "POST",
        headers: {
          "content-type": media.contentType,
          "x-vercel-protection-bypass": vercelBypassToken,
          "x-drivemate-media-import-token": importToken,
          "x-drivemate-media-metadata": metadata,
        },
        body: await readFile(path.join(outputDirectory, media.file)),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(`Upload failed for ${item.pn}/${media.mediaType}: ${payload.message ?? response.status}`);
      report.matched.push(payload);
    }
  }
  await writeFile(path.join(outputDirectory, "product-media-upload-report.json"), `${JSON.stringify(report, null, 2)}\n`);
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
