import { Keypair } from '@solana/web3.js';

import { ask, askHidden } from '../lib/passwordPrompt.js';
import {
  decryptBytes,
  encryptBytes,
  hashPassword,
  verifyPassword,
} from '../lib/crypto.js';

function parseSecretKey(raw) {
  const value = raw.trim();
  if (!value) {
    return Keypair.generate();
  }

  if (value.startsWith('[')) {
    const parsed = JSON.parse(value);
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 64) {
    throw new Error('Secret key must be a Solana CLI JSON array or 64-byte base64 value');
  }
  return Keypair.fromSecretKey(decoded);
}

function rowToEncryptedRecord(row) {
  return {
    encryptedKey: row.encrypted_key,
    iv: row.iv,
    authTag: row.auth_tag,
    encryptionSalt: row.encryption_salt,
  };
}

export async function unlockOrCreateWallet(database) {
  const existing = database.getSecret();

  if (!existing) {
    const password = await askHidden('Create master password: ');
    const confirmation = await askHidden('Confirm master password: ');
    if (!password || password !== confirmation) {
      throw new Error('Master password confirmation failed');
    }

    const secretInput = await ask(
      'Paste Solana secret key (CLI JSON array or base64), or press Enter to generate: ',
    );
    const keypair = parseSecretKey(secretInput);
    const encrypted = encryptBytes(Buffer.from(keypair.secretKey), password);
    const passwordHash = hashPassword(password);

    database.saveSecret({
      encrypted_key: encrypted.encryptedKey,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
      encryption_salt: encrypted.encryptionSalt,
      password_salt: passwordHash.salt,
      password_hash: passwordHash.hash,
      public_key: keypair.publicKey.toBase58(),
    });

    return createWalletService(database, keypair);
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const password = await askHidden('Master password: ');
    if (!verifyPassword(password, existing.password_salt, existing.password_hash)) {
      console.error(`Invalid master password (${attempt}/3)`);
      continue;
    }

    const secretKey = decryptBytes(rowToEncryptedRecord(existing), password);
    const keypair = Keypair.fromSecretKey(secretKey);
    secretKey.fill(0);
    return createWalletService(database, keypair);
  }

  throw new Error('Failed to unlock wallet');
}

export function createWalletService(database, keypair) {
  return {
    publicKey: keypair.publicKey,
    publicKeyBase58: keypair.publicKey.toBase58(),

    signer() {
      return keypair;
    },

    verifyMasterPassword(password) {
      const secret = database.getSecret();
      if (!secret) return false;
      return verifyPassword(password, secret.password_salt, secret.password_hash);
    },
  };
}
