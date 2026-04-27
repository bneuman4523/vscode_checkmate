import { createChildLogger } from '../logger';
import type { Express, Request, Response, NextFunction } from "express";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const logger = createChildLogger('LocalStorage');

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

function uploadRequireAuth(req: Request, res: Response, next: NextFunction) {
  const dbUser = req.dbUser;
  if (!dbUser) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    logger.info(`Created uploads directory: ${UPLOADS_DIR}`);
  }
}

/**
 * Local filesystem storage routes — drop-in replacement for Replit object storage.
 * Same API contract: POST /api/uploads/request-url returns an uploadURL,
 * client PUTs to that URL, GET /objects/* serves the file.
 */
export function registerLocalStorageRoutes(app: Express): void {
  ensureUploadsDir();
  logger.info("Local file storage enabled (uploads/ directory)");

  // Pending uploads — tracks UUID→metadata before the PUT arrives
  const pendingUploads = new Map<string, { contentType: string; name: string }>();

  // Step 1: Request upload URL — returns a local PUT endpoint
  app.post("/api/uploads/request-url", uploadRequireAuth, async (req, res) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }

      if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return res.status(400).json({
          error: `File type not allowed. Accepted types: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
        });
      }

      if (size && size > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        });
      }

      const uuid = randomUUID();
      const ext = CONTENT_TYPE_EXTENSIONS[contentType] || '';
      const filename = `${uuid}${ext}`;
      const objectPath = `/objects/uploads/${filename}`;

      pendingUploads.set(filename, { contentType, name });

      // Return a local URL for the client to PUT the file to
      const protocol = req.protocol;
      const host = req.get('host');
      const uploadURL = `${protocol}://${host}/api/uploads/put/${filename}`;

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      logger.error({ err: error }, "Error generating local upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Step 2: Receive the actual file via PUT
  app.put("/api/uploads/put/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      const filePath = path.join(UPLOADS_DIR, filename);

      // Prevent path traversal
      if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_FILE_SIZE) {
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (totalSize > MAX_FILE_SIZE) {
          return res.status(400).json({ error: "File too large" });
        }

        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(filePath, buffer);
        pendingUploads.delete(filename);
        logger.info(`File saved: ${filename} (${totalSize} bytes)`);
        res.status(200).json({ success: true });
      });

      req.on('error', (err) => {
        logger.error({ err }, "Error receiving upload");
        res.status(500).json({ error: "Upload failed" });
      });
    } catch (error) {
      logger.error({ err: error }, "Error handling file upload");
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Serve uploaded files
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      // Extract filename from path (e.g., /objects/uploads/abc.jpg → uploads/abc.jpg)
      const objectPath = req.params.objectPath;
      const filePath = path.join(UPLOADS_DIR, objectPath.replace(/^uploads\//, ''));

      // Prevent path traversal
      if (!filePath.startsWith(UPLOADS_DIR)) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Object not found" });
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';
      const stat = fs.statSync(filePath);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      logger.error({ err: error }, "Error serving local file");
      res.status(500).json({ error: "Failed to serve file" });
    }
  });
}
