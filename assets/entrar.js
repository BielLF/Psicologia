/* ============================================================
   Login e cadastro
   ============================================================ */

// só aceita destino interno (evita redirecionar para outro site)
function destinoApos(usuario) {
  const volta = new URLSearchParams(location.search).get('volta');
  if (volta && /^[\w-]+\.html(#[\w-]+)?$/.test(volta)) return volta;
  return usuario.perfil === 'psicologa' ? 'painel.html' : 'minha-conta.html';
}

function trocarAba(qual) {
  const entrar = qual === 'entrar';
  $('#aba-entrar').setAttribute('aria-selected', entrar);
  $('#aba-cadastro').setAttribute('aria-selected', !entrar);
  $('#form-entrar').hidden = !entrar;
  $('#form-cadastro').hidden = entrar;
  (entrar ? $('#form-entrar') : $('#form-cadastro')).querySelector('input').focus();
}

function mostrarErro(form, msg) {
  const p = form.querySelector('.erro');
  p.textContent = msg;
  p.hidden = !msg;
}

async function enviar(form, acao) {
  const botao = form.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    const usuario = await acao();
    location.href = destinoApos(usuario);
  } catch (ex) {
    mostrarErro(form, ex.message);
  } finally {
    botao.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const atual = await Api.auth.atual();
  if (atual) { location.href = destinoApos(atual); return; }

  if (new URLSearchParams(location.search).get('volta')) {
    // sem horário guardado (veio do botão "Entrar para ver os horários"), o texto muda
    if (!sessionStorage.getItem('psi_agendamento_pendente')) {
      $('#auth-contexto').textContent = 'Entre ou crie sua conta para ver os horários livres e agendar sua consulta.';
    }
    $('#auth-contexto').hidden = false;
  }
  if (DB_CONFIG.modo === 'local') $('#dica-prototipo').hidden = false;

  $('#aba-entrar').addEventListener('click', () => trocarAba('entrar'));
  $('#aba-cadastro').addEventListener('click', () => trocarAba('cadastro'));
  if (new URLSearchParams(location.search).get('aba') === 'cadastro') trocarAba('cadastro');

  const tel = $('#form-cadastro [name="telefone"]');
  tel.addEventListener('input', () => { tel.value = mascaraCelular(tel.value); });

  $('#form-entrar').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const d = Object.fromEntries(new FormData(f));
    if (!emailValido(d.email) || !d.senha) return mostrarErro(f, 'Informe e-mail e senha.');
    enviar(f, () => Api.auth.entrar(d.email, d.senha));
  });

  $('#form-cadastro').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const d = Object.fromEntries(new FormData(f));
    const falta = [];
    if (!d.nome?.trim()) falta.push('nome');
    if (!emailValido(d.email)) falta.push('e-mail válido');
    if (!celularValido(d.telefone)) falta.push('WhatsApp com DDD (11 números)');
    if ((d.senha || '').length < 6) falta.push('senha com 6 caracteres ou mais');
    if (falta.length) return mostrarErro(f, `Preencha: ${falta.join(', ')}.`);
    if (d.senha !== d.senha2) return mostrarErro(f, 'As senhas não são iguais.');
    if (!d.aceite) return mostrarErro(f, 'Para criar a conta, marque a concordância com a LGPD.');
    enviar(f, () => Api.auth.cadastrar({ nome: d.nome, email: d.email, telefone: d.telefone, senha: d.senha }));
  });
});
