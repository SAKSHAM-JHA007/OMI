import { ModelAdapter } from './adapter';
import { GeminiAdapter } from './gemini';
import { OpenAIAdapter } from './openai';
import { MockAdapter } from './mock';

export function getModelAdapter(): { adapter: ModelAdapter; modelName: string } {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  const preferred = process.env.PRIMARY_MODEL?.toLowerCase() || '';

  if (preferred === 'mock') {
    return { adapter: new MockAdapter(), modelName: 'mock-agent-v1' };
  }

  // 1. DeepSeek Native Support (Ultra-fast, DeepSeek-V3 / R1)
  if (deepseekKey || preferred.includes('deepseek')) {
    const key = deepseekKey || openAiKey || '';
    if (key) {
      return {
        adapter: new OpenAIAdapter(
          key,
          process.env.PRIMARY_MODEL || 'deepseek-chat',
          process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
        ),
        modelName: process.env.PRIMARY_MODEL || 'deepseek-chat',
      };
    }
  }

  // 2. Groq (Ultra-fast LPU inference, 300-800 tok/s)
  if (groqKey || preferred.includes('groq')) {
    const key = groqKey || '';
    if (key) {
      return {
        adapter: new OpenAIAdapter(
          key,
          process.env.PRIMARY_MODEL || 'llama-3.3-70b-versatile',
          'https://api.groq.com/openai/v1'
        ),
        modelName: process.env.PRIMARY_MODEL || 'groq/llama-3.3-70b',
      };
    }
  }

  // 3. Google Gemini (Fast multimodal)
  if (geminiKey && (!preferred || preferred.includes('gemini'))) {
    return {
      adapter: new GeminiAdapter(geminiKey, process.env.PRIMARY_MODEL || 'gemini-3.5-flash'),
      modelName: process.env.PRIMARY_MODEL || 'gemini-3.5-flash',
    };
  }

  // 4. OpenAI
  if (openAiKey) {
    return {
      adapter: new OpenAIAdapter(openAiKey, process.env.PRIMARY_MODEL || 'gpt-4o-mini'),
      modelName: process.env.PRIMARY_MODEL || 'gpt-4o-mini',
    };
  }

  // Built-in fallback
  return { adapter: new MockAdapter(), modelName: 'mock-agent-v1' };
}
