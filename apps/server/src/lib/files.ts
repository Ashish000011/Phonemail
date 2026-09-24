/**
 * File type detection from the first bytes ("magic numbers"), never from the
 * name or the browser's Content-Type, which anyone can fake.
 */
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const startsWith = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  // WebP: "RIFF" + 4 size bytes + "WEBP"
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export const IMAGE_EXTENSIONS: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
