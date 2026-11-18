/* ============================================================
   Painel da psicóloga: clientes (listar, incluir, editar, excluir)
   ============================================================ */
const PainelClientes = (() => {
  let ctx = { agendar: () => {}, consultas: () => [], recarregar: async () => {} };
  let editando = null;          // cliente sendo editado (null = novo)

  const agora = () => Date.now();
  const futura = (a) => deIso(a.data, a.hora).getTime() > agora();

  // resumo das consultas de um cliente, a partir das consultas já carregadas no painel
  function resumo(id) {
    const doCliente = ctx.consultas().filter((a) => a.usuarioId === id);
    const proxima = doCliente
      .filter((a) => a.status === 'agendada' && futura(a))
      .sort((x, y) => (x.data + x.hora).localeCompare(y.data + y.hora))[0];
    const realizadas = doCliente.filter((a) => a.status === 'realizada').length;
    const marcadas = doCliente.filter((a) => a.status === 'agendada' && futura(a)).length;
    return { proxima, realizadas, marcadas };
  }

  function item(c) {
    const r = resumo(c.id);
    const li = document.createElement('li');
    const contatos = [
      c.telefone ? `<a href="${linkWhats(c.telefone)}" target="_blank" rel="noopener">${escapar(c.telefone)}</a>` : '',
      c.email ? `<a href="mailto:${escapar(c.email)}">${escapar(c.email)}</a>` : '<span>sem e-mail</span>',
    ].filter(Boolean).join(' · ');
    const consultas = [
      r.proxima ? `Próxima: ${fmtDiaCurto(r.proxima.data)}, ${r.proxima.hora}` : 'Sem consulta marcada',
      `${r.realizadas} realizada${r.realizadas === 1 ? '' : 's'}`,
    ].join(' · ');
    li.innerHTML = `
      <div>
        <span class="cliente__nome">
          <strong>${escapar(c.nome)}</strong>
          <span class="selo selo--${c.temAcesso ? 'ok' : 'neutro'}">${c.temAcesso ? 'Com acesso ao site' : 'Sem acesso ao site'}</span>
          ${c.senhaProvisoria ? '<span class="selo selo--atencao" title="O cliente ainda não trocou a senha que você definiu">Senha inicial</span>' : ''}
        </span>
        <small class="cliente__contato">${contatos}</small>
        <small>${consultas}</small>
      </div>
      <div class="cliente__acoes">
        <button type="button" class="btn btn--ocre btn--sm" data-acao="agendar">Agendar</button>
        <button type="button" class="btn btn--linha btn--sm" data-acao="editar">Editar</button>
        <button type="button" class="btn btn--linha btn--sm" data-acao="excluir">Excluir</button>
      </div>`;
    li.querySelector('[data-acao="agendar"]').addEventListener('click', () => ctx.agendar(c));
    li.querySelector('[data-acao="editar"]').addEventListener('click', () => abrirForm(c));
    li.querySelector('[data-acao="excluir"]').addEventListener('click', () => excluir(c, r));
    return li;
  }

  async function render() {
    const ul = $('#lista-clientes');
    const busca = $('#clientes-busca').value;
    let lista;
    try {
      lista = await Api.clientes.listar(busca);
    } catch (ex) {
      ul.innerHTML = `<li class="vazio">${escapar(ex.message)}</li>`;
      return;
    }
    ul.innerHTML = '';
    $('#clientes-total').textContent = busca.trim()
      ? `${lista.length} cliente(s) encontrado(s).`
      : `${lista.length} cliente(s) cadastrado(s).`;
    if (!lista.length) {
      ul.innerHTML = busca.trim()
        ? '<li class="vazio">Nenhum cliente encontrado com essa busca.</li>'
        : '<li class="vazio">Nenhum cliente ainda. Use “Novo cliente” para cadastrar.</li>';
      return;
    }
    lista.forEach((c) => ul.appendChild(item(c)));
  }

  /* ===== Incluir / editar ===== */
  function abrirForm(c = null) {
    editando = c;
    const f = $('#form-cliente');
    f.reset();
    f.querySelector('.erro').hidden = true;
    $('#dlg-cliente-titulo').textContent = c ? 'Editar cliente' : 'Novo cliente';
    $('#cliente-email-dica').textContent = c?.temAcesso
      ? '(é o login do cliente no site — se mudar, avise o cliente)'
      : '(opcional — necessário para o cliente entrar no site)';
    // quem já tem acesso: senha em branco mantém a atual; preenchida, redefine
    $('#cliente-senha-dica').textContent = c?.temAcesso
      ? '(deixe em branco para manter — preencha só para redefinir)'
      : '(o cliente pode trocar depois em “Minhas consultas”)';
    f.senha.placeholder = c?.temAcesso ? 'Manter a senha atual' : '';
    if (c) {
      f.nome.value = c.nome;
      f.telefone.value = mascaraCelular(c.telefone || '');
      f.email.value = c.email || '';
      if (c.temAcesso) f.senha.value = '';
    }
    $('#dlg-cliente').showModal();
    f.nome.focus();
  }

  async function salvar(e) {
    e.preventDefault();
    const f = e.target;
    const erro = f.querySelector('.erro');
    const mostrar = (msg) => { erro.textContent = msg; erro.hidden = false; };
    const d = { nome: f.nome.value.trim(), telefone: f.telefone.value.trim(), email: f.email.value.trim() };
    d.senha = d.email ? f.senha.value : '';     // sem e-mail não há login, a senha é ignorada

    if (!d.nome) return mostrar('Informe o nome do cliente.');
    if (!celularValido(d.telefone)) return mostrar('Informe o WhatsApp com DDD (11 números).');
    if (d.email && !emailValido(d.email)) return mostrar('O e-mail não parece válido.');
    if (editando?.temAcesso && !d.email) return mostrar('Este cliente entra no site com o e-mail, então ele não pode ficar em branco.');
    if (d.senha && d.senha.length < 6) return mostrar('A senha precisa ter 6 caracteres ou mais.');

    const botao = f.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      const c = editando ? await Api.clientes.atualizar(editando.id, d) : await Api.clientes.criar(d);
      $('#dlg-cliente').close();
      await ctx.recarregar();          // nomes nas consultas podem ter mudado
      await render();
      const envio = d.senha && c.telefone
        ? ` <a href="${linkWhats(c.telefone, `Olá, ${c.nome.split(' ')[0]}! ${textoAcesso({ email: c.email, senha: d.senha })}`)}" target="_blank" rel="noopener">Enviar acesso pelo WhatsApp</a>`
        : '';
      avisar((editando
        ? `Cadastro de <strong>${escapar(c.nome)}</strong> atualizado${d.senha ? ' e senha redefinida' : ''}.`
        : `Cliente <strong>${escapar(c.nome)}</strong> cadastrado${d.senha ? ' com acesso ao site' : ''}.`) + envio);
    } catch (ex) {
      mostrar(ex.message);
    } finally {
      botao.disabled = false;
    }
  }

  /* ===== Excluir ===== */
  function confirmarExclusao(c, r) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'dialogo';
      const avisoConsultas = r.marcadas
        ? `<p class="dialogo__aviso">${r.marcadas} consulta(s) marcada(s) pela frente ser${r.marcadas === 1 ? 'á cancelada' : 'ão canceladas'}.</p>`
        : '';
      dlg.innerHTML = `
        <form method="dialog">
          <h3>Excluir cliente?</h3>
          <p><strong>${escapar(c.nome)}</strong> sai da lista de clientes${c.temAcesso ? ' e perde o acesso ao site' : ''}.
            O histórico de consultas continua guardado.</p>
          ${avisoConsultas}
          <div class="dialogo__acoes">
            <button value="nao" class="btn btn--linha btn--sm">Manter cliente</button>
            <button value="sim" class="btn btn--perigo btn--sm">Excluir cliente</button>
          </div>
        </form>`;
      document.body.appendChild(dlg);
      dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'sim'); dlg.remove(); });
      dlg.showModal();
    });
  }

  async function excluir(c, r) {
    if (!(await confirmarExclusao(c, r))) return;
    try {
      const res = await Api.clientes.excluir(c.id);
      await ctx.recarregar();
      await render();
      avisar(`Cliente <strong>${escapar(c.nome)}</strong> excluído${res.canceladas ? ` e ${res.canceladas} consulta(s) futura(s) cancelada(s)` : ''}.`);
    } catch (ex) {
      avisar(escapar(ex.message), 'erro');
    }
  }

  function iniciar(opcoes) {
    ctx = { ...ctx, ...opcoes };
    let espera;
    $('#clientes-busca').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(render, 200); });
    $('#cliente-novo').addEventListener('click', () => abrirForm());
    $('#cliente-fechar').addEventListener('click', () => $('#dlg-cliente').close());
    $('#form-cliente').addEventListener('submit', salvar);
    const tel = $('#form-cliente [name="telefone"]');
    tel.addEventListener('input', () => { tel.value = mascaraCelular(tel.value); });
  }

  // sempre recarrega ao abrir a aba (consultas e clientes podem ter mudado)
  function abrir() { return render(); }

  return { iniciar, abrir };
})();
