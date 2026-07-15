import { IsIn, IsOptional, IsUrl } from 'class-validator';

export class ScrapeRequestDto {
  @IsUrl({ require_protocol: true })
  url: string;

  @IsOptional()
  @IsIn(['fetch', 'browser', 'auto'])
  engine?: 'fetch' | 'browser' | 'auto';
}
