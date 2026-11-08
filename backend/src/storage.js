import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { put, del } from '@vercel/blob';

const here = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(here, '..', 'uploads');

export async function storeImage(jpegBuffer) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`tracelab/${randomUUID()}.jpg`, jpegBuffer, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'image/jpeg',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    return { url: blob.url, storageKey: blob.url };
  }

  if (process.env.VERCEL) {
    throw new Error('Image storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel project settings.');
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const filename = `${randomUUID()}.jpg`;
  await fs.writeFile(path.join(uploadsDir, filename), jpegBuffer, { flag: 'wx' });
  const base = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  return { url: `${base}/uploads/${filename}`, storageKey: filename };
}

export async function deleteStoredImage(storageKey) {
  if (!storageKey) return;
  if (/^https:\/\//i.test(storageKey) && process.env.BLOB_READ_WRITE_TOKEN) {
    try { await del(storageKey, { token: process.env.BLOB_READ_WRITE_TOKEN }); } catch (error) {
      console.warn('Could not delete Blob image:', error.message);
    }
    return;
  }
  if (!process.env.VERCEL) {
    try { await fs.unlink(path.join(uploadsDir, path.basename(storageKey))); } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Could not delete local image:', error.message);
    }
  }
}
