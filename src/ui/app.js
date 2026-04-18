const config = window.__SAW_CONFIG__ ?? { apiBaseUrl: 'http://localhost:3001' };

const state = {
  bootstrapToken: localStorage.getItem('saw.bootstrapToken'),
  policyToken: localStorage.getItem('saw.policyToken'),
  status: null,
};

const nodes = {
  statusDot: document.querySelector('#statusDot'),
  statusText: document.querySelector('#statusText'),
  authState: document.querySelector('#authState'),
  walletPublicKey: document.querySelector('#walletPublicKey'),
  passkeyCount: document.querySelector('#passkeyCount'),
  spentToday: document.querySelector('#spentToday'),
  panicState: document.querySelector('#panicState'),
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
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  return payload;
}

function setOnline(online, text) {
  nodes.statusDot.classList.toggle('online', online);
  nodes.statusText.textContent = text;
}

function formatLamports(value) {
  return `${value} lamports`;
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
  nodes.walletPublicKey.textContent = status.walletPublicKey;
  nodes.passkeyCount.textContent = String(status.passkeyCount);
  nodes.spentToday.textContent = formatLamports(status.policy.spentTodayLamports);
  nodes.panicState.textContent = status.policy.panicMode ? 'on' : 'off';
  nodes.dailyLimit.value = status.policy.dailyLimitLamports;
  nodes.whitelistPrograms.value = status.policy.whitelistPrograms.join('\n');
  nodes.requireSimulation.checked = status.policy.requireSimulation;
  nodes.authState.textContent = state.policyToken
    ? 'Passkey 已授权'
    : state.bootstrapToken
      ? '主密码会话'
      : '未授权';
  nodes.registerPasskeyButton.disabled = !state.bootstrapToken;
  nodes.savePolicyButton.disabled = status.hasPasskeys ? !state.policyToken : !state.bootstrapToken;
  nodes.panicButton.disabled = status.hasPasskeys ? !state.policyToken : !state.bootstrapToken;
  renderAudit(status.auditLogs);
}

async function refreshStatus() {
  try {
    const status = await api('/v1/admin/status');
    renderStatus(status);
    setOnline(true, '在线');
  } catch (error) {
    setOnline(false, '离线');
    showToast(error.message);
  }
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
  localStorage.setItem('saw.bootstrapToken', result.token);
  nodes.masterPassword.value = '';
  showToast(result.requiresPasskey ? '主密码验证成功，请使用 Passkey 授权策略操作' : '主密码验证成功，可注册 Passkey');
  await refreshStatus();
}

async function registerPasskey() {
  if (!state.bootstrapToken) {
    showToast('请先用 Master Password 解锁');
    return;
  }

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

  showToast('Passkey 注册完成');
  await refreshStatus();
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
  localStorage.setItem('saw.policyToken', result.token);
  showToast('Passkey 授权成功');
  await refreshStatus();
}

function managementToken() {
  return state.status?.hasPasskeys ? state.policyToken : state.bootstrapToken;
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
