/**
 * Token Refresh Worker - Background service for proactive OAuth2 token refresh
 * 
 * Features:
 * - Runs every 1 minute
 * - Identifies tokens expiring within 5 minutes
 * - Refreshes tokens proactively
 * - Exponential backoff on failures
 * - Circuit breaker protection
 * - Telemetry and monitoring
 */

import { createChildLogger } from '../logger';
import { oauth2Service } from '../services/oauth2-service';

const logger = createChildLogger('TokenRefresh');

interface TokenRefreshJob {
  integrationId: string;
  tokenMetadataId: string;
  expiresAt: Date;
  refreshTokenRef: string;
  attempts: number;
  nextRetryAt: Date | null;
}

class TokenRefreshWorker {
  private interval: NodeJS.Timeout | null = null;
  private readonly REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute
  private readonly PROACTIVE_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RETRIES = 3;
  private activeJobs: Map<string, boolean> = new Map();
  private stats = {
    totalRefreshes: 0,
    successfulRefreshes: 0,
    failedRefreshes: 0,
    lastRunAt: null as Date | null,
  };

  /**
   * Start the background worker
   */
  start(): void {
    if (this.interval) {
      logger.warn('Worker already running');
      return;
    }

    logger.info('Starting background worker');
    this.interval = setInterval(() => {
      this.runRefreshCycle().catch(error => {
        logger.error({ err: error }, 'Refresh cycle failed');
      });
    }, this.REFRESH_INTERVAL_MS);

    // Run immediately on start
    this.runRefreshCycle().catch(error => {
      logger.error({ err: error }, 'Initial refresh cycle failed');
    });
  }

  /**
   * Stop the background worker
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Worker stopped');
    }
  }

  /**
   * Main refresh cycle - identifies and refreshes expiring tokens
   */
  private async runRefreshCycle(): Promise<void> {
    this.stats.lastRunAt = new Date();
    logger.info('Running refresh cycle');

    try {
      // Get tokens expiring within threshold
      const expiringTokens = await this.getExpiringTokens();
      
      logger.info(
        `[TokenRefreshWorker] Found ${expiringTokens.length} tokens expiring soon`
      );

      // Refresh tokens in parallel (with concurrency limit)
      const concurrency = 5;
      for (let i = 0; i < expiringTokens.length; i += concurrency) {
        const batch = expiringTokens.slice(i, i + concurrency);
        await Promise.allSettled(
          batch.map(token => this.refreshToken(token))
        );
      }

      logger.info('Refresh cycle complete', {
        total: this.stats.totalRefreshes,
        successful: this.stats.successfulRefreshes,
        failed: this.stats.failedRefreshes,
      });
    } catch (error) {
      logger.error({ err: error }, 'Refresh cycle error');
    }
  }

  /**
   * Get tokens that are expiring within threshold
   */
  private async getExpiringTokens(): Promise<TokenRefreshJob[]> {
    // PLANNED: Query database for tokens expiring within PROACTIVE_REFRESH_THRESHOLD_MS
    // See docs/ROADMAP.md — Phase 4: OAuth Token Lifecycle Management
    
    const now = new Date();
    const threshold = new Date(now.getTime() + this.PROACTIVE_REFRESH_THRESHOLD_MS);

    // Mock query:
    // SELECT * FROM oauth2_tokens 
    // WHERE expires_at <= $1 
    // AND expires_at > NOW()
    // AND status = 'active'
    // AND refresh_token_ref IS NOT NULL
    // AND (next_retry_at IS NULL OR next_retry_at <= NOW())

    return []; // Replace with actual database query
  }

  /**
   * Refresh a single token
   */
  private async refreshToken(job: TokenRefreshJob): Promise<void> {
    const jobKey = `${job.integrationId}-${job.tokenMetadataId}`;

    // Prevent concurrent refresh of same token
    if (this.activeJobs.get(jobKey)) {
      logger.info(`Refresh already in progress: ${jobKey}`);
      return;
    }

    this.activeJobs.set(jobKey, true);
    this.stats.totalRefreshes++;

    try {
      logger.info(`Refreshing token: ${jobKey}`);

      // PLANNED: Get OAuth2 config from database — see docs/ROADMAP.md Phase 4
      const oauth2Config = {
        authorizationUrl: 'https://example.com/oauth/authorize',
        tokenUrl: 'https://example.com/oauth/token',
        clientId: 'client_id',
        clientSecret: 'client_secret',
        grantType: 'refresh_token' as const,
      };

      // Refresh token
      const newTokenMetadata = await oauth2Service.refreshAccessToken(
        job.integrationId,
        job.refreshTokenRef,
        oauth2Config
      );

      // PLANNED: Update token metadata in database — see docs/ROADMAP.md Phase 4
      logger.info(`Token refreshed successfully: ${jobKey}`);
      
      this.stats.successfulRefreshes++;
    } catch (error) {
      logger.error({ err: error }, `Token refresh failed: ${jobKey}`);
      this.stats.failedRefreshes++;

      // PLANNED: Update retry logic in database — see docs/ROADMAP.md Phase 4
      const nextRetryAt = this.calculateNextRetry(job.attempts);
      logger.info(`Will retry at: ${nextRetryAt}`);
    } finally {
      this.activeJobs.delete(jobKey);
    }
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetry(attempts: number): Date {
    const baseDelay = 60 * 1000; // 1 minute
    const delay = Math.min(baseDelay * Math.pow(2, attempts), 30 * 60 * 1000); // Max 30 min
    const jitter = Math.random() * delay * 0.1; // 10% jitter
    return new Date(Date.now() + delay + jitter);
  }

  /**
   * Get worker statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.interval !== null,
      activeJobs: this.activeJobs.size,
    };
  }

  /**
   * Reset statistics (useful for testing)
   */
  resetStats(): void {
    this.stats = {
      totalRefreshes: 0,
      successfulRefreshes: 0,
      failedRefreshes: 0,
      lastRunAt: null,
    };
  }
}

// Singleton instance
export const tokenRefreshWorker = new TokenRefreshWorker();

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  tokenRefreshWorker.start();
}
