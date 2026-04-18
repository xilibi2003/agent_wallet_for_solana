# Solana Agent Wallet

本项目实现一个本地运行的 Solana Agent Wallet（Node.js 版）。它把 LLM/Agent 的交易请求隔离在策略引擎之后：私钥只在本机进程内解锁，交易必须通过程序白名单、每日限额、模拟检查和审计记录。

## 已实现能力

- CLI 启动解锁：首次运行创建 Master Password，可生成新钱包或导入 Solana CLI JSON 私钥。
- SQLite 加密存储：私钥使用 `scrypt + AES-256-GCM` 加密落盘。
- Signer API：`POST /v1/execute` 支持 SOL 转账和已构造的原始交易。
- Policy Engine：支持每日限额、程序白名单、模拟开关和 Panic Mode。
- Passkey 管理授权：本地管理面板可注册/验证 Passkey，策略修改需授权。
- Admin Dashboard：运行在 `localhost:8080`，用于限额、白名单、Panic Mode 和审计日志。
- 审计日志：记录交易意图、状态、签名、程序 ID、花费 lamports 和错误信息。

> 说明：交易解析、签名、模拟和广播目前使用 `@solana/web3.js` 作为 Solana 兼容边界层。这样能稳定覆盖 raw transaction 处理；业务层仍保持在独立 service 中，后续可逐步替换为 `@solana/kit` 交易管线。

## 快速开始

需要 Node.js 20+。

```bash
npm install
cp .env.example .env
npm start
```

首次启动会提示：

```text
Create master password:
Confirm master password:
Paste Solana secret key (CLI JSON array or base64), or press Enter to generate:
```

留空会生成新钱包；粘贴 Solana CLI keypair JSON 数组会导入已有钱包。

启动后打开：

```text
http://localhost:8080
```

首次使用流程：

1. 在管理面板输入 Master Password。
2. 点击“注册 Passkey”完成 Touch ID / Windows Hello / 系统 Passkey 注册。
3. 设置每日限额和程序白名单。
4. 如果要允许 SOL 转账，把 System Program 加入白名单：

```text
11111111111111111111111111111111
```

## 环境变量

见 `.env.example`：

- `SAW_RPC_URL`：Solana RPC，默认 devnet。
- `SAW_API_PORT`：Signer API 端口，默认 `3001`。
- `SAW_DASHBOARD_PORT`：管理面板端口，默认 `8080`。
- `SAW_DASHBOARD_ORIGIN`：CORS/WebAuthn expected origin，默认 `http://localhost:8080`。
- `SAW_RP_ID`：WebAuthn relying party ID，本地开发使用 `localhost`。
- `SAW_DB_PATH`：SQLite 数据库路径，默认 `./data/agent-wallet.sqlite`。

## API

### 健康检查

```bash
curl http://localhost:3001/health
```

### Agent 执行 SOL 转账

```bash
curl -X POST http://localhost:3001/v1/execute \
  -H 'content-type: application/json' \
  -d '{
    "kind": "sol_transfer",
    "intent": "pay 0.001 SOL to approved recipient",
    "recipient": "RECIPIENT_PUBLIC_KEY",
    "lamports": "1000000"
  }'
```

### Agent 执行原始交易

```bash
curl -X POST http://localhost:3001/v1/execute \
  -H 'content-type: application/json' \
  -d '{
    "kind": "raw_transaction",
    "intent": "execute prepared transaction",
    "transactionFormat": "legacy",
    "transactionBase64": "BASE64_SERIALIZED_TRANSACTION"
  }'
```

`transactionFormat` 支持：

- `legacy`：Legacy `Transaction`。
- `v0`：Versioned transaction v0，但当前为安全起见不支持 Address Lookup Tables。

## 风控规则

当前策略是保守实现：

- Panic Mode 开启时拒绝所有 Agent 执行。
- 所有指令的 program id 必须在白名单中。
- 每日限额按模拟结果中的钱包 lamports 净支出累计。
- 默认要求 `simulateTransaction` 成功后才广播。
- 拒绝多签名者交易，避免 Agent 诱导本地钱包成为复杂交易的一部分。
- 拒绝非 `Transfer` 的 System Program 指令。
- 拒绝非系统程序将钱包主账户标记为 writable 的指令。
- v0 raw transaction 暂不支持 Address Lookup Tables，因为白名单检查无法在不解析 LUT 的情况下完整确认 program id。

## 开发命令

```bash
npm run check
npm test
```

## 文件结构

```text
src/
  db/                  SQLite schema 和数据访问
  lib/                 加密、时间、CLI 输入工具
  routes/              Fastify API routes
  servers/             Signer API 和 Dashboard server
  services/            Wallet、Policy、Passkey、Execute、Audit
  ui/                  本地管理面板
tests/                 Node 内置 test runner 测试
```

## 安全边界

这是本地 Agent Wallet MVP，不应直接暴露到公网。

- API 默认只监听 `127.0.0.1`。
- CORS 只允许管理面板 origin。
- Master Password 不通过网络发送给 Agent，只在管理面板首次/恢复授权时发送到本地 API。
- Passkey 只保护管理操作；Agent 的交易执行仍由策略引擎控制。
- 如果怀疑 Agent 行为异常，先在面板开启 Panic Mode。
