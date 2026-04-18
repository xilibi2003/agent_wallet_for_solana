import 'dotenv/config';

import { loadConfig } from './config.js';
import { createDatabase } from './db/database.js';
import { buildDashboardServer } from './servers/dashboardServer.js';
import { buildSignerServer } from './servers/signerServer.js';
import { createAdminAuthService } from './services/adminAuthService.js';
import { createAuditService } from './services/auditService.js';
import { createExecuteService } from './services/executeService.js';
import { createPasskeyService } from './services/passkeyService.js';
import { createPolicyService } from './services/policyService.js';
import { createSessionService } from './services/sessionService.js';
import { unlockOrCreateWallet } from './services/walletService.js';

async function main() {
  const config = loadConfig();
  const database = createDatabase(config.databasePath);
  const walletService = await unlockOrCreateWallet(database);
  const sessionService = createSessionService();
  const policyService = createPolicyService(database);
  const auditService = createAuditService(database);
  const passkeyService = createPasskeyService({
    config,
    database,
    sessionService,
  });
  const adminAuthService = createAdminAuthService({
    walletService,
    passkeyService,
    sessionService,
  });

  const services = {
    config,
    database,
    walletService,
    sessionService,
    policyService,
    auditService,
    passkeyService,
    adminAuthService,
  };

  services.executeService = createExecuteService({
    config,
    walletService,
    policyService,
    auditService,
  });

  const signerServer = await buildSignerServer(services);
  const dashboardServer = await buildDashboardServer(config);

  await signerServer.listen({
    host: config.api.host,
    port: config.api.port,
  });
  await dashboardServer.listen({
    host: config.dashboard.host,
    port: config.dashboard.port,
  });

  console.log(`Wallet: ${walletService.publicKeyBase58}`);
  console.log(`Signer API: http://localhost:${config.api.port}`);
  console.log(`Admin dashboard: http://localhost:${config.dashboard.port}`);
  console.log(`RPC: ${config.solana.rpcUrl}`);

  const cleanupTimer = setInterval(() => sessionService.cleanup(), 60_000);

  async function shutdown(signal) {
    clearInterval(cleanupTimer);
    console.log(`\nReceived ${signal}, shutting down`);
    await Promise.allSettled([signerServer.close(), dashboardServer.close()]);
    database.close();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
