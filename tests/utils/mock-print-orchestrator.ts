/**
 * Mock Print Orchestrator
 * Captures print jobs for validation without sending to physical printers
 */

export interface PrintJob {
  id: string;
  timestamp: number;
  attendeeId: string;
  templateId: string;
  dimensions: {
    width: number;
    height: number;
    dpi: number;
  };
  canvasDataUrl?: string;
  canvasPixelDimensions?: {
    width: number;
    height: number;
  };
  status: 'queued' | 'rendered' | 'printed' | 'failed';
  error?: string;
  renderDuration?: number;
}

export interface PrintCapabilities {
  canPrint: boolean;
  supportsWindowPrint: boolean;
  supportsAirPrint: boolean;
  supportsMopria: boolean;
  supportsWebUSB: boolean;
  supportsWebBluetooth: boolean;
  recommendedStrategy: 'native' | 'pdf' | 'vendor';
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'unknown';
}

export class MockPrintOrchestrator {
  private printJobs: PrintJob[] = [];
  private mockCapabilities: PrintCapabilities;
  private simulateNetworkError: boolean = false;
  private simulateTimeout: boolean = false;
  private networkErrorRate: number = 0; // 0-1

  constructor(platform: PrintCapabilities['platform'] = 'windows') {
    this.mockCapabilities = this.buildCapabilitiesForPlatform(platform);
  }

  private buildCapabilitiesForPlatform(platform: PrintCapabilities['platform']): PrintCapabilities {
    const base = {
      canPrint: true,
      supportsWindowPrint: true,
      recommendedStrategy: 'native' as const,
      platform,
    };

    switch (platform) {
      case 'ios':
        return {
          ...base,
          supportsAirPrint: true,
          supportsMopria: false,
          supportsWebUSB: false,
          supportsWebBluetooth: false,
        };
      case 'android':
        return {
          ...base,
          supportsAirPrint: false,
          supportsMopria: true,
          supportsWebUSB: false,
          supportsWebBluetooth: true,
        };
      case 'windows':
      case 'macos':
        return {
          ...base,
          supportsAirPrint: platform === 'macos',
          supportsMopria: false,
          supportsWebUSB: true,
          supportsWebBluetooth: true,
        };
      default:
        return {
          ...base,
          supportsAirPrint: false,
          supportsMopria: false,
          supportsWebUSB: false,
          supportsWebBluetooth: false,
        };
    }
  }

  detectCapabilities(): PrintCapabilities {
    return { ...this.mockCapabilities };
  }

  setSimulateNetworkError(enabled: boolean, errorRate: number = 0.1): void {
    this.simulateNetworkError = enabled;
    this.networkErrorRate = errorRate;
  }

  setSimulateTimeout(enabled: boolean): void {
    this.simulateTimeout = enabled;
  }

  async print(job: Omit<PrintJob, 'id' | 'timestamp' | 'status'>): Promise<PrintJob> {
    const printJob: PrintJob = {
      ...job,
      id: `print_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      status: 'queued',
    };

    this.printJobs.push(printJob);

    // Simulate network errors
    if (this.simulateNetworkError && Math.random() < this.networkErrorRate) {
      printJob.status = 'failed';
      printJob.error = 'Network error: Printer not reachable';
      return printJob;
    }

    // Simulate timeout
    if (this.simulateTimeout) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      printJob.status = 'failed';
      printJob.error = 'Timeout: Print operation took too long';
      return printJob;
    }

    // Simulate successful print
    printJob.status = 'printed';
    return printJob;
  }

  async batchPrint(jobs: Array<Omit<PrintJob, 'id' | 'timestamp' | 'status'>>): Promise<PrintJob[]> {
    const results = await Promise.all(jobs.map(job => this.print(job)));
    return results;
  }

  validatePrintJob(job: PrintJob): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check dimensions
    if (!job.dimensions) {
      errors.push('Missing dimensions');
    } else {
      if (job.dimensions.width < 2 || job.dimensions.width > 8) {
        errors.push(`Invalid width: ${job.dimensions.width} (expected 2-8 inches)`);
      }
      if (job.dimensions.height < 2 || job.dimensions.height > 8) {
        errors.push(`Invalid height: ${job.dimensions.height} (expected 2-8 inches)`);
      }
      if (job.dimensions.dpi !== 300 && job.dimensions.dpi !== 600) {
        errors.push(`Invalid DPI: ${job.dimensions.dpi} (expected 300 or 600)`);
      }
    }

    // Check canvas pixel dimensions match expected DPI
    if (job.canvasPixelDimensions && job.dimensions) {
      const expectedWidth = job.dimensions.width * job.dimensions.dpi;
      const expectedHeight = job.dimensions.height * job.dimensions.dpi;
      
      if (Math.abs(job.canvasPixelDimensions.width - expectedWidth) > 1) {
        errors.push(`Canvas width ${job.canvasPixelDimensions.width}px doesn't match expected ${expectedWidth}px for ${job.dimensions.dpi} DPI`);
      }
      if (Math.abs(job.canvasPixelDimensions.height - expectedHeight) > 1) {
        errors.push(`Canvas height ${job.canvasPixelDimensions.height}px doesn't match expected ${expectedHeight}px for ${job.dimensions.dpi} DPI`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  getJobs(): PrintJob[] {
    return [...this.printJobs];
  }

  getJobById(id: string): PrintJob | undefined {
    return this.printJobs.find(job => job.id === id);
  }

  getSuccessfulJobs(): PrintJob[] {
    return this.printJobs.filter(job => job.status === 'printed');
  }

  getFailedJobs(): PrintJob[] {
    return this.printJobs.filter(job => job.status === 'failed');
  }

  getStats(): {
    total: number;
    successful: number;
    failed: number;
    avgRenderTime: number;
    successRate: number;
  } {
    const successful = this.getSuccessfulJobs();
    const failed = this.getFailedJobs();
    const renderTimes = this.printJobs
      .filter(j => j.renderDuration)
      .map(j => j.renderDuration!);

    return {
      total: this.printJobs.length,
      successful: successful.length,
      failed: failed.length,
      avgRenderTime: renderTimes.length > 0 
        ? renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length 
        : 0,
      successRate: this.printJobs.length > 0 
        ? successful.length / this.printJobs.length 
        : 0,
    };
  }

  clearJobs(): void {
    this.printJobs = [];
  }
}

// Singleton for test use
export const mockPrintOrchestrator = new MockPrintOrchestrator();
