import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { readFile, rename } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';
import type { AuthService } from '../services/auth.js';
import { authenticate, requireRoles, requireSameOrigin } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { absoluteObjectPath, ensureObjectParent, ensureUploadRoot, objectKey, removeTempFile, uploadRoot } from '../storage.js';
import { SITE_CONTENT_ID, siteContentDefaults, siteContentSchema } from '../site-content.js';

const allowedMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']);
const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico']);
const upload = multer({
  dest: uploadRoot,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4, parts: 6 },
  fileFilter: (_req, file, callback) => callback(null, allowedMimes.has(file.mimetype) && allowedExtensions.has(path.extname(file.originalname).toLowerCase())),
});

const safeImage = async (file: Express.Multer.File) => {
  const bytes = await readFile(file.path);
  if (file.mimetype === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (file.mimetype === 'image/jpeg') return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (file.mimetype === 'image/webp') return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (file.mimetype === 'image/x-icon' || file.mimetype === 'image/vnd.microsoft.icon') return bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]));
  return false;
};

export const publicSiteContent = async (prisma: PrismaClient) => {
  const row = await prisma.siteContent.findUnique({ where: { id: SITE_CONTENT_ID } });
  return row ? { ...siteContentDefaults, ...row } : siteContentDefaults;
};

export const siteContentAdminRouter = (prisma: PrismaClient, auth: AuthService) => {
  const router = Router();
  router.use(authenticate(auth), requireRoles('SUPER_ADMIN'));

  router.get('/', async (_req, res, next) => {
    try { res.json({ content: await publicSiteContent(prisma) }); } catch (error) { next(error); }
  });

  router.put('/', requireSameOrigin, async (req, res, next) => {
    try {
      const values = siteContentSchema.parse(req.body);
      const content = await prisma.siteContent.upsert({
        where: { id: SITE_CONTENT_ID },
        create: { id: SITE_CONTENT_ID, ...values, updatedByUserId: req.user!.id },
        update: { ...values, updatedByUserId: req.user!.id },
      });
      await prisma.auditLog.create({ data: { actorUserId: req.user!.id, entityType: 'SiteContent', entityId: SITE_CONTENT_ID, action: 'UPDATE_SITE_CONTENT' } });
      res.json({ content });
    } catch (error) { next(error); }
  });

  router.post('/assets/:kind', requireSameOrigin, upload.single('file'), async (req, res, next) => {
    try {
      const kind = String(req.params.kind);
      if (!['logo', 'favicon', 'hero'].includes(kind)) throw new HttpError(400, 'Invalid asset kind');
      const file = req.file;
      if (!file || !await safeImage(file)) throw new HttpError(400, 'Invalid image file');
      if (kind === 'favicon' && path.extname(file.originalname).toLowerCase() !== '.ico' && file.mimetype !== 'image/png') throw new HttpError(400, 'Favicon must be ICO or PNG');
      await ensureUploadRoot();
      const extension = path.extname(file.originalname).toLowerCase();
      const key = objectKey('site-content/' + kind, extension);
      await ensureObjectParent(key);
      await rename(file.path, absoluteObjectPath(key));
      res.status(201).json({ url: '/uploads/' + key });
    } catch (error) {
      if (req.file) await removeTempFile(req.file.path).catch(() => undefined);
      next(error);
    }
  });

  return router;
};
