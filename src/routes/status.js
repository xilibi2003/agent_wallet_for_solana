import { parseBearerToken, serializeAuditLog, serializePolicy } from './helpers.js';

function unauthorized(reply, message = 'Unauthorized', code = 'unauthorized') {
  reply.code(401);
  return { error: message, code };
}

export async function registerStatusRoutes(app, services) {
  app.get('/health', async () => ({
    status: 'ok',
    wallet: services.walletService.publicKeyBase58,
    rpcUrl: services.config.solana.rpcUrl,
  }));

  app.get('/v1/admin/auth/status', async () => {
    const passkeys = services.passkeyService.listPasskeys();
    return {
      hasPasskeys: passkeys.length > 0,
      passkeyCount: passkeys.length,
    };
  });

  app.get('/v1/admin/status', async (request, reply) => {
    const token = parseBearerToken(request);
    if (!token) return unauthorized(reply, 'Login required', 'login_required');

    const passkeys = services.passkeyService.listPasskeys();
    const hasPasskeys = passkeys.length > 0;

    try {
      if (hasPasskeys) {
        services.adminAuthService.assertPolicyAuthorization(token);
      } else {
        services.adminAuthService.assertBootstrapSession(token);
      }
    } catch (error) {
      if (error.message === 'policy_authorization_required') {
        return unauthorized(
          reply,
          'Passkey login required',
          'policy_authorization_required',
        );
      }
      if (error.message === 'bootstrap_session_required') {
        return unauthorized(
          reply,
          'Bootstrap session required',
          'bootstrap_session_required',
        );
      }
      return unauthorized(reply, error.message);
    }

    const policy = services.policyService.getCurrentPolicy();
    let walletBalance = null;
    let walletBalanceError = null;

    try {
      walletBalance = await services.walletInfoService.getBalance();
    } catch (error) {
      walletBalanceError = error.message;
    }

    return {
      walletPublicKey: services.walletService.publicKeyBase58,
      walletBalance,
      walletBalanceError,
      hasPasskeys,
      passkeyCount: passkeys.length,
      policy: serializePolicy(policy),
      auditLogs: services.auditService.recent(20).map(serializeAuditLog),
    };
  });
}
