import { createHmac, timingSafeEqual } from "node:crypto";

type ImportPreviewToken = {
  sourceSha256: string;
  supplementalSha256?: string;
  expiresAt: number;
};

function secret() {
  const value = process.env.DRIVEMATE_IMPORT_SIGNING_SECRET;
  if (!value || value.length < 32) throw new Error("DRIVEMATE_IMPORT_SIGNING_SECRET must be at least 32 characters.");
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createImportPreviewToken(input: Omit<ImportPreviewToken, "expiresAt">) {
  const data: ImportPreviewToken = { ...input, expiresAt: Date.now() + 15 * 60 * 1000 };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyImportPreviewToken(token: string): ImportPreviewToken {
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) throw new Error("Import preview token is invalid.");
  const expectedSignature = sign(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Import preview token signature is invalid.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ImportPreviewToken;
  if (!parsed.sourceSha256 || parsed.expiresAt < Date.now()) throw new Error("Import preview token has expired.");
  return parsed;
}
