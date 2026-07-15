import { Body, Controller, Post } from '@nestjs/common';
import { ExtractService } from './extract.service.js';
import { ExtractRequestDto } from './dto/extract-request.dto.js';

@Controller('extract')
export class ExtractController {
  constructor(private readonly extractService: ExtractService) {}

  @Post()
  extract(@Body() dto: ExtractRequestDto) {
    return this.extractService.extract(dto.url, dto.schema);
  }
}
