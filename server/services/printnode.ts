import { createChildLogger } from '../logger';

const logger = createChildLogger('PrintNode');

interface PrintNodePrinter {
  id: number;
  name: string;
  description: string;
  computer: {
    id: number;
    name: string;
  };
  state: string;
  capabilities?: {
    papers?: Record<string, [number | null, number | null]>;
  };
}

interface PrintNodePrintJob {
  id: number;
  state: string;
  createTimestamp: string;
}

class PrintNodeService {
  private apiKey: string | null = null;
  private initialized: boolean = false;
  private readonly baseUrl = 'https://api.printnode.com';

  private ensureInitialized(): void {
    if (!this.initialized) {
      const apiKey = process.env.PRINTNODE_API_KEY;
      if (apiKey) {
        this.apiKey = apiKey;
        this.initialized = true;
      }
    }
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(this.apiKey + ':').toString('base64');
  }

  private async apiRequest(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': this.getAuthHeader(),
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PrintNode API error ${response.status}: ${text}`);
    }

    return response.json();
  }

  isConfigured(): boolean {
    this.ensureInitialized();
    return this.apiKey !== null;
  }

  async testConnection(): Promise<{ success: boolean; error?: string; account?: any }> {
    this.ensureInitialized();
    if (!this.apiKey) {
      return { success: false, error: 'PrintNode not configured. Please add PRINTNODE_API_KEY.' };
    }

    try {
      const account = await this.apiRequest('GET', '/whoami');
      return { success: true, account };
    } catch (error: any) {
      return { success: false, error: error.message || 'Connection failed' };
    }
  }

  async getPrinters(): Promise<PrintNodePrinter[]> {
    this.ensureInitialized();
    if (!this.apiKey) {
      throw new Error('PrintNode not configured. Please add PRINTNODE_API_KEY.');
    }

    try {
      const printers = await this.apiRequest('GET', '/printers');
      printers.forEach((p: any) => {
        logger.info(`Printer: ${p.name} (ID: ${p.id})`);
        logger.info(`State: ${p.state}, Computer: ${p.computer?.name}`);
        if (p.capabilities?.papers) {
          const paperNames = Object.keys(p.capabilities.papers);
          logger.info(`Papers (${paperNames.length}): ${paperNames.join(', ')}`);
        }
      });
      return printers.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        computer: {
          id: p.computer?.id || 0,
          name: p.computer?.name || 'Unknown',
        },
        state: p.state || 'unknown',
        capabilities: p.capabilities ? {
          papers: p.capabilities.papers || {},
        } : undefined,
      }));
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching PrintNode printers');
      throw new Error(error.message || 'Failed to fetch printers');
    }
  }

  private findBestPaper(
    printerPapers: Record<string, [number | null, number | null]> | undefined,
    widthInches: number,
    heightInches: number
  ): string | null {
    if (!printerPapers || Object.keys(printerPapers).length === 0) return null;

    const targetW = Math.round(widthInches * 25.4);
    const targetH = Math.round(heightInches * 25.4);

    let bestMatch: string | null = null;
    let bestScore = Infinity;

    for (const paperName of Object.keys(printerPapers)) {
      const match = paperName.match(/^(\d+)x(\d+)mm$/);
      if (!match) continue;

      const pw = parseInt(match[1]);
      const ph = parseInt(match[2]);

      const diffW = Math.abs(pw - targetW);
      const diffH = Math.abs(ph - targetH);
      const score = diffW + diffH;

      if (score < bestScore) {
        bestScore = score;
        bestMatch = paperName;
      }

      const diffWSwap = Math.abs(pw - targetH);
      const diffHSwap = Math.abs(ph - targetW);
      const scoreSwap = diffWSwap + diffHSwap;
      if (scoreSwap < bestScore) {
        bestScore = scoreSwap;
        bestMatch = paperName;
      }
    }

    if (bestMatch && bestScore <= 5) {
      logger.info(`Matched paper "${bestMatch}" (score: ${bestScore}) for ${targetW}x${targetH}mm`);
      return bestMatch;
    }

    logger.info(`No close paper match found for ${targetW}x${targetH}mm, using custom size`);
    return null;
  }

  async printPdf(
    printerId: number,
    pdfBase64: string,
    title: string,
    options?: { widthInches?: number; heightInches?: number; fitToPage?: boolean }
  ): Promise<PrintNodePrintJob> {
    this.ensureInitialized();
    if (!this.apiKey) {
      throw new Error('PrintNode not configured. Please add PRINTNODE_API_KEY.');
    }

    logger.info(`Sending PDF job to printer ${printerId}: "${title}" (${pdfBase64.length} bytes base64)`);

    const printJobOptions: Record<string, any> = {};

    if (options?.widthInches && options?.heightInches) {
      logger.info(`Badge size: ${options.widthInches}" x ${options.heightInches}"`);

      let printerPapers: Record<string, [number | null, number | null]> | undefined;
      try {
        const printers = await this.apiRequest('GET', `/printers/${printerId}`);
        const printer = Array.isArray(printers) ? printers[0] : printers;
        printerPapers = printer?.capabilities?.papers;
        if (printerPapers) {
          logger.info(`Printer papers available: ${Object.keys(printerPapers).join(', ')}`);
        }
      } catch (e) {
        logger.info(`Could not fetch printer capabilities: ${e}`);
      }

      const matchedPaper = this.findBestPaper(printerPapers, options.widthInches, options.heightInches);

      if (matchedPaper) {
        printJobOptions.paper = matchedPaper;
      } else {
        const widthMm = Math.round(options.widthInches * 25.4);
        const heightMm = Math.round(options.heightInches * 25.4);
        printJobOptions.paper = `Custom.${options.widthInches}x${options.heightInches}in`;
        logger.info(`Using custom paper size: ${widthMm}x${heightMm}mm (${options.widthInches}x${options.heightInches}in)`);
      }

      printJobOptions.fit_to_page = options.fitToPage !== false;
    }

    try {
      const jobPayload: Record<string, any> = {
        printerId,
        title,
        contentType: 'pdf_base64',
        content: pdfBase64,
        source: 'CheckinKit',
      };

      if (Object.keys(printJobOptions).length > 0) {
        jobPayload.options = printJobOptions;
        logger.info(`Print options:`, JSON.stringify(printJobOptions));
      }

      const jobId = await this.apiRequest('POST', '/printjobs', jobPayload);

      logger.info(`PDF job created successfully: jobId=${jobId}`);

      return {
        id: typeof jobId === 'number' ? jobId : jobId.id || jobId,
        state: 'pending',
        createTimestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Error creating PDF job');
      throw new Error(error.message || 'Failed to create print job');
    }
  }

  async printRaw(
    printerId: number,
    rawData: string,
    title: string
  ): Promise<PrintNodePrintJob> {
    this.ensureInitialized();
    if (!this.apiKey) {
      throw new Error('PrintNode not configured. Please add PRINTNODE_API_KEY.');
    }

    logger.info(`Sending RAW job to printer ${printerId}: "${title}" (${rawData.length} bytes)`);
    logger.info(`RAW data preview: ${rawData.substring(0, 200)}...`);

    try {
      const base64Data = Buffer.from(rawData).toString('base64');
      const jobId = await this.apiRequest('POST', '/printjobs', {
        printerId,
        title,
        contentType: 'raw_base64',
        content: base64Data,
        source: 'CheckinKit',
      });

      logger.info(`RAW job created successfully: jobId=${jobId}`);

      setTimeout(async () => {
        try {
          const status = await this.getJobStatus(typeof jobId === 'number' ? jobId : jobId);
          logger.info(`Job ${jobId} status check:`, status);
        } catch (e) {
          logger.info(`Could not check job status: ${e}`);
        }
      }, 2000);

      return {
        id: typeof jobId === 'number' ? jobId : jobId.id || jobId,
        state: 'pending',
        createTimestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error({ err: error }, 'Error creating RAW job');
      throw new Error(error.message || 'Failed to create print job');
    }
  }

  async getJobStatus(jobId: number): Promise<PrintNodePrintJob | null> {
    this.ensureInitialized();
    if (!this.apiKey) {
      throw new Error('PrintNode not configured. Please add PRINTNODE_API_KEY.');
    }

    try {
      const jobs = await this.apiRequest('GET', `/printjobs/${jobId}`);
      const jobArray = Array.isArray(jobs) ? jobs : [jobs];
      if (jobArray.length > 0) {
        const job = jobArray[0];
        return {
          id: job.id,
          state: job.state,
          createTimestamp: job.createTimestamp,
        };
      }
      return null;
    } catch (error: any) {
      logger.error({ err: error }, 'Error getting job status');
      return null;
    }
  }
}

export const printNodeService = new PrintNodeService();
