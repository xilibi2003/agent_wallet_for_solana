export function parseBearerToken(request) {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export function serializePolicy(policy) {
  return {
    dailyLimitLamports: policy.dailyLimitLamports.toString(),
    whitelistPrograms: policy.whitelistPrograms,
    spentTodayLamports: policy.spentTodayLamports.toString(),
    spentDate: policy.spentDate,
    panicMode: policy.panicMode,
    requireSimulation: policy.requireSimulation,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

export function serializeAuditLog(log) {
  return {
    id: log.id,
    timestamp: log.timestamp,
    intent: log.intent,
    txSignature: log.txSignature,
    status: log.status,
    programIds: log.programIds,
    amountLamports: log.amountLamports?.toString() ?? null,
    details: log.details,
  };
}
