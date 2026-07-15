import { BadGatewayException, Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service.js';
import { ScrapeService } from '../scrape/scrape.service.js';
import { tryParseJson } from '../llm/llm-complete.js';

const MAX_MARKDOWN_CHARS = 100_000;

function buildExtractionPrompt(
  markdown: string,
  schema: Record<string, string>,
  truncated: boolean,
): string {
  return `You are a structured data extractor. Extract the requested fields from the webpage content below and return them as a JSON object.

Schema (field name → type):
${JSON.stringify(schema, null, 2)}

Rules:
- Return ONLY a valid JSON object — no markdown fences, no explanation, no other text
- Use null for any field not found on the page — do not guess or hallucinate values
- "string": a string value
- "number": a numeric value only (no currency symbols, units, or commas)
- "boolean": true or false
- "array of strings": a JSON array of strings

Page content (markdown):
${markdown}${truncated ? '\n\n[Note: content was truncated to 100,000 characters]' : ''}`;
}

@Injectable()
export class ExtractService {
  constructor(
    private readonly scrapeService: ScrapeService,
    private readonly llmService: LlmService,
  ) {}

  async extract(url: string, schema: Record<string, string>) {
    const { markdown } = await this.scrapeService.scrape(
      url,
      'auto',
      'extract',
    );

    const truncated = markdown.length > MAX_MARKDOWN_CHARS;
    const content = truncated
      ? markdown.slice(0, MAX_MARKDOWN_CHARS)
      : markdown;

    const prompt = buildExtractionPrompt(content, schema, truncated);
    let raw = await this.llmService.complete(prompt);
    let data = tryParseJson(raw);

    if (!data) {
      const retryPrompt = `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a JSON object, nothing else.`;
      raw = await this.llmService.complete(retryPrompt);
      data = tryParseJson(raw);
    }

    if (!data) {
      throw new BadGatewayException({
        error: 'extraction-failed',
        reason: 'LLM returned invalid JSON after retry',
      });
    }

    return {
      url,
      data,
      provider: process.env.LLM_PROVIDER ?? 'openai',
      model: process.env.LLM_MODEL ?? 'gpt-4o',
      'extracted-at': new Date().toISOString(),
    };
  }
}
