/* ============================================================
   Painel da psicóloga: consultas, abas e nova consulta
   (grade e bloqueios ficam em painel-config.js)
   ============================================================ */
let todas = [];
let filtro = 'proximas';

const ehFutura = (a) => deIso(a.data, a.hora).getTime() > Date.now();

function avisar(html, tipo = 'ok') {
  const p = $('#aviso-painel');
  p.className = `aviso-painel aviso-painel--${tipo}`;
  p.innerHTML = html;
  p.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { p.hidden = true; }, 12000);
}

/* ===== Abas ===== */
function abrirSecao(nome) {
  document.querySelectorAll('.secoes button').forEach((b) => b.setAttribute('aria-selected', b.dataset.secao === nome));
  document.querySelectorAll('main section[data-secao]').forEach((s) => { s.hidden = s.dataset.secao !== nome; });
  history.replaceState(null, '', nome === 'consultas' ? location.pathname : `#${nome}`);
  if (nome === 'grade') PainelConfig.abrirGrade();
  if (nome === 'bloqueios') PainelConfig.abrirBloqueios();
}

/* ===== Consultas ===== */
const FILTROS = {
  proximas: { teste: (a) => a.status === 'agendada' && ehFutura(a), ordem: 1, vazio: 'Nenhuma consulta marcada pela frente.' },
  passadas: { teste: (a) => a.status === 'agendada' && !ehFutura(a), ordem: -1, vazio: 'Nenhuma consulta passada esperando confirmação.' },
  historico: { teste: (a) => a.status === 'realizada', ordem: -1, vazio: 'Nenhuma consulta realizada ainda.' },
  canceladas: { teste: (a) => a.status === 'cancelada', ordem: -1, vazio: 'Nenhuma consulta cancelada.' },
};

function renderResumo() {
  const hoje = isoData(new Date());
  const fimSemana = new Date(); fimSemana.setDate(fimSemana.getDate() + 7);
  const ativas = todas.filter((a) => a.status === 'agendada');
  const nums = [
    ['Hoje', ativas.filter((a) => a.data === hoje && ehFutura(a)).length],
    ['Próximos 7 dias', ativas.filter((a) => ehFutura(a) && a.data <= isoData(fimSemana)).length],
    ['A concluir', ativas.filter((a) => !ehFutura(a)).length],
  ];
  $('#resumo-painel').innerHTML = nums.map(([r, n]) => `<div><dt>${r}</dt><dd>${n}</dd></div>`).join('');
}

function cartao(a) {
  const c = a.cliente || { nome: '(conta removida)', email: '', telefone: '' };
  const st = rotuloStatus(a);
  const el = document.createElement('article');
  el.className = 'consulta';
  const contatos = [
    c.telefone ? `<a href="${linkWhats(c.telefone)}" target="_blank" rel="noopener">${escapar(c.telefone)}</a>` : '',
    c.email ? `<a href="mailto:${escapar(c.email)}">${escapar(c.email)}</a>` : '',
  ].filter(Boolean).join(' · ');
  el.innerHTML = `
    <div class="consulta__hora">${a.hora}</div>
    <div class="consulta__info">
      <strong>${escapar(c.nome)}</strong>
      <small>${escapar(a.modalidade)} · ${a.primeira === 'Sim' ? 'Primeira consulta' : 'Retorno'}${a.criadoPor === 'psicologa' ? ' · marcada por você' : ''}</small>
      ${contatos ? `<small>${contatos}</small>` : ''}
      ${a.obs ? `<p class="consulta__obs">“${escapar(a.obs)}”</p>` : ''}
      ${a.status === 'cancelada' && a.motivoCancelamento ? `<small class="motivo">Motivo: ${escapar(a.motivoCancelamento)}</small>` : ''}
    </div>
    <div class="consulta__acoes">
      <span class="selo selo--${st.classe}">${st.texto}</span>
    </div>`;

  const acoes = el.querySelector('.consulta__acoes');
  if (a.status === 'agendada') {
    if (!ehFutura(a)) {
      const ok = document.createElement('button');
      ok.className = 'btn btn--tinta btn--sm';
      ok.textContent = 'Marcar como realizada';
      ok.addEventListener('click', () => executar(() => Api.agenda.concluir(a.id)));
      acoes.appendChild(ok);
    }
    const cx = document.createElement('button');
    cx.className = 'btn btn--linha btn--sm';
    cx.textContent = 'Cancelar consulta';
    cx.addEventListener('click', async () => {
      const r = await dialogoCancelar({
        titulo: 'Cancelar consulta?',
        texto: `<strong>${escapar(c.nome)}</strong> — ${fmtDiaLongo(a.data)}, às ${a.hora}.`,
        pedirMotivo: true,
      });
      if (r.ok) executar(() => Api.agenda.cancelar(a.id, r.motivo));
    });
    acoes.appendChild(cx);
  }
  return el;
}

function renderLista() {
  const f = FILTROS[filtro];
  const lista = todas.filter(f.teste)
    .sort((x, y) => f.ordem * (x.data + x.hora).localeCompare(y.data + y.hora));
  const alvo = $('#agenda-painel');
  alvo.innerHTML = '';
  if (!lista.length) { alvo.innerHTML = `<p class="vazio">${f.vazio}</p>`; return; }

  let diaAtual = null;
  let grupo = null;
  lista.forEach((a) => {
    if (a.data !== diaAtual) {
      diaAtual = a.data;
      grupo = document.createElement('section');
      grupo.className = 'dia-grupo';
      grupo.innerHTML = `<h2>${fmtDiaLongo(a.data)}</h2>`;
      alvo.appendChild(grupo);
    }
    grupo.appendChild(cartao(a));
  });
}

async function executar(acao) {
  try {
    await acao();
    await carregar();
  } catch (ex) {
    avisar(escapar(ex.message), 'erro');
  }
}

async function carregar() {
  todas = await Api.agenda.todas();
  renderResumo();
  renderLista();
}

/* ===== Nova consulta em nome de um cliente ===== */
const nova = { modo: 'existente', clienteId: null, hora: null, bloqueios: [], grade: {} };

function modoCliente(modo) {
  nova.modo = modo;
  document.querySelectorAll('#dlg-nova .abas button').forEach((b) => b.setAttribute('aria-selected', b.dataset.modo === modo));
  $('#cli-existente').hidden = modo !== 'existente';
  $('#cli-novo').hidden = modo !== 'novo';
  (modo === 'novo' ? $('#form-nova [name="cNome"]') : $('#cli-busca')).focus();
}

async function buscarClientes() {
  const ul = $('#cli-lista');
  const lista = await Api.clientes.listar($('#cli-busca').value);
  ul.innerHTML = '';
  if (!lista.length) {
    ul.innerHTML = '<li class="vazio">Nenhum cliente encontrado. Use “Cadastrar novo”.</li>';
    return;
  }
  lista.slice(0, 8).forEach((c) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', c.id === nova.clienteId);
    b.innerHTML = `<strong>${escapar(c.nome)}</strong>
      <small>${escapar([c.telefone, c.email].filter(Boolean).join(' · '))}${c.temAcesso ? '' : ' · sem acesso ao site'}</small>`;
    b.addEventListener('click', () => {
      nova.clienteId = c.id;
      ul.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', x === b));
    });
    li.appendChild(b);
    ul.appendChild(li);
  });
}

function renderHorasNova() {
  const alvo = $('#nova-horas');
  const iso = $('#form-nova [name="data"]').value;
  alvo.innerHTML = '';
  nova.hora = null;
  if (!iso) { alvo.innerHTML = '<p class="vazio">Escolha a data para ver os horários da grade.</p>'; return; }

  const grade = nova.grade[deIso(iso).getDay()] || [];
  if (!grade.length) { alvo.innerHTML = '<p class="vazio">Você não atende neste dia da semana. Use o encaixe abaixo.</p>'; return; }

  const ocupadas = new Set(todas.filter((a) => a.status === 'agendada' && a.data === iso).map((a) => a.hora));
  const bloqueada = (h) => nova.bloqueios.some((b) => b.de <= iso && iso <= b.ate && (!b.hora || b.hora === h));
  grade.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hora';
    b.textContent = h;
    const passou = deIso(iso, h).getTime() < Date.now();
    if (ocupadas.has(h) || passou) {
      b.disabled = true;
      b.title = passou ? 'Horário já passou' : 'Já tem consulta';
    } else if (bloqueada(h)) {
      b.classList.add('hora--bloq');
      b.title = 'Bloqueado — você ainda pode agendar';
    }
    b.addEventListener('click', () => {
      nova.hora = h;
      $('#form-nova [name="horaEncaixe"]').value = '';
      alvo.querySelectorAll('.hora').forEach((x) => x.classList.toggle('hora--sel', x === b));
    });
    alvo.appendChild(b);
  });
}

async function abrirNova() {
  const f = $('#form-nova');
  f.reset();
  f.querySelector('.erro').hidden = true;
  nova.clienteId = null;
  nova.hora = null;
  try {
    const [cfg, bloqueios] = await Promise.all([Api.config.obter(), Api.bloqueios.listar()]);
    nova.grade = cfg.grade;
    nova.bloqueios = bloqueios;
  } catch (ex) { avisar(escapar(ex.message), 'erro'); return; }
  f.querySelector('[name="data"]').min = isoData(new Date());
  modoCliente('existente');
  renderHorasNova();
  await buscarClientes();
  $('#dlg-nova').showModal();
  $('#cli-busca').focus();
}

async function salvarNova(e) {
  e.preventDefault();
  const f = e.target;
  const erro = f.querySelector('.erro');
  const d = Object.fromEntries(new FormData(f));
  const hora = d.horaEncaixe || nova.hora;
  const mostrar = (msg) => { erro.textContent = msg; erro.hidden = false; };

  if (nova.modo === 'existente' && !nova.clienteId) return mostrar('Escolha o cliente na lista ou cadastre um novo.');
  if (nova.modo === 'novo') {
    if (!d.cNome.trim()) return mostrar('Informe o nome do cliente.');
    if (!celularValido(d.cTelefone)) return mostrar('Informe o WhatsApp do cliente com DDD (11 números).');
    if (d.cEmail && !emailValido(d.cEmail)) return mostrar('O e-mail do cliente não parece válido.');
  }
  if (!d.data || !hora) return mostrar('Escolha a data e um horário (da grade ou de encaixe).');

  const botao = f.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    if (nova.modo === 'novo') {
      const c = await Api.clientes.criar({ nome: d.cNome, telefone: d.cTelefone, email: d.cEmail });
      // se o agendamento falhar, o cliente já fica salvo e selecionado
      nova.clienteId = c.id;
      modoCliente('existente');
      $('#cli-busca').value = c.nome;
      await buscarClientes();
    }
    const ag = await Api.agenda.criar({
      usuarioId: nova.clienteId, data: d.data, hora,
      modalidade: d.modalidade, primeira: d.primeira, obs: d.obs.trim(),
    });
    $('#dlg-nova').close();
    await carregar();
    abrirSecao('consultas');
    const c = ag.cliente;
    const msg = `Olá, ${c.nome.split(' ')[0]}! Sua consulta com ${CONFIG.nome} ficou marcada para ${fmtDiaLongo(ag.data)}, às ${ag.hora} (${ag.modalidade}).`;
    avisar(`Consulta de <strong>${escapar(c.nome)}</strong> marcada para ${fmtDiaLongo(ag.data)}, às ${ag.hora}.
      ${c.telefone ? `<a href="${linkWhats(c.telefone, msg)}" target="_blank" rel="noopener">Avisar pelo WhatsApp</a>` : ''}`);
  } catch (ex) {
    mostrar(ex.message);
  } finally {
    botao.disabled = false;
  }
}

/* ===== Início ===== */
document.addEventListener('DOMContentLoaded', async () => {
  const u = await Api.auth.atual();
  if (!u) { location.href = 'entrar.html?volta=painel.html'; return; }
  if (u.perfil !== 'psicologa') { location.href = 'minha-conta.html'; return; }
  renderContaNav(u);

  document.querySelectorAll('.secoes button').forEach((b) => b.addEventListener('click', () => abrirSecao(b.dataset.secao)));
  document.querySelectorAll('.filtros button').forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro;
    document.querySelectorAll('.filtros button').forEach((x) => x.setAttribute('aria-selected', x === b));
    renderLista();
  }));

  // nova consulta
  $('#btn-nova').addEventListener('click', abrirNova);
  $('#nova-fechar').addEventListener('click', () => $('#dlg-nova').close());
  document.querySelectorAll('#dlg-nova .abas button').forEach((b) => b.addEventListener('click', () => modoCliente(b.dataset.modo)));
  let espera;
  $('#cli-busca').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(buscarClientes, 200); });
  $('#form-nova [name="data"]').addEventListener('change', renderHorasNova);
  $('#form-nova [name="horaEncaixe"]').addEventListener('input', () => {
    nova.hora = null;
    document.querySelectorAll('#nova-horas .hora').forEach((x) => x.classList.remove('hora--sel'));
  });
  const tel = $('#form-nova [name="cTelefone"]');
  tel.addEventListener('input', () => { tel.value = mascaraCelular(tel.value); });
  $('#form-nova').addEventListener('submit', salvarNova);

  PainelConfig.iniciar();

  try {
    await carregar();
  } catch (ex) {
    $('#agenda-painel').innerHTML = `<p class="vazio">${escapar(ex.message)}</p>`;
  }
  const inicial = location.hash.slice(1);
  if (inicial === 'grade' || inicial === 'bloqueios') abrirSecao(inicial);
});
