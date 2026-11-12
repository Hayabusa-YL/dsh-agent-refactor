/**
 * OpenAI 兼容 LLM 客户端。配置优先级：显式参数 > 环境变量。
 *   AGENT_REFACTOR_LLM_BASE_URL  例如 https://api.deepseek.com/v1
 *   AGENT_REFACTOR_LLM_KEY       API key
 *   AGENT_REFACTOR_LLM_MODEL     默认 deepseek-chat
 * 没配 baseURL 时 createLLM 返回 null，调用方降级为「需要模型接口」提示，绝不静默编造。
 *
 * json 参数传 true 只保证 JSON 语法；传 schema 对象强制结构（ollama 的 format 对象、
 * OpenAI 兼容层的 json_schema）。小模型在 json 模式下易输出空对象/截断，用 schema 约束最稳。
 *
 * 本机 ollama（:11434）走原生 /api/chat，可带 options（num_predict/repeat_penalty）。
 */
export function createLLM(config = {}) {
  const baseURL = config.baseURL || process.env.AGENT_REFACTOR_LLM_BASE_URL || '';
  const apiKey = config.apiKey || process.env.AGENT_REFACTOR_LLM_KEY || '';
  const model = config.model || process.env.AGENT_REFACTOR_LLM_MODEL || 'deepseek-chat';

  if (!baseURL) return null;

  async function chat(messages, { temperature = 0.25, maxTokens = 4000, json = false, timeoutMs = Number(process.env.AGENT_REFACTOR_LLM_TIMEOUT_MS) || 120000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const isOllama = /:11434(\/|$)/.test(baseURL);
      const formatValue = json === true ? 'json' : json && typeof json === 'object' ? json : undefined;
      let res;
      if (isOllama) {
        const origin = baseURL.replace(/\/v1\/?$/, '');
        res = await fetch(`${origin}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            ...(formatValue ? { format: formatValue } : {}),
            options: { temperature, num_predict: maxTokens, repeat_penalty: 1.05, repeat_last_n: 256 },
          }),
          signal: controller.signal,
        });
      } else {
        const responseFormat = formatValue
          ? typeof json === 'object'
            ? { type: 'json_schema', json_schema: { name: 'vibe_schema', schema: json } }
            : { type: 'json_object' }
          : undefined;
        res = await fetch(`${baseURL.replace(/\/+$/, '')}/chat/completions`, {
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
            ...(responseFormat ? { response_format: responseFormat } : {}),
          }),
          signal: controller.signal,
        });
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`LLM ${res.status}：${body.slice(0, 500)}`);
      }
      const data = await res.json();
      const content = isOllama ? data.message?.content : data.choices?.[0]?.message?.content;
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
