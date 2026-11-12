import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLLM, parseJsonLoose } from '../src/llm.js';

test('createLLM：无 baseURL 返回 null', () => {
  assert.equal(createLLM({}), null);
  assert.equal(createLLM({ baseURL: '' }), null);
});

test('createLLM：返回可用 client', () => {
  const llm = createLLM({ baseURL: 'https://api.example.com/v1', apiKey: 'k', model: 'm' });
  assert.equal(typeof llm.chat, 'function');
  assert.equal(llm.model, 'm');
  assert.equal(llm.baseURL, 'https://api.example.com/v1');
});

test('chat：成功返回 content 并携带正确请求体', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'hello' } }] }) };
  };
  try {
    const llm = createLLM({ baseURL: 'https://api.example.com/v1/', apiKey: 'secret', model: 'm1' });
    const content = await llm.chat([{ role: 'user', content: 'hi' }], { json: true });
    assert.equal(content, 'hello');
    assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.model, 'm1');
    assert.equal(body.response_format.type, 'json_object');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer secret');
  } finally {
    globalThis.fetch = orig;
  }
});

test('chat：非 2xx 抛出带状态的错误', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  try {
    const llm = createLLM({ baseURL: 'https://x/v1' });
    await assert.rejects(() => llm.chat([{ role: 'user', content: 'hi' }]), /LLM 500/);
  } finally {
    globalThis.fetch = orig;
  }
});

test('chat：空内容抛错', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [] }) });
  try {
    const llm = createLLM({ baseURL: 'https://x/v1' });
    await assert.rejects(() => llm.chat([{ role: 'user', content: 'hi' }]), /空内容/);
  } finally {
    globalThis.fetch = orig;
  }
});

test('parseJsonLoose：兼容代码块与前后噪音', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('前置 {"a": 2} 后置'), { a: 2 });
  assert.throws(() => parseJsonLoose('nope'), /无法解析/);
});
