(() => {
  const API_BASE = 'https://cfs31mater-cdx87j7e.manus.space/api';
  const USER_CACHE_KEY = 'cfs31-last-authenticated-profile-v1';
  const OFFLINE_PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  let currentState = { user: null, offline: false, error: '' };

  function callbackUri() {
    if (location.origin === 'https://vilsonloverthink.github.io') return 'https://vilsonloverthink.github.io/Quest-es-Manus-/';
    return new URL('./', location.href).href;
  }

  async function apiFetch(path, options = {}) {
    return fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      cache: options.cache || 'no-store',
    });
  }

  function rememberUser(user) {
    try { localStorage.setItem(USER_CACHE_KEY, JSON.stringify({ displayName: user.displayName, savedAt: Date.now() })); } catch { /* modo privado */ }
  }

  function savedUser() {
    try {
      const value = JSON.parse(localStorage.getItem(USER_CACHE_KEY) || 'null');
      const savedAt = Number(value?.savedAt);
      if (value && typeof value.displayName === 'string' && value.displayName.trim() && Number.isFinite(savedAt) && savedAt <= Date.now() + 5 * 60 * 1000 && Date.now() - savedAt <= OFFLINE_PROFILE_TTL_MS) {
        return { displayName: value.displayName.trim(), loginCount: null };
      }
      if (value) localStorage.removeItem(USER_CACHE_KEY);
    } catch { /* cache ausente ou inválido */ }
    return null;
  }

  function setMessage(message) {
    const element = document.getElementById('auth-status');
    if (element) element.textContent = message || '';
  }

  function renderState() {
    const login = document.getElementById('login-screen');
    const app = document.getElementById('inicio');
    const nav = document.getElementById('main-navigation');
    const controls = document.getElementById('account-controls');
    const name = document.getElementById('signed-user-name');
    const adminButton = document.getElementById('admin-access-open');
    const offline = document.getElementById('auth-offline-notice');
    const button = document.getElementById('manus-login');
    const authenticated = Boolean(currentState.user);
    if (login) login.hidden = authenticated;
    if (app) app.hidden = !authenticated;
    if (nav) nav.hidden = !authenticated;
    if (controls) controls.hidden = !authenticated;
    if (adminButton) adminButton.hidden = currentState.offline;
    if (name) name.textContent = currentState.user?.displayName || '';
    if (offline) {
      offline.hidden = !(authenticated && currentState.offline);
      offline.textContent = currentState.offline ? (currentState.error || 'Modo offline: progresso local disponível; login, contador e correções globais precisam de conexão.') : '';
    }
    if (button) button.disabled = false;
    setMessage(currentState.error || '');
  }

  function cleanCallbackUrl() {
    const clean = new URL(location.href);
    clean.search = '';
    clean.hash = '';
    history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`);
  }

  async function loadSession() {
    try {
      const response = await apiFetch('/auth/session');
      if (response.status === 401) {
        try { localStorage.removeItem(USER_CACHE_KEY); } catch { /* modo privado */ }
        return { user: null, offline: false, error: 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.' };
      }
      if (!response.ok) {
        const previous = savedUser();
        if (previous) return { user: previous, offline: true, error: 'Serviço de login indisponível. Estudo local disponível; contador e correções globais precisam de conexão.' };
        if (response.status < 500) return { user: null, offline: false, error: 'Não foi possível validar a sessão. Tente entrar novamente.' };
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!data.user || typeof data.user.displayName !== 'string') throw new Error('Resposta de sessão inválida.');
      rememberUser(data.user);
      return { user: data.user, offline: false, error: '' };
    } catch {
      const previous = savedUser();
      return previous
        ? { user: previous, offline: true, error: '' }
        : { user: null, offline: false, error: 'Sem conexão com o serviço de login. Conecte-se à internet e tente novamente.' };
    }
  }

  async function finishCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const state = params.get('state');
    const providerError = params.get('error');
    if (providerError) {
      cleanCallbackUrl();
      return { user: null, offline: false, error: 'O login foi cancelado. Selecione “Entrar com conta Manus” para tentar novamente.' };
    }
    if (!code && !state) return null;
    cleanCallbackUrl();
    if (!code || !state) return { user: null, offline: false, error: 'O retorno do login está incompleto. Inicie novamente.' };
    try {
      const response = await apiFetch('/auth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code, state, redirectUri: callbackUri() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user || typeof data.user.displayName !== 'string' || !data.user.displayName.trim()) throw new Error(data.message || 'Não foi possível concluir o login.');
      rememberUser(data.user);
      return { user: data.user, offline: false, error: '' };
    } catch (error) {
      return { user: null, offline: false, error: error.message || 'Não foi possível validar o retorno. Inicie novamente.' };
    }
  }

  async function startLogin() {
    const button = document.getElementById('manus-login');
    if (button) button.disabled = true;
    setMessage('Abrindo o login Manus…');
    try {
      const response = await apiFetch('/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ redirectUri: callbackUri() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.authorizationUrl !== 'string') throw new Error(data.message || 'Não foi possível iniciar o login.');
      location.assign(data.authorizationUrl);
    } catch (error) {
      setMessage(error.message || 'Não foi possível iniciar o login Manus. Tente novamente.');
      if (button) button.disabled = false;
    }
  }

  async function logout() {
    const signOut = document.getElementById('sign-out');
    if (signOut) signOut.disabled = true;
    try {
      const response = await apiFetch('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error('Não foi possível encerrar a sessão no servidor. Tente novamente com conexão.');
      try { localStorage.removeItem(USER_CACHE_KEY); } catch { /* modo privado */ }
      location.reload();
    } catch (error) {
      const notice = document.getElementById('auth-offline-notice');
      if (notice) { notice.hidden = false; notice.textContent = error.message || 'Sem conexão; a sessão continua ativa no servidor.'; }
      if (signOut) signOut.disabled = false;
    }
  }

  const ready = (async () => {
    const callback = await finishCallback();
    currentState = callback || await loadSession();
    renderState();
    return { ...currentState };
  })();

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('manus-login')?.addEventListener('click', startLogin);
    document.getElementById('sign-out')?.addEventListener('click', logout);
  }, { once: true });

  window.CFS31Auth = Object.freeze({ ready, apiFetch, get state() { return { ...currentState }; }, login: startLogin, logout });
})();
