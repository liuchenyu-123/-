import { httpJson } from '@/server/http';

/**
 * Optional server-side LLM enrichment.
 *
 * The project runs fully offline with the deterministic shared engine. Only when
 * LLM_API_BASE + LLM_API_KEY are set does an OpenAI-compatible chat completion get
 * called. Secrets never leave the server; the client only receives generated text.
 */

export type Enrichment = {
  mode: 'rules' | 'llm';
  text: string | null;
  error?: string;
};

export function llmStatus(): { configured: boolean; model: string | null } {
  const base = process.env.LLM_API_BASE?.trim() || '';
  const key = process.env.LLM_API_KEY?.trim() || '';
  const model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini';
  return {
    configured: Boolean(base && key),
    model: base && key ? model : null,
  };
}

function endpoint(): string | null {
  const base = process.env.LLM_API_BASE?.trim();
  const key = process.env.LLM_API_KEY?.trim();
  if (!base || !key) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.toString().replace(/\/+$/, '')}/chat/completions`;
  } catch {
    return null;
  }
}

export async function enrichText(system: string, prompt: string): Promise<Enrichment> {
  const url = endpoint();
  const key = process.env.LLM_API_KEY?.trim();
  if (!url || !key) return { mode: 'rules', text: null };

  const model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini';
  try {
    const { status, data } = await httpJson(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
      timeoutMs: 10000,
    });
    if (status !== 200 || !data || typeof data !== 'object') {
      return { mode: 'rules', text: null, error: `LLM provider returned ${status || 'no data'}` };
    }
    const parsed = data as { choices?: Array<{ message?: { content?: string } }> };
    const text = parsed.choices?.[0]?.message?.content?.trim();
    return text ? { mode: 'llm', text } : { mode: 'rules', text: null, error: 'Empty LLM response' };
  } catch {
    return { mode: 'rules', text: null, error: 'LLM provider unreachable; served by rule engine' };
  }
}
