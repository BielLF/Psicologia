/* ============================================================
   Página inicial: próximos horários + agendamento (exige login)
   ============================================================ */
const PENDENTE = 'psi_agendamento_pendente';   // horário escolhido antes de fazer login

const estado = {
  mes: (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })(),
  data: null,
  hora: null,
  usuario: null,
  agenda: montarAgenda({ grade: {}, antecedenciaHoras: 0, janelaDias: 0 }, []),
};

/* ===== Disponibilidade (grade + ocupados + bloqueios vêm do banco) ===== */
async function carregarOcupados() {
  const cfg = await Api.config.obter();
  const fim = new Date(); fim.setDate(fim.getDate() + cfg.janelaDias);
  const lista = await Api.agenda.ocupados(isoData(new Date()), isoData(fim));
  estado.agenda = montarAgenda(cfg, lista);
}

const horariosLivres = (iso) => estado.agenda.livres(iso);
const dentroDaJanela = (d) => estado.agenda.dentroDaJanela(d);

/* ===== Próximos horários (hero) =====
   Os 3 primeiros horários livres a partir de agora, em ordem (podem ser no mesmo dia).
   `livres()` já descarta horários passados e os que não respeitam a antecedência mínima. */
function renderProximos() {
  const ul = $('#proximos-lista');
  const itens = [];
  const d = new Date(); d.setHours(0, 0, 0, 0);
  for (let i = 0; i <= estado.agenda.cfg.janelaDias && itens.length < 3; i++) {
    const iso = isoData(d);
    horariosLivres(iso).slice(0, 3 - itens.length).forEach((hora) => itens.push({ iso, hora }));
    d.setDate(d.getDate() + 1);
  }
  ul.innerHTML = '';
  if (!itens.length) {
    ul.innerHTML = '<li class="proximos__vazio">Agenda cheia no momento. Fale comigo pelo WhatsApp.</li>';
    return;
  }
  itens.forEach(({ iso, hora }) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span>${fmtDiaCurto(iso)}</span><strong>${hora}</strong>`;
    b.addEventListener('click', () => {
      selecionarData(iso);
      selecionarHora(hora);
      if (!estado.usuario) { irParaDados(); return; }   // guarda o horário e vai para o login
      $('#agendar').scrollIntoView();
    });
    li.appendChild(b);
    ul.appendChild(li);
  });
}

/* ===== Calendário ===== */
function renderCalendario() {
  const m = estado.mes;
  const titulo = m.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  $('#mes-titulo').textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const limite = new Date(hoje); limite.setDate(limite.getDate() + estado.agenda.cfg.janelaDias);
  $('#mes-ant').disabled = m <= mesAtual;
  $('#mes-prox').disabled = new Date(m.getFullYear(), m.getMonth() + 1, 1) > limite;

  const grid = $('#cal-dias');
  grid.innerHTML = '';
  for (let i = 0; i < m.getDay(); i++) grid.appendChild(document.createElement('span'));

  const total = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  for (let dia = 1; dia <= total; dia++) {
    const d = new Date(m.getFullYear(), m.getMonth(), dia);
    const iso = isoData(d);
    const livre = dentroDaJanela(d) && horariosLivres(iso).length > 0;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dia';
    b.textContent = dia;
    if (+d === +hoje) b.classList.add('dia--hoje');
    if (livre) {
      b.classList.add('dia--livre');
      b.setAttribute('aria-label', `${fmtDiaLongo(iso)}, com horários livres`);
      b.addEventListener('click', () => selecionarData(iso));
    } else {
      b.disabled = true;
    }
    if (iso === estado.data) b.classList.add('dia--sel');
    grid.appendChild(b);
  }
}

function selecionarData(iso) {
  estado.data = iso;
  estado.hora = null;
  const d = deIso(iso);
  estado.mes = new Date(d.getFullYear(), d.getMonth(), 1);
  renderCalendario();
  renderHorarios();
  atualizarResumo();
}

function renderHorarios() {
  const lista = $('#horarios-lista');
  lista.innerHTML = '';
  if (!estado.data) return;
  $('#horarios-titulo').textContent = fmtDiaLongo(estado.data);
  const livres = horariosLivres(estado.data);
  if (!livres.length) {
    lista.innerHTML = '<p class="vazio">Sem horários livres neste dia. Escolha outra data.</p>';
    return;
  }
  livres.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hora' + (h === estado.hora ? ' hora--sel' : '');
    b.textContent = h;
    b.setAttribute('aria-pressed', h === estado.hora);
    b.addEventListener('click', () => selecionarHora(h));
    lista.appendChild(b);
  });
}

function selecionarHora(h) {
  estado.hora = h;
  renderHorarios();
  atualizarResumo();
}

const modalidade = () => 'Online';     // a profissional só atende online
const textoSelecao = () => `${modalidade()} · ${fmtDiaLongo(estado.data)}, às ${estado.hora}`;

function atualizarResumo() {
  const ok = estado.data && estado.hora;
  $('#resumo-sel').textContent = ok ? textoSelecao() : 'Nenhum horário escolhido.';
  $('#ir-dados').disabled = !ok;
  $('#ir-dados').textContent = ok && !estado.usuario ? 'Entrar para continuar' : 'Continuar';
}

/* ===== Etapas ===== */
function mostrarEtapa(n) {
  document.querySelectorAll('.agenda__etapa').forEach((el) => { el.hidden = el.dataset.etapa !== String(n); });
  $('#agenda').scrollIntoView({ block: 'start' });
}

function irParaDados() {
  const u = estado.usuario;
  if (!u) {
    // guarda o horário e manda para o login; ao voltar, retoma daqui
    sessionStorage.setItem(PENDENTE, JSON.stringify({ data: estado.data, hora: estado.hora, modalidade: modalidade() }));
    location.href = `entrar.html?volta=${encodeURIComponent('index.html#agendar')}`;
    return;
  }
  const erro = $('#erro-dados');
  erro.hidden = true;
  $('#resumo-dados').textContent = textoSelecao();
  $('#agendando-como').innerHTML =
    `Agendando como <strong>${escapar(u.nome)}</strong> · ${escapar(u.email)}${u.telefone ? ` · ${escapar(u.telefone)}` : ''}`;
  if (u.perfil === 'psicologa') {
    erro.textContent = 'Você entrou como psicóloga. Para agendar, use uma conta de cliente.';
    erro.hidden = false;
  }
  mostrarEtapa(2);
}

async function confirmar(e) {
  e.preventDefault();
  const f = e.target;
  const erro = $('#erro-dados');
  const botao = f.querySelector('[type="submit"]');
  const dados = Object.fromEntries(new FormData(f));
  botao.disabled = true;
  try {
    const ag = await Api.agenda.criar({
      data: estado.data, hora: estado.hora, modalidade: modalidade(),
      primeira: dados.primeira, obs: (dados.obs || '').trim(),
    });
    erro.hidden = true;
    $('#confirmado-texto').innerHTML =
      `<strong>${escapar(ag.cliente.nome)}</strong>, sua consulta ficou para <strong>${textoSelecao()}</strong>.`;
    const msg = `Olá, ${CONFIG.nome}! Acabei de agendar uma consulta pelo site: ${textoSelecao()}. Nome: ${ag.cliente.nome}.`;
    $('#link-whats').href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;
    f.reset();
    await carregarOcupados();
    renderProximos();
    renderCalendario();
    mostrarEtapa(3);
  } catch (ex) {
    erro.textContent = ex.message;
    erro.hidden = false;
    if (ex.status === 409) { await carregarOcupados(); renderCalendario(); renderHorarios(); renderProximos(); }
  } finally {
    botao.disabled = false;
  }
}

function retomarPendente() {
  const raw = sessionStorage.getItem(PENDENTE);
  if (!raw) return;
  sessionStorage.removeItem(PENDENTE);
  if (!estado.usuario) return;
  try {
    const p = JSON.parse(raw);
    selecionarData(p.data);
    if (horariosLivres(p.data).includes(p.hora)) {
      selecionarHora(p.hora);
      irParaDados();
    } else {
      $('#resumo-sel').textContent = 'O horário que você escolheu foi ocupado. Escolha outro.';
    }
  } catch { /* ignora */ }
}

/* ===== Início ===== */
document.addEventListener('DOMContentLoaded', async () => {
  iniciarMenuMobile();

  $('#mes-ant').addEventListener('click', () => { estado.mes.setMonth(estado.mes.getMonth() - 1); renderCalendario(); });
  $('#mes-prox').addEventListener('click', () => { estado.mes.setMonth(estado.mes.getMonth() + 1); renderCalendario(); });
  $('#ir-dados').addEventListener('click', irParaDados);
  $('#voltar').addEventListener('click', () => mostrarEtapa(1));
  $('#form-dados').addEventListener('submit', confirmar);
  $('#novo').addEventListener('click', () => {
    estado.data = null; estado.hora = null;
    $('#horarios-titulo').textContent = 'Escolha uma data';
    $('#horarios-lista').innerHTML = '<p class="vazio">Os dias com horário livre aparecem destacados no calendário.</p>';
    renderCalendario(); atualizarResumo(); mostrarEtapa(1);
  });

  estado.usuario = await Api.auth.atual();
  renderContaNav(estado.usuario);
  // sem login, a grade e os horários ficam escondidos
  $('#agenda-login').hidden = !!estado.usuario;
  document.querySelector('.agenda__etapa[data-etapa="1"]').hidden = !estado.usuario;
  try {
    await carregarOcupados();
  } catch (ex) {
    $('#proximos-lista').innerHTML = `<li class="proximos__vazio">${escapar(ex.message)}</li>`;
  }
  renderProximos();
  renderCalendario();
  atualizarResumo();
  retomarPendente();
});
