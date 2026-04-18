import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PASSWORD_HASH_LENGTH = 32;
const CIPHER = 'aes-256-gcm';

export function deriveKey(password, salt) {
  return scryptSync(password, salt, KEY_LENGTH);
}

export function hashPassword(password, salt = randomBytes(SALT_LENGTH)) {
  return {
    salt,
    hash: scryptSync(password, salt, PASSWORD_HASH_LENGTH),
  };
}

export function verifyPassword(password, salt, expectedHash) {
  const actualHash = scryptSync(password, salt, expectedHash.length);
  return (
    actualHash.length === expectedHash.length &&
    timingSafeEqual(actualHash, expectedHash)
  );
}

export function encryptBytes(plainBytes, password) {
  const encryptionSalt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(password, encryptionSalt);
  const cipher = createCipheriv(CIPHER, key, iv);
  const encryptedKey = Buffer.concat([cipher.update(plainBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();
  key.fill(0);

  return {
    encryptedKey,
    iv,
    authTag,
    encryptionSalt,
  };
}

export function decryptBytes(encryptedRecord, password) {
  const key = deriveKey(password, encryptedRecord.encryptionSalt);
  const decipher = createDecipheriv(CIPHER, key, encryptedRecord.iv);
  decipher.setAuthTag(encryptedRecord.authTag);
  const plain = Buffer.concat([
    decipher.update(encryptedRecord.encryptedKey),
    decipher.final(),
  ]);
  key.fill(0);
  return plain;
}

export function createRandomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}
