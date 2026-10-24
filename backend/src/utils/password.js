import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

export const hashPassword = password => argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
});

export const verifyPassword = (hash, password) => argon2.verify(hash, password);

// Unknown users still perform password verification to reduce timing differences.
let dummyHash;
export function getDummyPasswordHash() {
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
  return dummyHash;
}
