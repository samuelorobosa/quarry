import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { ScrapeModule } from '../scrape/scrape.module.js';
import { ExtractController } from './extract.controller.js';
import { ExtractService } from './extract.service.js';

@Module({
  imports: [ScrapeModule, LlmModule],
  controllers: [ExtractController],
  providers: [ExtractService],
})
export class ExtractModule {}
