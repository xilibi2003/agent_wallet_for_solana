import assert from 'node:assert/strict';
import test from 'node:test';

import { Keypair } from '@solana/web3.js';

test('Keypair restored from decrypted Buffer survives zeroing source bytes', () => {
  const original = Keypair.generate();
  const decryptedSecretKey = Buffer.from(original.secretKey);
  const restored = Keypair.fromSecretKey(Uint8Array.from(decryptedSecretKey));

  decryptedSecretKey.fill(0);

  assert.equal(restored.publicKey.toBase58(), original.publicKey.toBase58());
});
