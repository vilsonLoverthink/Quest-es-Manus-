const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const STORAGE_KEY = 'cfs31-quiz-app-v1';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const state = {
  view: 'practice', discipline: 'all', topic: 'all', search: '', practiceIndex: 0,
  bankPage: 1, onlyWrong: false, reviewIds: null, retryUnlocked: new Set(), simulation: null,
  saved: { answers: {}, favorites: [] }
};
let questions = [];
let disciplines = [];
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
function getFilteredQuestions() {
  const needle = normalize(state.search.trim());
  return questions.filter(q => {
    if (state.discipline !== 'all' && q.disc !== state.discipline) return false;
    if (state.topic !== 'all' && (q.assunto || 'Geral') !== state.topic) return false;
    if (state.reviewIds && !state.reviewIds.includes(q.id)) return false;
    if (state.onlyWrong && (!state.saved.answers[q.id] || state.saved.answers[q.id].correct)) return false;
    if (!needle) return true;
    const searchable = normalize([q.disc, q.assunto, q.enunciado, q.resolucao, getText(q.base), ...(q.alts || []).map(a => a.t)].join(' '));
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
  $('#side-count').textContent = questions.length;
  $('#side-total').textContent = disciplines.length;
  const filtered = getFilteredQuestions();
  $('#result-count').textContent = `${filtered.length} de ${questions.length} questões`;
}
function renderDisciplineControls() {
  const select = $('#discipline-filter');
  select.replaceChildren(new Option('Todas as disciplinas', 'all'));
  disciplines.forEach(d => select.add(new Option(`${d.name} (${d.count})`, d.name)));
  select.value = state.discipline;
  const topicSelect = $('#topic-filter');
  const topics = [...new Set(questions.filter(q => state.discipline === 'all' || q.disc === state.discipline).map(q => q.assunto || 'Geral'))].sort((a,b) => a.localeCompare(b,'pt-BR'));
  topicSelect.replaceChildren(new Option('Todos os assuntos', 'all'));
  topics.forEach(topic => topicSelect.add(new Option(topic, topic)));
  if (state.topic !== 'all' && !topics.includes(state.topic)) state.topic = 'all';
  topicSelect.value = state.topic;
  const list = $('#discipline-list');
  list.replaceChildren();
  const all = node('button', `discipline-item${state.discipline === 'all' ? ' is-selected' : ''}`);
  all.type = 'button'; all.dataset.subject = 'all';
  all.setAttribute('aria-pressed', String(state.discipline === 'all'));
  all.append(node('span', '', 'Todas as disciplinas'), node('span', '', questions.length));
  list.appendChild(all);
  disciplines.forEach(d => {
    const button = node('button', `discipline-item${state.discipline === d.name ? ' is-selected' : ''}`);
    button.type = 'button'; button.dataset.subject = d.name;
    button.setAttribute('aria-pressed', String(state.discipline === d.name));
    button.append(node('span', '', d.name), node('span', '', d.count));
    list.appendChild(button);
  });
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
  if (base) {
    wrap.appendChild(node('h3', '', 'Referência'));
    const p = node('p'); appendMarkedText(p, base); wrap.appendChild(p);
  }
  return wrap;
}
function optionOrder(q, shuffle = false) {
  const arr = q.alts.map((_, i) => i);
  if (!shuffle) return arr;
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function createOptions(q, order, selectedIndex = null, locked = false, revealCorrect = true) {
  const list = node('div', 'options-list');
  order.forEach((actualIndex, shownIndex) => {
    const alt = q.alts[actualIndex];
    const button = node('button', 'option-button');
    button.type = 'button'; button.dataset.action = state.view === 'simulado' ? 'answer-simulation' : 'answer-practice';
    button.dataset.optionIndex = actualIndex; button.disabled = locked;
    if (locked && revealCorrect && alt.ok) button.classList.add('is-correct');
    if (locked && revealCorrect && actualIndex === selectedIndex && !alt.ok) button.classList.add('is-wrong');
    if (locked && !revealCorrect && actualIndex === selectedIndex) button.classList.add('is-selected');
    button.append(node('span', 'option-letter', LETTERS[shownIndex] || String(shownIndex + 1)));
    const text = node('span', ''); appendMarkedText(text, alt.t); button.appendChild(text);
    let status = '';
    if (locked && revealCorrect && alt.ok) status = actualIndex === selectedIndex ? 'Correta · sua resposta' : 'Correta';
    else if (locked && revealCorrect && actualIndex === selectedIndex) status = 'Sua resposta';
    else if (locked && !revealCorrect && actualIndex === selectedIndex) status = 'Resposta registrada';
    if (status) button.appendChild(node('strong', 'option-status', status));
    list.appendChild(button);
  });
  return list;
}
function feedback(q, selectedIndex) {
  const correct = q.alts[selectedIndex]?.ok === true;
  const wrap = node('section', `feedback${correct ? '' : ' is-wrong'}`);
  wrap.setAttribute('aria-live', 'polite'); wrap.tabIndex = -1;
  wrap.appendChild(node('p', 'feedback-title', correct ? 'Resposta correta' : 'Resposta incorreta'));
  if (!correct) {
    const right = q.alts.find(a => a.ok === true);
    const p = node('p', 'feedback-copy');
    p.append('A alternativa correta é: ');
    const strong = node('strong', '', getText(right?.t)); p.appendChild(strong); wrap.appendChild(p);
    const reason = getText(q.alts[selectedIndex]?.motivo);
    if (reason) { const why = node('p', 'feedback-copy'); why.style.marginTop = '6px'; appendMarkedText(why, reason); wrap.appendChild(why); }
  }
  wrap.appendChild(createExplanation(q));
  return wrap;
}
function makeQuestionCard(q, options = {}) {
  const { order = optionOrder(q), selectedIndex = null, locked = false, showControls = true, position = null, total = null } = options;
  const card = node('article', 'question-card');
  card.dataset.questionId = q.id;
  if (position !== null && total) {
    const cap = node('div', 'practice-caption'); cap.append(node('span', '', `${position + 1} / ${total}`), node('span', '', `${q.disc} · ${q.assunto || 'Questão'}`));
    card.appendChild(cap); card.appendChild(createProgressTrack(position + 1, total));
  }
  const top = node('div', 'question-top');
  const meta = node('div', 'question-meta');
  meta.append(node('span', 'pill', q.disc), node('span', 'pill topic', q.assunto || 'Geral'), node('span', 'question-id', q.id));
  const fav = node('button', `favorite-button${favorite(q.id) ? ' is-favorite' : ''}`);
  fav.type = 'button'; fav.dataset.action = 'toggle-favorite'; fav.setAttribute('aria-label', favorite(q.id) ? 'Remover questão das favoritas' : 'Adicionar questão às favoritas'); fav.textContent = favorite(q.id) ? '★' : '☆';
  top.append(meta, fav); card.appendChild(top);
  const body = node('div', 'question-body');
  const prompt = node('p', 'question-text'); appendMarkedText(prompt, q.enunciado); body.appendChild(prompt);
  body.appendChild(createOptions(q, order, selectedIndex, locked, state.view !== 'simulado'));
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
  card.appendChild(body);
  return card;
}
function renderPractice() {
  const filtered = getFilteredQuestions();
  if (!filtered.length) {
    const emptyTitle=state.onlyWrong?'Sem erros para revisar':state.reviewIds?'Sem erros nesta rodada':'Nenhuma questão encontrada';
    const emptyCopy=state.onlyWrong||state.reviewIds?'Não há questões pendentes nesta revisão.':'Tente ajustar a busca ou escolher outra disciplina.';
    viewRoot.append(heading('MODO DE ESTUDO', emptyTitle, emptyCopy));
    if (state.onlyWrong) { const b = node('button', 'button', 'Voltar para todas as questões'); b.type = 'button'; b.dataset.action = 'clear-wrong-filter'; viewRoot.appendChild(b); }
    return;
  }
  state.practiceIndex = Math.max(0, Math.min(state.practiceIndex, filtered.length - 1));
  const q = filtered[state.practiceIndex];
  const practiceTitle = state.onlyWrong ? 'Revisão dos seus erros' : state.reviewIds ? 'Revisão dos erros do simulado' : 'Praticar questão por questão';
  viewRoot.append(heading('MODO DE ESTUDO', practiceTitle, 'Responda no seu ritmo. A resolução aparece logo após a escolha.'));
  const savedAnswer = state.saved.answers[q.id];
  const locked = !!savedAnswer && !state.retryUnlocked.has(q.id);
  viewRoot.appendChild(makeQuestionCard(q, { selectedIndex: locked ? savedAnswer.selectedIndex : null, locked, position: state.practiceIndex, total: filtered.length }));
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
  state.simulation = { ids: selected.map(q => q.id), orders, answers: {}, index: 0, done: false };
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
  viewRoot.append(heading('MODO DE AVALIAÇÃO', 'Simulado em andamento', 'Responda todas ou finalize a rodada quando quiser.'));
  const status=node('div','simulation-progress'); status.append(node('span','',`Questão ${sim.index+1} de ${sim.ids.length}`),node('span','',`${Object.keys(sim.answers).length} respondida(s)`)); viewRoot.appendChild(status);
  const answer=sim.answers[q.id];
  viewRoot.appendChild(makeQuestionCard(q,{order:sim.orders[q.id]||optionOrder(q),selectedIndex:answer?answer.selectedIndex:null,locked:!!answer,position:sim.index,total:sim.ids.length}));
}
function renderBank() {
  const filtered=getFilteredQuestions();
  viewRoot.append(heading('CONSULTA', 'Banco de questões', 'Abra uma questão para ver alternativas, gabarito, resolução e referência.'));
  if (!filtered.length) { viewRoot.appendChild(node('div','empty-state','Nenhuma questão corresponde aos filtros.')); return; }
  const perPage=20; const pages=Math.max(1,Math.ceil(filtered.length/perPage)); state.bankPage=Math.min(state.bankPage,pages);
  const start=(state.bankPage-1)*perPage;
  const list=node('div','bank-list');
  filtered.slice(start,start+perPage).forEach(q=>{
    const details=node('details','bank-entry'); details.dataset.questionId=q.id; const summary=node('summary','bank-summary');
    const main=node('div','bank-summary-main'); const meta=node('div','bank-meta'); meta.append(node('span','pill',q.disc),node('span','pill topic',q.assunto||'Geral'),node('span','question-id',q.id));
    main.append(meta,node('p','bank-question',q.enunciado)); summary.appendChild(main);
    const favoriteBtn=node('button',`favorite-button bank-fav${favorite(q.id)?' is-favorite':''}`); favoriteBtn.type='button'; favoriteBtn.dataset.action='toggle-favorite'; favoriteBtn.dataset.id=q.id; favoriteBtn.setAttribute('aria-label',favorite(q.id)?'Remover questão das favoritas':'Adicionar questão às favoritas'); favoriteBtn.textContent=favorite(q.id)?'★':'☆'; summary.appendChild(favoriteBtn);
    details.appendChild(summary);
    const detail=node('div','bank-detail'); detail.appendChild(createOptions(q,optionOrder(q),null,true,true)); detail.appendChild(createExplanation(q)); details.appendChild(detail); list.appendChild(details);
  });
  viewRoot.appendChild(list);
  if(pages>1){const nav=node('div','pagination');const prev=node('button','button','Anterior');prev.type='button';prev.dataset.action='bank-page';prev.dataset.page=state.bankPage-1;prev.disabled=state.bankPage<=1;const next=node('button','button','Próxima');next.type='button';next.dataset.action='bank-page';next.dataset.page=state.bankPage+1;next.disabled=state.bankPage>=pages;nav.append(prev,node('span','','Página '+state.bankPage+' de '+pages),next);viewRoot.appendChild(nav);}
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
  if(!q.alts[index])return;
  const previous=state.saved.answers[q.id];
  const history=Array.isArray(previous?.history)?[...previous.history]:(previous?[{selectedIndex:previous.selectedIndex,correct:previous.correct,at:previous.at||Date.now()}]:[]);
  const at=Date.now();const correct=q.alts[index].ok===true;
  history.push({selectedIndex:index,correct,at});
  state.saved.answers[q.id]={selectedIndex:index,correct,at,history};save();
}
function answerPractice(index) {
  const list=getFilteredQuestions();const q=list[state.practiceIndex];if(!q)return;
  recordAnswer(q,index);state.retryUnlocked.delete(q.id);render();$('.feedback',viewRoot)?.focus();
}
function answerSimulation(index) {
  const sim=state.simulation;if(!sim||sim.done)return;
  const q=questions.find(x=>x.id===sim.ids[sim.index]);if(!q||sim.answers[q.id])return;
  const correct=q.alts[index]?.ok===true;sim.answers[q.id]={selectedIndex:index,correct};recordAnswer(q,index);render();
  const next=$('[data-action="next-question"]',viewRoot);(next&&!next.disabled?next:$('[data-action="finish-simulation"]',viewRoot))?.focus();
}
function resetSimulation(){state.simulation=null;render();}
function handleAction(button) {
  const action=button.dataset.action;
  if(action==='toggle-favorite'){const card=button.closest('[data-question-id]');const id=button.dataset.id||card?.dataset.questionId;if(id)toggleFavorite(id);else{const q=state.view==='simulado'&&state.simulation?questions.find(x=>x.id===state.simulation.ids[state.simulation.index]):getFilteredQuestions()[state.practiceIndex];if(q)toggleFavorite(q.id);}return;}
  if(action==='retry-question'){state.retryUnlocked.add(button.dataset.id);render();$('.option-button',viewRoot)?.focus();return;}
  if(action==='answer-practice'){answerPractice(Number(button.dataset.optionIndex));return;}
  if(action==='answer-simulation'){answerSimulation(Number(button.dataset.optionIndex));return;}
  if(action==='prev-question'){if(state.view==='simulado'&&state.simulation)state.simulation.index=Math.max(0,state.simulation.index-1);else state.practiceIndex=Math.max(0,state.practiceIndex-1);render();$('[data-action="prev-question"]',viewRoot)?.focus();return;}
  if(action==='next-question'){if(state.view==='simulado'&&state.simulation)state.simulation.index=Math.min(state.simulation.ids.length-1,state.simulation.index+1);else state.practiceIndex=Math.min(getFilteredQuestions().length-1,state.practiceIndex+1);render();$('[data-action="next-question"]',viewRoot)?.focus();return;}
  if(action==='start-simulation'){startSimulation();return;}
  if(action==='finish-simulation'){if(state.simulation){state.simulation.done=true;render();($('[data-action="review-simulation-errors"]',viewRoot)||$('[data-action="reset-simulation"]',viewRoot))?.focus();}return;}
  if(action==='reset-simulation'){resetSimulation();return;}
  if(action==='bank-page'){state.bankPage=Number(button.dataset.page);const page=state.bankPage;render();$$('[data-action="bank-page"]',viewRoot).find(b=>Number(b.dataset.page)===page)?.focus();return;}
  if(action==='review-wrongs'){state.onlyWrong=true;state.reviewIds=null;state.view='practice';state.practiceIndex=0;render();$('.option-button',viewRoot)?.focus();return;}
  if(action==='clear-wrong-filter'){state.onlyWrong=false;state.reviewIds=null;state.practiceIndex=0;render();return;}
  if(action==='review-simulation-errors'){const sim=state.simulation;state.reviewIds=sim.ids.filter(id=>sim.answers[id]&&!sim.answers[id].correct);state.onlyWrong=false;state.discipline='all';state.topic='all';state.search='';$('#question-search').value='';$('#discipline-filter').value='all';state.view='practice';state.practiceIndex=0;render();return;}
  if(action==='open-question'){const id=button.dataset.id;state.onlyWrong=false;state.reviewIds=null;state.discipline='all';state.topic='all';state.search='';$('#question-search').value='';$('#discipline-filter').value='all';$('#topic-filter').value='all';state.view='practice';state.practiceIndex=Math.max(0,getFilteredQuestions().findIndex(q=>q.id===id));render();return;}
  if(action==='reset-progress'){if(confirm('Apagar todas as respostas e favoritas salvas neste navegador?')){state.saved={answers:{},favorites:[]};save();render();}return;}
}
document.addEventListener('click',event=>{
  const tab=event.target.closest('[data-view]');if(tab){state.view=tab.dataset.view;state.onlyWrong=false;state.reviewIds=null;state.bankPage=1;render();return;}
  const subject=event.target.closest('[data-subject]');if(subject){state.discipline=subject.dataset.subject;state.topic='all';state.practiceIndex=0;state.bankPage=1;state.onlyWrong=false;state.reviewIds=null;$('#discipline-filter').value=state.discipline;render();$('.discipline-item[aria-pressed="true"]')?.focus();return;}
  const action=event.target.closest('[data-action]');if(action){if(action.dataset.action==='toggle-favorite'&&action.closest('summary'))event.preventDefault();handleAction(action);}
});
$('#discipline-filter').addEventListener('change',event=>{state.discipline=event.target.value;state.topic='all';state.practiceIndex=0;state.bankPage=1;state.onlyWrong=false;state.reviewIds=null;render();});
$('#topic-filter').addEventListener('change',event=>{state.topic=event.target.value;state.practiceIndex=0;state.bankPage=1;render();});
$('#question-search').addEventListener('input',event=>{state.search=event.target.value;state.practiceIndex=0;state.bankPage=1;render();});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();$('#question-search').focus();}if(event.key==='Escape'&&document.activeElement===$('#question-search')){$('#question-search').value='';state.search='';render();}});
async function init(){
  state.saved=readSaved();
  try{
    const response=await fetch('data/questions.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);
    questions=await response.json();
    if(!Array.isArray(questions)||!questions.length)throw new Error('O arquivo de questões está vazio.');
    const counts=new Map();questions.forEach(q=>counts.set(q.disc,(counts.get(q.disc)||0)+1));
    disciplines=[...counts].map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    render();setStatus('');
  }catch(error){setStatus(`Não foi possível carregar o banco: ${error.message}. Abra esta página por um servidor HTTP, não como arquivo local.`);viewRoot.replaceChildren();}
}
init();
