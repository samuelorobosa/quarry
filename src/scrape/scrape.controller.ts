import { Body, Controller, Post } from '@nestjs/common';
import { ScrapeRequestDto } from './dto/scrape-request.dto.js';
import { ScrapeService } from './scrape.service.js';

@Controller('scrape')
export class ScrapeController {
  constructor(private readonly scrapeService: ScrapeService) {}

  @Post()
  scrape(@Body() dto: ScrapeRequestDto) {
    return this.scrapeService.scrape(dto.url, dto.engine);
  }
}
