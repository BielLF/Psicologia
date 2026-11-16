/* ============================================================
   Painel da psicóloga: grade de horários e bloqueios
   ============================================================ */
const PainelConfig = (() => {
  let salvo = null;     // config como está no banco
  let edicao = null;    // cópia sendo editada

  const copiar = (o) => JSON.parse(JSON.stringify(o));
  const ordemDias = [1, 2, 3, 4, 5, 6, 0];   // segunda primeiro
  const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const hhmm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

  /* ===== Grade ===== */
  function alterado() {
    return JSON.stringify(edicao) !== JSON.stringify(salvo);
  }

  function atualizarBarra() {
    const mudou = alterado();
    $('#grade-status').textContent = mudou ? 'Alterações não salvas.' : 'Nenhuma alteração.';
    $('#grade-status').classList.toggle('pendente', mudou);
    $('#grade-salvar').disabled = !mudou;
    $('#grade-desfazer').disabled = !mudou;
  }

  function adicionarHora(dia, h) {
    const lista = edicao.grade[dia] || (edicao.grade[dia] = []);
    if (!lista.includes(h)) lista.push(h);
    lista.sort();
  }

  function renderGrade() {
    const alvo = $('#grade-dias');
    alvo.innerHTML = '';
    ordemDias.forEach((dia) => {
      const horas = edicao.grade[dia] || [];
      const linha = document.createElement('div');
      linha.className = 'grade__dia';
      linha.innerHTML = `
        <h3>${DIAS_SEMANA[dia]}</h3>
        <div class="grade__horas">${horas.length ? '' : '<span class="vazio">Não atende</span>'}</div>
        <div class="grade__add">
          <input type="time" aria-label="Novo horário para ${DIAS_SEMANA[dia]}">
          <button type="button" class="btn btn--linha btn--sm" data-acao="add">Adicionar</button>
          ${horas.length ? '<button type="button" class="link-sair" data-acao="limpar">Limpar dia</button>' : ''}
        </div>`;
      const chips = linha.querySelector('.grade__horas');
      horas.forEach((h) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.innerHTML = `${h} <span aria-hidden="true">×</span>`;
        chip.setAttribute('aria-label', `Remover ${h} de ${DIAS_SEMANA[dia]}`);
        chip.addEventListener('click', () => {
          edicao.grade[dia] = horas.filter((x) => x !== h);
          renderGrade();
        });
        chips.appendChild(chip);
      });
      const input = linha.querySelector('input');
      const add = () => { if (input.value) { adicionarHora(dia, input.value); renderGrade(); } };
      linha.querySelector('[data-acao="add"]').addEventListener('click', add);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      linha.querySelector('[data-acao="limpar"]')?.addEventListener('click', () => { edicao.grade[dia] = []; renderGrade(); });
      alvo.appendChild(linha);
    });
    $('#cfg-antecedencia').value = edicao.antecedenciaHoras;
    $('#cfg-janela').value = edicao.janelaDias;
    atualizarBarra();
  }

  function gerar() {
    const de = $('#g-de').value;
    const ate = $('#g-ate').value;
    const passo = Number($('#g-int').value);
    const dias = [...document.querySelectorAll('#g-dias input:checked')].map((c) => Number(c.value));
    if (!de || !ate || minutos(ate) < minutos(de)) { avisar('No gerador, o horário final precisa ser depois do inicial.', 'erro'); return; }
    if (!dias.length) { avisar('No gerador, marque ao menos um dia da semana.', 'erro'); return; }
    let n = 0;
    for (let m = minutos(de); m <= minutos(ate); m += passo) {
      dias.forEach((d) => adicionarHora(d, hhmm(m)));
      n++;
    }
    renderGrade();
    avisar(`${n} horário(s) adicionados em ${dias.length} dia(s). Confira e clique em “Salvar grade”.`);
  }

  async function salvar() {
    edicao.antecedenciaHoras = Number($('#cfg-antecedencia').value);
    edicao.janelaDias = Number($('#cfg-janela').value);
    const botao = $('#grade-salvar');
    botao.disabled = true;
    try {
      salvo = await Api.config.salvar(edicao);
      edicao = copiar(salvo);
      renderGrade();
      avisar('Grade salva. Os novos horários já aparecem no site.');
    } catch (ex) {
      avisar(escapar(ex.message), 'erro');
      atualizarBarra();
    }
  }

  async function abrirGrade() {
    if (edicao && alterado()) return;   // mantém o que está sendo editado
    try {
      salvo = await Api.config.obter();
      edicao = copiar(salvo);
      renderGrade();
    } catch (ex) { avisar(escapar(ex.message), 'erro'); }
  }

  /* ===== Bloqueios ===== */
  function tipoBloqueio() {
    return document.querySelector('#form-bloqueio [name="tipo"]:checked').value;
  }

  function ajustarFormBloqueio() {
    const tipo = tipoBloqueio();
    document.querySelectorAll('#form-bloqueio [data-tipo]').forEach((el) => { el.hidden = el.dataset.tipo !== tipo; });
    $('#rot-de').textContent = tipo === 'periodo' ? 'De' : 'Data';
  }

  function descreverBloqueio(b) {
    if (b.hora) return `${fmtDiaLongo(b.de)}, às ${b.hora}`;
    if (b.de === b.ate) return `${fmtDiaLongo(b.de)} — dia inteiro`;
    return `De ${fmtDiaCurto(b.de)} a ${fmtDiaCurto(b.ate)}`;
  }

  async function renderBloqueios() {
    const ul = $('#lista-bloqueios');
    const hoje = isoData(new Date());
    const lista = (await Api.bloqueios.listar()).filter((b) => b.ate >= hoje);
    ul.innerHTML = '';
    if (!lista.length) { ul.innerHTML = '<li class="vazio">Nenhum bloqueio. Toda a grade está aberta.</li>'; return; }
    lista.forEach((b) => {
      const li = document.createElement('li');
      li.innerHTML = `<div><strong>${descreverBloqueio(b)}</strong>${b.motivo ? `<small>${escapar(b.motivo)}</small>` : ''}</div>`;
      const bt = document.createElement('button');
      bt.className = 'btn btn--linha btn--sm';
      bt.textContent = 'Remover bloqueio';
      bt.addEventListener('click', async () => {
        try {
          await Api.bloqueios.remover(b.id);
          avisar('Bloqueio removido. Os horários voltaram a aparecer no site.');
          renderBloqueios();
        } catch (ex) { avisar(escapar(ex.message), 'erro'); }
      });
      li.appendChild(bt);
      ul.appendChild(li);
    });
  }

  async function criarBloqueio(e) {
    e.preventDefault();
    const f = e.target;
    const erro = f.querySelector('.erro');
    const d = Object.fromEntries(new FormData(f));
    const tipo = tipoBloqueio();
    const dados = {
      de: d.de,
      ate: tipo === 'periodo' ? d.ate : d.de,
      hora: tipo === 'horario' ? d.hora : null,
      motivo: d.motivo,
    };
    if (!dados.de || (tipo === 'periodo' && !dados.ate) || (tipo === 'horario' && !dados.hora)) {
      erro.textContent = 'Preencha a data' + (tipo === 'periodo' ? ' inicial e final.' : tipo === 'horario' ? ' e o horário.' : '.');
      erro.hidden = false;
      return;
    }
    try {
      const r = await Api.bloqueios.criar(dados);
      erro.hidden = true;
      f.reset();
      ajustarFormBloqueio();
      if (r.conflitos.length) {
        const nomes = r.conflitos.map((a) => `${escapar(a.cliente?.nome || '')} (${fmtDiaCurto(a.data)} ${a.hora})`).join(', ');
        avisar(`Bloqueio criado, mas ${r.conflitos.length} consulta(s) já marcada(s) caem nele: ${nomes}.
          Elas continuam ativas — cancele na aba Consultas se for o caso.`, 'atencao');
      } else {
        avisar('Bloqueio criado. Esses horários não aparecem mais no site.');
      }
      renderBloqueios();
    } catch (ex) {
      erro.textContent = ex.message;
      erro.hidden = false;
    }
  }

  async function abrirBloqueios() {
    try { await renderBloqueios(); } catch (ex) { avisar(escapar(ex.message), 'erro'); }
  }

  function iniciar() {
    // gerador: dias úteis marcados por padrão
    $('#g-dias').innerHTML = ordemDias.map((d) => `
      <label class="pilula pilula--mini"><input type="checkbox" value="${d}" ${d >= 1 && d <= 5 ? 'checked' : ''}><span>${DIAS_SEMANA[d].slice(0, 3)}</span></label>`).join('');
    $('#g-add').addEventListener('click', gerar);
    $('#grade-salvar').addEventListener('click', salvar);
    $('#grade-desfazer').addEventListener('click', () => { edicao = copiar(salvo); renderGrade(); });
    $('#cfg-antecedencia').addEventListener('input', (e) => { edicao.antecedenciaHoras = Number(e.target.value); atualizarBarra(); });
    $('#cfg-janela').addEventListener('input', (e) => { edicao.janelaDias = Number(e.target.value); atualizarBarra(); });
    window.addEventListener('beforeunload', (e) => { if (edicao && alterado()) e.preventDefault(); });

    document.querySelectorAll('#form-bloqueio [name="tipo"]').forEach((r) => r.addEventListener('change', ajustarFormBloqueio));
    $('#form-bloqueio').addEventListener('submit', criarBloqueio);
  }

  return { iniciar, abrirGrade, abrirBloqueios };
})();
