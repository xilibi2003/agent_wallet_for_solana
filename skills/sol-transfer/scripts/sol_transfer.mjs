#!/usr/bin/env node

const LAMPORTS_PER_SOL = 1_000_000_000n;

function usage() {
  console.error(`Usage:
  node skills/sol-transfer/scripts/sol_transfer.mjs --recipient <PUBKEY> (--lamports <LAMPORTS> | --sol <SOL>) --intent <TEXT>

Options:
  --api-base-url <URL>  Defaults to SAW_API_BASE_URL or http://localhost:3001
  --recipient <PUBKEY>  Destination Solana public key
  --lamports <VALUE>    Transfer amount in lamports
  --sol <VALUE>         Transfer amount in SOL, converted to lamports
  --intent <TEXT>       Human-readable transfer reason for audit logs
`);
}

function parseArgs(argv) {
  const args = {
    apiBaseUrl: process.env.SAW_API_BASE_URL ?? 'http://localhost:3001',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === '--help' || key === '-h') {
      args.help = true;
      continue;
    }

    if (!key.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`Invalid argument: ${key}`);
    }

    index += 1;
    if (key === '--api-base-url') args.apiBaseUrl = value;
    else if (key === '--recipient') args.recipient = value;
    else if (key === '--lamports') args.lamports = value;
    else if (key === '--sol') args.sol = value;
    else if (key === '--intent') args.intent = value;
    else throw new Error(`Unknown option: ${key}`);
  }

  return args;
}

function solToLamports(value) {
  if (!/^\d+(\.\d{1,9})?$/.test(value)) {
    throw new Error('--sol must be a non-negative decimal with at most 9 decimals');
  }

  const [whole, fraction = ''] = value.split('.');
  return (
    BigInt(whole) * LAMPORTS_PER_SOL +
    BigInt(fraction.padEnd(9, '0'))
  ).toString();
}

function normalizeLamports(args) {
  if (args.lamports && args.sol) {
    throw new Error('Use either --lamports or --sol, not both');
  }

  if (args.sol) return solToLamports(args.sol);

  if (!args.lamports) {
    throw new Error('Missing --lamports or --sol');
  }

  if (!/^\d+$/.test(args.lamports)) {
    throw new Error('--lamports must be a non-negative integer string');
  }

  return args.lamports;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  if (!args.recipient) throw new Error('Missing --recipient');
  if (!args.intent) throw new Error('Missing --intent');

  const lamports = normalizeLamports(args);
  const response = await fetch(new URL('/v1/execute', args.apiBaseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind: 'sol_transfer',
      intent: args.intent,
      recipient: args.recipient,
      lamports,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
