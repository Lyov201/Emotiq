import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import request from 'supertest';
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.FRONTEND_URL = 'http://localhost:5173';
const { createApp } = await import('../src/app.js');

test('Swagger UI, assets and specification are served with the API without database access', async () => {
  const app = createApp({ db: {} });
  const response = await request(app).get('/api/docs/').expect(200);
  assert.match(response.text, /swagger-ui/);
  assert.match(response.headers['content-security-policy'], /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(response.headers['content-security-policy'], /upgrade-insecure-requests/);
  await request(app).get('/api/docs/swagger-ui-bundle.js').expect(200);
  await request(app).get('/api/docs/swagger-ui.css').expect(200);
  const init = await request(app).get('/api/docs/swagger-ui-init.js').expect(200);
  assert.match(init.text, /Emotiq API/);
  assert.match(init.text, /"persistAuthorization": false/);
  const { body } = await request(app).get('/api/docs/openapi.json').expect(200);
  assert.equal(body.openapi, '3.0.3');
  assert.equal(body.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.equal(Object.values(body.paths).flatMap(path => Object.keys(path)).length, 29);
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(process.env.JWT_ACCESS_SECRET));
  if (process.env.GEMINI_API_KEY) assert.ok(!serialized.includes(process.env.GEMINI_API_KEY));
  assert.equal(body.paths['/api/auth/register'].post.parameters[0].name, 'X-CSRF-Protection');
  assert.equal(body.paths['/api/sessions/{id}/messages'].post.responses[201].content['application/json'].schema.properties.data.properties.assistantMessage.$ref, '#/components/schemas/Message');
  // Resolve all schema references to catch broken documentation links.
  for (const match of serialized.matchAll(/"\$ref":"#\/components\/schemas\/([^"/]+)"/g)) assert.ok(body.components.schemas[match[1]]);
  const health = await request(app).get('/api/health').expect(200);
  assert.doesNotMatch(health.headers['content-security-policy'], /script-src 'self' 'unsafe-inline'/);
});

test('Swagger local origin works only in development and still requires CSRF header', () => {
  const script = `
    import assert from 'node:assert/strict';
    import request from 'supertest';
    const { createApp } = await import('./src/app.js');
    const app = createApp({ db: {} });
    const allowed = process.env.NODE_ENV === 'development';
    const origin = 'http://localhost:' + process.env.PORT;
    const response = await request(app).post('/api/auth/login').set('Origin', origin).set('X-CSRF-Protection','1').send({});
    assert.equal(response.status, allowed ? 400 : 403);
    await request(app).post('/api/auth/login').set('Origin', origin).send({}).expect(403);
    await request(app).post('/api/auth/login').set('Origin','https://evil.example').set('X-CSRF-Protection','1').send({}).expect(403);
  `;
  for (const nodeEnv of ['development', 'production']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url),
      env: { ...process.env, NODE_ENV: nodeEnv, PORT: '4567', FRONTEND_URL: 'https://frontend.example' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});
