import { createChildLogger } from '../logger';
import type { Express, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "stream";

const logger = createChildLogger('S3Storage');

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

/**
 * AWS S3 storage routes — drop-in replacement for local filesystem and Replit object storage.
 * Same API contract: POST /api/uploads/request-url returns a presigned S3 PUT URL,
 * client PUTs directly to S3, GET /objects/* proxies from S3.
 *
 * Required env vars: AWS_REGION, S3_BUCKET_NAME
 * Optional: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (falls back to IAM role on EC2)
 */
export function registerS3StorageRoutes(app: Express): void {
  const region = process.env.AWS_REGION!;
  const bucket = process.env.S3_BUCKET_NAME!;
  const prefix = process.env.S3_OBJECT_PREFIX || 'uploads/';

  const s3 = new S3Client({ region });

  logger.info(`S3 storage enabled (bucket: ${bucket}, region: ${region})`);

  // Step 1: Request upload URL — returns a presigned S3 PUT URL
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
      const s3Key = `${prefix}${filename}`;
      const objectPath = `/objects/uploads/${filename}`;

      // Generate presigned PUT URL (10 minute expiry)
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        ContentType: contentType || 'application/octet-stream',
      });
      const uploadURL = await getSignedUrl(s3, command, { expiresIn: 600 });

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      logger.error({ err: error }, "Error generating S3 presigned URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Serve uploaded files by proxying from S3
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectPath = req.params.objectPath;
      const s3Key = `${prefix}${objectPath.replace(/^uploads\//, '')}`;

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });

      const response = await s3.send(command);

      if (!response.Body) {
        return res.status(404).json({ error: "Object not found" });
      }

      if (response.ContentType) {
        res.setHeader('Content-Type', response.ContentType);
      }
      if (response.ContentLength) {
        res.setHeader('Content-Length', response.ContentLength);
      }
      res.setHeader('Cache-Control', 'public, max-age=3600');

      // Stream the S3 response body to the client
      const stream = response.Body as Readable;
      stream.pipe(res);
    } catch (error: any) {
      if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: "Object not found" });
      }
      logger.error({ err: error }, "Error serving file from S3");
      res.status(500).json({ error: "Failed to serve file" });
    }
  });
}
