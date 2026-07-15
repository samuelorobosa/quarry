import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreateMonitorDto {
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
  @IsIn(['hourly', 'daily', 'weekly'])
  frequency?: string;

  @IsUrl({ require_protocol: true })
  'webhook-url': string;

  @IsOptional()
  @IsString()
  goal?: string;
}
