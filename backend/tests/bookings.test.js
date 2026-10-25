import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/emotiq_test';
process.env.FRONTEND_URL = 'http://localhost:5173';
const { createApp } = await import('../src/app.js');
const { signAccessToken } = await import('../src/utils/token.js');
const { createBookingService } = await import('../src/services/booking.service.js');
const { dayBounds, SLOT_MS } = await import('../src/utils/bookingSlots.js');

function database() {
  const rows = new Map();
  let queue = Promise.resolve();
  let conflicts = 0;
  const isolations = [];
  function match(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'session') return !row.hasSession;
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('not' in value) return row[key] !== value.not;
        if ('lt' in value) return row[key] < value.lt;
        if ('gt' in value) return row[key] > value.gt;
      }
      return row[key] === value;
    });
  }
  const db = {
    rows, isolations,
    conflict(count) { conflicts = count; },
    user: { async findUnique({ where }) { return { id: where.id }; } },
    booking: {
      async findMany({ where, skip = 0, take = 100000 }) {
        return [...rows.values()].filter(row => match(row,where)).sort((a,b) => a.startTime-b.startTime || a.id.localeCompare(b.id)).slice(skip,skip+take).map(row => structuredClone(row));
      },
      async count({ where }) { return [...rows.values()].filter(row => match(row,where)).length; },
      async findFirst({ where }) { return structuredClone([...rows.values()].find(row => match(row,where)) ?? null); },
      async create({ data }) {
        const row = { id: randomUUID(), createdAt: new Date(), ...data };
        rows.set(row.id,row);
        return structuredClone(row);
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of rows.values()) if (match(row,where)) { Object.assign(row,data); count++; }
        return { count };
      },
    },
    async $transaction(fn, options) {
      isolations.push(options.isolationLevel);
      if (conflicts > 0) { conflicts--; throw Object.assign(new Error('Serialization conflict'),{code:'P2034'}); }
      // Models a serial schedule. Actual PostgreSQL predicate locking needs an isolated DB test.
      const previous = queue;
      let unlock;
      queue = new Promise(resolve => { unlock = resolve; });
      await previous;
      const snapshot = structuredClone(rows);
      try { return await fn(db); }
      catch(error) { rows.clear(); for(const [k,v] of snapshot)rows.set(k,v); throw error; }
      finally { unlock(); }
    },
  };
  return db;
}
const future = () => new Date(Math.ceil((Date.now()+86400000)/SLOT_MS)*SLOT_MS).toISOString();
function fixture() {
  const db = database();
  const userId = randomUUID();
  return { db, userId, app:createApp({ db }), token:signAccessToken(userId) };
}
const auth = (req,token) => req.set('Authorization',`Bearer ${token}`);

test('booking lifecycle enforces ownership, cancellation, pagination and capacity', async () => {
  const {app,db,token,userId} = fixture();
  const startTime = future();
  const created = await auth(request(app).post('/api/bookings'),token).send({startTime});
  assert.equal(created.status,201);
  const booking = created.body.data.booking;
  assert.equal(booking.userId,userId);
  assert.equal(new Date(booking.endTime)-new Date(booking.startTime),SLOT_MS);
  const id = booking.id;
  assert.equal((await auth(request(app).get(`/api/bookings/${id}`),token)).status,200);
  assert.equal((await auth(request(app).post('/api/bookings'),token).send({startTime})).status,409);
  const other = signAccessToken(randomUUID());
  assert.equal((await auth(request(app).get(`/api/bookings/${id}`),other)).status,404);
  assert.equal((await auth(request(app).patch(`/api/bookings/${id}/cancel`),other)).status,404);
  const list = await auth(request(app).get('/api/bookings?page=1&limit=1&status=SCHEDULED'),token);
  assert.equal(list.status,200);
  assert.equal(list.body.data.pagination.total,1);
  assert.equal((await auth(request(app).get('/api/bookings'),other)).body.data.bookings.length,0);
  for(let i=0;i<2;i++) assert.equal((await auth(request(app).patch(`/api/bookings/${id}/cancel`),token)).status,200);
  assert.equal(db.rows.get(id).status,'CANCELLED');
  assert.equal((await auth(request(app).post('/api/bookings'),token).send({startTime})).status,201);
});

test('only three of four competing users can book a slot; cancellation frees capacity', async () => {
  const db = database();
  const service = createBookingService(db);
  const startTime = future();
  const users = Array.from({length:4},()=>randomUUID());
  const results = await Promise.allSettled(users.map(user=>service.create(user,{startTime})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,3);
  const rejected = results.find(result=>result.status==='rejected');
  assert.equal(rejected.reason.status,409);
  const first = results[0].value;
  const date = startTime.slice(0,10);
  let availability = await service.availability(users[3],{date,timezone:'UTC'});
  let slot = availability.slots.find(slot=>slot.startTime.toISOString()===startTime);
  assert.equal(slot.remainingPlaces,0);
  assert.equal(slot.available,false);
  assert(!JSON.stringify(availability).includes(users[0]));
  await service.cancel(users[0],first.id);
  availability = await service.availability(users[3],{date,timezone:'UTC'});
  slot = availability.slots.find(slot=>slot.startTime.toISOString()===startTime);
  assert.equal(slot.remainingPlaces,1);
  assert.equal(slot.available,true);
  await service.create(users[3],{startTime});
  assert(db.isolations.every(value=>value==='Serializable'));
});

test('same-user simultaneous bookings and legacy overlaps are rejected', async () => {
  const db=database(); const service=createBookingService(db); const user=randomUUID(); const startTime=future();
  const results=await Promise.allSettled([service.create(user,{startTime}),service.create(user,{startTime})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  const row=[...db.rows.values()][0];
  row.startTime=new Date(new Date(startTime).getTime()-5*60000);
  row.endTime=new Date(new Date(startTime).getTime()+5*60000);
  await assert.rejects(service.create(user,{startTime}),{status:409});
});

test('serialization conflicts retry and exhaustion returns safe conflict', async () => {
  const db=database(); const service=createBookingService(db);
  db.conflict(2);
  await service.create(randomUUID(),{startTime:future()});
  assert.equal(db.rows.size,1);
  db.conflict(4);
  await assert.rejects(service.create(randomUUID(),{startTime:future()}),{status:409});
  assert.equal(db.rows.size,1);
});

test('authentication and strict body/query/ID validation reject invalid requests', async () => {
  const {app,token}=fixture();
  for(const [method,path] of [['get','/api/bookings'],['get','/api/bookings/availability'],['post','/api/bookings'],['get',`/api/bookings/${randomUUID()}`],['patch',`/api/bookings/${randomUUID()}/cancel`]]) {
    assert.equal((await request(app)[method](path)).status,401);
  }
  for(const body of [{},{startTime:'invalid'},{startTime:'2020-01-01T00:00:00Z'},{startTime:new Date(Date.now()+100*86400000).toISOString()},{startTime:future(),userId:randomUUID()},{startTime:new Date(new Date(future()).getTime()+60000).toISOString()}]) {
    assert.equal((await auth(request(app).post('/api/bookings'),token).send(body)).status,400);
  }
  for(const path of ['/api/bookings/not-a-uuid','/api/bookings?page=0','/api/bookings?limit=101','/api/bookings?userId=x','/api/bookings/availability?date=2026-02-30','/api/bookings/availability?date=2026-10-26&timezone=Unknown/Place']) {
    assert.equal((await auth(request(app).get(path),token)).status,400);
  }
});

test('calendar timezone boundaries include 23- and 25-hour daylight-saving days', async () => {
  const spring=dayBounds('2027-03-14','America/New_York');
  const autumn=dayBounds('2027-11-07','America/New_York');
  assert.equal(spring.end-spring.start,23*3600000);
  assert.equal(autumn.end-autumn.start,25*3600000);
  const yerevan=dayBounds('2027-01-05','Asia/Yerevan');
  assert.equal(yerevan.start.toISOString(),'2027-01-04T20:00:00.000Z');
  const db=database();
  const service=createBookingService(db,()=>new Date('2027-03-13T00:00:00Z'));
  assert.equal((await service.availability(randomUUID(),{date:'2027-03-14',timezone:'America/New_York'})).slots.length,46);
});

test('availability shows personal booking and exposes no other users; API route precedes ID route', async () => {
  const {app,db,token,userId}=fixture(); const startTime=future();
  await createBookingService(db).create(userId,{startTime});
  const result=await auth(request(app).get(`/api/bookings/availability?date=${startTime.slice(0,10)}&timezone=UTC`),token);
  assert.equal(result.status,200);
  const slot=result.body.data.slots.find(row=>row.startTime===startTime);
  assert.equal(slot.remainingPlaces,2); assert.equal(slot.bookedByYou,true); assert.equal(slot.available,false);
  assert(!JSON.stringify(result.body).includes(userId));
});

test('started, completed and session-linked bookings cannot be cancelled; DB errors are safe', async () => {
  const {app,db,token,userId}=fixture(); const service=createBookingService(db);
  const row=await service.create(userId,{startTime:future()});
  for(const mutate of [b=>{b.status='COMPLETED';},b=>{b.status='SCHEDULED';b.hasSession=true;},b=>{b.hasSession=false;b.startTime=new Date(0); }]) {
    mutate(db.rows.get(row.id));
    assert.equal((await auth(request(app).patch(`/api/bookings/${row.id}/cancel`),token)).status,409);
  }
  db.booking.findMany=async()=>{throw new Error('private database credentials');};
  const response=await auth(request(app).get('/api/bookings'),token);
  assert.equal(response.status,500);
  assert.deepEqual(response.body,{success:false,message:'Internal server error'});
});

test('booking rate limits and PATCH preflight are configured', async () => {
  const {app,token}=fixture();
  const preflight=await request(app).options(`/api/bookings/${randomUUID()}/cancel`)
    .set('Origin','http://localhost:5173').set('Access-Control-Request-Method','PATCH')
    .set('Access-Control-Request-Headers','Authorization');
  assert.equal(preflight.status,204);
  assert(preflight.headers['access-control-allow-methods'].includes('PATCH'));
  for(let i=0;i<180;i++) assert.equal((await auth(request(app).get('/api/bookings'),token)).status,200);
  const blocked=await auth(request(app).get('/api/bookings'),token);
  assert.equal(blocked.status,429);
  assert(blocked.headers['retry-after']);
});
