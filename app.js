const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = 'cfs31-quiz-app-v1';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const state = {
  view: 'practice', collection: 'all', discipline: 'all', topic: 'all', search: '', practiceIndex: 0,
  bankPage: 1, bankStatus: 'active', onlyWrong: false, reviewIds: null, retryUnlocked: new Set(), practiceSelections: {},
  bankResponses: {}, bankRevealed: new Set(), simulation: null,
  readerQuestionId: null, readerFontScale: 1,
  saved: { answers: {}, favorites: [] }
};
let questions = [];
let disciplines = [];
const READER_STORAGE_KEY = 'cfs31-quiz-reader-v1';
const viewRoot = $('#app-view');

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}
function normalize(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}
function getText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(getText).filter(Boolean).join(' · ');
  if (typeof value === 'object') return Object.values(value).map(getText).filter(Boolean).join(' · ');
  return String(value);
}
function appendPlainWithBreaks(parent, text) {
  String(text ?? '').split('\n').forEach((line, i) => {
    if (i) parent.appendChild(document.createElement('br'));
    parent.appendChild(document.createTextNode(line));
  });
}
function appendMarkedText(parent, text) {
  const value = getText(text);
  const pattern = /==(.*?)==/gs;
  let cursor = 0, match;
  while ((match = pattern.exec(value))) {
    appendPlainWithBreaks(parent, value.slice(cursor, match.index));
    const mark = node('mark');
    appendPlainWithBreaks(mark, match[1]);
    parent.appendChild(mark);
    cursor = pattern.lastIndex;
  }
  appendPlainWithBreaks(parent, value.slice(cursor));
}
function appendIncorrectFragment(parent, alt) {
  const text = getText(alt?.t);
  const fragment = getText(alt?.erro).trim();
  const start = fragment ? text.toLocaleLowerCase('pt-BR').indexOf(fragment.toLocaleLowerCase('pt-BR')) : -1;
  if (start < 0) { appendMarkedText(parent, text); return false; }
  appendMarkedText(parent, text.slice(0, start));
  const del = node('del', 'incorrect-fragment'); del.setAttribute('aria-label', 'Trecho incorreto');
  appendMarkedText(del, text.slice(start, start + fragment.length)); parent.appendChild(del);
  appendMarkedText(parent, text.slice(start + fragment.length));
  return true;
}
function readSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { answers: value.answers && typeof value.answers === 'object' ? value.answers : {}, favorites: Array.isArray(value.favorites) ? value.favorites : [] };
  } catch { return { answers: {}, favorites: [] }; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.saved)); }
  catch { setStatus('O navegador não permitiu salvar o progresso local.'); }
}
function setStatus(message = '') {
  $('#load-status').textContent = message;
}
function favorite(id) { return state.saved.favorites.includes(id); }
function collectionOf(q) { return q.colecao || 'Apostilas CFS 31'; }
function effectiveCorrectIndex(q) {
  const index = window.CFS31AnswerKeys?.correctIndex(q);
  return Number.isInteger(index) ? index : (Array.isArray(q?.alts) ? q.alts.findIndex(option => option?.ok === true) : -1);
}
function hasCorrectKey(q) { return effectiveCorrectIndex(q) >= 0; }
function isQuestionArchived(q) {
  return Boolean(q?.archived || window.CFS31QuestionCollab?.currentState(q?.id)?.archived);
}
function readReaderSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || '{}');
    return { questionId: typeof value.questionId === 'string' ? value.questionId : null, fontScale: Number.isFinite(value.fontScale) ? Math.max(.85, Math.min(1.5, value.fontScale)) : 1 };
  } catch { return { questionId: null, fontScale: 1 }; }
}
function saveReaderSettings() {
  try { localStorage.setItem(READER_STORAGE_KEY, JSON.stringify({ questionId: state.readerQuestionId, fontScale: state.readerFontScale })); }
  catch { /* A leitura continua; apenas a posição não será lembrada pelo navegador. */ }
}
function getFilteredQuestions({ mode = state.view } = {}) {
  const needle = normalize(state.search.trim());
  return questions.filter(q => {
    const archived = isQuestionArchived(q);
    const hasKey = hasCorrectKey(q);
    if (mode === 'bank') {
      if (state.bankStatus === 'pending' && (archived || hasKey)) return false;
      if (state.bankStatus === 'archived' && !archived) return false;
      if (state.bankStatus === 'active' && archived) return false;
    } else if (mode === 'reader') {
      if (archived) return false;
    } else if (archived || !hasKey) return false;
    if (state.collection !== 'all' && collectionOf(q) !== state.collection) return false;
    if (state.discipline !== 'all' && q.disc !== state.discipline) return false;
    if (state.topic !== 'all' && (q.assunto || 'Geral') !== state.topic) return false;
    if (state.reviewIds && !state.reviewIds.includes(q.id)) return false;
    if (state.onlyWrong && (!state.saved.answers[q.id] || state.saved.answers[q.id].correct)) return false;
    if (!needle) return true;
    const searchable = normalize([collectionOf(q), q.origem, q.disc, q.assunto, q.enunciado, q.resolucao, getText(q.base), ...(q.alts || []).map(a => a.t)].join(' '));
    return searchable.includes(needle);
  });
}
function getAttemptHistory() {
  return Object.values(state.saved.answers).flatMap(answer => Array.isArray(answer.history) ? answer.history : [answer]);
}
function updateStats() {
  const answers = getAttemptHistory();
  const attempted = answers.length;
  const correct = answers.filter(a => a.correct).length;
  $('#stat-attempted').textContent = attempted;
  $('#stat-accuracy').textContent = attempted ? `${Math.round(correct / attempted * 100)}%` : '—';
  $('#stat-favorites').textContent = state.saved.favorites.length;
  $('#hero-total').textContent = questions.length;
  $('#hero-subjects').textContent = disciplines.length;
  const filtered = getFilteredQuestions();
  $('#result-count').textContent = `${filtered.length} de ${questions.length} questões`;
}
function renderDisciplineControls() {
  const collectionSelect = $('#collection-filter');
  const collections = [...new Set(questions.map(collectionOf))].sort((a,b) => a.localeCompare(b,'pt-BR'));
  collectionSelect.replaceChildren(new Option('Todas as coleções', 'all'));
  collections.forEach(name => collectionSelect.add(new Option(`${name} (${questions.filter(q => collectionOf(q) === name).length})`, name)));
  if (state.collection !== 'all' && !collections.includes(state.collection)) state.collection = 'all';
  collectionSelect.value = state.collection;
  const inCollection = questions.filter(q => state.collection === 'all' || collectionOf(q) === state.collection);
  const select = $('#discipline-filter');
  select.replaceChildren(new Option('Todas as disciplinas', 'all'));
  const availableDisciplines = [...new Set(inCollection.map(q => q.disc))].sort((a,b) => a.localeCompare(b,'pt-BR'));
  availableDisciplines.forEach(name => select.add(new Option(`${name} (${inCollection.filter(q => q.disc === name).length})`, name)));
  if (state.discipline !== 'all' && !availableDisciplines.includes(state.discipline)) state.discipline = 'all';
  select.value = state.discipline;
  const topicSelect = $('#topic-filter');
  const topics = [...new Set(inCollection.filter(q => state.discipline === 'all' || q.disc === state.discipline).map(q => q.assunto || 'Geral'))].sort((a,b) => a.localeCompare(b,'pt-BR'));
  topicSelect.replaceChildren(new Option('Todos os assuntos', 'all'));
  topics.forEach(topic => topicSelect.add(new Option(topic, topic)));
  if (state.topic !== 'all' && !topics.includes(state.topic)) state.topic = 'all';
  topicSelect.value = state.topic;
  $('#bank-status-filter').value = state.bankStatus;
  const activeCount = Number(state.collection !== 'all') + Number(state.discipline !== 'all') + Number(state.topic !== 'all') + Number(state.bankStatus !== 'active');
  const badge = $('#active-filter-count');
  badge.hidden = activeCount === 0;
  badge.textContent = activeCount ? String(activeCount) : '';
  $('#filter-trigger').setAttribute('aria-label', activeCount ? `Filtros, ${activeCount} ativos` : 'Abrir filtros');
}
function renderNav() {
  $$('[data-view]').forEach(button => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}
function heading(eyebrow, title, subtitle) {
  const wrap = node('div', 'page-heading');
  const left = node('div');
  left.append(node('p', 'eyebrow-dark', eyebrow), node('h2', '', title), node('p', '', subtitle));
  wrap.appendChild(left);
  return wrap;
}
function createProgressTrack(value, max = 100) {
  const track = node('div', 'progress-track');
  track.setAttribute('role', 'progressbar'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(max)); track.setAttribute('aria-valuenow', String(value));
  const fill = node('div', 'progress-fill'); fill.style.width = `${max ? Math.max(0, Math.min(100, value / max * 100)) : 0}%`;
  track.appendChild(fill); return track;
}
function createExplanation(q) {
  const wrap = node('div', 'explanation');
  if (q.resolucao) {
    wrap.appendChild(node('h3', '', 'Resolução'));
    const p = node('p'); appendMarkedText(p, q.resolucao); wrap.appendChild(p);
  }
  const base = getText(q.base);
  if (base || q.source_url) {
    wrap.appendChild(node('h3', '', 'Referência'));
    const p = node('p');
    if (base) appendMarkedText(p, base);
    if (q.source_url) {
      try {
        const url = new URL(String(q.source_url));
        if (url.protocol === 'https:' || url.protocol === 'http:') {
          if (base) p.append(' · ');
          const link = node('a', 'source-link', 'Abrir fonte');
          link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.setAttribute('aria-label', `Abrir fonte: ${q.validation?.source_title || 'referência da questão'} (nova aba)`);
          p.appendChild(link);
        }
      } catch { /* Ignora URLs inválidas; a citação textual continua disponível. */ }
    }
    wrap.appendChild(p);
  }
  return wrap;
}
function optionOrder(q, shuffle = false) {
  const arr = q.alts.map((_, i) => i);
  if (!shuffle) return arr;
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function createOptions(q, order, selectedIndex = null, locked = false, revealCorrect = true, action = null) {
  const list = node('div', 'options-list');
  const optionAction = action || (state.view === 'simulado' ? 'select-simulation' : 'select-practice');
  const correctIndex = effectiveCorrectIndex(q);
  order.forEach((actualIndex, shownIndex) => {
    const alt = q.alts[actualIndex];
    const isCorrect = actualIndex === correctIndex;
    const button = node('button', 'option-button');
    button.type = 'button'; button.dataset.action = optionAction;
    button.dataset.optionIndex = actualIndex; button.disabled = locked;
    if (optionAction.startsWith('select-')) button.setAttribute('aria-pressed', String(actualIndex === selectedIndex));
    if (!locked && actualIndex === selectedIndex) button.classList.add('is-selected');
    if (locked && revealCorrect && isCorrect) button.classList.add('is-correct');
    if (locked && revealCorrect && actualIndex === selectedIndex && !isCorrect) button.classList.add('is-wrong');
    if (locked && !revealCorrect && actualIndex === selectedIndex) button.classList.add('is-selected');
    button.append(node('span', 'option-letter', LETTERS[shownIndex] || String(shownIndex + 1)));
    const text = node('span', '');
    if (locked && revealCorrect && !isCorrect) appendIncorrectFragment(text, alt);
    else appendMarkedText(text, alt.t);
    button.appendChild(text);
    let status = '';
    if (locked && revealCorrect && isCorrect) status = actualIndex === selectedIndex ? 'Correta · sua resposta' : 'Correta';
    else if (locked && revealCorrect && actualIndex === selectedIndex) status = 'Sua resposta';
    else if (locked && !revealCorrect && actualIndex === selectedIndex) status = 'Resposta registrada';
    if (status) button.appendChild(node('strong', 'option-status', status));
    list.appendChild(button);
  });
  return list;
}
function feedback(q, selectedIndex) {
  const correctIndex = effectiveCorrectIndex(q);
  const correct = correctIndex >= 0 && selectedIndex === correctIndex;
  const wrap = node('section', `feedback${correct ? '' : ' is-wrong'}`);
  wrap.setAttribute('aria-live', 'polite'); wrap.tabIndex = -1;
  if (correctIndex < 0) {
    wrap.appendChild(node('p', 'feedback-title', 'Gabarito ainda não cadastrado.'));
    wrap.appendChild(node('p', 'feedback-copy', 'Esta questão permanece fora da prática pontuada até que a turma cadastre uma resposta fundamentada.'));
    return wrap;
  }
  wrap.appendChild(node('p', 'feedback-title', correct ? 'Você acertou!' : 'Você errou.'));
  if (!correct) {
    const selected = q.alts[selectedIndex];
    const wrong = node('p', 'feedback-copy incorrect-answer');
    wrong.append('Trecho incorreto da alternativa marcada: ');
    appendIncorrectFragment(wrong, selected);
    wrap.appendChild(wrong);
    const right = q.alts[correctIndex];
    const p = node('p', 'feedback-copy');
    p.append('A alternativa correta é: ');
    const strong = node('strong', '', getText(right?.t)); p.appendChild(strong); wrap.appendChild(p);
    const reason = getText(selected?.motivo);
    if (reason) { const why = node('p', 'feedback-copy'); why.style.marginTop = '6px'; appendMarkedText(why, reason); wrap.appendChild(why); }
  }
  wrap.appendChild(createExplanation(q));
  return wrap;
}
function makeQuestionCard(q, options = {}) {
  const { order = optionOrder(q), selectedIndex = null, locked = false, showControls = true, position = null, total = null, optionAction = null, submitAction = null } = options;
  const card = node('article', 'question-card');
  card.dataset.questionId = q.id;
  if (position !== null && total) {
    const cap = node('div', 'practice-caption'); cap.append(node('span', '', `${position + 1} / ${total}`), node('span', '', `${q.disc} · ${q.assunto || 'Questão'}`));
    card.appendChild(cap); card.appendChild(createProgressTrack(position + 1, total));
  }
  const top = node('div', 'question-top');
  const meta = node('div', 'question-meta');
  if (collectionOf(q) !== 'Apostilas CFS 31') meta.append(node('span', 'pill collection', collectionOf(q)));
  meta.append(node('span', 'pill', q.disc), node('span', 'pill topic', q.assunto || 'Geral'), node('span', 'question-id', q.id));
  const fav = node('button', `favorite-button${favorite(q.id) ? ' is-favorite' : ''}`);
  fav.type = 'button'; fav.dataset.action = 'toggle-favorite'; fav.setAttribute('aria-label', favorite(q.id) ? 'Remover questão das favoritas' : 'Adicionar questão às favoritas'); fav.textContent = favorite(q.id) ? '★' : '☆';
  top.append(meta, fav); card.appendChild(top);
  const body = node('div', 'question-body');
  const prompt = node('p', 'question-text'); appendMarkedText(prompt, q.enunciado); body.appendChild(prompt);
  body.appendChild(createOptions(q, order, selectedIndex, locked, state.view !== 'simulado', optionAction));
  if (submitAction) {
    const submitRow = node('div', 'answer-submit-row');
    const submit = node('button', 'button primary', 'Conferir resposta'); submit.type = 'button';
    submit.dataset.action = submitAction; submit.dataset.id = q.id;
    submit.disabled = selectedIndex === null || selectedIndex === undefined || locked;
    submitRow.appendChild(submit); body.appendChild(submitRow);
  }
  if (locked && selectedIndex !== null && state.view !== 'simulado') {
    const result = feedback(q, selectedIndex);
    if (state.view === 'practice') {
      const retry = node('button', 'button', 'Tentar novamente');
      retry.type = 'button'; retry.dataset.action = 'retry-question'; retry.dataset.id = q.id; retry.style.marginTop = '11px';
      result.appendChild(retry);
    }
    body.appendChild(result);
  }
  if (showControls) {
    const actions = node('div', 'question-actions');
    const nav = node('div', 'button-row');
    const prev = node('button', 'button', 'Anterior'); prev.type = 'button'; prev.dataset.action = 'prev-question'; prev.disabled = position === 0;
    const next = node('button', 'button primary', position === total - 1 ? 'Última questão' : 'Próxima'); next.type = 'button'; next.dataset.action = 'next-question'; next.disabled = position === total - 1;
    nav.append(prev, next); actions.appendChild(nav);
    if (state.view === 'simulado' && state.simulation && !state.simulation.done) {
      const finish = node('button', 'button amber', 'Finalizar simulado'); finish.type = 'button'; finish.dataset.action = 'finish-simulation'; actions.appendChild(finish);
    }
    body.appendChild(actions);
  }
  if (state.view !== 'simulado') body.appendChild(createQuestionManagement(q));
  card.appendChild(body);
  return card;
}
function renderPractice() {
  const filtered = getFilteredQuestions();
  if (!filtered.length) {
    const emptyTitle=state.onlyWrong?'Sem erros para revisar':state.reviewIds?'Sem erros nesta rodada':'Nenhuma questão encontrada';
    const emptyCopy=state.onlyWrong||state.reviewIds?'Não há questões pendentes nesta revisão.':'Tente ajustar a busca, escolher outra coleção ou disciplina.';
    viewRoot.append(heading('MODO DE ESTUDO', emptyTitle, emptyCopy));
    if (state.onlyWrong) { const b = node('button', 'button', 'Voltar para todas as questões'); b.type = 'button'; b.dataset.action = 'clear-wrong-filter'; viewRoot.appendChild(b); }
    return;
  }
  state.practiceIndex = Math.max(0, Math.min(state.practiceIndex, filtered.length - 1));
  const q = filtered[state.practiceIndex];
  const practiceTitle = state.onlyWrong ? 'Revisão dos seus erros' : state.reviewIds ? 'Revisão dos erros do simulado' : 'Praticar questão por questão';
  viewRoot.append(heading('MODO DE ESTUDO', practiceTitle, 'Selecione uma alternativa e toque em “Conferir resposta” para ver o resultado.'));
  const savedAnswer = state.saved.answers[q.id];
  const locked = !!savedAnswer && !state.retryUnlocked.has(q.id);
  const selectedIndex = locked ? savedAnswer.selectedIndex : (state.practiceSelections[q.id] ?? null);
  viewRoot.appendChild(makeQuestionCard(q, { selectedIndex, locked, position: state.practiceIndex, total: filtered.length, optionAction: locked ? null : 'select-practice', submitAction: locked ? null : 'submit-practice' }));
}
function startSimulation() {
  const eligible = getFilteredQuestions();
  if (!eligible.length) { setStatus('Nenhuma questão disponível com os filtros atuais.'); return; }
  const countValue = $('#sim-count')?.value || '10';
  const count = countValue === 'all' ? eligible.length : Math.min(Number(countValue), eligible.length);
  const pool = [...eligible];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const selected = pool.slice(0, count);
  const shuffle = $('#sim-shuffle')?.checked ?? true;
  const orders = {};
  selected.forEach(q => { orders[q.id] = optionOrder(q, shuffle); });
  state.simulation = { ids: selected.map(q => q.id), orders, answers: {}, pending: {}, index: 0, done: false };
  setStatus(''); render(); $('.option-button',viewRoot)?.focus();
}
function renderSimulation() {
  const sim = state.simulation;
  if (!sim) {
    viewRoot.append(heading('MODO DE AVALIAÇÃO', 'Simulado', 'Monte uma rodada aleatória a partir das questões filtradas.'));
    const card = node('section', 'config-card');
    card.append(node('p', 'eyebrow-dark', 'CONFIGURE SUA RODADA'), node('h3', '', 'Escolha o tamanho do simulado'));
    const grid = node('div', 'config-grid');
    const countField = node('div', 'config-field'); countField.append(node('label', '', 'Número de questões'));
    const select = node('select'); select.id = 'sim-count';
    [['10','10 questões'],['20','20 questões'],['40','40 questões'],['all','Todas as filtradas']].forEach(([v,l]) => select.add(new Option(l,v)));
    countField.appendChild(select);
    const filterField = node('div', 'config-field'); filterField.append(node('label', '', 'Base atual'), node('div', '', `${getFilteredQuestions().length} questão(ões) disponíveis`));
    grid.append(countField, filterField); card.appendChild(grid);
    const label = node('label', 'check-line'); const check = document.createElement('input'); check.type = 'checkbox'; check.id = 'sim-shuffle'; check.checked = true;
    label.append(check, node('span', '', 'Embaralhar a ordem das alternativas em cada questão'));
    card.appendChild(label);
    const start = node('button', 'button primary', 'Iniciar simulado'); start.type = 'button'; start.dataset.action = 'start-simulation';
    card.appendChild(start); viewRoot.appendChild(card); return;
  }
  const simQuestions = sim.ids.map(id => questions.find(q => q.id === id)).filter(Boolean);
  if (sim.done) {
    const answered = Object.keys(sim.answers).length;
    const correct = Object.values(sim.answers).filter(a => a.correct).length;
    const wrong = simQuestions.filter(q => sim.answers[q.id] && !sim.answers[q.id].correct);
    viewRoot.append(heading('RESULTADO DO SIMULADO', 'Rodada concluída', 'Veja seu desempenho e revise as questões que errou.'));
    const metrics = node('div', 'metric-grid');
    [[`${correct} / ${simQuestions.length}`,'acertos'],[`${Math.round(correct / Math.max(1, simQuestions.length) * 100)}%`,'aproveitamento'],[`${simQuestions.length - answered}`,'sem resposta']].forEach(([v,l]) => { const m=node('div','metric-card'); m.append(node('small','',l),node('strong','',v)); metrics.appendChild(m); });
    viewRoot.appendChild(metrics);
    const buttons = node('div','button-row');
    const retry = node('button','button primary',wrong.length ? `Revisar ${wrong.length} erro(s)` : 'Revisar respostas'); retry.type='button'; retry.dataset.action='review-simulation-errors'; retry.disabled=!wrong.length;
    const again = node('button','button','Novo simulado'); again.type='button'; again.dataset.action='reset-simulation';
    buttons.append(retry,again); viewRoot.appendChild(buttons);
    const list = node('div','favorite-list');
    simQuestions.forEach((q,i)=>{
      const a=sim.answers[q.id]; const row=node('div','favorite-row'); const copy=node('p'); copy.append(node('small','',`${i+1}. ${q.disc} · ${q.assunto||''}`),document.createTextNode(q.enunciado));
      row.append(copy,node('span','pill',a?(a.correct?'Correta':'Incorreta'):'Sem resposta')); list.appendChild(row);
    });
    const panel=node('section','progress-panel'); panel.append(node('h3','','Questões desta rodada'),list); viewRoot.appendChild(panel); return;
  }
  const q = questions.find(x => x.id === sim.ids[sim.index]);
  if (!q) { sim.done=true; render(); return; }
  viewRoot.append(heading('MODO DE AVALIAÇÃO', 'Simulado em andamento', 'Selecione, confirme e avance. O gabarito fica oculto até o fim da rodada.'));
  const status=node('div','simulation-progress'); status.append(node('span','',`Questão ${sim.index+1} de ${sim.ids.length}`),node('span','',`${Object.keys(sim.answers).length} respondida(s)`)); viewRoot.appendChild(status);
  const answer=sim.answers[q.id];
  const selectedIndex=answer?answer.selectedIndex:(sim.pending[q.id]??null);
  viewRoot.appendChild(makeQuestionCard(q,{order:sim.orders[q.id]||optionOrder(q),selectedIndex,locked:!!answer,position:sim.index,total:sim.ids.length,optionAction:answer?null:'select-simulation',submitAction:answer?null:'submit-simulation'}));
}
function createQuestionManagement(q) {
  const actions = node('div', 'question-management');
  const key = node('button', 'text-link', 'Alterar gabarito desta questão');
  key.type = 'button'; key.dataset.action = 'open-key-correction'; key.dataset.id = q.id;
  if (!hasCorrectKey(q)) key.title = 'Cadastrar manualmente o gabarito, com fonte e justificativa.';
  const edit = node('button', 'text-link', 'Editar questão'); edit.type = 'button'; edit.dataset.action = 'edit-question'; edit.dataset.id = q.id;
  const archived = isQuestionArchived(q);
  const status = node('button', `text-link${archived ? '' : ' danger-link'}`, archived ? 'Restaurar questão' : 'Excluir questão');
  status.type = 'button'; status.dataset.action = 'question-status'; status.dataset.id = q.id; status.dataset.statusAction = archived ? 'restore' : 'archive';
  actions.append(key, edit, status);
  return actions;
}
function renderBank() {
  const filtered=getFilteredQuestions({ mode: 'bank' });
  viewRoot.append(heading('CONSULTA', 'Banco de questões', 'Abra uma questão sem registrar resposta. Itens sem gabarito e arquivados ficam identificados.'));
  if (!filtered.length) { viewRoot.appendChild(node('div','empty-state',state.bankStatus==='archived'?'Nenhuma questão arquivada corresponde aos filtros.':'Nenhuma questão corresponde aos filtros.')); return; }
  const perPage=20; const pages=Math.max(1,Math.ceil(filtered.length/perPage)); state.bankPage=Math.min(state.bankPage,pages);
  const start=(state.bankPage-1)*perPage;
  const list=node('div','bank-list');
  filtered.slice(start,start+perPage).forEach(q=>{
    const details=node('details','bank-entry'); details.dataset.questionId=q.id; const summary=node('summary','bank-summary');
    const archived=isQuestionArchived(q);const hasKey=hasCorrectKey(q);
    const main=node('div','bank-summary-main'); const meta=node('div','bank-meta'); if(collectionOf(q)!=='Apostilas CFS 31')meta.append(node('span','pill collection',collectionOf(q))); meta.append(node('span','pill',q.disc),node('span','pill topic',q.assunto||'Geral'));
    if(archived)meta.append(node('span','pill archived-pill','Arquivada'));else if(!hasKey)meta.append(node('span','pill pending-pill','Aguardando gabarito'));
    meta.append(node('span','question-id',q.id));
    main.append(meta,node('p','bank-question',q.enunciado)); summary.appendChild(main);
    const favoriteBtn=node('button',`favorite-button bank-fav${favorite(q.id)?' is-favorite':''}`); favoriteBtn.type='button'; favoriteBtn.dataset.action='toggle-favorite'; favoriteBtn.dataset.id=q.id; favoriteBtn.setAttribute('aria-label',favorite(q.id)?'Remover questão das favoritas':'Adicionar questão às favoritas'); favoriteBtn.textContent=favorite(q.id)?'★':'☆'; summary.appendChild(favoriteBtn);
    details.appendChild(summary);
    const detail=node('div','bank-detail');
    const response=state.bankResponses[q.id];
    if(archived){
      detail.appendChild(node('p','bank-prompt','Esta questão foi arquivada para todos. Ela não participa da prática nem dos simulados; use “Restaurar questão” para reativá-la.'));
    }else if(!hasKey){
      detail.appendChild(node('p','bank-prompt','Aguardando gabarito. A questão pode ser lida e editada, mas não participa da prática nem dos simulados até que a turma cadastre uma alternativa fundamentada.'));
      detail.appendChild(createOptions(q,optionOrder(q),null,true,false,'view-key'));
    }else if(response?.submitted){
      detail.appendChild(createOptions(q,optionOrder(q),response.selectedIndex,true,true,'view-key'));
      detail.appendChild(feedback(q,response.selectedIndex));
      const again=node('button','button','Responder novamente');again.type='button';again.dataset.action='retry-bank-answer';again.dataset.id=q.id;detail.appendChild(again);
    }else if(response?.active){
      detail.appendChild(createOptions(q,optionOrder(q),response.selectedIndex,false,false,'select-bank-answer'));
      const actions=node('div','bank-answer-actions');const submit=node('button','button primary','Conferir resposta');submit.type='button';submit.dataset.action='submit-bank-answer';submit.dataset.id=q.id;submit.disabled=response.selectedIndex===null||response.selectedIndex===undefined;
      const cancel=node('button','button','Cancelar');cancel.type='button';cancel.dataset.action='cancel-bank-answer';cancel.dataset.id=q.id;actions.append(submit,cancel);detail.appendChild(actions);
    }else if(state.bankRevealed.has(q.id)){
      detail.appendChild(createOptions(q,optionOrder(q),null,true,true,'view-key'));detail.appendChild(createExplanation(q));
      const hide=node('button','button','Ocultar gabarito');hide.type='button';hide.dataset.action='hide-bank-key';hide.dataset.id=q.id;detail.appendChild(hide);
    }else{
      detail.appendChild(node('p','bank-prompt','Escolha uma ação. Abrir esta questão não registra uma resposta.'));
      const actions=node('div','bank-answer-actions');const answer=node('button','button primary','Responder questão');answer.type='button';answer.dataset.action='start-bank-answer';answer.dataset.id=q.id;
      const key=node('button','button','Consultar gabarito e resolução');key.type='button';key.dataset.action='reveal-bank-key';key.dataset.id=q.id;actions.append(answer,key);detail.appendChild(actions);
    }
    detail.appendChild(createQuestionManagement(q));
    details.appendChild(detail); list.appendChild(details);
  });
  viewRoot.appendChild(list);
  if(pages>1){const nav=node('div','pagination');const prev=node('button','button','Anterior');prev.type='button';prev.dataset.action='bank-page';prev.dataset.page=state.bankPage-1;prev.disabled=state.bankPage<=1;const next=node('button','button','Próxima');next.type='button';next.dataset.action='bank-page';next.dataset.page=state.bankPage+1;next.disabled=state.bankPage>=pages;nav.append(prev,node('span','','Página '+state.bankPage+' de '+pages),next);viewRoot.appendChild(nav);}
}
function renderReader() {
  const filtered = getFilteredQuestions({ mode: 'reader' });
  viewRoot.append(heading('MODO LEITURA', 'Leitor de questões', 'Leia uma questão por página, ajuste o texto e continue de onde parou neste aparelho.'));
  if (!filtered.length) { viewRoot.appendChild(node('div', 'empty-state', 'Nenhuma questão disponível para leitura com estes filtros.')); return; }
  let index = filtered.findIndex(q => q.id === state.readerQuestionId);
  if (index < 0) index = 0;
  const q = filtered[index];
  state.readerQuestionId = q.id; saveReaderSettings();

  const toolbar = node('div', 'reader-toolbar');
  const position = node('span', 'reader-position', `Página ${index + 1} de ${filtered.length}`);
  const fontControls = node('div', 'reader-font-controls');
  const smaller = node('button', 'button reader-font-button', 'A−'); smaller.type = 'button'; smaller.dataset.action = 'reader-font-smaller'; smaller.setAttribute('aria-label', 'Diminuir tamanho do texto'); smaller.disabled = state.readerFontScale <= .85;
  const larger = node('button', 'button reader-font-button', 'A+'); larger.type = 'button'; larger.dataset.action = 'reader-font-larger'; larger.setAttribute('aria-label', 'Aumentar tamanho do texto'); larger.disabled = state.readerFontScale >= 1.5;
  fontControls.append(smaller, larger); toolbar.append(position, fontControls); viewRoot.appendChild(toolbar);
  viewRoot.appendChild(createProgressTrack(index + 1, filtered.length));

  const page = node('article', 'reader-page');
  page.style.setProperty('--reader-scale', String(state.readerFontScale));
  page.setAttribute('aria-label', `Página ${index + 1}: ${q.disc}, ${q.assunto || 'questão'}`);
  const pageHeader = node('div', 'reader-page-header');
  pageHeader.append(node('span', 'reader-chapter', `${q.disc} · ${q.assunto || 'Geral'}`), node('span', 'question-id', q.id));
  page.appendChild(pageHeader);
  const prompt = node('div', 'reader-prompt'); appendMarkedText(prompt, q.enunciado); page.appendChild(prompt);
  const alternatives = node('ol', 'reader-alternatives');
  q.alts.forEach((alternative, optionIndex) => {
    const item = node('li', 'reader-alternative');
    item.append(node('span', 'reader-alternative-letter', `${LETTERS[optionIndex] || optionIndex + 1}.`));
    const text = node('span'); appendMarkedText(text, alternative.t); item.appendChild(text); alternatives.appendChild(item);
  });
  page.appendChild(alternatives);
  const reference = getText(q.base);
  if (reference) page.appendChild(node('p', 'reader-reference', `Referência: ${reference}`));
  page.appendChild(node('p', 'reader-saved-note', 'Posição de leitura salva neste aparelho.'));
  if (!hasCorrectKey(q)) page.appendChild(node('p', 'pending-note', 'Aguardando gabarito: esta questão ainda não pode ser pontuada.'));
  viewRoot.appendChild(page);

  const actions = node('div', 'reader-actions');
  const previous = node('button', 'button', '← Página anterior'); previous.type = 'button'; previous.dataset.action = 'reader-previous'; previous.disabled = index <= 0;
  const respond = node('button', 'button primary', 'Responder esta questão'); respond.type = 'button'; respond.dataset.action = 'reader-answer'; respond.dataset.id = q.id; respond.disabled = !hasCorrectKey(q) || isQuestionArchived(q);
  const next = node('button', 'button', 'Próxima página →'); next.type = 'button'; next.dataset.action = 'reader-next'; next.disabled = index >= filtered.length - 1;
  actions.append(previous, respond, next); viewRoot.appendChild(actions);
  viewRoot.appendChild(createQuestionManagement(q));
}
function renderProgress() {
  const attempts=getAttemptHistory(); const total=attempts.length; const correct=attempts.filter(a=>a.correct).length; const wrong=attempts.filter(a=>!a.correct).length;
  viewRoot.append(heading('ACOMPANHAMENTO', 'Meu progresso', 'Suas respostas ficam apenas neste navegador.'));
  const metrics=node('div','metric-grid');[[total,'tentativas'],[correct,'acertos'],[wrong,'erros para revisar']].forEach(([v,l])=>{const m=node('div','metric-card');m.append(node('small','',l),node('strong','',v));metrics.appendChild(m);});viewRoot.appendChild(metrics);
  const panel=node('section','progress-panel');panel.appendChild(node('h3','','Cobertura por disciplina'));
  const bars=node('div','subject-progress');
  disciplines.forEach(d=>{const inDisc=questions.filter(q=>q.disc===d.name);const done=inDisc.filter(q=>state.saved.answers[q.id]);const hit=done.filter(q=>state.saved.answers[q.id].correct).length;const row=node('div','subject-progress-row');row.append(node('strong','',d.name),createProgressTrack(done.length,inDisc.length),node('span','',`${done.length}/${inDisc.length} feitas`));if(done.length&&hit<done.length)row.title=`Acerto em ${Math.round(hit/done.length*100)}% das respondidas`;bars.appendChild(row);});
  panel.appendChild(bars);viewRoot.appendChild(panel);
  const wrongQs=questions.filter(q=>state.saved.answers[q.id]&&!state.saved.answers[q.id].correct);
  if(wrongQs.length){const wrongPanel=node('section','progress-panel');wrongPanel.append(node('h3','','Revisar erros recentes'));const review=node('button','button primary','Praticar questões erradas');review.type='button';review.dataset.action='review-wrongs';wrongPanel.appendChild(review);viewRoot.appendChild(wrongPanel);}
  const favQs=questions.filter(q=>favorite(q.id));const favPanel=node('section','progress-panel');favPanel.append(node('h3','','Favoritas'));if(!favQs.length)favPanel.append(node('p','','Ainda não há questões favoritas. Marque uma estrela durante a prática.'));else{const list=node('div','favorite-list');favQs.forEach(q=>{const row=node('div','favorite-row');const p=node('p');p.append(node('small','',`${q.disc} · ${q.assunto||''}`),document.createTextNode(q.enunciado));row.append(p);const go=node('button','button','Estudar');go.type='button';go.dataset.action='open-question';go.dataset.id=q.id;row.appendChild(go);list.appendChild(row);});favPanel.appendChild(list);}viewRoot.appendChild(favPanel);
  if(total){const reset=node('button','button','Apagar meu progresso deste navegador');reset.type='button';reset.dataset.action='reset-progress';viewRoot.appendChild(reset);}
}
function render() {
  renderNav(); updateStats(); renderDisciplineControls(); viewRoot.replaceChildren();
  if(state.view==='practice')renderPractice();
  else if(state.view==='simulado')renderSimulation();
  else if(state.view==='bank')renderBank();
  else if(state.view==='reader')renderReader();
  else renderProgress();
}
function toggleFavorite(id) {
  const openEntries = state.view === 'bank' ? $$('.bank-entry[open]').map(entry => entry.dataset.questionId) : [];
  if (favorite(id)) state.saved.favorites=state.saved.favorites.filter(x=>x!==id);else state.saved.favorites.push(id);
  save();render();
  if (state.view === 'bank') $$('.bank-entry').forEach(entry => { if (openEntries.includes(entry.dataset.questionId)) entry.open = true; });
  const target=$$('.favorite-button',viewRoot).find(button=>button.dataset.id===id||button.closest('[data-question-id]')?.dataset.questionId===id);
  target?.focus();
}
function recordAnswer(q,index) {
  if(!q.alts[index]||effectiveCorrectIndex(q)<0)return;
  const previous=state.saved.answers[q.id];
  const history=Array.isArray(previous?.history)?[...previous.history]:(previous?[{selectedIndex:previous.selectedIndex,correct:previous.correct,at:previous.at||Date.now()}]:[]);
  const at=Date.now();const correct=index===effectiveCorrectIndex(q);
  history.push({selectedIndex:index,correct,at});
  state.saved.answers[q.id]={selectedIndex:index,correct,at,history};save();
}
function focusOption(action,id,index) {
  $$('.option-button',viewRoot).find(button=>button.dataset.action===action&&Number(button.dataset.optionIndex)===index&&(!id||button.closest('[data-question-id]')?.dataset.questionId===id))?.focus();
}
function selectPractice(index) {
  const q=getFilteredQuestions()[state.practiceIndex];if(!q||!q.alts[index])return;
  state.practiceSelections[q.id]=index;render();focusOption('select-practice',q.id,index);
}
function submitPractice(id) {
  const q=questions.find(item=>item.id===id);const index=state.practiceSelections[id];if(!q||index===undefined)return;
  recordAnswer(q,index);delete state.practiceSelections[id];state.retryUnlocked.delete(q.id);render();$('.feedback',viewRoot)?.focus();
}
function selectSimulation(index) {
  const sim=state.simulation;if(!sim||sim.done)return;
  const q=questions.find(item=>item.id===sim.ids[sim.index]);if(!q||sim.answers[q.id]||!q.alts[index])return;
  sim.pending[q.id]=index;render();focusOption('select-simulation',q.id,index);
}
function submitSimulation(id) {
  const sim=state.simulation;const q=questions.find(item=>item.id===id);const index=sim?.pending[id];
  if(!sim||sim.done||!q||index===undefined||sim.answers[id])return;
  sim.answers[id]={selectedIndex:index,correct:index===effectiveCorrectIndex(q)};delete sim.pending[id];recordAnswer(q,index);render();
  const next=$('[data-action="next-question"]',viewRoot);(next&&!next.disabled?next:$('[data-action="finish-simulation"]',viewRoot))?.focus();
}
function resetSimulation(){state.simulation=null;render();}
function renderBankPreservingOpen(id, focusAction = null, optionIndex = null) {
  const openIds=new Set($$('.bank-entry[open]',viewRoot).map(entry=>entry.dataset.questionId));if(id)openIds.add(id);
  render();
  $$('.bank-entry',viewRoot).forEach(entry=>{if(openIds.has(entry.dataset.questionId))entry.open=true;});
  if(!id)return;
  const entry=$$('.bank-entry',viewRoot).find(item=>item.dataset.questionId===id);if(!entry)return;
  const target=focusAction==='feedback'?$('.feedback',entry):focusAction==='first-option'?$('.option-button',entry):$$('[data-action]',entry).find(button=>button.dataset.action===focusAction&&(optionIndex===null||Number(button.dataset.optionIndex)===optionIndex));
  target?.focus();
}
function handleAction(button) {
  const action=button.dataset.action;
  if(action==='toggle-favorite'){const card=button.closest('[data-question-id]');const id=button.dataset.id||card?.dataset.questionId;if(id)toggleFavorite(id);else{const q=state.view==='simulado'&&state.simulation?questions.find(x=>x.id===state.simulation.ids[state.simulation.index]):getFilteredQuestions()[state.practiceIndex];if(q)toggleFavorite(q.id);}return;}
  if(action==='open-key-correction'){const q=questions.find(item=>item.id===button.dataset.id);if(q)window.CFS31AnswerKeys?.open(q);return;}
  if(action==='edit-question'){const q=questions.find(item=>item.id===button.dataset.id);if(q)window.CFS31QuestionCollab?.openEdit(q);return;}
  if(action==='question-status'){const q=questions.find(item=>item.id===button.dataset.id);if(q)window.CFS31QuestionCollab?.openStatus(q,button.dataset.statusAction);return;}
  if(action==='retry-question'){state.retryUnlocked.add(button.dataset.id);render();$('.option-button',viewRoot)?.focus();return;}
  if(action==='select-practice'){selectPractice(Number(button.dataset.optionIndex));return;}
  if(action==='submit-practice'){submitPractice(button.dataset.id);return;}
  if(action==='select-simulation'){selectSimulation(Number(button.dataset.optionIndex));return;}
  if(action==='submit-simulation'){submitSimulation(button.dataset.id);return;}
  if(action==='start-bank-answer'){state.bankResponses[button.dataset.id]={active:true,selectedIndex:null,submitted:false};state.bankRevealed.delete(button.dataset.id);renderBankPreservingOpen(button.dataset.id,'first-option');return;}
  if(action==='select-bank-answer'){const id=button.closest('[data-question-id]')?.dataset.questionId;const response=state.bankResponses[id];if(response?.active&&!response.submitted){response.selectedIndex=Number(button.dataset.optionIndex);renderBankPreservingOpen(id,'select-bank-answer',response.selectedIndex);}return;}
  if(action==='submit-bank-answer'){const id=button.dataset.id;const response=state.bankResponses[id];const q=questions.find(item=>item.id===id);if(!q||!response?.active||response.selectedIndex===null||response.selectedIndex===undefined)return;response.submitted=true;recordAnswer(q,response.selectedIndex);renderBankPreservingOpen(id,'feedback');return;}
  if(action==='retry-bank-answer'){state.bankResponses[button.dataset.id]={active:true,selectedIndex:null,submitted:false};renderBankPreservingOpen(button.dataset.id,'first-option');return;}
  if(action==='cancel-bank-answer'){delete state.bankResponses[button.dataset.id];renderBankPreservingOpen(button.dataset.id,'start-bank-answer');return;}
  if(action==='reveal-bank-key'){state.bankResponses[button.dataset.id]=null;state.bankRevealed.add(button.dataset.id);renderBankPreservingOpen(button.dataset.id,'hide-bank-key');return;}
  if(action==='hide-bank-key'){state.bankRevealed.delete(button.dataset.id);renderBankPreservingOpen(button.dataset.id,'reveal-bank-key');return;}
  if(action==='prev-question'){if(state.view==='simulado'&&state.simulation)state.simulation.index=Math.max(0,state.simulation.index-1);else state.practiceIndex=Math.max(0,state.practiceIndex-1);render();$('[data-action="prev-question"]',viewRoot)?.focus();return;}
  if(action==='next-question'){if(state.view==='simulado'&&state.simulation)state.simulation.index=Math.min(state.simulation.ids.length-1,state.simulation.index+1);else state.practiceIndex=Math.min(getFilteredQuestions().length-1,state.practiceIndex+1);render();$('[data-action="next-question"]',viewRoot)?.focus();return;}
  if(action==='start-simulation'){startSimulation();return;}
  if(action==='finish-simulation'){if(state.simulation){state.simulation.done=true;render();($('[data-action="review-simulation-errors"]',viewRoot)||$('[data-action="reset-simulation"]',viewRoot))?.focus();}return;}
  if(action==='reset-simulation'){resetSimulation();return;}
  if(action==='bank-page'){state.bankPage=Number(button.dataset.page);const page=state.bankPage;render();$$('[data-action="bank-page"]',viewRoot).find(b=>Number(b.dataset.page)===page)?.focus();return;}
  if(action==='reader-previous'||action==='reader-next'){
    const filtered=getFilteredQuestions({mode:'reader'});const index=filtered.findIndex(q=>q.id===state.readerQuestionId);const nextIndex=Math.max(0,Math.min(filtered.length-1,index+(action==='reader-next'?1:-1)));
    if(filtered[nextIndex])state.readerQuestionId=filtered[nextIndex].id;saveReaderSettings();render();$(`[data-action="${action}"]`,viewRoot)?.focus();return;
  }
  if(action==='reader-font-smaller'||action==='reader-font-larger'){
    state.readerFontScale=Math.max(.85,Math.min(1.5,Math.round((state.readerFontScale+(action==='reader-font-larger' ? .1 : -.1))*100)/100));saveReaderSettings();render();$(`[data-action="${action}"]`,viewRoot)?.focus();return;
  }
  if(action==='reader-answer'){
    const id=button.dataset.id;state.view='practice';state.onlyWrong=false;state.reviewIds=null;
    const filtered=getFilteredQuestions({mode:'practice'});const index=filtered.findIndex(q=>q.id===id);
    if(index>=0){state.practiceIndex=index;render();$('.option-button',viewRoot)?.focus();}return;
  }
  if(action==='review-wrongs'){state.onlyWrong=true;state.reviewIds=null;state.view='practice';state.practiceIndex=0;render();$('.option-button',viewRoot)?.focus();return;}
  if(action==='clear-wrong-filter'){state.onlyWrong=false;state.reviewIds=null;state.practiceIndex=0;render();return;}
  if(action==='review-simulation-errors'){const sim=state.simulation;state.reviewIds=sim.ids.filter(id=>sim.answers[id]&&!sim.answers[id].correct);state.onlyWrong=false;state.collection='all';state.discipline='all';state.topic='all';state.search='';$('#question-search').value='';$('#collection-filter').value='all';$('#discipline-filter').value='all';state.view='practice';state.practiceIndex=0;render();return;}
  if(action==='open-question'){const id=button.dataset.id;state.onlyWrong=false;state.reviewIds=null;state.collection='all';state.discipline='all';state.topic='all';state.search='';$('#question-search').value='';$('#collection-filter').value='all';$('#discipline-filter').value='all';$('#topic-filter').value='all';state.view='practice';state.practiceIndex=Math.max(0,getFilteredQuestions().findIndex(q=>q.id===id));render();return;}
  if(action==='reset-progress'){if(confirm('Apagar todas as respostas e favoritas salvas neste navegador?')){state.saved={answers:{},favorites:[]};save();render();}return;}
}
document.addEventListener('click',event=>{
  const tab=event.target.closest('[data-view]');if(tab){state.view=tab.dataset.view;state.onlyWrong=false;state.reviewIds=null;state.bankPage=1;render();return;}
  const action=event.target.closest('[data-action]');if(action){if(action.dataset.action==='toggle-favorite'&&action.closest('summary'))event.preventDefault();handleAction(action);}
});
window.addEventListener('cfs31:answerkeys-updated',()=>{if(state.view==='bank')renderBankPreservingOpen();else render();});
window.addEventListener('cfs31:questions-updated',()=>{state.bankPage=1;if(state.view==='bank')renderBankPreservingOpen();else render();});
$('#clear-filters').addEventListener('click',()=>{state.collection='all';state.discipline='all';state.topic='all';state.bankStatus='active';state.search='';state.onlyWrong=false;state.reviewIds=null;state.practiceIndex=0;state.bankPage=1;$('#question-search').value='';$('#filter-control').open=false;render();});
$('#collection-filter').addEventListener('change',event=>{state.collection=event.target.value;state.discipline='all';state.topic='all';state.practiceIndex=0;state.bankPage=1;state.onlyWrong=false;state.reviewIds=null;render();});
$('#discipline-filter').addEventListener('change',event=>{state.discipline=event.target.value;state.topic='all';state.practiceIndex=0;state.bankPage=1;state.onlyWrong=false;state.reviewIds=null;render();});
$('#topic-filter').addEventListener('change',event=>{state.topic=event.target.value;state.practiceIndex=0;state.bankPage=1;render();});
$('#bank-status-filter').addEventListener('change',event=>{state.bankStatus=event.target.value;state.bankPage=1;render();});
$('#question-search').addEventListener('input',event=>{state.search=event.target.value;state.practiceIndex=0;state.bankPage=1;render();});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();$('#question-search').focus();}if(event.key==='Escape'&&document.activeElement===$('#question-search')){$('#question-search').value='';state.search='';render();}});
function setupPwa() {
  const installButton = $('#install-app');
  const helpDialog = $('#install-help-dialog');
  let deferredPrompt = null;
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) installButton.hidden = true;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredPrompt = event; installButton.hidden = false; });
  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) { helpDialog.showModal(); return; }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
  });
  $('#close-install-help').addEventListener('click', () => helpDialog.close());
  window.addEventListener('appinstalled', () => { installButton.hidden = true; deferredPrompt = null; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => setStatus('A leitura segue disponível online; não foi possível ativar o modo offline neste navegador.'));
}
async function loadOptionalQuestionFile(file, errors) {
  try {
    const response = await fetch(file);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('o arquivo não contém uma lista JSON');
    return data;
  } catch (error) { errors.push(`${file}: ${error.message}`); return []; }
}
async function init(){
  state.saved=readSaved();
  const readerSettings=readReaderSettings();state.readerQuestionId=readerSettings.questionId;state.readerFontScale=readerSettings.fontScale;
  setupPwa();
  try{
    const response=await fetch('data/questions.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const baseQuestions=await response.json();
    if(!Array.isArray(baseQuestions)||!baseQuestions.length)throw new Error('O arquivo de questões está vazio.');
    const supplementErrors=[];
    const cfs30Questions=await loadOptionalQuestionFile('data/questions_cfs30.json',supplementErrors);
    const pendingQuestions=await loadOptionalQuestionFile('data/questions_cfs30_pending.json',supplementErrors);
    questions=[...baseQuestions,...cfs30Questions,...pendingQuestions];
    const ids=new Set();
    questions.forEach(q=>{
      if(!q||typeof q.id!=='string'||ids.has(q.id))throw new Error(`ID ausente ou duplicado: ${q?.id||'(vazio)'}`);
      ids.add(q.id);
      if(!Array.isArray(q.alts)||q.alts.length!==4)throw new Error(`${q.id}: esperadas exatamente quatro alternativas.`);
      const marked=q.alts.filter(option=>option?.ok===true).length;
      if(marked!==1&&!(marked===0&&q.keyStatus==='pending'))throw new Error(`${q.id}: precisa ter exatamente um gabarito ou estar explicitamente pendente.`);
    });
    window.CFS31QuestionCollab?.setQuestions(questions);
    const counts=new Map();questions.forEach(q=>counts.set(q.disc,(counts.get(q.disc)||0)+1));
    disciplines=[...counts].map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    render();setStatus(supplementErrors.length?`Alguns suplementos não foram carregados: ${supplementErrors.join(' · ')}`:'');
  }catch(error){setStatus(`Não foi possível carregar o banco: ${error.message}. Abra esta página por um servidor HTTP, não como arquivo local.`);viewRoot.replaceChildren();}
}
init();
