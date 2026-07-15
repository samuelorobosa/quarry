import { Module } from '@nestjs/common';
import { ScrapeController } from './scrape.controller.js';
import { ScrapeService } from './scrape.service.js';

@Module({
  controllers: [ScrapeController],
  providers: [ScrapeService],
  exports: [ScrapeService],
})
export class ScrapeModule {}
