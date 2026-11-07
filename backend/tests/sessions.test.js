import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import request from 'supertest';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.FRONTEND_URL = 'http://localhost:5173';
const { createSessionService } = await import('../src/services/session.service.js');
const { createChatService } = await import('../src/services/chat.service.js');
const { createApp } = await import('../src/app.js');
const { signAccessToken } = await import('../src/utils/token.js');

function fixture() {
  let now = new Date('2026-10-30T10:05:00Z');
  const userId = randomUUID();
  const booking = { id: randomUUID(), userId, status: 'SCHEDULED', startTime: new Date('2026-10-30T10:00:00Z'), endTime: new Date('2026-10-30T10:30:00Z') };
  const state = { sessions: [], messages: [], booking };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => value?.in ? value.in.includes(row[key]) : row[key] === value);
  function table(key) {
    return {
      async findFirst({ where }) { const row = state[key].find(row => matches(row, where)); return row ? structuredClone({ ...row, ...(key === 'sessions' ? { booking: state.booking } : {}) }) : null; },
      async findUnique(args) { return this.findFirst(args); },
      async findMany({ where, skip = 0, take = 10000 }) { return structuredClone(state[key].filter(row => matches(row, where)).slice(skip, skip + take)); },
      async count({ where }) { return state[key].filter(row => matches(row, where)).length; },
      async create({ data }) {
        if (key === 'messages' && state.failMessage && data.role === 'ASSISTANT') throw new Error('insert failed');
        const row = { id: randomUUID(), createdAt: now, endedAt: null, ...data };
        state[key].push(row); return structuredClone(row);
      },
      async update({ where, data }) { const row = state[key].find(row => matches(row, where)); Object.assign(row, data); return structuredClone(row); },
    };
  }
  let queue = Promise.resolve();
  const db = { session: table('sessions'), message: table('messages'),
    booking: {
      async findFirst({ where }) { return matches(state.booking, where) ? structuredClone(state.booking) : null; },
      async update({ data }) { Object.assign(state.booking, data); return structuredClone(state.booking); },
    },
    async $transaction(fn) {
      const previous = queue; let release; queue = new Promise(resolve => { release = resolve; }); await previous;
      const snapshot = structuredClone(state);
      try { return await fn(db); } catch (error) { Object.assign(state, snapshot); throw error; } finally { release(); }
    },
  };
  const chat = { async reply() { return 'I am listening.'; } };
  return { state, db, chat, userId, booking, setTime(value) { now = new Date(value); },
    service: createSessionService(db, chat, () => now) };
}
const status = expected => error => error.status === expected;

test('start is idempotent, enforces owner and booking window', async () => {
  const f = fixture();
  await assert.rejects(f.service.start(randomUUID(), { bookingId: f.booking.id }), status(404));
  f.setTime('2026-10-30T09:59:59Z');
  await assert.rejects(f.service.start(f.userId, { bookingId: f.booking.id }), status(409));
  f.setTime('2026-10-30T10:00:00Z');
  const first = await f.service.start(f.userId, { bookingId: f.booking.id });
  assert.equal((await f.service.start(f.userId, { bookingId: f.booking.id })).id, first.id);
  assert.equal(f.state.sessions.length, 1);
  f.setTime('2026-10-30T10:30:00Z');
  await assert.rejects(f.service.start(f.userId, { bookingId: f.booking.id }), status(409));
});
test('chat history, ownership, completion, and no messages after completion', async () => {
  const f = fixture(); const session = await f.service.start(f.userId, { bookingId: f.booking.id });
  await assert.rejects(f.service.send(randomUUID(), session.id, { content: 'secret' }), status(404));
  const turn = await f.service.send(f.userId, session.id, { content: 'I feel sad' });
  assert.equal(turn.assistantMessage.content, 'I am listening.');
  assert.ok(turn.userMessage.createdAt < turn.assistantMessage.createdAt);
  const page = await f.service.messages(f.userId, session.id, { page: 1, limit: 20 });
  assert.equal(page.messages.length, 2);
  assert.equal((await f.service.complete(f.userId, session.id)).status, 'COMPLETED');
  assert.equal(f.state.booking.status, 'COMPLETED');
  assert.equal((await f.service.complete(f.userId, session.id)).status, 'COMPLETED');
  await assert.rejects(f.service.send(f.userId, session.id, { content: 'again' }), status(409));
});
test('provider failures and database failures leave no partial turn', async () => {
  const f = fixture(); const session = await f.service.start(f.userId, { bookingId: f.booking.id });
  f.chat.reply = async () => { throw new Error('provider failed'); };
  await assert.rejects(f.service.send(f.userId, session.id, { content: 'hello' }));
  assert.equal(f.state.messages.length, 0);
  f.chat.reply = async () => 'reply'; f.state.failMessage = true;
  await assert.rejects(f.service.send(f.userId, session.id, { content: 'hello' }));
  assert.equal(f.state.messages.length, 0);
});
test('expiry during generation rejects the turn; get persists expiry', async () => {
  const f = fixture(); const session = await f.service.start(f.userId, { bookingId: f.booking.id });
  f.chat.reply = async () => { f.setTime('2026-10-30T10:30:00Z'); return 'late'; };
  await assert.rejects(f.service.send(f.userId, session.id, { content: 'hello' }), status(409));
  assert.equal(f.state.messages.length, 0);
  assert.equal((await f.service.get(f.userId, session.id)).status, 'EXPIRED');
  assert.equal(f.state.booking.status, 'COMPLETED');
});
test('concurrent turns commit one pair and reject stale history', async () => {
  const f = fixture(); const session = await f.service.start(f.userId, { bookingId: f.booking.id });
  let arrivals = 0; let release; const gate = new Promise(resolve => { release = resolve; });
  f.chat.reply = async () => { if (++arrivals === 2) release(); await gate; return 'reply'; };
  const results = await Promise.allSettled([1, 2].map(i => f.service.send(f.userId, session.id, { content: `hello ${i}` })));
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.status, 409);
  assert.equal(f.state.messages.length, 2);
});
test('HTTP authentication, strict validation and nested route ownership', async () => {
  const f = fixture(); const app = createApp({ db: f.db, chat: f.chat });
  const token = signAccessToken(f.userId);
  await request(app).get('/api/sessions').expect(401);
  await request(app).post('/api/sessions').auth(token, { type: 'bearer' }).send({ bookingId: f.booking.id, userId: f.userId }).expect(400);
  await request(app).get('/api/sessions/not-a-uuid/messages').auth(token, { type: 'bearer' }).expect(400);
  await request(app).get(`/api/sessions/${randomUUID()}/messages`).auth(token, { type: 'bearer' }).expect(404);
  await request(app).post(`/api/sessions/${randomUUID()}/messages`).auth(token, { type: 'bearer' }).send({ content: '  ' }).expect(400);
  const session = await f.service.start(f.userId, { bookingId: f.booking.id });
  const history = await request(app).get(`/api/sessions/${session.id}/messages`).auth(token, { type: 'bearer' }).expect(200);
  assert.deepEqual(history.body.data.messages, []);
  const completed = await request(app).patch(`/api/sessions/${session.id}/complete`).auth(token, { type: 'bearer' }).expect(200);
  assert.ok(['COMPLETED', 'EXPIRED'].includes(completed.body.data.session.status));
});
test('Gemini adapter maps conversation roles and redacts provider errors', async () => {
  let body;
  const chat = createChatService({ apiKey: 'test-secret', model: 'configured-model', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/configured-model:generateContent');
    assert.equal(options.headers['x-goog-api-key'], 'test-secret');
    assert.ok(!url.includes('test-secret'));
    body = JSON.parse(options.body);
    return { ok: true, async json() { return { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'private reasoning', thought: true }, { text: 'Hello' }] } }] }; } };
  } });
  assert.equal(await chat.reply([{ role: 'USER', content: 'Hi' }, { role: 'ASSISTANT', content: 'Hello' }, { role: 'USER', content: 'Again' }]), 'Hello');
  assert.deepEqual(body.contents.map(row => row.role), ['user', 'model', 'user']);
  assert.equal(body.contents[0].parts[0].text, 'Hi');
  assert.ok(body.systemInstruction.parts[0].text.includes('Emotiq'));
  assert.equal(body.generationConfig.maxOutputTokens, 4096);
  await assert.rejects(createChatService({ apiKey: null, model: null }).reply([]), status(503));
  await assert.rejects(createChatService({ apiKey: 'secret', model: 'model', fetchImpl: async () => { throw new Error('private provider details'); } }).reply([]), error => error.status === 502 && !error.message.includes('private'));
});


test('Gemini rejects blocked, truncated, empty, malformed and failed replies', async () => {
  const responses = [
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { role: 'model', parts: [{ text: 'partial' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [] } }] },
    { candidates: [{ finishReason: 'SAFETY', content: { role: 'model', parts: [{ text: 'blocked' }] } }] },
    {},
  ];
  for (const result of responses) {
    const chat = createChatService({ apiKey: 'test', model: 'test', fetchImpl: async () => ({ ok: true, json: async () => result }) });
    await assert.rejects(chat.reply([]), status(502));
  }
  for (const code of [400, 401, 403, 429, 500, 503]) {
    const chat = createChatService({ apiKey: 'test', model: 'test', fetchImpl: async () => ({ ok: false, status: code }) });
    await assert.rejects(chat.reply([]), status([429, 503].includes(code) ? 503 : 502));
  }
});


test('Gemini uses low thinking for text model families and returns a safe timeout', async () => {
  let config;
  const chat = createChatService({ apiKey: 'test', model: 'gemini-3.8-flash', fetchImpl: async (url, options) => {
    config = JSON.parse(options.body).generationConfig;
    throw Object.assign(new Error('private timeout'), { name: 'TimeoutError' });
  } });
  await assert.rejects(chat.reply([{ role: 'USER', content: 'Hi' }]), error => error.status === 504 && !error.message.includes('private'));
  assert.equal(config.thinkingConfig.thinkingLevel, 'low');
});

test('Gemini diagnostics classify failures without exposing provider messages or keys', async () => {
  for (const [http, payload, expected] of [
    [400, { error: { message: 'secret test-key', details: [{ reason: 'API_KEY_INVALID' }] } }, 'invalid_key'],
    [403, { error: { details: [{ reason: 'SERVICE_DISABLED' }] } }, 'api_disabled'],
    [404, { error: { message: 'private URL' } }, 'model_unavailable'],
    [429, {}, 'quota_exceeded'],
    [503, { error: { message: 'private provider detail' } }, 'service_unavailable'],
  ]) {
    const diagnostics = [];
    const chat = createChatService({ apiKey: 'test-key', model: 'test-model', onDiagnostic: value => diagnostics.push(value),
      fetchImpl: async () => ({ ok: false, status: http, json: async () => payload }) });
    await assert.rejects(chat.reply([]), error => error.status === ([429, 503].includes(http) ? 503 : 502) && !error.message.includes('secret'));
    assert.deepEqual(diagnostics, [{ category: expected, upstreamStatus: http }]);
    assert.ok(!JSON.stringify(diagnostics).includes('test-key'));
  }
});
