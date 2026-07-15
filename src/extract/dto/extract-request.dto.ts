import { IsObject, IsUrl } from 'class-validator';

export class ExtractRequestDto {
  @IsUrl({ require_protocol: true })
  url: string;

  @IsObject()
  schema: Record<string, string>;
}
