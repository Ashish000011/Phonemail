import { z } from 'zod';
import { attachmentSchema, type AttachmentInfo } from '@phonemail/shared';
import { api } from './api';

/** Uploads files before sending; the email then refers to them by id. */
export function uploadAttachments(files: File[]): Promise<AttachmentInfo[]> {
  const form = new FormData();
  for (const file of files) form.append('file', file, file.name);
  return api('/attachments', { method: 'POST', body: form, schema: z.array(attachmentSchema) });
}

/** Where an attachment can be opened or downloaded (the session cookie goes along). */
export function attachmentUrl(id: string): string {
  return `/api/attachments/${id}`;
}
