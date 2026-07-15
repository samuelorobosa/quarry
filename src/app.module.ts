import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CrawlModule } from './crawl/crawl.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { ExtractModule } from './extract/extract.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LlmModule } from './llm/llm.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { MonitorsModule } from './monitors/monitors.module.js';
import { ScrapeModule } from './scrape/scrape.module.js';
import { WebhookModule } from './webhooks/webhook.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScrapeModule,
    CrawlModule,
    JobsModule,
    MonitorsModule,
    WebhookModule,
    LlmModule,
    ExtractModule,
    MetricsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
