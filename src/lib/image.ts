// Detect actual image format from magic bytes — used to catch content-type
// mismatches when stored metadata disagrees with actual bytes.
export function detectMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  return null;
}

// Image normalization for Track A ingestion.
// Produces a fixed-spec analysis copy: long edge ≤ 1568px, JPEG quality 0.85.
// The original is never modified — normalization is applied to a derived copy only.
//
// Uses OffscreenCanvas + createImageBitmap, available in the Cloudflare Workers runtime.
// Falls back gracefully (returns original unchanged) if the Canvas API is unavailable,
// e.g. during local Node.js development.

export const IMAGE_SPEC = '1568px-long-edge-jpeg-q85';
export const LONG_EDGE_TARGET = 1568;
export const JPEG_QUALITY = 0.85;

export interface NormalizeResult {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  normalized: boolean;  // false if Canvas API was unavailable and original was returned
}

// Encode ArrayBuffer to base64 in chunks to avoid stack overflow on large images.
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

export async function normalizeImage(dataUrl: string): Promise<NormalizeResult> {
  const [header, base64] = dataUrl.split(',');
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';

  try {
    // Decode base64 → Uint8Array → Blob → ImageBitmap
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });

    // @ts-ignore — createImageBitmap is available in Workers runtime
    const bitmap = await createImageBitmap(blob);
    const { width, height } = bitmap;

    // Scale down so long edge ≤ LONG_EDGE_TARGET; never upscale
    const longEdge = Math.max(width, height);
    const scale = Math.min(1, LONG_EDGE_TARGET / longEdge);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    // Draw to OffscreenCanvas and export as JPEG
    // @ts-ignore — OffscreenCanvas is available in Workers runtime
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(bitmap, 0, 0, w, h);
    // @ts-ignore
    bitmap.close?.();

    const outBlob: Blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    const outBuffer = await outBlob.arrayBuffer();

    return {
      dataUrl: `data:image/jpeg;base64,${bufferToBase64(outBuffer)}`,
      mimeType: 'image/jpeg',
      width: w,
      height: h,
      normalized: true,
    };
  } catch {
    // Canvas API unavailable (e.g. local Node.js dev) — return original unchanged
    return { dataUrl, mimeType, width: 0, height: 0, normalized: false };
  }
}

// Extract raw bytes and content type from a data URL, for R2 upload.
export function dataUrlToBlob(dataUrl: string): { bytes: Uint8Array; contentType: string; ext: string } {
  const [header, base64] = dataUrl.split(',');
  const contentType = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/gif': 'gif',
  };
  const ext = extMap[contentType] ?? 'jpg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType, ext };
}

// Fetch a previously-stored analysis image back out of R2 as a data URL, for
// re-sending to a model (e.g. re-fingerprinting an existing object).
export async function loadImageFromR2(r2: any, key: string): Promise<string | null> {
  try {
    const obj = await r2.get(key);
    if (!obj) return null;
    const buffer = await obj.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const declared: string = obj.httpMetadata?.contentType ?? 'image/jpeg';
    const contentType = detectMimeFromBytes(bytes) ?? declared;
    return `data:${contentType};base64,${bufferToBase64(buffer)}`;
  } catch {
    return null;
  }
}
