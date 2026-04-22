import { createChildLogger } from '../logger';
import { printNodeService } from './printnode';

const logger = createChildLogger('PrintNodeDiagnostics');

export interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

export interface DiagnosticResult {
  printerId: number;
  printerName: string;
  timestamp: string;
  overallStatus: 'healthy' | 'warning' | 'error' | 'offline';
  checks: DiagnosticCheck[];
  recommendation: string;
}

export interface PrinterOverview {
  printerId: number;
  printerName: string;
  computerName: string;
  computerOnline: boolean;
  printerState: string;
  lastJobTime: string | null;
  lastJobState: string | null;
}

// Threshold in milliseconds — jobs sitting in sent/queued longer than this are "stuck"
const STUCK_JOB_THRESHOLD_MS = 30_000;

/**
 * Run a full diagnostic sequence against a single PrintNode printer.
 */
export async function runPrinterDiagnostic(printerId: number): Promise<DiagnosticResult> {
  const timestamp = new Date().toISOString();
  const checks: DiagnosticCheck[] = [];
  let printerName = `Printer ${printerId}`;
  let computerOnline = false;
  let printerOnline = false;
  let printerState = 'unknown';

  // Fetch computer list, printer detail, and recent jobs in parallel
  const [computersResult, printerResult, jobsResult] = await Promise.allSettled([
    printNodeApiRequest('GET', '/computers'),
    printNodeApiRequest('GET', `/printers/${printerId}`),
    printNodeApiRequest('GET', `/printers/${printerId}/printjobs?limit=10`),
  ]);

  // ── 1. Computer check ──
  if (computersResult.status === 'rejected') {
    const err = computersResult.reason;
    if (isRateLimited(err)) {
      checks.push({ name: 'API Rate Limit', status: 'warn', message: 'PrintNode is throttling requests (429)', details: err.message });
      return buildResult(printerId, printerName, timestamp, 'warning', checks, 'PrintNode is throttling requests — reduce print volume or add delay between jobs');
    }
    if (isNotFound(err)) {
      checks.push({ name: 'PrintNode Connection', status: 'fail', message: 'PrintNode API unreachable or not configured', details: err.message });
      return buildResult(printerId, printerName, timestamp, 'error', checks, 'PrintNode API key may be invalid or service is unreachable — check PRINTNODE_API_KEY');
    }
    checks.push({ name: 'Computer Check', status: 'fail', message: `Failed to fetch computers: ${err.message}`, details: err.message });
  } else {
    const computers = computersResult.value;
    // Determine which computer owns this printer (we'll match from printer data)
    if (Array.isArray(computers) && computers.length > 0) {
      checks.push({ name: 'Computer Check', status: 'pass', message: `${computers.length} computer(s) registered`, details: computers.map((c: any) => ({ id: c.id, name: c.name, state: c.state })) });
      // We'll refine after we know the printer's computer
    } else {
      checks.push({ name: 'Computer Check', status: 'fail', message: 'No computers registered with PrintNode account' });
    }
  }

  // ── 2. Printer state check ──
  if (printerResult.status === 'rejected') {
    const err = printerResult.reason;
    if (isRateLimited(err)) {
      checks.push({ name: 'API Rate Limit', status: 'warn', message: 'PrintNode is throttling requests (429)' });
      return buildResult(printerId, printerName, timestamp, 'warning', checks, 'PrintNode is throttling requests — reduce print volume or add delay between jobs');
    }
    if (isNotFound(err)) {
      checks.push({ name: 'Printer State', status: 'fail', message: 'Printer not found in PrintNode account' });
      return buildResult(printerId, printerName, timestamp, 'error', checks, 'Printer not registered to this PrintNode account — verify API key');
    }
    checks.push({ name: 'Printer State', status: 'fail', message: `Failed to fetch printer: ${err.message}` });
  } else {
    const rawPrinter = printerResult.value;
    const printer = Array.isArray(rawPrinter) ? rawPrinter[0] : rawPrinter;

    if (!printer) {
      checks.push({ name: 'Printer State', status: 'fail', message: 'Printer not found in PrintNode account' });
      return buildResult(printerId, printerName, timestamp, 'error', checks, 'Printer not registered to this PrintNode account — verify API key');
    }

    printerName = printer.name || printerName;
    printerState = printer.state || 'unknown';

    // Refine computer check with printer's computer info
    const computer = printer.computer;
    if (computer) {
      const computerState = computer.state || 'unknown';
      computerOnline = computerState === 'connected';

      // Replace generic computer check with specific one
      const compIdx = checks.findIndex(c => c.name === 'Computer Check');
      const compCheck: DiagnosticCheck = {
        name: 'Computer Check',
        status: computerOnline ? 'pass' : 'fail',
        message: computerOnline
          ? `Computer "${computer.name}" is online`
          : `Computer "${computer.name}" is ${computerState}`,
        details: { id: computer.id, name: computer.name, state: computerState },
      };
      if (compIdx >= 0) {
        checks[compIdx] = compCheck;
      } else {
        checks.push(compCheck);
      }

      if (!computerOnline) {
        checks.push({ name: 'Printer State', status: 'fail', message: `Printer state unknown — computer is offline` });
        return buildResult(printerId, printerName, timestamp, 'offline', checks, 'Restart the PrintNode client on the venue PC');
      }
    }

    // Printer itself
    const printerOk = printerState === 'online' || printerState === 'idle' || printerState === 'printing';
    printerOnline = printerOk;
    checks.push({
      name: 'Printer State',
      status: printerOk ? 'pass' : 'fail',
      message: printerOk ? `Printer is ${printerState}` : `Printer is ${printerState}`,
      details: { state: printerState, description: printer.description },
    });

    if (!printerOk && computerOnline) {
      return buildResult(printerId, printerName, timestamp, 'error', checks, 'Power cycle the printer; check USB/network cable');
    }
  }

  // ── 3–5. Job checks ──
  if (jobsResult.status === 'rejected') {
    const err = jobsResult.reason;
    if (isRateLimited(err)) {
      checks.push({ name: 'API Rate Limit', status: 'warn', message: 'PrintNode is throttling requests (429)' });
      return buildResult(printerId, printerName, timestamp, 'warning', checks, 'PrintNode is throttling requests — reduce print volume or add delay between jobs');
    }
    checks.push({ name: 'Recent Jobs', status: 'warn', message: `Could not fetch recent jobs: ${err.message}` });
  } else {
    const jobs: any[] = Array.isArray(jobsResult.value) ? jobsResult.value : [];

    if (jobs.length === 0) {
      checks.push({ name: 'Recent Jobs', status: 'pass', message: 'No recent print jobs found' });
    } else {
      // 3. Recent jobs overview
      const stateCount: Record<string, number> = {};
      for (const j of jobs) {
        stateCount[j.state] = (stateCount[j.state] || 0) + 1;
      }
      checks.push({
        name: 'Recent Jobs',
        status: 'pass',
        message: `${jobs.length} recent jobs: ${Object.entries(stateCount).map(([s, c]) => `${c} ${s}`).join(', ')}`,
        details: stateCount,
      });

      // 4. Stuck jobs — in "new", "queued", or "sent_to_client" for >30s
      const now = Date.now();
      const stuckJobs = jobs.filter((j: any) => {
        const stuckStates = ['new', 'queued', 'sent_to_client'];
        if (!stuckStates.includes(j.state)) return false;
        const created = new Date(j.createTimestamp).getTime();
        return (now - created) > STUCK_JOB_THRESHOLD_MS;
      });

      if (stuckJobs.length > 0) {
        checks.push({
          name: 'Stuck Jobs',
          status: 'warn',
          message: `${stuckJobs.length} job(s) stuck in queue for >30 seconds`,
          details: stuckJobs.map((j: any) => ({ id: j.id, state: j.state, created: j.createTimestamp })),
        });
      } else {
        checks.push({ name: 'Stuck Jobs', status: 'pass', message: 'No stuck jobs detected' });
      }

      // 5. Error jobs
      const errorJobs = jobs.filter((j: any) => j.state === 'error' || j.state === 'expired');
      if (errorJobs.length > 0) {
        checks.push({
          name: 'Error Jobs',
          status: 'fail',
          message: `${errorJobs.length} recent job(s) in error/expired state`,
          details: errorJobs.map((j: any) => ({ id: j.id, state: j.state, created: j.createTimestamp, title: j.title })),
        });
      } else {
        checks.push({ name: 'Error Jobs', status: 'pass', message: 'No error jobs in recent history' });
      }

      // Decision: if stuck jobs exist, that's the recommendation
      if (stuckJobs.length > 0) {
        return buildResult(printerId, printerName, timestamp, 'warning', checks, 'Clear print queue on venue PC; restart PrintNode client');
      }

      // Decision: if error jobs exist
      if (errorJobs.length > 0) {
        return buildResult(printerId, printerName, timestamp, 'error', checks, 'Badge template may have issues — try regenerating. If persistent, reinstall printer driver');
      }

      // Decision: all jobs done but check if "done" jobs actually printed
      const doneJobs = jobs.filter((j: any) => j.state === 'done');
      const nonDoneNonError = jobs.filter((j: any) => j.state !== 'done' && j.state !== 'error' && j.state !== 'expired');
      if (doneJobs.length > 0 && nonDoneNonError.length === 0) {
        // All recent jobs completed — looks healthy
        checks.push({ name: 'Job Completion', status: 'pass', message: 'Recent jobs completed successfully on PrintNode' });
      }
    }
  }

  // All checks passed
  const hasWarnings = checks.some(c => c.status === 'warn');
  const hasFailures = checks.some(c => c.status === 'fail');

  if (hasFailures) {
    return buildResult(printerId, printerName, timestamp, 'error', checks, 'One or more diagnostic checks failed — review details above');
  }
  if (hasWarnings) {
    return buildResult(printerId, printerName, timestamp, 'warning', checks, 'Minor issues detected — review warnings above');
  }

  return buildResult(printerId, printerName, timestamp, 'healthy', checks, 'Printer is operating normally');
}

/**
 * Get a quick health overview of all printers from PrintNode.
 */
export async function getPrinterOverviews(): Promise<PrinterOverview[]> {
  const printers = await printNodeService.getPrinters();
  const overviews: PrinterOverview[] = [];

  // Fetch computers for online status
  let computersMap: Map<number, any> = new Map();
  try {
    const computers = await printNodeApiRequest('GET', '/computers');
    if (Array.isArray(computers)) {
      for (const c of computers) {
        computersMap.set(c.id, c);
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Could not fetch computers for overview');
  }

  // Fetch recent jobs for each printer in parallel
  const jobPromises = printers.map(async (p) => {
    try {
      const jobs = await printNodeApiRequest('GET', `/printers/${p.id}/printjobs?limit=1`);
      const jobArr = Array.isArray(jobs) ? jobs : [];
      return { printerId: p.id, job: jobArr[0] || null };
    } catch {
      return { printerId: p.id, job: null };
    }
  });

  const jobResults = await Promise.all(jobPromises);
  const jobMap = new Map(jobResults.map(r => [r.printerId, r.job]));

  for (const p of printers) {
    const computer = computersMap.get(p.computer?.id);
    const lastJob = jobMap.get(p.id);

    overviews.push({
      printerId: p.id,
      printerName: p.name,
      computerName: p.computer?.name || 'Unknown',
      computerOnline: computer ? computer.state === 'connected' : false,
      printerState: p.state || 'unknown',
      lastJobTime: lastJob?.createTimestamp || null,
      lastJobState: lastJob?.state || null,
    });
  }

  return overviews;
}

/**
 * Run diagnostics on all printers.
 */
export async function runAllDiagnostics(): Promise<DiagnosticResult[]> {
  const printers = await printNodeService.getPrinters();

  // Run all diagnostics in parallel
  const results = await Promise.allSettled(
    printers.map(p => runPrinterDiagnostic(p.id))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<DiagnosticResult> => r.status === 'fulfilled')
    .map(r => r.value);
}

// ── Helpers ──

function buildResult(
  printerId: number,
  printerName: string,
  timestamp: string,
  overallStatus: DiagnosticResult['overallStatus'],
  checks: DiagnosticCheck[],
  recommendation: string,
): DiagnosticResult {
  return { printerId, printerName, timestamp, overallStatus, checks, recommendation };
}

function isRateLimited(err: any): boolean {
  return err?.message?.includes('429') || false;
}

function isNotFound(err: any): boolean {
  return err?.message?.includes('404') || err?.message?.includes('not found') || false;
}

/**
 * Thin wrapper around the PrintNode API using the same auth as the existing service.
 * We re-use the singleton's credentials but need direct access to arbitrary endpoints
 * the public service methods don't expose.
 */
async function printNodeApiRequest(method: string, path: string, body?: any): Promise<any> {
  const apiKey = process.env.PRINTNODE_API_KEY;
  if (!apiKey) {
    throw new Error('PrintNode not configured — PRINTNODE_API_KEY not set');
  }

  const url = `https://api.printnode.com${path}`;
  const headers: Record<string, string> = {
    'Authorization': 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
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
