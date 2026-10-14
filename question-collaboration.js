(() => {
  const API_URL = 'https://cfs31mater-cdx87j7e.manus.space/api/questions';
  const CACHE_KEY = 'cfs31-global-question-edits-v1';
  const ALPHABET = ['A', 'B', 'C', 'D'];
  let overrides = Object.create(null);
  let lastSyncAt = null;
  let questionsById = new Map();
  let snapshots = new Map();
  let activeQuestion = null;
  let activeStatusQuestion = null;
  let activeStatusAction = null;
  let openingVersion = 0;
  let statusOpeningVersion = 0;

  function asText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(' · ');
    if (typeof value === 'object') return Object.values(value).map(asText).filter(Boolean).join(' · ');
    return String(value);
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function currentState(questionId) { return overrides[questionId] || { questionId, content: null, archived: false, version: 0 }; }
  function formatTime(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : 'horário indisponível';
  }
  function setStatus(message, state = 'neutral') {
    const element = document.getElementById('question-sync-status');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
  }
  function readCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (saved.questions && typeof saved.questions === 'object' && !Array.isArray(saved.questions)) overrides = saved.questions;
      lastSyncAt = Number.isFinite(saved.lastSyncAt) ? saved.lastSyncAt : null;
    } catch { /* Usa os arquivos estáticos se o cache não estiver disponível. */ }
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ questions: overrides, lastSyncAt })); }
    catch { /* Edições continuam disponíveis na sessão atual. */ }
  }
  function sameOverrides(left, right) {
    const leftIds = Object.keys(left);
    const rightIds = Object.keys(right);
    return leftIds.length === rightIds.length && leftIds.every(id => right[id] && left[id].version === right[id].version);
  }
  function applyOverrides() {
    questionsById.forEach((question, id) => {
      const base = snapshots.get(id);
      if (!base) return;
      const override = overrides[id];
      question.enunciado = base.enunciado;
      question.alts = Array.isArray(base.alts) ? base.alts.map(option => ({ ...option })) : [];
      question.resolucao = base.resolucao;
      question.base = base.base;
      question.source_url = base.source_url;
      question.archived = Boolean(override?.archived);
      if (!override?.content) return;
      const content = override.content;
      if (typeof content.prompt === 'string') question.enunciado = content.prompt;
      if (Array.isArray(content.alternatives) && content.alternatives.length === question.alts.length) {
        question.alts = question.alts.map((option, index) => {
          const edited = { ...option, t: content.alternatives[index] };
          delete edited.erro;
          return edited;
        });
      }
      if (typeof content.resolution === 'string') question.resolucao = content.resolution;
      if (typeof content.reference === 'string') question.base = content.reference;
      if (typeof content.sourceUrl === 'string') question.source_url = content.sourceUrl;
    });
  }
  function setQuestions(questions) {
    questionsById = new Map();
    snapshots = new Map();
    questions.forEach(question => {
      if (!question || typeof question.id !== 'string') return;
      questionsById.set(question.id, question);
      snapshots.set(question.id, clone(question));
    });
    applyOverrides();
    void refresh();
  }
  function labelAction(action) {
    if (action === 'edit') return 'Questão editada';
    if (action === 'archive') return 'Questão arquivada';
    if (action === 'restore') return 'Questão restaurada';
    return action;
  }
  function renderHistoryItem(item) {
    const entry = document.createElement('article');
    entry.className = 'key-history-entry';
    const title = document.createElement('strong');
    title.textContent = `${labelAction(item.action)} · versão ${item.version} · ${formatTime(item.createdAt)}`;
    const before = document.createElement('p');
    before.textContent = `Antes: ${item.previousContent?.prompt || (item.previousArchived ? 'Arquivada' : 'Conteúdo original')}`;
    const after = document.createElement('p');
    after.textContent = `Depois: ${item.content?.prompt || (item.archived ? 'Arquivada (pode ser restaurada)' : 'Conteúdo original')}`;
    const source = document.createElement('p'); source.textContent = `Fonte: ${item.source}`;
    const rationale = document.createElement('p'); rationale.textContent = `Justificativa: ${item.rationale}`;
    entry.append(title, before, after, source, rationale);
    return entry;
  }
  async function loadHistory(questionId, hostId) {
    const host = document.getElementById(hostId);
    host.replaceChildren();
    const loading = document.createElement('p'); loading.textContent = 'Carregando histórico…'; host.appendChild(loading);
    try {
      const response = await fetch(`${API_URL}/${encodeURIComponent(questionId)}/history`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(); host.replaceChildren();
      if (!Array.isArray(data.history) || !data.history.length) {
        host.appendChild(Object.assign(document.createElement('p'), { textContent: 'Ainda não há edições, arquivamentos ou restaurações registrados.' }));
        return;
      }
      data.history.forEach(item => host.appendChild(renderHistoryItem(item)));
    } catch {
      host.replaceChildren();
      host.appendChild(Object.assign(document.createElement('p'), { textContent: 'Histórico indisponível enquanto a API estiver sem conexão.' }));
    }
  }
  async function refresh() {
    try {
      const response = await fetch(API_URL, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.questions)) throw new Error('Resposta da API inválida.');
      const next = Object.create(null);
      data.questions.forEach(item => { if (item && typeof item.questionId === 'string') next[item.questionId] = item; });
      const changed = !sameOverrides(overrides, next);
      overrides = next;
      lastSyncAt = Date.now();
      saveCache();
      if (changed) {
        applyOverrides();
        window.dispatchEvent(new CustomEvent('cfs31:questions-updated'));
      }
      setStatus(`Edições globais sincronizadas às ${formatTime(lastSyncAt)}.`, 'online');
    } catch {
      const detail = lastSyncAt ? ` Última sincronização: ${formatTime(lastSyncAt)}.` : '';
      setStatus(`Sem conexão para sincronizar edições globais.${detail}`, 'offline');
    }
  }
  function openEdit(question) {
    if (!question) return;
    activeQuestion = question;
    openingVersion = Number(currentState(question.id).version || 0);
    document.getElementById('edit-question-id').textContent = `Questão ${question.id} · ${question.disc || 'Sem disciplina'}`;
    document.getElementById('edit-question-prompt').value = question.enunciado || '';
    question.alts.forEach((alternative, index) => {
      const input = document.getElementById(`edit-question-option-${index}`);
      if (input) input.value = asText(alternative?.t).replace(/==/g, '');
    });
    document.getElementById('edit-question-resolution').value = question.resolucao || '';
    document.getElementById('edit-question-reference').value = asText(question.base);
    document.getElementById('edit-question-source-url').value = question.source_url || '';
    document.getElementById('edit-question-source').value = '';
    document.getElementById('edit-question-rationale').value = '';
    document.getElementById('edit-question-status').textContent = '';
    document.getElementById('save-question-edit').disabled = false;
    const dialog = document.getElementById('question-edit-dialog');
    dialog.showModal();
    void loadHistory(question.id, 'question-edit-history');
    document.getElementById('edit-question-prompt').focus();
  }
  async function submitEdit(event) {
    event.preventDefault();
    if (!activeQuestion) return;
    const source = document.getElementById('edit-question-source').value.trim();
    const rationale = document.getElementById('edit-question-rationale').value.trim();
    const sourceUrl = document.getElementById('edit-question-source-url').value.trim();
    const status = document.getElementById('edit-question-status');
    const submit = document.getElementById('save-question-edit');
    const content = {
      prompt: document.getElementById('edit-question-prompt').value.trim(),
      alternatives: [0, 1, 2, 3].map(index => document.getElementById(`edit-question-option-${index}`).value.trim()),
      resolution: document.getElementById('edit-question-resolution').value.trim(),
      reference: document.getElementById('edit-question-reference').value.trim(),
      sourceUrl,
    };
    if (!content.prompt || content.alternatives.some(value => !value)) { status.textContent = 'Preencha o enunciado e as quatro alternativas.'; return; }
    if (source.length < 5 || rationale.length < 10) { status.textContent = 'Informe uma fonte e uma justificativa (mínimo 10 caracteres).'; return; }
    if (sourceUrl) {
      try { if (!['http:', 'https:'].includes(new URL(sourceUrl).protocol)) throw new Error(); }
      catch { status.textContent = 'A URL da referência precisa começar com http:// ou https://.'; return; }
    }
    submit.disabled = true; status.textContent = 'Publicando edição para todos…';
    try {
      const response = await fetch(`${API_URL}/${encodeURIComponent(activeQuestion.id)}/edit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ expectedVersion: openingVersion, content, source, rationale }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        await refresh();
        status.textContent = `${data.message || 'Outra pessoa alterou esta questão.'} Feche e abra novamente para comparar a versão atual.`;
        submit.disabled = false; return;
      }
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      overrides[activeQuestion.id] = data; lastSyncAt = Date.now(); saveCache(); applyOverrides();
      window.dispatchEvent(new CustomEvent('cfs31:questions-updated'));
      setStatus(`Edição da questão ${activeQuestion.id} publicada para todos.`, 'online');
      document.getElementById('question-edit-dialog').close();
    } catch (error) { status.textContent = `${error.message || 'Não foi possível publicar a edição.'} Nenhuma mudança foi confirmada.`; submit.disabled = false; }
  }
  function openStatus(question, action) {
    if (!question || !['archive', 'restore'].includes(action)) return;
    activeStatusQuestion = question; activeStatusAction = action;
    statusOpeningVersion = Number(currentState(question.id).version || 0);
    document.getElementById('question-status-title').textContent = action === 'archive' ? 'Excluir questão (arquivamento reversível)' : 'Restaurar questão';
    document.getElementById('question-status-prompt').textContent = question.enunciado || 'Questão sem enunciado.';
    document.getElementById('question-status-warning').textContent = action === 'archive'
      ? 'A confirmação arquiva esta questão para todos: ela sai da prática e dos simulados, mas continua no Banco e pode ser restaurada. Nenhum registro será apagado permanentemente.'
      : 'A confirmação restaura esta questão para todos e a torna novamente disponível de acordo com seu gabarito atual.';
    document.getElementById('question-status-source').value = '';
    document.getElementById('question-status-rationale').value = '';
    document.getElementById('question-status-message').textContent = '';
    const submit = document.getElementById('submit-question-status');
    submit.textContent = action === 'archive' ? 'Confirmar arquivamento para todos' : 'Confirmar restauração para todos';
    submit.disabled = false;
    document.getElementById('question-status-dialog').showModal();
    document.getElementById('question-status-source').focus();
  }
  async function submitStatus(event) {
    event.preventDefault();
    if (!activeStatusQuestion || !activeStatusAction) return;
    const source = document.getElementById('question-status-source').value.trim();
    const rationale = document.getElementById('question-status-rationale').value.trim();
    const message = document.getElementById('question-status-message');
    const submit = document.getElementById('submit-question-status');
    if (source.length < 5 || rationale.length < 10) { message.textContent = 'Informe a fonte e uma justificativa com pelo menos 10 caracteres.'; return; }
    submit.disabled = true; message.textContent = 'Salvando alteração global…';
    try {
      const response = await fetch(`${API_URL}/${encodeURIComponent(activeStatusQuestion.id)}/${activeStatusAction}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ expectedVersion: statusOpeningVersion, source, rationale }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        await refresh();
        message.textContent = `${data.message || 'O estado da questão mudou.'} Feche e reabra para revisar a situação atual.`;
        submit.disabled = false; return;
      }
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      overrides[activeStatusQuestion.id] = data; lastSyncAt = Date.now(); saveCache(); applyOverrides();
      window.dispatchEvent(new CustomEvent('cfs31:questions-updated'));
      const verb = activeStatusAction === 'archive' ? 'arquivada' : 'restaurada';
      setStatus(`Questão ${activeStatusQuestion.id} ${verb} para todos.`, 'online');
      document.getElementById('question-status-dialog').close();
    } catch (error) { message.textContent = `${error.message || 'Não foi possível alterar a questão.'} Nenhuma mudança foi confirmada.`; submit.disabled = false; }
  }

  readCache();
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('question-edit-form').addEventListener('submit', submitEdit);
    document.getElementById('cancel-question-edit').addEventListener('click', () => document.getElementById('question-edit-dialog').close());
    document.getElementById('question-status-form').addEventListener('submit', submitStatus);
    document.getElementById('cancel-question-status').addEventListener('click', () => document.getElementById('question-status-dialog').close());
    void refresh();
    window.addEventListener('focus', () => { if (!document.hidden) void refresh(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
    window.setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
  }, { once: true });

  window.CFS31QuestionCollab = Object.freeze({
    setQuestions,
    currentState,
    openEdit,
    openStatus,
    refresh,
  });
})();
