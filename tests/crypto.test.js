import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptBytes,
  encryptBytes,
  hashPassword,
  verifyPassword,
} from '../src/lib/crypto.js';

test('encryptBytes and decryptBytes round-trip private data', () => {
  const secret = Buffer.from('local signer secret');
  const password = 'correct horse battery staple';
  const encrypted = encryptBytes(secret, password);

  assert.notDeepEqual(encrypted.encryptedKey, secret);
  assert.deepEqual(decryptBytes(encrypted, password), secret);
});

test('verifyPassword rejects wrong password', () => {
  const password = 'master password';
  const wrongPassword = 'not it';
  const result = hashPassword(password);

  assert.equal(verifyPassword(password, result.salt, result.hash), true);
  assert.equal(verifyPassword(wrongPassword, result.salt, result.hash), false);
});
