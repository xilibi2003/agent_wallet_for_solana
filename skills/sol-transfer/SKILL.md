---
name: sol-transfer
description: Use when the user asks an agent to send or transfer SOL through this repository's local Solana Agent Wallet HTTP API. Guides safe SOL transfers using POST /v1/execute with recipient public key and lamports.
---

# SOL Transfer via Agent Wallet

Use this skill only for SOL transfers through the local Solana Agent Wallet signer API.

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
4. Run `scripts/sol_transfer.mjs` from this skill directory or issue the equivalent HTTP request.
5. Report the transaction signature, spend lamports, program IDs, and simulation result.

## Script Usage

```bash
node skills/sol-transfer/scripts/sol_transfer.mjs \
  --recipient RECIPIENT_PUBLIC_KEY \
  --lamports 1000000 \
  --intent "pay 0.001 SOL to approved recipient"
```

Use `--sol 0.001` instead of `--lamports` when the user provides an amount in SOL.

```bash
SAW_API_BASE_URL=http://localhost:3001 node skills/sol-transfer/scripts/sol_transfer.mjs \
  --recipient RECIPIENT_PUBLIC_KEY \
  --sol 0.001 \
  --intent "pay 0.001 SOL to approved recipient"
```
