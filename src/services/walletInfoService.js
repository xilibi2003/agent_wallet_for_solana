import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';

export function createWalletInfoService({ config, walletService }) {
  const connection = new Connection(config.solana.rpcUrl, config.solana.commitment);

  return {
    async getBalance() {
      const lamports = await connection.getBalance(
        walletService.publicKey,
        config.solana.commitment,
      );

      return {
        lamports: lamports.toString(),
        sol: lamports / LAMPORTS_PER_SOL,
        rpcUrl: config.solana.rpcUrl,
        commitment: config.solana.commitment,
      };
    },
  };
}
