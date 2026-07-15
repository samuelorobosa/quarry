import { Body, Controller, Post } from '@nestjs/common';
import { CrawlService } from './crawl.service.js';
import { CrawlRequestDto } from './dto/crawl-request.dto.js';

@Controller('crawl')
export class CrawlController {
  constructor(private readonly crawlService: CrawlService) {}

  @Post()
  createCrawl(@Body() dto: CrawlRequestDto) {
    return this.crawlService.createCrawl(dto);
  }
}
