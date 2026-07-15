import { Module } from '@nestjs/common';
import { CrawlController } from './crawl.controller.js';
import { CrawlService } from './crawl.service.js';

@Module({
  controllers: [CrawlController],
  providers: [CrawlService],
})
export class CrawlModule {}
