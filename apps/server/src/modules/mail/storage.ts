import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../config/env.js';

/**
 * Files on the "maildata" volume (/data in Docker):
 *   /data/mail/YYYY/MM/<uuid>.eml        every raw email exactly as received
 *   /data/attachments/YYYY/MM/<uuid>     attachment contents
 * Folders by month keep any one folder from growing huge.
 */
async function monthFolder(kind: 'mail' | 'attachments'): Promise<string> {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const folder = join(env.DATA_DIR, kind, String(now.getUTCFullYear()), month);
  await mkdir(folder, { recursive: true });
  return folder;
}

export async function saveRawMessage(raw: Buffer): Promise<string> {
  const path = join(await monthFolder('mail'), `${randomUUID()}.eml`);
  await writeFile(path, raw);
  return path;
}

export async function saveAttachmentFile(
  content: Buffer,
): Promise<{ storagePath: string; sha256: string }> {
  const storagePath = join(await monthFolder('attachments'), randomUUID());
  await writeFile(storagePath, content);
  return { storagePath, sha256: createHash('sha256').update(content).digest('hex') };
}

/** Deletes files that no row points to any more. Missing files are fine. */
export async function removeFiles(paths: (string | null | undefined)[]): Promise<void> {
  await Promise.all(paths.filter(Boolean).map((p) => rm(p!, { force: true })));
}
