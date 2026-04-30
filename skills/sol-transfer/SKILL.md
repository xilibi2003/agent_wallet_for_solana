---
name: sol-transfer
description: Use whenever the user asks to send SOL, transfer SOL, send a transaction, 发起交易, 发送交易, or 转账 from this repository's local Solana Agent Wallet. Always execute approved SOL transfers by running skills/sol-transfer/scripts/sol_transfer.mjs; that script POSTs to the local /v1/execute HTTP API with recipient public key and lamports.
---

# SOL Transfer via Agent Wallet

Use this skill only for SOL transfers through the local Solana Agent Wallet signer API.

## Script-Only Send Path

- For SOL transfer requests, submit transactions by running:
  `node skills/sol-transfer/scripts/sol_transfer.mjs`.
- `sol_transfer.mjs` is the only send path. It converts `--sol` to lamports when needed and POSTs to the local Agent Wallet endpoint:
  `POST http://localhost:3001/v1/execute`.
- Do not use `solana transfer`, `solana confirm`, direct `@solana/web3.js` broadcast, or any direct RPC send path to execute the transfer.
- Assume `npm start` owns wallet unlock, signing, simulation, policy checks, and broadcasting. If the API is unavailable, report that `npm start` must be running and do not fall back to another sender.
- Do not hand-write a separate `curl` request for normal execution. Use `curl` only for health/debug checks, not for sending funds.

## Safety Rules

- Never transfer SOL without explicit user approval for recipient, amount, RPC/cluster, and intent.
- Default API base URL is `http://localhost:3001`; override with `SAW_API_BASE_URL`.
- Amounts sent to the API are lamports. If the user gives SOL, convert with `1 SOL = 1000000000 lamports`.
- Confirm the dashboard policy permits System Program before sending:
  `11111111111111111111111111111111`.
- If Panic Mode is enabled, whitelist is missing, daily limit is exceeded, or simulation fails, report the API error and do not retry with a different amount or recipient unless the user explicitly approves.
- Never ask for private keys or seed phrases. The local signer process owns signing.

## HTTP Contract

`POST /v1/execute`

```json
{
  "kind": "sol_transfer",
  "intent": "short human-readable transfer reason",
  "recipient": "RECIPIENT_PUBLIC_KEY",
  "lamports": "1000000"
}
```

Successful responses include `ok`, `signature`, `spendLamports`, `programIDs`, and optional simulation details.

## Preferred Workflow

1. Collect recipient, amount, and intent.
2. Convert SOL to lamports if needed.
3. Show the exact transfer summary and wait for explicit approval.
4. Run `skills/sol-transfer/scripts/sol_transfer.mjs` exactly once for the approved transfer.
5. Report the transaction signature, spend lamports, program IDs, and simulation result.

## Script Usage

```bash
node skills/sol-transfer/scripts/sol_transfer.mjs \
  --recipient RECIPIENT_PUBLIC_KEY \
  --lamports 1000000 \
  --intent "pay 0.001 SOL to approved recipient"
```

Use `--sol` when the user provides an amount in SOL:

```bash
node skills/sol-transfer/scripts/sol_transfer.mjs \
  --recipient RECIPIENT_PUBLIC_KEY \
  --sol 0.001 \
  --intent "pay 0.001 SOL to approved recipient"
```

Use `SAW_API_BASE_URL` or `--api-base-url` only when the user or environment explicitly points to another local Agent Wallet base URL.
