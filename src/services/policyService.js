import { PublicKey } from '@solana/web3.js';

import { utcDateKey } from '../lib/time.js';

function normalizeProgramIDs(programIDs) {
  return [...new Set(programIDs.map((id) => new PublicKey(id).toBase58()))].sort();
}

export function createPolicyService(database) {
  function resetIfNeeded(policy) {
    const today = utcDateKey();
    if (policy.spentDate === today) return policy;
    return database.savePolicy({
      ...policy,
      spentTodayLamports: 0n,
      spentDate: today,
    });
  }

  return {
    getCurrentPolicy() {
      return resetIfNeeded(database.getPolicy());
    },

    updatePolicy(input) {
      const current = resetIfNeeded(database.getPolicy());
      const next = {
        ...current,
        dailyLimitLamports: input.dailyLimitLamports ?? current.dailyLimitLamports,
        whitelistPrograms: input.whitelistPrograms
          ? normalizeProgramIDs(input.whitelistPrograms)
          : current.whitelistPrograms,
        panicMode: input.panicMode ?? current.panicMode,
        requireSimulation: input.requireSimulation ?? current.requireSimulation,
      };
      return database.savePolicy(next);
    },

    consumeSpend(amountLamports) {
      const current = resetIfNeeded(database.getPolicy());
      return database.savePolicy({
        ...current,
        spentTodayLamports: current.spentTodayLamports + amountLamports,
      });
    },

    assertWithinPolicy(programIDs, spendLamports) {
      const policy = resetIfNeeded(database.getPolicy());

      if (policy.panicMode) {
        throw new Error('panic_mode_enabled');
      }

      for (const programID of programIDs) {
        if (!policy.whitelistPrograms.includes(programID)) {
          throw new Error(`program_not_whitelisted:${programID}`);
        }
      }

      if (policy.dailyLimitLamports >= 0n) {
        const projectedSpend = policy.spentTodayLamports + spendLamports;
        if (projectedSpend > policy.dailyLimitLamports) {
          throw new Error('daily_limit_exceeded');
        }
      }

      return policy;
    },
  };
}
