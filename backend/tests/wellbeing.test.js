import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import request from 'supertest';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.FRONTEND_URL = 'http://localhost:5173';
const { createApp } = await import('../src/app.js');
const { signAccessToken } = await import('../src/utils/token.js');

function fixture() {
  const rows = { moodEntry: [], journalEntry: [] };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => key === 'createdAt'
    ? (!value.gte || row.createdAt >= value.gte) && (!value.lte || row.createdAt <= value.lte) : row[key] === value);
  const select = (row, fields) => Object.fromEntries(Object.keys(fields).map(key => [key, row[key]]));
  const db = {};
  for (const name of Object.keys(rows)) {
    db[name] = {
      async create({ data, select: fields }) {
        const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), note: null, ...data };
        rows[name].push(row); return select(row, fields);
      },
      async findFirst({ where, select: fields }) { const row = rows[name].find(row => matches(row, where)); return row ? select(row, fields) : null; },
      async findMany({ where, select: fields, skip, take }) {
        return rows[name].filter(row => matches(row, where)).sort((a,b) => b.createdAt-a.createdAt || b.id.localeCompare(a.id)).slice(skip, skip+take).map(row => select(row, fields));
      },
      async count({ where }) { return rows[name].filter(row => matches(row, where)).length; },
      async update({ where, data, select: fields }) {
        const row = rows[name].find(row => matches(row, where));
        if (!row) throw Object.assign(new Error('missing'), { code: 'P2025' });
        Object.assign(row, data, { updatedAt: new Date() }); return select(row, fields);
      },
      async delete({ where }) {
        const index = rows[name].findIndex(row => matches(row, where));
        if (index < 0) throw Object.assign(new Error('missing'), { code: 'P2025' });
        return rows[name].splice(index, 1)[0];
      },
    };
  }
  db.$transaction = fn => fn(db);
  const app = createApp({ db });
  const token = signAccessToken(randomUUID());
  const other = signAccessToken(randomUUID());
  const call = (method, path, auth = token) => request(app)[method](path).auth(auth, { type: 'bearer' });
  return { app, db, rows, call, token, other };
}

for (const [path, data, update, model] of [
  ['/api/moods', { moodScore: 3, note: 'A quiet day' }, { moodScore: 4, note: null }, 'moodEntry'],
  ['/api/journals', { title: 'Today', content: 'Went for a walk' }, { title: 'A better day' }, 'journalEntry'],
]) {
  test(`${path}: lifecycle, owner-scoped mutations, pagination and date filters`, async () => {
    const f = fixture();
    await request(f.app).get(path).expect(401);
    const created = await f.call('post', path).send(data).expect(201);
    const entry = created.body.data.entry;
    assert.ok(entry.id); assert.equal(entry.userId, undefined);
    for (const method of ['get', 'patch', 'delete']) {
      const req = f.call(method, `${path}/${entry.id}`, f.other);
      if (method === 'patch') req.send(update);
      await req.expect(404);
    }
    assert.equal(f.rows[model].length, 1);
    await f.call('get', `${path}/${entry.id}`).expect(200);
    const changed = await f.call('patch', `${path}/${entry.id}`).send(update).expect(200);
    for (const [key,value] of Object.entries(update)) assert.equal(changed.body.data.entry[key], value);
    const own = await f.call('get', `${path}?page=1&limit=1`).expect(200);
    assert.equal(own.body.data.pagination.total, 1); assert.equal(own.body.data.entries.length, 1);
    const another = await f.call('get', path, f.other).expect(200); assert.equal(another.body.data.pagination.total, 0);
    const empty = await f.call('get', `${path}?from=2100-01-01T00:00:00Z`).expect(200); assert.equal(empty.body.data.entries.length, 0);
    const inclusive = await f.call('get', path).query({ from: entry.createdAt, to: entry.createdAt }).expect(200); assert.equal(inclusive.body.data.entries.length, 1);
    await f.call('delete', `${path}/${entry.id}`).expect(204);
    await f.call('get', `${path}/${entry.id}`).expect(404);
    await f.call('delete', `${path}/${entry.id}`).expect(404);
  });
  test(`${path}: rejects invalid body, IDs, pagination and timestamp ranges`, async () => {
    const f = fixture();
    await f.call('post', path).send({ ...data, userId: randomUUID() }).expect(400);
    await f.call('post', path).send({}).expect(400);
    await f.call('get', `${path}/invalid`).expect(400);
    await f.call('patch', `${path}/${randomUUID()}`).send({}).expect(400);
    for (const query of ['limit=101','page=0','from=bad','from=2026-10-31T00:00:00Z&to=2026-10-30T00:00:00Z','unknown=1']) {
      await f.call('get', `${path}?${query}`).expect(400);
    }
  });
}

test('mood score bounds and journal content limits are enforced', async () => {
  const f = fixture();
  for (const moodScore of [0, 6, 1.5, '3', null]) await f.call('post', '/api/moods').send({ moodScore }).expect(400);
  await f.call('post', '/api/moods').send({ moodScore: 1, note: 'x'.repeat(2001) }).expect(400);
  await f.call('post', '/api/journals').send({ title: ' ', content: 'x' }).expect(400);
  await f.call('post', '/api/journals').send({ title: 'x', content: 'x'.repeat(6001) }).expect(400);
  await f.call('post', '/api/journals').send({ title: 'x'.repeat(201), content: 'x' }).expect(400);
});

test('database failures are redacted, stale-user creates return 401, DELETE is enabled in CORS', async () => {
  const f = fixture();
  f.db.moodEntry.create = async () => { throw Object.assign(new Error('private detail'), { code: 'P2003' }); };
  await f.call('post', '/api/moods').send({ moodScore: 3 }).expect(401);
  f.db.journalEntry.findFirst = async () => { throw new Error('private detail'); };
  const error = await f.call('get', `/api/journals/${randomUUID()}`).expect(500);
  assert.ok(!JSON.stringify(error.body).includes('private detail'));
  const response = await request(f.app).options('/api/journals').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method','DELETE').expect(204);
  assert.match(response.headers['access-control-allow-methods'], /DELETE/);
});
