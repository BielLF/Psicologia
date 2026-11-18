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
  if (nome === 'clientes') PainelClientes.abrir();
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
      <strong>${escapar(c.nome)}</strong>${c.excluido ? ' <small class="motivo">(cadastro encerrado)</small>' : ''}
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

  const diaTodo = nova.bloqueios.find((b) => !b.hora && b.de <= iso && iso <= b.ate);
  if (diaTodo) {
    alvo.innerHTML = `<p class="vazio aviso-bloq">Dia bloqueado${diaTodo.motivo ? ` (${escapar(diaTodo.motivo)})` : ''}. Para agendar, remova o bloqueio na aba Bloqueios.</p>`;
    return;
  }
  const grade = nova.grade[deIso(iso).getDay()] || [];
  if (!grade.length) { alvo.innerHTML = '<p class="vazio">Você não atende neste dia da semana. Use o encaixe abaixo.</p>'; return; }

  const ocupadas = new Set(todas.filter((a) => a.status === 'agendada' && a.data === iso).map((a) => a.hora));
  grade.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hora';
    b.textContent = h;
    const passou = deIso(iso, h).getTime() < Date.now();
    const bloq = bloqueioEm(iso, h);
    if (ocupadas.has(h) || passou || bloq) {
      b.disabled = true;
      b.title = passou ? 'Horário já passou' : bloq ? `Bloqueado${bloq.motivo ? ` — ${bloq.motivo}` : ''}` : 'Já tem consulta';
      if (bloq && !ocupadas.has(h)) b.classList.add('hora--bloq');
    }
    b.addEventListener('click', () => {
      nova.hora = h;
      $('#hora-encaixe').value = '';
      alvo.querySelectorAll('.hora').forEach((x) => x.classList.toggle('hora--sel', x === b));
    });
    alvo.appendChild(b);
  });
}

// texto com os dados de acesso para enviar ao cliente pelo WhatsApp
const textoAcesso = ({ email, senha }) => {
  const site = location.href.replace(/[^/]*$/, '');
  return `Você já pode acompanhar suas consultas em ${site} — entre com o e-mail ${email} e a senha ${senha}. `
    + 'Depois de entrar, troque a senha em "Alterar senha".';
};

// bloqueio que pega este dia/horário (dia inteiro, período ou horário específico)
const bloqueioEm = (iso, h) => nova.bloqueios.find((b) => b.de <= iso && iso <= b.ate && (!b.hora || b.hora === h));

/* ===== Campo de encaixe: digitável + lista de horários prontos ===== */
const Encaixe = (() => {
  const PASSO = 30;                          // minutos entre os horários da lista
  const INICIO = 6 * 60;
  const FIM = 22 * 60;
  const opcoes = [];
  for (let m = INICIO; m <= FIM; m += PASSO) opcoes.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);

  let input; let lista; let combo; let ativo = -1;

  // 9 → 09:00 · 930 → 09:30 · 1415 → 14:15 · 14:5 → 14:05
  function normalizar(txt) {
    const t = (txt || '').trim();
    if (!t) return '';
    let h; let m;
    if (t.includes(':')) { [h, m] = t.split(':'); m = m || '0'; } else {
      const d = t.replace(/\D/g, '');
      if (d.length <= 2) { h = d; m = '0'; } else { h = d.slice(0, d.length - 2); m = d.slice(-2); }
    }
    h = Number(h); m = Number(m);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null;
    return `${pad(h)}:${pad(m)}`;
  }

  function situacao(h) {
    const iso = $('#form-nova [name="data"]').value;
    if (!iso) return { livre: true, nota: '' };
    if (deIso(iso, h).getTime() < Date.now()) return { livre: false, nota: 'já passou' };
    if (todas.some((a) => a.status === 'agendada' && a.data === iso && a.hora === h)) return { livre: false, nota: 'ocupado' };
    if (bloqueioEm(iso, h)) return { livre: false, nota: 'bloqueado' };
    if ((nova.grade[deIso(iso).getDay()] || []).includes(h)) return { livre: true, nota: 'na grade' };
    return { livre: true, nota: '' };
  }

  function itens() { return [...lista.querySelectorAll('li[data-hora]')]; }

  function marcar(i, rolar = true) {
    const its = itens();
    ativo = Math.max(-1, Math.min(i, its.length - 1));
    its.forEach((li, j) => li.classList.toggle('ativo', j === ativo));
    if (ativo >= 0) {
      input.setAttribute('aria-activedescendant', its[ativo].id);
      if (rolar) its[ativo].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function render(filtrar) {
    const txt = input.value.trim();
    const visiveis = filtrar && txt ? opcoes.filter((h) => h.startsWith(txt)) : opcoes;
    lista.innerHTML = '';
    visiveis.forEach((h, i) => {
      const s = situacao(h);
      const li = document.createElement('li');
      li.id = `enc-${h.replace(':', '')}`;
      li.dataset.hora = h;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', h === input.value);
      if (!s.livre) li.setAttribute('aria-disabled', 'true');
      li.innerHTML = `${h}${s.nota ? `<small>${s.nota}</small>` : ''}`;
      li.addEventListener('mousedown', (e) => e.preventDefault());   // mantém o foco no campo
      li.addEventListener('click', () => escolher(h));
      li.addEventListener('mousemove', () => { if (ativo !== i) marcar(i, false); });
      lista.appendChild(li);
    });
    if (!visiveis.length) {
      const n = normalizar(txt);
      lista.innerHTML = `<li class="combo__vazio">${n ? `Horário digitado: <strong>${n}</strong>` : 'Digite no formato 00:00'}</li>`;
    }
    ativo = -1;
  }

  function abrir(filtrar = false) {
    render(filtrar);
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    // abre para cima se não couber dentro do diálogo
    const dlg = combo.closest('dialog').getBoundingClientRect();
    const r = combo.getBoundingClientRect();
    combo.classList.toggle('combo--acima', dlg.bottom - r.bottom < 230 && r.top - dlg.top > 230);
    // posiciona a rolagem no horário escolhido ou no primeiro livre a partir das 8h
    const its = itens();
    const alvo = its.find((li) => li.dataset.hora === input.value)
      || (filtrar ? its[0] : its.find((li) => li.dataset.hora >= '08:00' && !li.hasAttribute('aria-disabled')));
    if (alvo) lista.scrollTop = alvo.offsetTop - lista.clientHeight / 2 + alvo.offsetHeight / 2;
    if (alvo && filtrar) marcar(its.indexOf(alvo));
  }

  function fechar() {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function escolher(h) {
    const li = lista.querySelector(`li[data-hora="${h}"]`);
    if (li?.hasAttribute('aria-disabled')) return;
    input.value = h;
    aoDigitar();
    fechar();
  }

  // escolher encaixe tira a seleção da grade
  function aoDigitar() {
    nova.hora = null;
    document.querySelectorAll('#nova-horas .hora').forEach((x) => x.classList.remove('hora--sel'));
  }

  function iniciar() {
    combo = $('#combo-encaixe');
    input = $('#hora-encaixe');
    lista = $('#combo-lista');

    input.addEventListener('input', () => {
      // máscara: só números, com ":" depois da hora
      let v = input.value.replace(/[^\d:]/g, '');
      if (!v.includes(':') && v.length > 2) v = `${v.slice(0, 2)}:${v.slice(2)}`;
      input.value = v.slice(0, 5);
      aoDigitar();
      abrir(true);
    });
    input.addEventListener('focus', () => { if (lista.hidden) abrir(false); });
    input.addEventListener('click', () => { if (lista.hidden) abrir(false); });
    input.addEventListener('blur', () => {
      fechar();
      const n = normalizar(input.value);
      if (n) input.value = n;
    });
    input.addEventListener('keydown', (e) => {
      const aberto = !lista.hidden;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!aberto) { abrir(false); return; }
        const its = itens();
        let i = ativo;
        do { i += e.key === 'ArrowDown' ? 1 : -1; } while (its[i]?.hasAttribute('aria-disabled'));
        if (its[i]) marcar(i);
      } else if (e.key === 'Enter' && aberto) {
        e.preventDefault();
        const li = itens()[ativo];
        if (li) escolher(li.dataset.hora); else { const n = normalizar(input.value); if (n) input.value = n; fechar(); }
      } else if (e.key === 'Escape' && aberto) {
        e.preventDefault();
        e.stopPropagation();      // não fecha o diálogo inteiro
        fechar();
      }
    });
    combo.querySelector('.combo__seta').addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (lista.hidden) { input.focus(); abrir(false); } else fechar();
    });
  }

  return { iniciar, normalizar, fechar };
})();

async function abrirNova(clientePre = null) {
  const f = $('#form-nova');
  f.reset();
  f.querySelector('.erro').hidden = true;
  Encaixe.fechar();
  nova.clienteId = clientePre?.id || null;
  nova.hora = null;
  try {
    const [cfg, bloqueios] = await Promise.all([Api.config.obter(), Api.bloqueios.listar()]);
    nova.grade = cfg.grade;
    nova.bloqueios = bloqueios;
  } catch (ex) { avisar(escapar(ex.message), 'erro'); return; }
  f.querySelector('[name="data"]').min = isoData(new Date());
  $('#cli-busca').value = clientePre?.nome || '';
  modoCliente('existente');
  renderHorasNova();
  await buscarClientes();
  $('#dlg-nova').showModal();
  if (clientePre) f.querySelector('[name="data"]').focus(); else $('#cli-busca').focus();
}

async function salvarNova(e) {
  e.preventDefault();
  const f = e.target;
  const erro = f.querySelector('.erro');
  const d = Object.fromEntries(new FormData(f));
  const mostrar = (msg) => { erro.textContent = msg; erro.hidden = false; };
  const encaixe = Encaixe.normalizar(d.horaEncaixe);
  if (encaixe === null) return mostrar('O horário de encaixe não é válido. Use o formato 00:00, por exemplo 14:30.');
  const hora = encaixe || nova.hora;

  if (nova.modo === 'existente' && !nova.clienteId) return mostrar('Escolha o cliente na lista ou cadastre um novo.');
  if (nova.modo === 'novo') {
    if (!d.cNome.trim()) return mostrar('Informe o nome do cliente.');
    if (!celularValido(d.cTelefone)) return mostrar('Informe o WhatsApp do cliente com DDD (11 números).');
    if (d.cEmail && !emailValido(d.cEmail)) return mostrar('O e-mail do cliente não parece válido.');
    if (d.cEmail && d.cSenha && d.cSenha.length < 6) return mostrar('A senha de acesso precisa ter 6 caracteres ou mais.');
  }
  if (!d.data || !hora) return mostrar('Escolha a data e um horário (da grade ou de encaixe).');
  const bloq = bloqueioEm(d.data, hora);
  if (bloq) return mostrar(`Este dia/horário está bloqueado${bloq.motivo ? ` (${bloq.motivo})` : ''}. Remova o bloqueio na aba Bloqueios para agendar.`);

  const botao = f.querySelector('[type="submit"]');
  botao.disabled = true;
  let acesso = null;      // { email, senha } quando o cliente novo ganha acesso ao site
  try {
    if (nova.modo === 'novo') {
      const senha = d.cEmail ? d.cSenha : '';   // sem e-mail não há login, a senha é ignorada
      const c = await Api.clientes.criar({ nome: d.cNome, telefone: d.cTelefone, email: d.cEmail, senha });
      if (senha) acesso = { email: c.email, senha };
      // se o agendamento falhar, o cliente já fica salvo e selecionado
      nova.clienteId = c.id;
      modoCliente('existente');
      $('#cli-busca').value = c.nome;
      await buscarClientes();
    }
    const ag = await Api.agenda.criar({
      usuarioId: nova.clienteId, data: d.data, hora,
      modalidade: 'Online', primeira: d.primeira, obs: d.obs.trim(),
    });
    $('#dlg-nova').close();
    await carregar();
    abrirSecao('consultas');
    const c = ag.cliente;
    const msg = `Olá, ${c.nome.split(' ')[0]}! Sua consulta online com ${CONFIG.nome} ficou marcada para ${fmtDiaLongo(ag.data)}, às ${ag.hora}.`
      + (acesso ? ` ${textoAcesso(acesso)}` : '');
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
  $('#btn-nova').addEventListener('click', () => abrirNova());
  $('#nova-fechar').addEventListener('click', () => $('#dlg-nova').close());
  document.querySelectorAll('#dlg-nova .abas button').forEach((b) => b.addEventListener('click', () => modoCliente(b.dataset.modo)));
  let espera;
  $('#cli-busca').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(buscarClientes, 200); });
  $('#form-nova [name="data"]').addEventListener('change', renderHorasNova);
  Encaixe.iniciar();
  // senha inicial já preenchida (f.reset() volta para este valor)
  document.querySelectorAll('[data-senha-padrao]').forEach((i) => { i.defaultValue = CONFIG.senhaPadrao; });
  const tel = $('#form-nova [name="cTelefone"]');
  tel.addEventListener('input', () => { tel.value = mascaraCelular(tel.value); });
  $('#form-nova').addEventListener('submit', salvarNova);

  PainelConfig.iniciar();
  PainelClientes.iniciar({ agendar: abrirNova, consultas: () => todas, recarregar: carregar });

  try {
    await carregar();
  } catch (ex) {
    $('#agenda-painel').innerHTML = `<p class="vazio">${escapar(ex.message)}</p>`;
  }
  const inicial = location.hash.slice(1);
  if (['grade', 'bloqueios', 'clientes'].includes(inicial)) abrirSecao(inicial);
});
