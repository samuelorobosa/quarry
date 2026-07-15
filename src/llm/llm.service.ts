import { Injectable } from '@nestjs/common';
import { llmComplete } from './llm-complete.js';

@Injectable()
export class LlmService {
  complete(prompt: string): Promise<string> {
    return llmComplete(prompt);
  }
}
