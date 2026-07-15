import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CrawlRequestDto {
  @IsUrl({ require_protocol: true })
  url: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  'max-depth'?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  'max-pages'?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  'include-patterns'?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  'exclude-patterns'?: string[];

  @IsOptional()
  @IsUrl({ require_protocol: true })
  'webhook-url'?: string;

  @IsOptional()
  @IsIn(['fetch', 'browser', 'auto'])
  engine?: 'fetch' | 'browser' | 'auto';
}
