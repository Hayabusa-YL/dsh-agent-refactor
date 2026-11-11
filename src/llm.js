/**
 * OpenAI 兼容 LLM 客户端。
 * 配置优先级：显式参数 > 环境变量。
 *   AGENT_REFACTOR_LLM_BASE_URL  例如 https://api.deepseek.com/v1
 *   AGENT_REFACTOR_LLM_KEY       API key
 *   AGENT_REFACTOR_LLM_MODEL     默认 deepseek-chat
 * 没配 baseURL 时 createLLM 返回 null，调用方降级为"需要模型接口"提示，绝不静默编造。
 */
export function createLLM(config = {}) {
  const baseURL = config.baseURL || process.env.AGENT_REFACTOR_LLM_BASE_URL || '';
  const apiKey = config.apiKey || process.env.AGENT_REFACTOR_LLM_KEY || '';
  const model = config.model || process.env.AGENT_REFACTOR_LLM_MODEL || 'deepseek-chat';

  if (!baseURL) return null;

  async function chat(messages, { temperature = 0.2, maxTokens = 4000, json = false, timeoutMs = 120000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseURL.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`LLM ${res.status}：${body.slice(0, 500)}`);
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM 返回空内容');
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  return { chat, model, baseURL };
}

export function parseJsonLoose(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error('无法解析 LLM 返回的 JSON');
  }
}
