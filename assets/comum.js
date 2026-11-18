/* ============================================================
   Configuração fixa e utilidades usadas por todas as páginas.
   A grade de horários, antecedência e bloqueios ficam no banco
   (editáveis no painel da psicóloga).
   ============================================================ */
const CONFIG = {
  nome: 'Helena Moraes',
  whatsapp: '5500000000000',          // DDI + DDD + número, só dígitos
  horasCancelamentoSemCusto: 24,
  senhaPadrao: 'Senha@123',            // senha inicial sugerida quando a psicóloga cadastra o cliente
};

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const $ = (s) => document.querySelector(s);

/* ===== Disponibilidade =====
   cfg: { grade, antecedenciaHoras, janelaDias } (Api.config.obter)
   ocupados: [{ data, hora }] (Api.agenda.ocupados) — hora null = dia todo bloqueado */
function montarAgenda(cfg, ocupados) {
  const slots = new Set();
  const dias = new Set();
  ocupados.forEach((o) => (o.hora ? slots.add(`${o.data}|${o.hora}`) : dias.add(o.data)));
  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  return {
    cfg,
    dentroDaJanela(d) {
      const h = hoje0();
      const fim = new Date(h); fim.setDate(fim.getDate() + cfg.janelaDias);
      return d >= h && d <= fim;
    },
    livres(iso) {
      if (dias.has(iso)) return [];
      const doDia = cfg.grade[deIso(iso).getDay()] || [];
      const limite = Date.now() + cfg.antecedenciaHoras * 3600000;
      return doDia.filter((h) => !slots.has(`${iso}|${h}`) && deIso(iso, h).getTime() >= limite);
    },
  };
}

/* ===== Datas ===== */
const pad = (n) => String(n).padStart(2, '0');
const isoData = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deIso = (iso, hora = '00:00') => {
  const [a, m, d] = iso.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  return new Date(a, m - 1, d, h, mi);
};
const fmtDiaLongo = (iso) =>
  deIso(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDiaCurto = (iso) =>
  deIso(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');
const horasAte = (a) => (deIso(a.data, a.hora).getTime() - Date.now()) / 3600000;

/* ===== Campos ===== */
function mascaraCelular(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '');
const celularValido = (t) => (t || '').replace(/\D/g, '').length === 11;
const linkWhats = (tel, msg = '') =>
  `https://wa.me/55${tel.replace(/\D/g, '')}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;

function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ===== Status da consulta ===== */
function rotuloStatus(a) {
  if (a.status === 'agendada') return { texto: 'Agendada', classe: 'ok' };
  if (a.status === 'realizada') return { texto: 'Realizada', classe: 'neutro' };
  return {
    texto: a.canceladoPor === 'psicologa' ? 'Cancelada pela psicóloga' : 'Cancelada pelo cliente',
    classe: 'cancelada',
  };
}

/* ===== Cabeçalho: área da conta ===== */
function renderContaNav(usuario) {
  const alvo = $('#conta-nav');
  if (!alvo) return;
  if (!usuario) {
    alvo.innerHTML = '<a href="entrar.html">Entrar</a>';
    return;
  }
  const destino = usuario.perfil === 'psicologa'
    ? '<a href="painel.html">Painel</a>'
    : '<a href="minha-conta.html">Minhas consultas</a>';
  alvo.innerHTML = `${destino}<button type="button" class="link-sair">Sair</button>`;
  alvo.querySelector('.link-sair').addEventListener('click', async () => {
    await Api.auth.sair();
    location.href = 'index.html';
  });
}

function iniciarMenuMobile() {
  const menuBtn = $('.menu-btn');
  const nav = $('#nav');
  if (!menuBtn || !nav) return;
  menuBtn.addEventListener('click', () => {
    const aberto = nav.classList.toggle('aberto');
    menuBtn.setAttribute('aria-expanded', aberto);
  });
  nav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') { nav.classList.remove('aberto'); menuBtn.setAttribute('aria-expanded', false); }
  });
}

/* ===== Diálogo de cancelamento =====
   Retorna Promise<{ ok: boolean, motivo: string }> */
function dialogoCancelar({
  titulo, texto, pedirMotivo = false, aviso = '',
  motivoObrigatorio = false, quemVe = 'o cliente vai ver', exemplo = 'Ex.: imprevisto de saúde, vamos remarcar',
}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialogo';
    const rotulo = motivoObrigatorio ? `Motivo do cancelamento <small>(obrigatório — ${quemVe})</small>` : `Motivo <small>(${quemVe})</small>`;
    dlg.innerHTML = `
      <form method="dialog">
        <h3>${escapar(titulo)}</h3>
        <p>${texto}</p>
        ${aviso ? `<p class="dialogo__aviso">${escapar(aviso)}</p>` : ''}
        ${pedirMotivo ? `<label class="dialogo__campo">${rotulo}
          <textarea name="motivo" rows="3" maxlength="300" placeholder="${escapar(exemplo)}" ${motivoObrigatorio ? 'required' : ''}></textarea></label>
          <p class="erro dialogo__erro" role="alert" hidden>Escreva o motivo do cancelamento.</p>` : ''}
        <div class="dialogo__acoes">
          <button value="nao" class="btn btn--linha btn--sm" formnovalidate>Manter consulta</button>
          <button value="sim" class="btn btn--perigo btn--sm">Cancelar consulta</button>
        </div>
      </form>`;
    document.body.appendChild(dlg);
    if (motivoObrigatorio) {
      const campo = dlg.querySelector('textarea');
      const erro = dlg.querySelector('.dialogo__erro');
      dlg.querySelector('button[value="sim"]').addEventListener('click', (e) => {
        if (campo.value.trim()) return;
        e.preventDefault();
        erro.hidden = false;
        campo.focus();
      });
      campo.addEventListener('input', () => { erro.hidden = true; });
    }
    dlg.addEventListener('close', () => {
      const motivo = dlg.querySelector('textarea')?.value || '';
      resolve({ ok: dlg.returnValue === 'sim', motivo });
      dlg.remove();
    });
    dlg.showModal();
  });
}
