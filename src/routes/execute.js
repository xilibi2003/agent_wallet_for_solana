import { z } from 'zod';

const lamportsSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => BigInt(value));

const executeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('sol_transfer'),
    intent: z.string().min(1).max(280),
    recipient: z.string().min(32).max(64),
    lamports: lamportsSchema,
  }),
  z.object({
    kind: z.literal('raw_transaction'),
    intent: z.string().min(1).max(280),
    transactionBase64: z.string().min(1),
    transactionFormat: z.enum(['legacy', 'v0']).default('legacy'),
  }),
]);

export async function registerExecuteRoutes(app, services) {
  app.post('/v1/execute', async (request, reply) => {
    const parsed = executeSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error: 'Invalid execute payload',
        issues: parsed.error.flatten(),
      };
    }

    try {
      const result = await services.executeService.execute(parsed.data);
      return {
        ok: true,
        signature: result.signature,
        spendLamports: result.spendLamports.toString(),
        programIDs: result.programIDs,
        simulation: result.simulation
          ? {
              ...result.simulation,
              spendLamports: result.simulation.spendLamports.toString(),
            }
          : null,
      };
    } catch (error) {
      await services.executeService.failAudit(parsed.data, error);
      const forbiddenErrors = [
        'not_whitelisted',
        'daily_limit_exceeded',
        'panic_mode_enabled',
      ];
      const statusCode = forbiddenErrors.some((marker) =>
        error.message.includes(marker),
      )
        ? 403
        : 400;
      reply.code(statusCode);
      return {
        error: error.message,
      };
    }
  });
}
