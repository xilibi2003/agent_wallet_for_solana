import path from 'node:path';

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function absolutePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

export function loadConfig() {
  const apiHost = process.env.SAW_API_HOST ?? '127.0.0.1';
  const apiPort = intFromEnv('SAW_API_PORT', 3001);
  const dashboardHost = process.env.SAW_DASHBOARD_HOST ?? '127.0.0.1';
  const dashboardPort = intFromEnv('SAW_DASHBOARD_PORT', 8080);
  const dashboardOrigin = process.env.SAW_DASHBOARD_ORIGIN ?? `http://localhost:${dashboardPort}`;

  return {
    api: {
      host: apiHost,
      port: apiPort,
      origin: `http://localhost:${apiPort}`,
    },
    dashboard: {
      host: dashboardHost,
      port: dashboardPort,
      origin: dashboardOrigin,
    },
    cors: {
      allowedOrigins: [
        dashboardOrigin,
        `http://127.0.0.1:${dashboardPort}`,
        `http://localhost:${dashboardPort}`,
      ],
    },
    webauthn: {
      rpID: process.env.SAW_RP_ID ?? 'localhost',
      rpName: process.env.SAW_RP_NAME ?? 'Solana Agent Wallet',
      expectedOrigin: dashboardOrigin,
    },
    solana: {
      rpcUrl: process.env.SAW_RPC_URL ?? 'https://api.devnet.solana.com',
      commitment: process.env.SAW_COMMITMENT ?? 'confirmed',
    },
    databasePath: absolutePath(process.env.SAW_DB_PATH ?? './data/agent-wallet.sqlite'),
  };
}
