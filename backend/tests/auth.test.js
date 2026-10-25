import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import jwt from 'jsonwebtoken';
import { createTestDatabase } from './helpers/database.js';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/emotiq_test';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_EXPIRES_DAYS = '7';
process.env.JWT_ISSUER = 'emotiq-api';
process.env.JWT_AUDIENCE = 'emotiq-client';
process.env.FRONTEND_URL = 'http://localhost:5173';

const { createApp } = await import('../src/app.js');
const { env } = await import('../src/config/env.js');
const { hashPassword, verifyPassword } = await import('../src/utils/password.js');
const { hashRefreshToken, signAccessToken, verifyAccessToken } = await import('../src/utils/token.js');
const { prisma } = await import('../src/config/prisma.js');
const origin = env.frontendOrigin;
const password = ' StrongPassword123! ';
let passwordHash;
before(async () => { passwordHash = await hashPassword(password); });

function fixture() {
  const db = createTestDatabase();
  const user = { id: randomUUID(), name: 'Levon', email: 'levon@example.com', passwordHash };
  db.users.set(user.id, user);
  return { db, user, app: createApp({ db }) };
}
const post = (app, path) => request(app).post(`/api/auth/${path}`)
  .set('Origin', origin).set('X-CSRF-Protection', '1');
const login = app => post(app, 'login').send({ email: 'levon@example.com', password });
const cookie = response => response.headers['set-cookie'][0].split(';')[0];
const rawToken = response => cookie(response).split('=')[1];
const assertSafe = body => {
  const text = JSON.stringify(body);
  for (const secret of ['passwordHash', 'tokenHash', 'refreshToken', password]) assert(!text.includes(secret));
};

test('registration normalizes input, hashes unchanged password, returns safe user without logging in', async () => {
  const { app, db } = fixture();
  const response = await post(app, 'register').send({ name: '  Ani  ', email: ' ANI@EXAMPLE.COM ', password });
  assert.equal(response.status, 201);
  assert.equal(response.body.message, 'User registered successfully');
  assert.equal(response.body.data.user.name, 'Ani');
  assert.equal(response.body.data.user.email, 'ani@example.com');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(response.body.data.accessToken, undefined);
  assertSafe(response.body);
  const stored = [...db.users.values()].find(user => user.email === 'ani@example.com');
  assert(stored.passwordHash.startsWith('$argon2id$'));
  assert(await verifyPassword(stored.passwordHash, password));
  assert.equal(await verifyPassword(stored.passwordHash, password.trim()), false);
});

test('registration validation rejects bounds, invalid types and unexpected fields', async () => {
  const { app } = fixture();
  for (const data of [
    { name:'A', email:'a@example.com', password },
    { name:'A'.repeat(101), email:'a@example.com', password },
    { name:'Ani', email:'bad', password },
    { name:'Ani', email:`${'x'.repeat(250)}@example.com`, password },
    { name:'Ani', email:'a@example.com', password:'short' },
    { name:'Ani', email:'a@example.com', password:'x'.repeat(129) },
    { name:'Ani', email:'a@example.com', password, admin:true },
    { name:22, email:'a@example.com', password },
  ]) {
    const response = await post(app, 'register').send(data);
    assert.equal(response.status, 400);
    assert(Array.isArray(response.body.errors));
    assertSafe(response.body);
  }
});

test('duplicate email and racing unique-constraint failure return 409', async () => {
  const { app, db } = fixture();
  assert.equal((await post(app, 'register').send({ name:'Levon', email:'LEVON@example.com', password })).status,409);
  db.forceDuplicateUser();
  assert.equal((await post(app, 'register').send({ name:'Ani', email:'ani@example.com', password })).status,409);
});

test('login returns verified 15-minute JWT and stores only refresh hash in a secure cookie', async () => {
  const { app, db, user } = fixture();
  const response = await login(app);
  assert.equal(response.status,200);
  assert.equal(response.body.data.expiresIn,900);
  assert.equal(verifyAccessToken(response.body.data.accessToken),user.id);
  const claims = jwt.decode(response.body.data.accessToken);
  assert.equal(claims.exp - claims.iat,900);
  assert.deepEqual(Object.keys(claims).sort(),['aud','exp','iat','iss','sub']);
  const header = response.headers['set-cookie'][0];
  assert.match(header,/HttpOnly/);
  assert.match(header,/SameSite=Lax/);
  assert.match(header,/Path=\/api\/auth/);
  assert.match(header,/Max-Age=604800/);
  assert(!header.includes('Secure'));
  const stored = [...db.tokens.values()][0];
  assert.equal(stored.tokenHash, hashRefreshToken(rawToken(response)));
  assert.notEqual(stored.tokenHash,rawToken(response));
  assert(Math.abs(stored.expiresAt.getTime()-Date.now()-7*86400000)<5000);
  assertSafe(response.body);
  assert.equal(response.headers['cache-control'],'no-store');
});

test('wrong password and unknown user return identical generic 401; login validation is strict', async () => {
  const { app } = fixture();
  const wrong = await post(app,'login').send({email:'levon@example.com',password:'incorrect'});
  const unknown = await post(app,'login').send({email:'unknown@example.com',password});
  assert.equal(wrong.status,401);
  assert.equal(unknown.status,401);
  assert.deepEqual(wrong.body,unknown.body);
  for (const body of [{email:'invalid',password}, {email:'levon@example.com'}, {email:'levon@example.com',password,extra:true}]) {
    assert.equal((await post(app,'login').send(body)).status,400);
  }
});

test('profile requires valid JWT signature, expiration, algorithm, issuer, audience and subject', async () => {
  const { app, user } = fixture();
  const response = await request(app).get('/api/auth/me').set('Authorization',`Bearer ${signAccessToken(user.id)}`);
  assert.equal(response.status,200);
  assert.deepEqual(response.body.data.user,{id:user.id,name:user.name,email:user.email});
  assertSafe(response.body);
  assert.equal((await request(app).get('/api/auth/me')).status,401);
  const options = {subject:user.id,issuer:env.jwtIssuer,audience:env.jwtAudience,expiresIn:'15m',algorithm:'HS256'};
  const invalid = [
    'garbage',
    jwt.sign({},'wrong-secret',options),
    jwt.sign({},env.jwtAccessSecret,{...options,expiresIn:-1}),
    jwt.sign({},env.jwtAccessSecret,{...options,issuer:'other'}),
    jwt.sign({},env.jwtAccessSecret,{...options,audience:'other'}),
    jwt.sign({},env.jwtAccessSecret,{...options,algorithm:'HS384'}),
    jwt.sign({},'',{...options,algorithm:'none'}),
    jwt.sign({},env.jwtAccessSecret,{...options,subject:'invalid'}),
    jwt.sign({},env.jwtAccessSecret,{subject:user.id,issuer:env.jwtIssuer,audience:env.jwtAudience}),
    signAccessToken(randomUUID()),
  ];
  for (const token of invalid) {
    assert.equal((await request(app).get('/api/auth/me').set('Authorization',`Bearer ${token}`)).status,401);
  }
});

test('refresh rotates token, revokes predecessor, and rejects reuse', async () => {
  const { app, db } = fixture();
  const first = await login(app);
  const rotated = await post(app,'refresh').set('Cookie',cookie(first));
  assert.equal(rotated.status,200);
  assert.notEqual(rawToken(rotated),rawToken(first));
  assert.equal(db.tokens.size,2);
  assert([...db.tokens.values()][0].revokedAt instanceof Date);
  assertSafe(rotated.body);
  assert.equal((await post(app,'refresh').set('Cookie',cookie(first))).status,401);
  assert.equal((await post(app,'refresh').set('Cookie',cookie(rotated))).status,200);
});

test('missing, malformed, unknown, expired and revoked refresh cookies are rejected', async () => {
  const { app, db } = fixture();
  assert.equal((await post(app,'refresh')).status,401);
  for (const token of ['invalid','a'.repeat(64)]) {
    assert.equal((await post(app,'refresh').set('Cookie',`emotiq_refresh=${token}`)).status,401);
  }
  const first = await login(app);
  const record = [...db.tokens.values()][0];
  record.expiresAt=new Date(Date.now()-1000);
  assert.equal((await post(app,'refresh').set('Cookie',cookie(first))).status,401);
  record.expiresAt=new Date(Date.now()+100000);
  record.revokedAt=new Date();
  assert.equal((await post(app,'refresh').set('Cookie',cookie(first))).status,401);
});

test('concurrent refresh reads can claim a token only once', async () => {
  const { app, db } = fixture();
  const first = await login(app);
  db.raceRefreshReads();
  const responses = await Promise.all([1,2].map(()=>post(app,'refresh').set('Cookie',cookie(first))));
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,401]);
  assert.equal(db.tokens.size,2);
  assert.equal([...db.tokens.values()].filter(row=>!row.revokedAt).length,1);
});

test('failed rotation rolls back revocation and never sends a new cookie', async () => {
  const { app, db } = fixture();
  const first = await login(app);
  db.failNextTokenCreate();
  const failed = await post(app,'refresh').set('Cookie',cookie(first));
  assert.equal(failed.status,500);
  assert.equal(failed.headers['set-cookie'],undefined);
  assert.equal([...db.tokens.values()][0].revokedAt,null);
  assert.deepEqual(failed.body,{success:false,message:'Internal server error'});
  assert.equal((await post(app,'refresh').set('Cookie',cookie(first))).status,200);
});

test('logout is idempotent, clears the cookie and revokes refresh; JWT remains valid', async () => {
  const { app, db } = fixture();
  const first = await login(app);
  const response = await post(app,'logout').set('Cookie',cookie(first));
  assert.equal(response.status,204);
  assert.equal(response.text,'');
  assert.match(response.headers['set-cookie'][0],/Expires=Thu, 01 Jan 1970/);
  assert.match(response.headers['set-cookie'][0],/Path=\/api\/auth/);
  assert([...db.tokens.values()][0].revokedAt);
  assert.equal((await post(app,'refresh').set('Cookie',cookie(first))).status,401);
  assert.equal((await post(app,'logout').set('Cookie',cookie(first))).status,204);
  assert.equal((await post(app,'logout')).status,204);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization',`Bearer ${first.body.data.accessToken}`)).status,200);
});

test('all auth POST endpoints require exact Origin and CSRF header independently of CORS', async () => {
  const { app } = fixture();
  for (const path of ['register','login','refresh','logout']) {
    for (const headers of [{}, {Origin:'null','X-CSRF-Protection':'1'}, {Origin:origin},
      {Origin:'https://evil.example','X-CSRF-Protection':'1'},
      {Origin:origin+'/', 'X-CSRF-Protection':'1'}]) {
      assert.equal((await request(app).post(`/api/auth/${path}`).set(headers).send({})).status,403);
    }
  }
  const preflight = await request(app).options('/api/auth/refresh').set('Origin',origin)
    .set('Access-Control-Request-Method','POST').set('Access-Control-Request-Headers','X-CSRF-Protection');
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers['access-control-allow-origin'],origin);
  assert.equal(preflight.headers['access-control-allow-credentials'],'true');
});

test('rate limits cover every auth endpoint and do not trust spoofed forwarding headers', async () => {
  for (const [path,limit] of [['register',10],['login',20],['refresh',60],['logout',60],['me',120]]) {
    const { app } = fixture();
    assert.equal(app.get('trust proxy'),false);
    let response;
    for (let i=0;i<=limit;i++) {
      response=path==='me' ? await request(app).get('/api/auth/me') : await post(app,path).send({});
      if(i<limit) assert.notEqual(response.status,429);
    }
    assert.equal(response.status,429);
    assert(response.headers['retry-after']);
    assert.equal(response.body.success,false);
    const spoofed = path === 'me'
      ? await request(app).get('/api/auth/me').set('X-Forwarded-For', '203.0.113.123')
      : await post(app,path).set('X-Forwarded-For', '203.0.113.123').send({});
    assert.equal(spoofed.status,429);
  }
});

test('production cookies are Secure and startup rejects invalid secrets and lifetimes', () => {
  const run = (code, overrides={}) => spawnSync(process.execPath,['--input-type=module','-e',code], {
    cwd:process.cwd(),encoding:'utf8',env:{...process.env,...overrides},
  });
  const secure=run("const {refreshCookieOptions}=await import('./src/utils/cookies.js'); console.log(JSON.stringify(refreshCookieOptions()));",{
    NODE_ENV:'production',FRONTEND_URL:'https://emotiq.example',
  });
  assert.equal(secure.status,0,secure.stderr);
  assert.equal(JSON.parse(secure.stdout).secure,true);
  for (const overrides of [{JWT_ACCESS_SECRET:''},{JWT_ACCESS_SECRET:'replace_with_strong_random_secret'},
    {JWT_ACCESS_EXPIRES_IN:'1d'},{REFRESH_TOKEN_EXPIRES_DAYS:'0'},{FRONTEND_URL:'https://example.com/path'},
    {NODE_ENV:'production',FRONTEND_URL:'http://localhost:5173'}]) {
    const result=run("await import('./src/config/env.js')",overrides);
    assert.notEqual(result.status,0);
    assert(!result.stderr.includes(process.env.JWT_ACCESS_SECRET));
  }
});

test('health endpoints and existing root response remain intact', async () => {
  const { app } = fixture();
  assert.equal((await request(app).get('/')).text,'Hello World');
  assert.equal((await request(app).get('/api/health')).body.message,'Emotiq API is running');
  const original=prisma.$queryRaw;
  try {
    prisma.$queryRaw=async()=>[{value:1}];
    assert.equal((await request(app).get('/api/health/db')).status,200);
    prisma.$queryRaw=async()=>{throw new Error('Private credential');};
    const response=await request(app).get('/api/health/db');
    assert.equal(response.status,503);
    assert(!JSON.stringify(response.body).includes('Private'));
  } finally {prisma.$queryRaw=original;}
});


test('registered user can log in with normalized email and unchanged password', async () => {
  const { app, db } = fixture();
  const registration = await post(app, 'register').send({
    name: '  Ani  ', email: ' ANI@EXAMPLE.COM ', password,
  });
  assert.equal(registration.status, 201);
  const response = await post(app, 'login').send({ email: '  ANI@EXAMPLE.COM  ', password });
  assert.equal(response.status, 200);
  assert.equal(response.body.message, 'Login successful');
  assert.deepEqual(response.body.data.user, registration.body.data.user);
  assert.equal(verifyAccessToken(response.body.data.accessToken), registration.body.data.user.id);
  assert.equal(db.tokens.size, 1);
  assertSafe(response.body);
  assert(!JSON.stringify(response.body).includes(rawToken(response)));
  assert(!JSON.stringify(response.body).includes(process.env.JWT_ACCESS_SECRET));
});

test('registration database lookup and insert errors return safe 500 responses', async () => {
  for (const operation of ['findUnique', 'create']) {
    const { app, db } = fixture();
    db.user[operation] = async () => { throw new Error('Private Prisma details and credentials'); };
    const response = await post(app, 'register').send({ name: 'Ani', email: 'ani@example.com', password });
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { success: false, message: 'Internal server error' });
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(db.tokens.size, 0);
  }
});

test('login database failures never expose tokens or set authentication cookies', async () => {
  for (const operation of ['lookup', 'persist']) {
    const { app, db } = fixture();
    if (operation === 'lookup') {
      db.user.findUnique = async () => { throw new Error('Private Prisma details and credentials'); };
    } else {
      db.failNextTokenCreate();
    }
    const response = await login(app);
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { success: false, message: 'Internal server error' });
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(db.tokens.size, 0);
  }
});


test('complete cookie-aware authentication flow from registration through logout', async () => {
  const { app, db } = fixture();
  const agent = request.agent(app);
  const send = path => agent.post(`/api/auth/${path}`).set('Origin', origin).set('X-CSRF-Protection', '1');
  const credentials = { email: ' EMOTIQ.TEST@EXAMPLE.COM ', password: 'SecureTestPassword123!' };
  const registration = await send('register').send({ name: 'Emotiq Test User', ...credentials });
  assert.equal(registration.status, 201);
  const user = registration.body.data.user;
  assert.equal(user.email, 'emotiq.test@example.com');
  assertSafe(registration.body);
  assert(await verifyPassword(db.users.get(user.id).passwordHash, credentials.password));
  assert.equal((await send('register').send({ name: 'Emotiq Test User', ...credentials })).status, 409);
  assert.equal((await send('login').send({ ...credentials, password: 'incorrect' })).status, 401);
  const loggedIn = await send('login').send(credentials);
  assert.equal(loggedIn.status, 200);
  let accessToken = loggedIn.body.data.accessToken;
  assert.equal(verifyAccessToken(accessToken), user.id);
  assert.equal([...db.tokens.values()][0].tokenHash, hashRefreshToken(rawToken(loggedIn)));
  const profile = await agent.get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);
  assert.equal(profile.status, 200);
  assert.deepEqual(profile.body.data.user, user);
  const refreshed = await send('refresh'); // Agent sends stored cookie automatically.
  assert.equal(refreshed.status, 200);
  accessToken = refreshed.body.data.accessToken;
  assert.equal(verifyAccessToken(accessToken), user.id);
  assert.notEqual(rawToken(refreshed), rawToken(loggedIn));
  assert([...db.tokens.values()][0].revokedAt);
  assert.equal((await post(app, 'refresh').set('Cookie', cookie(loggedIn))).status, 401);
  assert.equal((await send('logout')).status, 204);
  assert([...db.tokens.values()].every(row => row.revokedAt));
  assert.equal((await send('logout')).status, 204);
  const denied = await send('refresh');
  assert.equal(denied.status, 401);
  assert.equal(denied.body.data, undefined);
  assert.equal(denied.headers['set-cookie'], undefined);
  assert.equal((await post(app, 'refresh').set('Cookie', cookie(refreshed))).status, 401);
  for (const response of [loggedIn, profile, refreshed, denied]) assertSafe(response.body);
});

test('development logs exclude credentials, tokens, secrets and database errors', () => {
  const code = `
    import request from 'supertest';
    const { createApp } = await import('./src/app.js');
    const db = { user: { findUnique: async () => { throw new Error(process.env.LOG_TEST_SECRET); } } };
    const app = createApp({ db });
    const response = await request(app).post('/api/auth/login?token=' + process.env.LOG_TEST_SECRET)
      .set('Origin', process.env.FRONTEND_URL).set('X-CSRF-Protection', '1')
      .set('Authorization', 'Bearer ' + process.env.LOG_TEST_SECRET)
      .set('Cookie', 'emotiq_refresh=' + process.env.LOG_TEST_SECRET)
      .send({ email:'test@example.com', password:process.env.LOG_TEST_SECRET });
    if (response.status !== 500) process.exitCode = 1;
  `;
  const secret = randomBytes(32).toString('hex');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: process.cwd(), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'development', LOG_TEST_SECRET: secret },
  });
  assert.equal(child.status, 0, child.stderr);
  const logs = child.stdout + child.stderr;
  assert(logs.includes('500'));
  for (const value of [secret, process.env.JWT_ACCESS_SECRET, process.env.DATABASE_URL]) {
    assert(!logs.includes(value));
  }
});

test('Postman collection scripts and all requests pass against a cookie-aware mocked backend', async () => {
  const collection = JSON.parse(readFileSync(new URL('../postman/Emotiq_Auth.postman_collection.json', import.meta.url)));
  const { app, db } = fixture();
  const agent = request.agent(app);
  const variables = new Map(collection.variable.map(row => [row.key, row.value]));
  assert.equal(variables.get('baseUrl'), 'http://localhost:5000');
  assert.equal(variables.get('accessToken'), '');
  const local = new Map();
  const environment = new Map([['testPassword', ' Postman"password\\123! '], ['isolatedDatabaseConfirmed', 'true']]);
  const get = key => local.has(key) ? local.get(key) : environment.has(key) ? environment.get(key) : variables.get(key);
  const replace = text => text.replace(/{{([^}]+)}}/g, (_, key) => key === '$guid' ? randomUUID() : get(key) ?? '');
  let assertions = 0;
  for (const item of collection.item) {
    const body = item.request.body ? structuredClone(item.request.body) : undefined;
    if (body) body.update = value => { body.raw = value; };
    const pm = {
      info: { requestName: item.name },
      request: { body },
      environment: { get: key => environment.get(key) },
      collectionVariables: { get: key => variables.get(key), set: (key,value) => variables.set(key,value) },
      variables: { get, set: (key,value) => local.set(key,value), replaceIn: replace },
      execution: { skipRequest: () => { throw new Error('Skipped'); }, setNextRequest: () => {} },
      test: (name, callback) => { callback(); assertions++; },
      expect: value => ({ to: { equal: expected => assert.equal(value,expected) } }),
    };
    const run = events => {
      for (const event of events) runInNewContext(event.script.exec.join('\n'), { pm });
    };
    // Prove the pre-request guard skips before sending anything without opt-in.
    environment.set('isolatedDatabaseConfirmed', 'false');
    assert.throws(() => run(collection.event.filter(event => event.listen === 'prerequest')), /Skipped/);
    environment.set('isolatedDatabaseConfirmed', 'true');
    run(collection.event.filter(event => event.listen === 'prerequest'));
    const url = new URL(replace(item.request.url));
    let req = agent[item.request.method.toLowerCase()](url.pathname);
    for (const header of item.request.header) req = req.set(header.key, replace(header.value));
    if (item.request.auth.type === 'bearer') {
      req = req.set('Authorization', `Bearer ${replace(item.request.auth.bearer[0].value)}`);
    }
    if (body) req = req.send(JSON.parse(body.raw));
    const response = await req;
    pm.response = {
      code: response.status,
      json: () => response.body,
      text: () => response.text,
      headers: { get: name => {
        const value = response.headers[name.toLowerCase()];
        return Array.isArray(value) ? value.join('; ') : value;
      } },
      to: { have: { status: status => assert.equal(response.status,status,item.name) } },
    };
    run(collection.event.filter(event => event.listen === 'test'));
    run(item.event.filter(event => event.listen === 'test'));
  }
  assert(assertions >= 35);
  assert.equal(db.tokens.size, 2);
  assert([...db.tokens.values()].every(row => row.revokedAt));
});
