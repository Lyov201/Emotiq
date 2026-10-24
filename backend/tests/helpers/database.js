import { randomUUID } from 'node:crypto';

// Deliberately in-memory: these tests never write to Neon.
export function createTestDatabase() {
  const users = new Map();
  const tokens = new Map();
  const select = (row, fields) => row && (fields
    ? Object.fromEntries(Object.keys(fields).filter(key => fields[key]).map(key => [key, row[key]]))
    : structuredClone(row));
  const matches = (row, where) => Object.entries(where).every(([key, value]) =>
    value && typeof value === 'object' && 'gt' in value ? row[key] > value.gt : row[key] === value);
  let failCreate = false;
  let forceDuplicate = false;
  let arrivals = 0;
  let release;
  let barrier;
  let releaseLock;
  let rowLock = Promise.resolve();
  function acquire() {
    const previous = rowLock;
    rowLock = new Promise(resolve => { releaseLock = resolve; });
    const unlock = releaseLock;
    return previous.then(() => unlock);
  }
  const db = {
    users, tokens,
    failNextTokenCreate() { failCreate = true; },
    forceDuplicateUser() { forceDuplicate = true; },
    raceRefreshReads() { arrivals = 0; barrier = new Promise(resolve => { release = resolve; }); },
    user: {
      async findUnique({ where, select: fields }) {
        return select([...users.values()].find(row => matches(row, where)), fields) ?? null;
      },
      async create({ data, select: fields }) {
        if (forceDuplicate || [...users.values()].some(user => user.email === data.email)) {
          forceDuplicate = false;
          throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        }
        const row = { id: randomUUID(), ...data };
        users.set(row.id, row);
        return select(row, fields);
      },
    },
    refreshToken: {
      async create({ data }) {
        if (failCreate) { failCreate = false; throw new Error('Private database error'); }
        const row = { id: randomUUID(), revokedAt: null, ...data };
        tokens.set(row.id, row);
        return structuredClone(row);
      },
      async findFirst({ where }) {
        const row = [...tokens.values()].find(row => matches(row, where));
        const result = row ? structuredClone(row) : null;
        if (barrier) {
          const wait = barrier;
          if (++arrivals === 2) { release(); barrier = undefined; }
          await wait;
        }
        return result;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of tokens.values()) {
          if (matches(row, where)) { Object.assign(row, data); count++; }
        }
        return { count };
      },
    },
    async $transaction(callback) {
      // Reads can race; conditional writes hold the simulated row lock until commit.
      let unlock;
      let snapshot;
      const tx = { ...db, refreshToken: { ...db.refreshToken,
        async updateMany(args) {
          unlock = await acquire();
          snapshot = structuredClone(tokens);
          return db.refreshToken.updateMany(args);
        },
      } };
      try { return await callback(tx); }
      catch (error) {
        if (snapshot) { tokens.clear(); for (const [key,value] of snapshot) tokens.set(key,value); }
        throw error;
      } finally { unlock?.(); }
    },
  };
  return db;
}
