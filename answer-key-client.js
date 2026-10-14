(() => {
  const API_URL = 'https://cfs31mater-cdx87j7e.manus.space/api/answer-keys';
  const CACHE_KEY = 'cfs31-global-answer-keys-v1';
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  let overrides = Object.create(null);
  let lastSyncAt = null;
  let activeQuestion = null;
  let openingVersion = 0;

  function asText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(' · ');
    if (typeof value === 'object') return Object.values(value).map(asText).filter(Boolean).join(' · ');
    return String(value);
  }

  function readCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      if (saved.overrides && typeof saved.overrides === 'object' && !Array.isArray(saved.overrides)) {
        overrides = saved.overrides;
      }
      lastSyncAt = Number.isFinite(saved.lastSyncAt) ? saved.lastSyncAt : null;
    } catch { /* Cache ausente ou antigo: usa o gabarito local do banco. */ }
  }

  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ overrides, lastSyncAt })); }
    catch { /* A correção ainda funciona enquanto esta página estiver aberta. */ }
  }

  function setStatus(message, state = 'neutral') {
    const element = document.getElementById('global-key-status');
    if (!element) return;
    element.textContent = message;
    element.dataset.state = state;
  }

  function notifyQuestionsChanged() {
    window.dispatchEvent(new CustomEvent('cfs31:answerkeys-updated'));
  }

  function currentOverride(questionId) { return overrides[questionId] || null; }

  function correctIndex(question) {
    const override = currentOverride(question?.id);
    if (Number.isInteger(override?.correctIndex) && override.correctIndex >= 0 && override.correctIndex < question.alts.length) {
      return override.correctIndex;
    }
    return Array.isArray(question?.alts) ? question.alts.findIndex(option => option?.ok === true) : -1;
  }

  function answerVersion(questionId) { return Number(currentOverride(questionId)?.version || 0); }
  function letter(index) { return Number.isInteger(index) && index >= 0 ? (LETTERS[index] || `Alternativa ${index + 1}`) : 'sem gabarito cadastrado'; }
  function sameOverrides(left, right) {
    const leftIds = Object.keys(left);
    const rightIds = Object.keys(right);
    return leftIds.length === rightIds.length && leftIds.every(id => right[id] && left[id].version === right[id].version && left[id].correctIndex === right[id].correctIndex);
  }
  function formatTime(value) {
    if (!value) return 'horário indisponível';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'horário indisponível' : date.toLocaleString('pt-BR');
  }

  async function sync() {
    try {
      const response = await fetch(API_URL, { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.overrides)) throw new Error('Resposta da API inválida.');
      const next = Object.create(null);
      data.overrides.forEach(item => {
        if (item && typeof item.questionId === 'string' && Number.isInteger(item.correctIndex) && Number.isInteger(item.version)) {
          next[item.questionId] = item;
        }
      });
      const changed = !sameOverrides(overrides, next);
      overrides = next;
      lastSyncAt = Date.now();
      saveCache();
      setStatus(`Gabaritos globais sincronizados às ${formatTime(lastSyncAt)}.`, 'online');
      if (changed) notifyQuestionsChanged();
    } catch {
      const detail = lastSyncAt ? ` Última sincronização: ${formatTime(lastSyncAt)}.` : '';
      setStatus(`Sem conexão com a API de correções; usando o gabarito local${detail}`, 'offline');
    }
  }

  function renderChoices(question, selectedIndex) {
    const list = document.getElementById('correction-options');
    list.replaceChildren();
    question.alts.forEach((alternative, index) => {
      const labelElement = document.createElement('label');
      labelElement.className = 'correction-choice';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'global-correct-answer';
      radio.value = String(index);
      radio.required = true;
      radio.checked = index === selectedIndex;
      const letterElement = document.createElement('strong');
      letterElement.textContent = letter(index);
      const text = document.createElement('span');
      text.textContent = asText(alternative?.t).replace(/==/g, '');
      labelElement.append(radio, letterElement, text);
      list.appendChild(labelElement);
    });
  }

  async function loadHistory(questionId) {
    const host = document.getElementById('key-history-list');
    host.replaceChildren();
    const loading = document.createElement('p');
    loading.textContent = 'Carregando histórico…';
    host.appendChild(loading);
    try {
      const response = await fetch(`${API_URL}/${encodeURIComponent(questionId)}/history`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      host.replaceChildren();
      if (!Array.isArray(data.history) || !data.history.length) {
        host.appendChild(Object.assign(document.createElement('p'), { textContent: 'Ainda não há alterações registradas para esta questão.' }));
        return;
      }
      data.history.forEach(item => {
        const entry = document.createElement('article');
        entry.className = 'key-history-entry';
        const heading = document.createElement('strong');
        heading.textContent = `${letter(item.previousCorrectIndex)} → ${letter(item.correctIndex)} · ${formatTime(item.createdAt)}`;
        const source = document.createElement('p');
        source.textContent = `Fonte: ${item.source}`;
        const rationale = document.createElement('p');
        rationale.textContent = `Justificativa: ${item.rationale}`;
        entry.append(heading, source, rationale);
        host.appendChild(entry);
      });
    } catch {
      host.replaceChildren();
      host.appendChild(Object.assign(document.createElement('p'), { textContent: 'Histórico indisponível enquanto a API estiver sem conexão.' }));
    }
  }

  function open(question) {
    if (!question || !Array.isArray(question.alts) || !question.alts.length) return;
    activeQuestion = question;
    const dialog = document.getElementById('key-correction-dialog');
    const currentIndex = correctIndex(question);
    const baseIndex = question.alts.findIndex(option => option?.ok === true);
    openingVersion = answerVersion(question.id);
    document.getElementById('key-correction-question').textContent = question.enunciado || 'Questão sem enunciado.';
    document.getElementById('key-correction-current').textContent = `Gabarito vigente: ${currentIndex >= 0 ? letter(currentIndex) : 'não identificado'}${currentOverride(question.id) ? ' (correção global)' : ' (banco-base)'}. Gabarito-base: ${baseIndex >= 0 ? letter(baseIndex) : 'não identificado'}.`;
    document.getElementById('correction-source').value = '';
    document.getElementById('correction-rationale').value = '';
    document.getElementById('correction-status').textContent = '';
    document.getElementById('submit-key-correction').disabled = false;
    renderChoices(question, currentIndex);
    if (!dialog.open) dialog.showModal();
    void loadHistory(question.id);
    document.querySelector('#correction-source').focus();
  }

  async function submitCorrection(event) {
    event.preventDefault();
    if (!activeQuestion) return;
    const selected = document.querySelector('input[name="global-correct-answer"]:checked');
    const source = document.getElementById('correction-source').value.trim();
    const rationale = document.getElementById('correction-rationale').value.trim();
    const status = document.getElementById('correction-status');
    const submit = document.getElementById('submit-key-correction');
    if (!selected) { status.textContent = 'Selecione a alternativa que deve ser considerada correta.'; return; }
    if (source.length < 5 || rationale.length < 10) { status.textContent = 'Informe uma fonte (mínimo 5 caracteres) e uma justificativa (mínimo 10 caracteres).'; return; }
    submit.disabled = true;
    status.textContent = 'Publicando correção para todos…';
    try {
      const response = await fetch(`${API_URL}/${encodeURIComponent(activeQuestion.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ correctIndex: Number(selected.value), expectedVersion: openingVersion, source, rationale }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        if (data.current && Number.isInteger(data.current.version)) {
          overrides[activeQuestion.id] = data.current;
          lastSyncAt = Date.now();
          saveCache();
          notifyQuestionsChanged();
        }
        status.textContent = `${data.message || 'O gabarito foi alterado por outra pessoa.'} Feche e abra novamente para revisar a versão atual.`;
        submit.disabled = false;
        return;
      }
      if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
      overrides[activeQuestion.id] = data;
      lastSyncAt = Date.now();
      saveCache();
      notifyQuestionsChanged();
      setStatus(`Gabarito de ${activeQuestion.id} alterado globalmente às ${formatTime(lastSyncAt)}.`, 'online');
      document.getElementById('key-correction-dialog').close();
    } catch (error) {
      status.textContent = `${error.message || 'Não foi possível publicar a correção.'} Nenhuma mudança global foi confirmada.`;
      submit.disabled = false;
    }
  }

  readCache();
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('key-correction-form').addEventListener('submit', submitCorrection);
    document.getElementById('cancel-key-correction').addEventListener('click', () => document.getElementById('key-correction-dialog').close());
    document.getElementById('key-correction-dialog').addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    void sync();
    window.addEventListener('focus', () => { if (!document.hidden) void sync(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync(); });
    window.setInterval(() => { if (!document.hidden) void sync(); }, 10000);
  }, { once: true });

  window.CFS31AnswerKeys = Object.freeze({ correctIndex, currentOverride, open, refresh: sync });
})();
