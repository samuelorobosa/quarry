import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../common/error-message.js';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  async send(url: string, payload: unknown): Promise<void> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`Webhook to ${url} returned ${res.status}`);
      }
    } catch (err: unknown) {
      this.logger.error(`Webhook to ${url} failed: ${errorMessage(err)}`);
    }
  }
}
