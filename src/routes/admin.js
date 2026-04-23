import { z } from 'zod';

import { parseBearerToken, serializePolicy } from './helpers.js';

const sessionSchema = z.object({
  masterPassword: z.string().min(1),
});

const policySchema = z.object({
  dailyLimitLamports: z
    .union([z.string(), z.number(), z.bigint()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return BigInt(value);
    }),
  whitelistPrograms: z.array(z.string()).optional(),
  panicMode: z.boolean().optional(),
  requireSimulation: z.boolean().optional(),
});

const challengeVerifySchema = z.object({
  challengeToken: z.string().min(1),
  credential: z.any(),
});

function unauthorized(reply, message = 'Unauthorized', code = 'unauthorized') {
  reply.code(401);
  return { error: message, code };
}

export async function registerAdminRoutes(app, services) {
  app.post('/v1/admin/session', async (request, reply) => {
    const parsed = sessionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid request body' };
    }

    try {
      const token = services.adminAuthService.createBootstrapSession(
        parsed.data.masterPassword,
      );
      return {
        token,
        requiresPasskey: services.passkeyService.hasPasskeys(),
      };
    } catch {
      return unauthorized(reply, 'Invalid master password');
    }
  });

  app.post('/v1/admin/passkeys/register/options', async (request, reply) => {
    const token = parseBearerToken(request);
    if (!token) return unauthorized(reply);

    try {
      services.adminAuthService.assertBootstrapSession(token);
      return await services.passkeyService.createRegistrationChallenge();
    } catch (error) {
      if (error.message === 'bootstrap_session_required') {
        return unauthorized(
          reply,
          'Bootstrap session required',
          'bootstrap_session_required',
        );
      }
      reply.code(400);
      return { error: error.message, code: 'passkey_registration_options_failed' };
    }
  });

  app.post('/v1/admin/passkeys/register/verify', async (request, reply) => {
    const token = parseBearerToken(request);
    if (!token) return unauthorized(reply);

    const parsed = challengeVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid request body' };
    }

    try {
      services.adminAuthService.assertBootstrapSession(token);
      await services.passkeyService.verifyRegistration({
        challengeToken: parsed.data.challengeToken,
        response: parsed.data.credential,
      });
      return {
        ok: true,
        passkeyCount: services.passkeyService.listPasskeys().length,
      };
    } catch (error) {
      if (error.message === 'bootstrap_session_required') {
        return unauthorized(
          reply,
          'Bootstrap session required',
          'bootstrap_session_required',
        );
      }
      reply.code(400);
      return { error: error.message, code: 'passkey_registration_failed' };
    }
  });

  app.post('/v1/admin/passkeys/authenticate/options', async (_request, reply) => {
    try {
      return await services.passkeyService.createAuthenticationChallenge();
    } catch (error) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.post('/v1/admin/passkeys/authenticate/verify', async (request, reply) => {
    const parsed = challengeVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid request body' };
    }

    try {
      await services.passkeyService.verifyAuthentication({
        challengeToken: parsed.data.challengeToken,
        response: parsed.data.credential,
      });

      const token = services.adminAuthService.issuePolicyAuthorization({
        actor: 'passkey',
        issuedAt: Date.now(),
      });

      return { token };
    } catch (error) {
      reply.code(400);
      return { error: error.message };
    }
  });

  app.patch('/v1/admin/policy', async (request, reply) => {
    const token = parseBearerToken(request);
    if (!token) return unauthorized(reply);

    const parsed = policySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid request body' };
    }

    try {
      services.adminAuthService.assertPolicyAuthorization(token);
      const policy = services.policyService.updatePolicy(parsed.data);
      return { policy: serializePolicy(policy) };
    } catch (error) {
      if (error.message === 'policy_authorization_required') {
        return unauthorized(
          reply,
          'Policy authorization required',
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
      reply.code(401);
      return { error: error.message, code: 'policy_update_failed' };
    }
  });

  app.post('/v1/admin/panic/toggle', async (request, reply) => {
    const token = parseBearerToken(request);
    if (!token) return unauthorized(reply);

    try {
      services.adminAuthService.assertPolicyAuthorization(token);
      const current = services.policyService.getCurrentPolicy();
      const policy = services.policyService.updatePolicy({
        panicMode: !current.panicMode,
      });
      return { policy: serializePolicy(policy) };
    } catch (error) {
      if (error.message === 'policy_authorization_required') {
        return unauthorized(
          reply,
          'Policy authorization required',
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
      reply.code(401);
      return { error: error.message, code: 'panic_toggle_failed' };
    }
  });
}
