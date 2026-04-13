declare module 'printnode-client' {
  interface PrintNodeClientOptions {
    apiKey: string;
  }

  interface PrintJobOptions {
    printerId: number;
    title: string;
    contentType: 'pdf_uri' | 'pdf_base64' | 'raw_uri' | 'raw_base64';
    content: string;
    source?: string;
  }

  interface GetPrintJobsOptions {
    printJobId?: number;
  }

  class PrintNodeClient {
    constructor(options: PrintNodeClientOptions);
    getWhoAmI(): Promise<any>;
    getPrinters(): Promise<any[]>;
    createPrintJob(options: PrintJobOptions): Promise<number>;
    getPrintJobs(options?: GetPrintJobsOptions): Promise<any[]>;
  }

  export = PrintNodeClient;
}
