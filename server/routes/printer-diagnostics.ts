import { createChildLogger } from '../logger';
import type { Express, Request, Response } from "express";
import { requireRole } from "../auth";
import { printNodeService } from "../services/printnode";
import {
  runPrinterDiagnostic,
  runAllDiagnostics,
  getPrinterOverviews,
} from "../services/printnode-diagnostics";

const logger = createChildLogger('PrinterDiagnostics');

export function registerPrinterDiagnosticsRoutes(app: Express) {

  // Quick health overview of all printers
  app.get("/api/admin/printers/overview", requireRole("super_admin"), async (_req: Request, res: Response) => {
    try {
      if (!printNodeService.isConfigured()) {
        return res.json({ configured: false, printers: [], message: 'PrintNode is not configured.' });
      }
      const printers = await getPrinterOverviews();
      res.json({ configured: true, printers });
    } catch (error: any) {
      logger.error({ err: error }, "Error fetching printer overview");
      res.status(500).json({ error: error.message || "Failed to fetch printer overview" });
    }
  });

  // Run diagnostics on ALL printers
  app.get("/api/admin/printers/diagnostics", requireRole("super_admin"), async (_req: Request, res: Response) => {
    try {
      if (!printNodeService.isConfigured()) {
        return res.json({ configured: false, results: [], message: 'PrintNode is not configured.' });
      }
      const results = await runAllDiagnostics();
      res.json({ configured: true, results });
    } catch (error: any) {
      logger.error({ err: error }, "Error running all diagnostics");
      res.status(500).json({ error: error.message || "Failed to run diagnostics" });
    }
  });

  // Run diagnostics on a single printer
  app.get("/api/admin/printers/diagnostics/:printerId", requireRole("super_admin"), async (req: Request, res: Response) => {
    try {
      if (!printNodeService.isConfigured()) {
        return res.status(400).json({ error: 'PrintNode is not configured.' });
      }

      const printerId = parseInt(req.params.printerId, 10);
      if (isNaN(printerId)) {
        return res.status(400).json({ error: 'Invalid printer ID' });
      }

      const result = await runPrinterDiagnostic(printerId);
      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, "Error running printer diagnostic");
      res.status(500).json({ error: error.message || "Failed to run diagnostic" });
    }
  });
}
