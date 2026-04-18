export function createAdminAuthService({
  walletService,
  passkeyService,
  sessionService,
}) {
  return {
    createBootstrapSession(masterPassword) {
      if (!walletService.verifyMasterPassword(masterPassword)) {
        throw new Error('invalid_master_password');
      }

      return sessionService.createAdminSession({
        createdAt: Date.now(),
      });
    },

    assertBootstrapSession(token) {
      const session = sessionService.getAdminSession(token);
      if (!session) {
        throw new Error('bootstrap_session_required');
      }
      return session;
    },

    issuePolicyAuthorization(payload) {
      return sessionService.createPolicyAuthorization(payload);
    },

    assertPolicyAuthorization(token) {
      if (!passkeyService.hasPasskeys()) {
        return this.assertBootstrapSession(token);
      }

      const authorization = sessionService.getPolicyAuthorization(token);
      if (!authorization) {
        throw new Error('policy_authorization_required');
      }
      return authorization;
    },
  };
}
