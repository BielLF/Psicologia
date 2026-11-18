/* ============================================================
   Área do cliente: próximas consultas e histórico
   ============================================================ */

function itemConsulta(a, comAcao) {
  const li = document.createElement('li');
  const st = rotuloStatus(a);
  const motivo = a.status === 'cancelada' && a.motivoCancelamento
    ? `<small class="motivo">Motivo: ${escapar(a.motivoCancelamento)}</small>` : '';
  li.innerHTML = `
    <div>
      <strong>${fmtDiaLongo(a.data)}, ${a.hora}</strong>
      <small>${escapar(a.modalidade)}${a.criadoPor === 'psicologa' ? ' · marcada pela psicóloga' : ''}</small>
      ${motivo}
    </div>
    <span class="selo selo--${st.classe}">${st.texto}</span>`;
  if (comAcao) {
    const b = document.createElement('button');
    b.className = 'btn btn--linha btn--sm';
    b.textContent = 'Cancelar consulta';
    b.addEventListener('click', () => cancelar(a));
    li.appendChild(b);
  }
  return li;
}

async function cancelar(a) {
  const tarde = horasAte(a) < CONFIG.horasCancelamentoSemCusto;
  const r = await dialogoCancelar({
    titulo: 'Cancelar consulta?',
    texto: `${fmtDiaLongo(a.data)}, às ${a.hora} (${escapar(a.modalidade)}).`,
    aviso: tarde ? `Faltam menos de ${CONFIG.horasCancelamentoSemCusto} horas: esta sessão será cobrada.` : '',
    pedirMotivo: true,
    motivoObrigatorio: true,
    quemVe: 'a psicóloga vai ver',
    exemplo: 'Ex.: imprevisto no trabalho, gostaria de remarcar',
  });
  if (!r.ok) return;
  try {
    await Api.agenda.cancelar(a.id, r.motivo);
    await carregar();
  } catch (ex) {
    alert(ex.message);
  }
}

/* ===== Agendar (mesmas regras da agenda do site: grade, bloqueios, antecedência) ===== */
const ag = { agenda: null, hora: null };

// próximo dia (a partir de `iso`) que tem horário livre, dentro da janela da agenda
function proximoDiaLivre(iso) {
  const d = deIso(iso);
  for (let i = 0; i <= ag.agenda.cfg.janelaDias; i++) {
    if (!ag.agenda.dentroDaJanela(d)) return null;
    const dia = isoData(d);
    if (ag.agenda.livres(dia).length) return dia;
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function atualizarResumoAg() {
  const iso = $('#form-agendar [name="data"]').value;
  $('#ag-resumo').innerHTML = iso && ag.hora
    ? `Online · <strong>${fmtDiaLongo(iso)}, às ${ag.hora}</strong>`
    : 'Escolha a data e o horário.';
}

function renderHorasAg(iso) {
  const alvo = $('#ag-horas');
  ag.hora = null;
  alvo.innerHTML = '';
  atualizarResumoAg();
  if (!iso) return;
  const livres = ag.agenda.dentroDaJanela(deIso(iso)) ? ag.agenda.livres(iso) : [];
  if (!livres.length) {
    const prox = proximoDiaLivre(isoData(new Date(Math.max(deIso(iso), new Date().setHours(0, 0, 0, 0)))));
    alvo.innerHTML = `<p class="vazio">Sem horários livres neste dia.${prox
      ? ` <button type="button" class="link-botao">Próximo dia com horário: ${fmtDiaCurto(prox)}</button>` : ''}</p>`;
    alvo.querySelector('button')?.addEventListener('click', () => {
      $('#form-agendar [name="data"]').value = prox;
      renderHorasAg(prox);
    });
    return;
  }
  livres.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hora';
    b.textContent = h;
    b.addEventListener('click', () => {
      ag.hora = h;
      alvo.querySelectorAll('.hora').forEach((x) => x.classList.toggle('hora--sel', x === b));
      atualizarResumoAg();
    });
    alvo.appendChild(b);
  });
}

async function abrirAgendar() {
  const f = $('#form-agendar');
  f.reset();
  f.querySelector('.erro').hidden = true;
  try {
    const cfg = await Api.config.obter();
    const fim = new Date(); fim.setDate(fim.getDate() + cfg.janelaDias);
    ag.agenda = montarAgenda(cfg, await Api.agenda.ocupados(isoData(new Date()), isoData(fim)));
    const campo = f.querySelector('[name="data"]');
    campo.min = isoData(new Date());
    campo.max = isoData(fim);
    // já abre no primeiro dia com horário livre
    const prox = proximoDiaLivre(isoData(new Date()));
    campo.value = prox || '';
    renderHorasAg(prox || '');
    if (!prox) $('#ag-horas').innerHTML = '<p class="vazio">Agenda cheia no momento. Fale com a psicóloga pelo WhatsApp.</p>';
  } catch (ex) {
    alert(ex.message);
    return;
  }
  $('#dlg-agendar').showModal();
}

async function salvarAgendamento(e) {
  e.preventDefault();
  const f = e.target;
  const erro = f.querySelector('.erro');
  const d = Object.fromEntries(new FormData(f));
  if (!d.data || !ag.hora) { erro.textContent = 'Escolha a data e um horário.'; erro.hidden = false; return; }
  const botao = f.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    const nova = await Api.agenda.criar({
      data: d.data, hora: ag.hora, modalidade: 'Online', primeira: d.primeira, obs: (d.obs || '').trim(),
    });
    $('#dlg-agendar').close();
    await carregar();
    const texto = `${fmtDiaLongo(nova.data)}, às ${nova.hora} (online)`;
    const msg = `Olá, ${CONFIG.nome}! Acabei de agendar uma consulta pelo site: ${texto}. Nome: ${nova.cliente.nome}.`;
    const aviso = $('#aviso-conta');
    aviso.innerHTML = `Consulta agendada para <strong>${texto}</strong>.
      <a href="https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Avisar pelo WhatsApp</a>`;
    aviso.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => { aviso.hidden = true; }, 15000);
  } catch (ex) {
    erro.textContent = ex.message;
    erro.hidden = false;
    // horário foi ocupado nesse meio tempo: recarrega a disponibilidade
    if (ex.status === 409) {
      const cfg = ag.agenda.cfg;
      const fim = new Date(); fim.setDate(fim.getDate() + cfg.janelaDias);
      ag.agenda = montarAgenda(cfg, await Api.agenda.ocupados(isoData(new Date()), isoData(fim)));
      renderHorasAg(d.data);
    }
  } finally {
    botao.disabled = false;
  }
}

/* ===== Alterar senha ===== */
function abrirSenha() {
  const f = $('#form-senha');
  f.reset();
  f.querySelector('.erro').hidden = true;
  $('#dlg-senha').showModal();
  f.atual.focus();
}

async function salvarSenha(e) {
  e.preventDefault();
  const f = e.target;
  const erro = f.querySelector('.erro');
  const mostrar = (msg) => { erro.textContent = msg; erro.hidden = false; };
  const d = Object.fromEntries(new FormData(f));
  if (!d.atual) return mostrar('Informe a senha atual.');
  if (d.nova.length < 6) return mostrar('A nova senha precisa ter 6 caracteres ou mais.');
  if (d.nova !== d.nova2) return mostrar('As novas senhas não são iguais.');
  if (d.nova === d.atual) return mostrar('A nova senha precisa ser diferente da atual.');

  const botao = f.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    await Api.auth.trocarSenha(d.atual, d.nova);
    $('#dlg-senha').close();
    $('#aviso-senha').hidden = true;
    const ok = $('#aviso-conta');
    ok.textContent = 'Senha alterada. Use a nova senha no próximo acesso.';
    ok.hidden = false;
    setTimeout(() => { ok.hidden = true; }, 8000);
  } catch (ex) {
    mostrar(ex.message);
  } finally {
    botao.disabled = false;
  }
}

async function carregar() {
  const lista = await Api.agenda.minhas();
  const agora = Date.now();
  const ordenar = (x, y) => (x.data + x.hora).localeCompare(y.data + y.hora);
  const proximas = lista.filter((a) => a.status === 'agendada' && deIso(a.data, a.hora).getTime() > agora).sort(ordenar);
  const historico = lista.filter((a) => !proximas.includes(a)).sort(ordenar).reverse();

  const ulP = $('#proximas');
  ulP.innerHTML = '';
  if (!proximas.length) {
    ulP.innerHTML = '<li class="vazio">Você não tem consultas marcadas. <button type="button" class="link-botao" data-agendar>Agendar uma consulta</button>.</li>';
    ulP.querySelector('[data-agendar]').addEventListener('click', abrirAgendar);
  }
  proximas.forEach((a) => ulP.appendChild(itemConsulta(a, true)));

  const ulH = $('#historico');
  ulH.innerHTML = '';
  if (!historico.length) ulH.innerHTML = '<li class="vazio">Suas consultas anteriores e canceladas aparecem aqui.</li>';
  historico.forEach((a) => ulH.appendChild(itemConsulta(a, false)));
}

document.addEventListener('DOMContentLoaded', async () => {
  const u = await Api.auth.atual();
  if (!u) { location.href = 'entrar.html?volta=minha-conta.html'; return; }
  if (u.perfil === 'psicologa') { location.href = 'painel.html'; return; }

  renderContaNav(u);
  $('#saudacao').textContent = `Olá, ${u.nome.split(' ')[0]}`;
  $('#meus-dados').textContent = `${u.email} · ${u.telefone}`;
  $('#aviso-senha').hidden = !u.senhaProvisoria;
  $('#btn-senha').addEventListener('click', abrirSenha);
  $('#link-senha').addEventListener('click', abrirSenha);
  $('#senha-fechar').addEventListener('click', () => $('#dlg-senha').close());
  $('#form-senha').addEventListener('submit', salvarSenha);
  document.querySelectorAll('header [data-agendar]').forEach((b) => b.addEventListener('click', abrirAgendar));
  $('#ag-fechar').addEventListener('click', () => $('#dlg-agendar').close());
  $('#form-agendar [name="data"]').addEventListener('change', (e) => renderHorasAg(e.target.value));
  $('#form-agendar').addEventListener('submit', salvarAgendamento);
  try {
    await carregar();
  } catch (ex) {
    $('#proximas').innerHTML = `<li class="vazio">${escapar(ex.message)}</li>`;
  }
});
