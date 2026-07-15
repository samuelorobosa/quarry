import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export async function llmComplete(prompt: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER ?? 'openai';
  const model = process.env.LLM_MODEL ?? 'gpt-4o';
  const apiKey = process.env.LLM_API_KEY ?? '';
  const baseURL = process.env.LLM_BASE_URL;

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = msg.content[0];
    return block.type === 'text' ? block.text : '';
  }

  // OpenAI-compatible (OpenAI, Ollama, Groq, Together, Mistral, LM Studio, …)
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4096,
  });
  return completion.choices[0]?.message?.content ?? '';
}

export function tryParseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}
