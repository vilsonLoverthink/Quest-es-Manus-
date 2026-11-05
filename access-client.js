(() => {
  const api = window.CFS31Auth?.apiFetch;
  if (typeof api !== 'function' || !window.CFS31Auth?.ready) return;

  let adminPinForPagination = '';
  let currentPage = 0;

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
  }

  function setActiveCount(value) {
    const element = document.getElementById('active-access-count');
    if (element) element.textContent = `Ativos: ${Number(value) || 0}`;
  }

  async function updateSummary() {
    try {
      const response = await api('/access/summary');
      if (!response.ok) return;
      const data = await response.json();
      setActiveCount(data.activeCount);
    } catch { /* o número exibido continua sendo a última leitura válida */ }
  }

  async function heartbeat() {
    try {
      const response = await api('/access/heartbeat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
      });
      if (!response.ok) return;
      const data = await response.json();
      setActiveCount(data.activeCount);
    } catch { /* sem conexão, nenhuma atualização de atividade */ }
  }

  function renderReport(data, append = false) {
    document.getElementById('access-report-total').textContent = String(data.totalAccesses || 0);
    document.getElementById('access-report-active').textContent = String(data.activeCount || 0);
    const tbody = document.getElementById('access-report-users');
    if (!append) tbody.replaceChildren();
    for (const user of (Array.isArray(data.users) ? data.users : [])) {
      const row = document.createElement('tr');
      const cells = [
        user.displayName || 'Nome indisponível',
        String(user.loginCount || 0),
        user.active ? 'Ativo' : 'Inativo',
        formatDate(user.lastLoginAt),
        formatDate(user.lastSeenAt),
      ];
      cells.forEach((value, index) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (index === 2) cell.dataset.active = String(Boolean(user.active));
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    }
    currentPage = Number.isInteger(data.page) ? data.page : 0;
    const totalUsers = Number(data.totalUsers) || 0;
    const displayedUsers = Math.min((currentPage + 1) * (Number(data.pageSize) || 100), totalUsers);
    const pageMessage = document.getElementById('access-report-page');
    if (pageMessage) pageMessage.textContent = `Mostrando ${displayedUsers} de ${totalUsers} participantes.`;
    const more = document.getElementById('access-report-load-more');
    if (more) more.hidden = !data.hasMore;
    const empty = document.getElementById('access-report-empty');
    if (empty) empty.hidden = totalUsers > 0;
  }

  async function requestReport(pin, page, append) {
    const response = await api('/admin/access-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ pin, page }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || 'Não foi possível abrir o painel ADM.');
      error.status = response.status;
      throw error;
    }
    renderReport(data, append);
    return data;
  }

  async function submitAdminReport(event) {
    event.preventDefault();
    const pinInput = document.getElementById('admin-access-pin');
    const message = document.getElementById('admin-access-status');
    const button = document.getElementById('admin-access-submit');
    const pin = pinInput.value;
    button.disabled = true;
    message.textContent = 'Consultando o painel…';
    try {
      await requestReport(pin, 0, false);
      adminPinForPagination = pin;
      message.textContent = '';
      document.getElementById('admin-access-report').hidden = false;
    } catch (error) {
      adminPinForPagination = '';
      message.textContent = error.message || 'Não foi possível abrir o painel ADM.';
      document.getElementById('admin-access-report').hidden = true;
    } finally {
      pinInput.value = '';
      button.disabled = false;
    }
  }

  async function loadMoreReport() {
    const button = document.getElementById('access-report-load-more');
    const message = document.getElementById('admin-access-status');
    if (!adminPinForPagination) {
      message.textContent = 'Digite o PIN novamente para continuar a lista.';
      return;
    }
    button.disabled = true;
    message.textContent = 'Carregando mais participantes…';
    try {
      await requestReport(adminPinForPagination, currentPage + 1, true);
      message.textContent = '';
    } catch (error) {
      if (error.status === 401 || error.status === 429) adminPinForPagination = '';
      message.textContent = error.message || 'Não foi possível carregar a próxima página.';
    } finally {
      button.disabled = false;
    }
  }

  window.CFS31Auth.ready.then(state => {
    if (!state.user || state.offline) return;
    void heartbeat();
    void updateSummary();
    window.setInterval(() => { if (!document.hidden) void heartbeat(); }, 60_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void heartbeat(); });
    const dialog = document.getElementById('admin-access-dialog');
    document.getElementById('admin-access-open')?.addEventListener('click', () => {
      adminPinForPagination = '';
      currentPage = 0;
      document.getElementById('admin-access-report').hidden = true;
      document.getElementById('admin-access-status').textContent = '';
      document.getElementById('admin-access-pin').value = '';
      document.getElementById('access-report-users').replaceChildren();
      document.getElementById('access-report-page').textContent = '';
      document.getElementById('access-report-load-more').hidden = true;
      dialog.showModal();
      document.getElementById('admin-access-pin').focus();
    });
    document.getElementById('admin-access-form')?.addEventListener('submit', submitAdminReport);
    document.getElementById('access-report-load-more')?.addEventListener('click', loadMoreReport);
    document.getElementById('admin-access-close')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { adminPinForPagination = ''; });
  });
})();
