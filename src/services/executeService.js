import {
  Connection,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';

const SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();

function lamportsToNumber(lamports) {
  const numeric = Number(lamports);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error('lamports_out_of_range');
  }
  return numeric;
}

function signerIndicesFromHeader(header) {
  return header.numRequiredSignatures;
}

function isStaticAccountSigner(message, index) {
  return index < signerIndicesFromHeader(message.header);
}

function isStaticAccountWritable(message, index) {
  const totalStaticKeys = message.staticAccountKeys.length;
  const signedWritableCount =
    message.header.numRequiredSignatures - message.header.numReadonlySignedAccounts;

  if (index < message.header.numRequiredSignatures) {
    return index < signedWritableCount;
  }

  const unsignedWritableThreshold =
    totalStaticKeys - message.header.numReadonlyUnsignedAccounts;
  return index < unsignedWritableThreshold;
}

function getLegacyProgramIDs(transaction) {
  return transaction.instructions.map((instruction) => instruction.programId.toBase58());
}

function getVersionedProgramIDs(transaction) {
  if (transaction.message.addressTableLookups.length > 0) {
    throw new Error('address_lookup_tables_not_supported');
  }
  return transaction.message.compiledInstructions.map((instruction) =>
    transaction.message.staticAccountKeys[instruction.programIdIndex].toBase58(),
  );
}

function assertSingleWalletSigner(requiredSignatures) {
  if (requiredSignatures > 1) {
    throw new Error('multiple_required_signers_not_allowed');
  }
}

function decodeSystemInstruction(instruction) {
  try {
    return SystemInstruction.decodeInstructionType(instruction);
  } catch {
    return null;
  }
}

function assertSafeLegacyInstructions(transaction, walletPublicKey) {
  for (const instruction of transaction.instructions) {
    const programID = instruction.programId.toBase58();
    if (programID === SYSTEM_PROGRAM_ID) {
      const instructionType = decodeSystemInstruction(instruction);
      if (instructionType !== 'Transfer') {
        throw new Error(`unsafe_system_instruction:${instructionType ?? 'unknown'}`);
      }
      continue;
    }

    const touchesWalletWritable = instruction.keys.some(
      (key) => key.pubkey.equals(walletPublicKey) && key.isWritable,
    );
    if (touchesWalletWritable) {
      throw new Error(`wallet_writable_by_program:${programID}`);
    }
  }
}

function compiledInstructionToLegacyLike(transaction, compiledInstruction) {
  const message = transaction.message;
  const keys = compiledInstruction.accountKeyIndexes.map((accountIndex) => ({
    pubkey: message.staticAccountKeys[accountIndex],
    isSigner: isStaticAccountSigner(message, accountIndex),
    isWritable: isStaticAccountWritable(message, accountIndex),
  }));

  return new TransactionInstruction({
    programId: message.staticAccountKeys[compiledInstruction.programIdIndex],
    keys,
    data: Buffer.from(compiledInstruction.data),
  });
}

function assertSafeVersionedInstructions(transaction, walletPublicKey) {
  for (const compiledInstruction of transaction.message.compiledInstructions) {
    const instruction = compiledInstructionToLegacyLike(transaction, compiledInstruction);
    const programID = instruction.programId.toBase58();
    if (programID === SYSTEM_PROGRAM_ID) {
      const instructionType = decodeSystemInstruction(instruction);
      if (instructionType !== 'Transfer') {
        throw new Error(`unsafe_system_instruction:${instructionType ?? 'unknown'}`);
      }
      continue;
    }

    const touchesWalletWritable = instruction.keys.some(
      (key) => key.pubkey.equals(walletPublicKey) && key.isWritable,
    );
    if (touchesWalletWritable) {
      throw new Error(`wallet_writable_by_program:${programID}`);
    }
  }
}

function getWalletBalanceDelta(simulation, walletIndex) {
  const pre = simulation.value.preBalances?.[walletIndex];
  const post = simulation.value.postBalances?.[walletIndex];
  if (typeof pre !== 'number' || typeof post !== 'number') {
    throw new Error('simulation_balances_unavailable');
  }
  const delta = BigInt(pre - post);
  return delta > 0n ? delta : 0n;
}

function serializeTransaction(transaction) {
  if (transaction instanceof VersionedTransaction) {
    return transaction.serialize();
  }
  return transaction.serialize();
}

function extractSignature(transaction) {
  if (transaction instanceof VersionedTransaction) {
    return Buffer.from(transaction.signatures[0]).toString('base64');
  }
  return transaction.signature?.toString('base64') ?? null;
}

export function createExecuteService({
  config,
  walletService,
  policyService,
  auditService,
}) {
  const connection = new Connection(config.solana.rpcUrl, config.solana.commitment);

  function assertFeePayerMatchesWallet(transaction, walletPublicKey) {
    if (transaction instanceof VersionedTransaction) {
      const feePayer = transaction.message.staticAccountKeys[0];
      if (!feePayer.equals(walletPublicKey)) {
        throw new Error('fee_payer_must_match_wallet');
      }
      assertSingleWalletSigner(transaction.message.header.numRequiredSignatures);
      return;
    }

    const feePayer = transaction.feePayer ?? transaction.signatures[0]?.publicKey;
    if (!feePayer || !feePayer.equals(walletPublicKey)) {
      throw new Error('fee_payer_must_match_wallet');
    }
    assertSingleWalletSigner(transaction.signatures.length || 1);
  }

  async function simulateAndMeasure(transaction, walletPublicKey) {
    const simulation = await connection.simulateTransaction(transaction, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });

    if (simulation.value.err) {
      throw new Error(`simulation_failed:${JSON.stringify(simulation.value.err)}`);
    }

    let walletIndex;
    if (transaction instanceof VersionedTransaction) {
      walletIndex = transaction.message.staticAccountKeys.findIndex((key) =>
        key.equals(walletPublicKey),
      );
    } else {
      const compiled = transaction.compileMessage();
      walletIndex = compiled.accountKeys.findIndex((key) => key.equals(walletPublicKey));
    }

    if (walletIndex < 0) {
      throw new Error('wallet_missing_from_transaction');
    }

    const spendLamports = getWalletBalanceDelta(simulation, walletIndex);
    return {
      spendLamports,
      logs: simulation.value.logs ?? [],
      unitsConsumed: simulation.value.unitsConsumed ?? null,
    };
  }

  function signTransaction(transaction) {
    const signer = walletService.signer();
    if (transaction instanceof VersionedTransaction) {
      transaction.sign([signer]);
      return transaction;
    }

    transaction.partialSign(signer);
    return transaction;
  }

  return {
    async execute(request) {
      const walletPublicKey = walletService.publicKey;

      let transaction;
      if (request.kind === 'sol_transfer') {
        const latestBlockhash = await connection.getLatestBlockhash(config.solana.commitment);
        transaction = new Transaction({
          feePayer: walletPublicKey,
          recentBlockhash: latestBlockhash.blockhash,
        }).add(
          SystemProgram.transfer({
            fromPubkey: walletPublicKey,
            toPubkey: new PublicKey(request.recipient),
            lamports: lamportsToNumber(request.lamports),
          }),
        );
      } else if (request.transactionFormat === 'v0') {
        transaction = VersionedTransaction.deserialize(
          Buffer.from(request.transactionBase64, 'base64'),
        );
      } else {
        transaction = Transaction.from(Buffer.from(request.transactionBase64, 'base64'));
      }

      assertFeePayerMatchesWallet(transaction, walletPublicKey);

      const programIDs =
        transaction instanceof VersionedTransaction
          ? getVersionedProgramIDs(transaction)
          : getLegacyProgramIDs(transaction);

      if (transaction instanceof VersionedTransaction) {
        assertSafeVersionedInstructions(transaction, walletPublicKey);
      } else {
        assertSafeLegacyInstructions(transaction, walletPublicKey);
      }

      const signedTransaction = signTransaction(transaction);

      let spendLamports = request.kind === 'sol_transfer' ? request.lamports : 0n;
      let simulationDetails = null;
      if (policyService.getCurrentPolicy().requireSimulation) {
        simulationDetails = await simulateAndMeasure(signedTransaction, walletPublicKey);
        spendLamports = simulationDetails.spendLamports;
      }

      policyService.assertWithinPolicy(programIDs, spendLamports);

      const signature = await connection.sendRawTransaction(
        serializeTransaction(signedTransaction),
        {
          skipPreflight: false,
          preflightCommitment: config.solana.commitment,
        },
      );

      await connection.confirmTransaction(signature, config.solana.commitment);
      policyService.consumeSpend(spendLamports);

      auditService.record({
        intent: request.intent,
        status: 'confirmed',
        txSignature: signature,
        programIds: programIDs,
        amountLamports: spendLamports,
        details: {
          kind: request.kind,
          rawSignature: extractSignature(signedTransaction),
          simulation: simulationDetails,
        },
      });

      return {
        signature,
        spendLamports,
        programIDs,
        simulation: simulationDetails,
      };
    },

    async failAudit(request, error, extras = {}) {
      auditService.record({
        intent: request.intent,
        status: 'rejected',
        txSignature: null,
        programIds: extras.programIDs ?? [],
        amountLamports: extras.amountLamports ?? null,
        details: {
          kind: request.kind,
          message: error.message,
        },
      });
    },
  };
}
