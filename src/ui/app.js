const config = window.__SAW_CONFIG__ ?? { apiBaseUrl: 'http://localhost:3001' };

const state = {
  bootstrapToken: null,
  policyToken: null,
  status: null,
  authStatus: {
    hasPasskeys: false,
    passkeyCount: 0,
  },
};

localStorage.removeItem('saw.bootstrapToken');
localStorage.removeItem('saw.policyToken');

function clearBootstrapToken() {
  state.bootstrapToken = null;
}

function clearPolicyToken() {
  state.policyToken = null;
}

function clearAuthTokens() {
  clearBootstrapToken();
  clearPolicyToken();
}

function createApiError(response, payload) {
  const error = new Error(payload.error ?? `HTTP ${response.status}`);
  error.status = response.status;
  error.code = payload.code ?? null;
  return error;
}

const nodes = {
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  loginPanel: document.querySelector('#loginPanel'),
  loginMode: document.querySelector('#loginMode'),
  loginCopy: document.querySelector('#loginCopy'),
  loginHint: document.querySelector('#loginHint'),
  masterPasswordField: document.querySelector('#masterPasswordField'),
  protectedPanels: document.querySelectorAll('.requires-login'),
  authState: document.querySelector('#authState'),
  walletPublicKey: document.querySelector('#walletPublicKey'),
  walletBalanceSol: document.querySelector('#walletBalanceSol'),
  walletBalanceLamports: document.querySelector('#walletBalanceLamports'),
  passkeyCount: document.querySelector('#passkeyCount'),
  spentToday: document.querySelector('#spentToday'),
  panicState: document.querySelector('#panicState'),
  policySummary: document.querySelector('#policySummary'),
  dailyLimit: document.querySelector('#dailyLimit'),
  whitelistPrograms: document.querySelector('#whitelistPrograms'),
  requireSimulation: document.querySelector('#requireSimulation'),
  masterPassword: document.querySelector('#masterPassword'),
  auditLogs: document.querySelector('#auditLogs'),
  toast: document.querySelector('#toast'),
  refreshButton: document.querySelector('#refreshButton'),
  unlockButton: document.querySelector('#unlockButton'),
  registerPasskeyButton: document.querySelector('#registerPasskeyButton'),
  authPasskeyButton: document.querySelector('#authPasskeyButton'),
  savePolicyButton: document.querySelector('#savePolicyButton'),
  panicButton: document.querySelector('#panicButton'),
};

function showToast(message) {
  const item = document.createElement('div');
  item.className = 'toast-message';
  item.textContent = message;
  nodes.toast.append(item);
  setTimeout(() => item.remove(), 4800);
}

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createApiError(response, payload);
  }
  return payload;
}

function setOnline(online, text) {
  nodes.statusDot.classList.toggle('online', online);
  nodes.statusText.textContent = text;
}

function isLoggedIn() {
  return Boolean(state.policyToken || (!state.authStatus.hasPasskeys && state.bootstrapToken));
}

function currentLoginToken() {
  if (state.authStatus.hasPasskeys) return state.policyToken;
  return state.bootstrapToken;
}

function renderAuthShell() {
  const hasPasskeys = state.authStatus.hasPasskeys;
  const loggedIn = isLoggedIn();
  nodes.loginPanel.hidden = loggedIn;

  for (const panel of nodes.protectedPanels) {
    panel.hidden = !loggedIn;
  }

  nodes.masterPasswordField.hidden = hasPasskeys;
  nodes.unlockButton.hidden = hasPasskeys;
  nodes.registerPasskeyButton.hidden = hasPasskeys;
  nodes.authPasskeyButton.hidden = !hasPasskeys;
  nodes.registerPasskeyButton.disabled = !state.bootstrapToken;

  nodes.loginMode.textContent = hasPasskeys ? 'Passkey 登录' : '首次设置';
  nodes.loginCopy.textContent = hasPasskeys
    ? '请使用已注册的 Passkey 登录控制页面。'
    : '第一次使用需要先用 Master Password 解锁，然后注册 Passkey。';
  nodes.loginHint.textContent = hasPasskeys
    ? '注册过 Passkey 后，控制页面不再使用主密钥登录。'
    : '注册完成后，后续访问控制页面将只显示 Passkey 登录。';
}

function formatLamports(value) {
  return `${value} lamports`;
}

function formatSol(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '- SOL';
  return `${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 9,
  })} SOL`;
}

function renderWalletBalance(status) {
  if (!status.walletBalance) {
    nodes.walletBalanceSol.textContent = '- SOL';
    nodes.walletBalanceLamports.textContent = status.walletBalanceError
      ? `余额读取失败：${status.walletBalanceError}`
      : '余额暂不可用';
    return;
  }

  nodes.walletBalanceSol.textContent = formatSol(status.walletBalance.sol);
  nodes.walletBalanceLamports.textContent = `${formatLamports(status.walletBalance.lamports)} · ${status.walletBalance.commitment}`;
}

function renderPolicySummary(policy) {
  const whitelistCount = policy.whitelistPrograms.length;
  const whitelistText =
    whitelistCount === 0
      ? '未配置程序白名单'
      : `${whitelistCount} 个白名单程序`;

  nodes.policySummary.innerHTML = [
    ['每日限额', formatLamports(policy.dailyLimitLamports)],
    ['今日已用', formatLamports(policy.spentTodayLamports)],
    ['模拟检查', policy.requireSimulation ? '开启' : '关闭'],
    ['Panic Mode', policy.panicMode ? '开启' : '关闭'],
    ['程序白名单', whitelistText],
  ]
    .map(
      ([label, value]) => `
        <div>
          <span class="metric-label">${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join('');
}

function renderAudit(logs) {
  if (logs.length === 0) {
    nodes.auditLogs.innerHTML = '<p class="hint">还没有执行记录。</p>';
    return;
  }

  nodes.auditLogs.innerHTML = logs
    .map(
      (log) => `
        <div class="audit-item">
          <div class="audit-topline">
            <strong>${escapeHtml(log.status)}</strong>
            <span>${new Date(log.timestamp).toLocaleString()}</span>
          </div>
          <div>${escapeHtml(log.intent || 'No intent')}</div>
          <div class="audit-meta">${escapeHtml(log.txSignature || log.details?.message || '-')}</div>
        </div>
      `,
    )
    .join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderStatus(status) {
  state.status = status;
  state.authStatus = {
    hasPasskeys: status.hasPasskeys,
    passkeyCount: status.passkeyCount,
  };
  nodes.walletPublicKey.textContent = status.walletPublicKey;
  renderWalletBalance(status);
  nodes.passkeyCount.textContent = String(status.passkeyCount);
  nodes.spentToday.textContent = formatLamports(status.policy.spentTodayLamports);
  nodes.panicState.textContent = status.policy.panicMode ? 'on' : 'off';
  renderPolicySummary(status.policy);
  nodes.dailyLimit.value = status.policy.dailyLimitLamports;
  nodes.whitelistPrograms.value = status.policy.whitelistPrograms.join('\n');
  nodes.requireSimulation.checked = status.policy.requireSimulation;
  nodes.authState.textContent = state.policyToken
    ? 'Passkey 已登录'
    : state.bootstrapToken
      ? '首次设置会话'
      : '未授权';
  nodes.registerPasskeyButton.disabled = !state.bootstrapToken;
  nodes.savePolicyButton.disabled = !isLoggedIn();
  nodes.panicButton.disabled = !isLoggedIn();
  renderAudit(status.auditLogs);
  renderAuthShell();
}

async function refreshAuthStatus() {
  const authStatus = await api('/v1/admin/auth/status');
  state.authStatus = authStatus;
  if (authStatus.hasPasskeys) {
    clearBootstrapToken();
  }
  renderAuthShell();
  return authStatus;
}

async function refreshStatus() {
  try {
    await refreshAuthStatus();
    const token = currentLoginToken();
    if (!token) {
      state.status = null;
      renderAuthShell();
      setOnline(true, '等待登录');
      return;
    }

    const status = await api('/v1/admin/status', { token });
    renderStatus(status);
    setOnline(true, '在线');
  } catch (error) {
    if (await handleAuthError(error)) return;
    setOnline(false, '离线');
    showToast(error.message);
  }
}

async function handleAuthError(error) {
  const messages = new Set([
    'Bootstrap session required',
    'bootstrap_session_required',
    'policy_authorization_required',
    'Policy authorization required',
  ]);

  if (error.status === 401 || messages.has(error.message) || messages.has(error.code)) {
    clearAuthTokens();
    await refreshAuthStatus();
    setOnline(true, '等待登录');
    showToast('登录会话已失效，请重新完成 Passkey 验证');
    return true;
  }

  return false;
}

function base64UrlToBuffer(value) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function registrationOptionsFromJSON(options) {
  return {
    ...options,
    challenge: base64UrlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64UrlToBuffer(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToBuffer(credential.id),
    })),
  };
}

function authenticationOptionsFromJSON(options) {
  return {
    ...options,
    challenge: base64UrlToBuffer(options.challenge),
    allowCredentials: options.allowCredentials?.map((credential) => ({
      ...credential,
      id: base64UrlToBuffer(credential.id),
    })),
  };
}

function registrationCredentialToJSON(credential) {
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
      attestationObject: bufferToBase64Url(credential.response.attestationObject),
      transports: credential.response.getTransports?.() ?? [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

function authenticationCredentialToJSON(credential) {
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
      authenticatorData: bufferToBase64Url(credential.response.authenticatorData),
      signature: bufferToBase64Url(credential.response.signature),
      userHandle: credential.response.userHandle
        ? bufferToBase64Url(credential.response.userHandle)
        : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

async function createBootstrapSession() {
  const masterPassword = nodes.masterPassword.value;
  if (!masterPassword) {
    showToast('请输入 Master Password');
    return;
  }

  const result = await api('/v1/admin/session', {
    method: 'POST',
    body: { masterPassword },
  });
  state.bootstrapToken = result.token;
  clearPolicyToken();
  nodes.masterPassword.value = '';
  state.authStatus.hasPasskeys = result.requiresPasskey;
  showToast(result.requiresPasskey ? '已注册 Passkey，请使用 Passkey 登录' : '主密码验证成功，请注册 Passkey');
  await refreshStatus();
}

async function registerPasskey() {
  if (!state.bootstrapToken) {
    showToast('请先用 Master Password 解锁');
    return;
  }

  try {
    const challenge = await api('/v1/admin/passkeys/register/options', {
      method: 'POST',
      token: state.bootstrapToken,
    });
    const credential = await navigator.credentials.create({
      publicKey: registrationOptionsFromJSON(challenge.options),
    });
    if (!credential) throw new Error('Passkey registration cancelled');

    await api('/v1/admin/passkeys/register/verify', {
      method: 'POST',
      token: state.bootstrapToken,
      body: {
        challengeToken: challenge.challengeToken,
        credential: registrationCredentialToJSON(credential),
      },
    });
  } catch (error) {
    if (await handleAuthError(error)) return;
    throw error;
  }

  showToast('Passkey 注册完成');
  clearBootstrapToken();
  await authenticatePasskey();
}

async function authenticatePasskey() {
  const challenge = await api('/v1/admin/passkeys/authenticate/options', {
    method: 'POST',
  });
  const credential = await navigator.credentials.get({
    publicKey: authenticationOptionsFromJSON(challenge.options),
  });
  if (!credential) throw new Error('Passkey authentication cancelled');

  const result = await api('/v1/admin/passkeys/authenticate/verify', {
    method: 'POST',
    body: {
      challengeToken: challenge.challengeToken,
      credential: authenticationCredentialToJSON(credential),
    },
  });

  state.policyToken = result.token;
  clearBootstrapToken();
  showToast('Passkey 登录成功');
  await refreshStatus();
}

function managementToken() {
  return currentLoginToken();
}

async function savePolicy() {
  const token = managementToken();
  if (!token) {
    showToast('请先完成授权');
    return;
  }

  const whitelistPrograms = nodes.whitelistPrograms.value
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);

  const result = await api('/v1/admin/policy', {
    method: 'PATCH',
    token,
    body: {
      dailyLimitLamports: nodes.dailyLimit.value || '0',
      whitelistPrograms,
      requireSimulation: nodes.requireSimulation.checked,
    },
  });

  renderStatus({
    ...state.status,
    policy: result.policy,
  });
  showToast('策略已保存');
  await refreshStatus();
}

async function togglePanic() {
  const token = managementToken();
  if (!token) {
    showToast('请先完成授权');
    return;
  }

  await api('/v1/admin/panic/toggle', {
    method: 'POST',
    token,
  });

  showToast('Panic Mode 状态已切换');
  await refreshStatus();
}

function bind(selector, eventName, handler) {
  selector.addEventListener(eventName, async () => {
    try {
      selector.disabled = true;
      await handler();
    } catch (error) {
      showToast(error.message);
    } finally {
      selector.disabled = false;
    }
  });
}

bind(nodes.refreshButton, 'click', refreshStatus);
bind(nodes.unlockButton, 'click', createBootstrapSession);
bind(nodes.registerPasskeyButton, 'click', registerPasskey);
bind(nodes.authPasskeyButton, 'click', authenticatePasskey);
bind(nodes.savePolicyButton, 'click', savePolicy);
bind(nodes.panicButton, 'click', togglePanic);

await refreshStatus();
