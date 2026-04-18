import { serializeAuditLog, serializePolicy } from './helpers.js';

export async function registerStatusRoutes(app, services) {
  app.get('/health', async () => ({
    status: 'ok',
    wallet: services.walletService.publicKeyBase58,
    rpcUrl: services.config.solana.rpcUrl,
  }));

  app.get('/v1/admin/status', async () => {
    const policy = services.policyService.getCurrentPolicy();
    const passkeys = services.passkeyService.listPasskeys();
    return {
      walletPublicKey: services.walletService.publicKeyBase58,
      hasPasskeys: passkeys.length > 0,
      passkeyCount: passkeys.length,
      policy: serializePolicy(policy),
      auditLogs: services.auditService.recent(20).map(serializeAuditLog),
    };
  });
}
