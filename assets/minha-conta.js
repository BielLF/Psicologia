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
  });
  if (!r.ok) return;
  try {
    await Api.agenda.cancelar(a.id, '');
    await carregar();
  } catch (ex) {
    alert(ex.message);
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
    ulP.innerHTML = '<li class="vazio">Você não tem consultas marcadas. <a href="index.html#agendar">Agendar uma consulta</a>.</li>';
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
  try {
    await carregar();
  } catch (ex) {
    $('#proximas').innerHTML = `<li class="vazio">${escapar(ex.message)}</li>`;
  }
});
