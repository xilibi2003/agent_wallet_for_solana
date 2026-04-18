import { nowIso } from '../lib/time.js';

export function createAuditService(database) {
  return {
    record(log) {
      database.addAuditLog({
        timestamp: nowIso(),
        ...log,
      });
    },
    recent(limit = 20) {
      return database.listAuditLogs(limit);
    },
  };
}
