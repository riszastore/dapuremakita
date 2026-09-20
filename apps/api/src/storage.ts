import { mkdir, unlink } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? './var/uploads');
mkdirSync(uploadRoot, { recursive: true });
export const ensureUploadRoot = () => mkdir(uploadRoot, { recursive: true });
export const objectKey = (folder: string, extension: string) => `${folder}/${randomUUID()}${extension}`;
export const absoluteObjectPath = (key: string) => {
  const root = path.resolve(uploadRoot);
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid object key');
  return target;
};
export const ensureObjectParent = (key: string) => mkdir(path.dirname(absoluteObjectPath(key)), { recursive: true });
export const removeObject = async (key: string) => {
  try { await unlink(absoluteObjectPath(key)); } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};
export const removeTempFile = async (filePath: string) => {
  try { await unlink(filePath); } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};
