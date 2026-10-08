import { createHash } from "node:crypto";

/** Largest icon accepted (and stored), in bytes. */
export const MAX_ICON_BYTES = 500 * 1024;

export type IconType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const startsWith = (b: Buffer, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

/**
 * Image type decided by the file's own bytes, never by what the server claims. SVG is not on the
 * list on purpose: it can carry scripts, and anything that is not a raster image is refused.
 */
export function sniffIconType(bytes: Buffer): IconType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "image/gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/** Strong validator for the stored bytes (quoted, as the ETag header requires). */
export function iconEtag(bytes: Buffer): string {
  return `"${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}"`;
}

export const iconPath = (identity: string) => `/api/validators/${identity}/icon`;
