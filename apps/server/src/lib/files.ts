/**
 * File type detection from the first bytes ("magic numbers"), never from the
 * name or the browser's Content-Type, which anyone can fake.
 */
export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

function startsWith(bytes: Uint8Array, values: number[], offset = 0): boolean {
  return values.every((v, i) => bytes[offset + i] === v);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'image/gif';
  return null;
}

export const IMAGE_EXTENSIONS: Record<ImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const OFFICE_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** True if the bytes look like readable text (no NUL bytes, valid UTF-8). */
function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

/** The real type of an uploaded or received file. Unknown = application/octet-stream. */
export function sniffContentType(bytes: Uint8Array, filename: string): string {
  const image = sniffImageType(bytes);
  if (image) return image;
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // .docx/.xlsx/.pptx are zip files inside.
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    return OFFICE_TYPES[ext] ?? 'application/zip';
  }
  if (startsWith(bytes, [0x1f, 0x8b])) return 'application/gzip';
  if (ascii(bytes, 0, 3) === 'ID3' || startsWith(bytes, [0xff, 0xfb])) return 'audio/mpeg';
  if (ascii(bytes, 4, 8) === 'ftyp') return 'video/mp4';
  if (ascii(bytes, 0, 4) === 'OggS') return 'audio/ogg';
  if (bytes.length > 0 && looksLikeText(bytes)) return 'text/plain';
  return 'application/octet-stream';
}

/**
 * A safe name to store and show: no folders ("../"), no control characters,
 * at most 150 characters, keeping the extension.
 */
export function sanitizeFilename(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  let clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim();
  clean = clean.replace(/^\.+/, ''); // no hidden files like ".htaccess"
  if (!clean) return 'attachment';
  if (clean.length <= 150) return clean;
  const dot = clean.lastIndexOf('.');
  const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : '';
  return clean.slice(0, 150 - ext.length) + ext;
}
