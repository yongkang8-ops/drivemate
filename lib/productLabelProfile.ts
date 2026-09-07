import { z } from "zod";

const englishText = (max: number) => z.string().trim().max(max).regex(/^[\x20-\x7E]*$/, "Use printable English label text.");

export const productLabelProfileSchema = z.object({
  schemaVersion: z.literal(1),
  displayName: englishText(100),
  vehicleMakes: z.array(englishText(40).min(1)).max(4).refine(
    values => new Set(values.map(value => value.toUpperCase())).size === values.length,
    "Each vehicle make must appear once.",
  ),
  partReference: englishText(60),
  position: z.discriminatedUnion("status", [
    z.object({ status: z.literal("specified"), value: englishText(48).min(1) }).strict(),
    z.object({ status: z.literal("not_applicable") }).strict(),
    z.object({ status: z.literal("unknown") }).strict(),
  ]),
}).strict();

export type ProductLabelProfile = z.infer<typeof productLabelProfileSchema>;
export const optionalProductLabelProfileSchema = productLabelProfileSchema.nullable().optional();

export function cloneProductLabelProfile(profile: ProductLabelProfile | null | undefined) {
  return profile == null ? profile : structuredClone(profile);
}

export function getProductLabelProfileIssues(profile: unknown): string[] {
  if (profile == null) return ["labelProfile"];
  const parsed = productLabelProfileSchema.safeParse(profile);
  if (!parsed.success) {
    return [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "labelProfile")))];
  }
  const value = parsed.data;
  return [
    ...(!value.displayName ? ["displayName"] : []),
    ...(!value.vehicleMakes.length ? ["vehicleMakes"] : []),
    ...(!value.partReference ? ["partReference"] : []),
    ...(value.position.status === "unknown" ? ["position"] : []),
  ];
}
