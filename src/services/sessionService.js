import { createRandomToken } from '../lib/crypto.js';

function createExpiringStore(defaultTtlMs) {
  const values = new Map();

  return {
    create(payload, ttlMs = defaultTtlMs) {
      const token = createRandomToken();
      values.set(token, {
        payload,
        expiresAt: Date.now() + ttlMs,
      });
      return token;
    },

    take(token) {
      const entry = values.get(token);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        values.delete(token);
        return null;
      }
      values.delete(token);
      return entry.payload;
    },

    get(token) {
      const entry = values.get(token);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        values.delete(token);
        return null;
      }
      return entry.payload;
    },

    revoke(token) {
      values.delete(token);
    },

    cleanup() {
      const now = Date.now();
      for (const [token, entry] of values.entries()) {
        if (entry.expiresAt <= now) values.delete(token);
      }
    },
  };
}

export function createSessionService() {
  const adminSessions = createExpiringStore(10 * 60 * 1000);
  const passkeyChallenges = createExpiringStore(5 * 60 * 1000);
  const policyAuthorizations = createExpiringStore(10 * 60 * 1000);

  return {
    createAdminSession(payload = {}) {
      return adminSessions.create(payload);
    },
    getAdminSession(token) {
      return adminSessions.get(token);
    },
    revokeAdminSession(token) {
      adminSessions.revoke(token);
    },
    createPasskeyChallenge(payload) {
      return passkeyChallenges.create(payload);
    },
    takePasskeyChallenge(token) {
      return passkeyChallenges.take(token);
    },
    createPolicyAuthorization(payload) {
      return policyAuthorizations.create(payload);
    },
    getPolicyAuthorization(token) {
      return policyAuthorizations.get(token);
    },
    cleanup() {
      adminSessions.cleanup();
      passkeyChallenges.cleanup();
      policyAuthorizations.cleanup();
    },
  };
}
