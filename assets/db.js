/* ============================================================
   CAMADA DE DADOS
   Todas as telas falam só com o objeto `Api`. Para ligar no banco
   de dados, basta implementar o backend (ver banco/API.md) e trocar
   DB_CONFIG.modo para 'api'. Nenhuma tela precisa mudar.
   ============================================================ */
const DB_CONFIG = {
  modo: 'local',                          // 'local' = protótipo no navegador | 'api' = backend real
  apiUrl: 'http://localhost:3000/api',    // usado só no modo 'api'
};

class ErroApi extends Error {
  constructor(mensagem, status) { super(mensagem); this.status = status; }
}

/* ------------------------------------------------------------
   Modo 'api' — chama o backend via HTTP (JWT no header)
   ------------------------------------------------------------ */
const HttpApi = (() => {
  const TOKEN = 'psi_token';

  async function req(metodo, caminho, corpo) {
    const headers = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem(TOKEN);
    if (token) headers.Authorization = `Bearer ${token}`;
    let resp;
    try {
      resp = await fetch(DB_CONFIG.apiUrl + caminho, {
        method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new ErroApi('Sem conexão com o servidor. Verifique sua internet e tente de novo.', 0);
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new ErroApi(json.mensagem || 'Não foi possível concluir. Tente de novo.', resp.status);
    return json;
  }

  return {
    auth: {
      async cadastrar(dados) {
        const r = await req('POST', '/auth/cadastro', dados);
        localStorage.setItem(TOKEN, r.token);
        return r.usuario;
      },
      async entrar(email, senha) {
        const r = await req('POST', '/auth/login', { email, senha });
        localStorage.setItem(TOKEN, r.token);
        return r.usuario;
      },
      async sair() { localStorage.removeItem(TOKEN); },
      async atual() {
        if (!localStorage.getItem(TOKEN)) return null;
        try { return await req('GET', '/auth/me'); } catch { localStorage.removeItem(TOKEN); return null; }
      },
    },
    config: {
      obter: () => req('GET', '/config'),
      salvar: (cfg) => req('PUT', '/config', cfg),
    },
    agenda: {
      ocupados: (de, ate) => req('GET', `/agendamentos/ocupados?de=${de}&ate=${ate}`),
      criar: (dados) => req('POST', '/agendamentos', dados),
      minhas: () => req('GET', '/agendamentos/meus'),
      todas: () => req('GET', '/agendamentos'),
      cancelar: (id, motivo) => req('POST', `/agendamentos/${id}/cancelar`, { motivo }),
      concluir: (id) => req('POST', `/agendamentos/${id}/concluir`),
    },
    bloqueios: {
      listar: () => req('GET', '/bloqueios'),
      criar: (dados) => req('POST', '/bloqueios', dados),
      remover: (id) => req('DELETE', `/bloqueios/${id}`),
    },
    clientes: {
      listar: (busca = '') => req('GET', `/clientes?busca=${encodeURIComponent(busca)}`),
      criar: (dados) => req('POST', '/clientes', dados),
    },
  };
})();

/* ------------------------------------------------------------
   Modo 'local' — simula o backend no localStorage, aplicando as
   MESMAS regras de permissão e validação que o servidor deverá aplicar.
   ------------------------------------------------------------ */
const LocalApi = (() => {
  const K = {
    usuarios: 'psi_usuarios', agend: 'psi_agendamentos', sessao: 'psi_sessao',
    config: 'psi_config', bloq: 'psi_bloqueios',
  };
  const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
  const gravar = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const agora = () => new Date().toISOString();

  const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
  const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
  const momento = (iso, hora = '00:00') => {
    const [a, m, d] = iso.split('-').map(Number);
    const [h, mi] = hora.split(':').map(Number);
    return new Date(a, m - 1, d, h, mi);
  };
  const proxDia = (iso) => {
    const d = momento(iso); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const GRADE_PADRAO = {
    0: [],
    1: ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
    2: ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
    3: ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
    4: ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '18:00'],
    5: ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00'],
    6: ['08:00', '09:00', '10:00'],
  };

  // No backend real a senha usa bcrypt/argon2 no servidor. Aqui é só para o protótipo.
  async function hash(txt) {
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0; for (const c of txt) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h;
  }

  const publico = (u) => u && {
    id: u.id, nome: u.nome, email: u.email, telefone: u.telefone, perfil: u.perfil, temAcesso: !!u.senhaHash,
  };

  // dados iniciais na primeira execução
  const pronto = (async () => {
    const us = ler(K.usuarios, []);
    if (!us.some((u) => u.perfil === 'psicologa')) {
      us.push({
        id: novoId(), nome: 'Helena Moraes', email: 'psicologa@exemplo.com', telefone: '',
        perfil: 'psicologa', senhaHash: await hash('troque123'), criadoEm: agora(),
      });
      gravar(K.usuarios, us);
    }
    if (!ler(K.config, null)) gravar(K.config, { grade: GRADE_PADRAO, antecedenciaHoras: 12, janelaDias: 60 });
    if (!ler(K.bloq, null)) {
      gravar(K.bloq, [
        { id: novoId(), de: '2026-12-25', ate: '2026-12-25', hora: null, motivo: 'Natal', criadoEm: agora() },
        { id: novoId(), de: '2027-01-01', ate: '2027-01-01', hora: null, motivo: 'Ano-novo', criadoEm: agora() },
      ]);
    }
  })();

  const cfg = () => ler(K.config, { grade: GRADE_PADRAO, antecedenciaHoras: 12, janelaDias: 60 });
  const ativas = () => ler(K.agend, []).filter((a) => a.status === 'agendada');
  const slotOcupado = (iso, h) => ativas().some((a) => a.data === iso && a.hora === h);
  const slotBloqueado = (iso, h) => ler(K.bloq, []).some((b) => b.de <= iso && iso <= b.ate && (!b.hora || b.hora === h));

  function usuarioSessao() {
    const id = ler(K.sessao, null);
    return ler(K.usuarios, []).find((u) => u.id === id) || null;
  }
  async function exigir(perfil) {
    await pronto;
    const u = usuarioSessao();
    if (!u) throw new ErroApi('Entre na sua conta para continuar.', 401);
    if (perfil && u.perfil !== perfil) throw new ErroApi('Acesso permitido apenas à psicóloga.', 403);
    return u;
  }
  function comCliente(a) {
    const u = ler(K.usuarios, []).find((x) => x.id === a.usuarioId);
    return { ...a, cliente: publico(u) };
  }

  return {
    auth: {
      async cadastrar({ nome, email, telefone, senha }) {
        await pronto;
        email = email.trim().toLowerCase();
        const us = ler(K.usuarios, []);
        const existente = us.find((u) => u.email === email);
        if (existente && existente.senhaHash) throw new ErroApi('Já existe uma conta com este e-mail. Use "Entrar".', 409);
        // conta criada pela psicóloga sem senha: o cliente ativa o acesso definindo a senha
        // (no backend real, confirmar o e-mail antes de liberar)
        const u = existente || { id: novoId(), perfil: 'cliente', criadoEm: agora() };
        Object.assign(u, { nome: nome.trim(), email, telefone, senhaHash: await hash(senha) });
        if (!existente) us.push(u);
        gravar(K.usuarios, us);
        gravar(K.sessao, u.id);
        return publico(u);
      },
      async entrar(email, senha) {
        await pronto;
        const u = ler(K.usuarios, []).find((x) => x.email === email.trim().toLowerCase());
        if (u && !u.senhaHash) {
          throw new ErroApi('Seu cadastro foi feito pela psicóloga. Use "Criar conta" com este e-mail para definir sua senha.', 401);
        }
        if (!u || u.senhaHash !== (await hash(senha))) throw new ErroApi('E-mail ou senha incorretos.', 401);
        gravar(K.sessao, u.id);
        return publico(u);
      },
      async sair() { localStorage.removeItem(K.sessao); },
      async atual() { await pronto; return publico(usuarioSessao()); },
    },

    config: {
      // público: o site precisa da grade para mostrar os horários
      async obter() { await pronto; return cfg(); },
      async salvar(nova) {
        await exigir('psicologa');
        const grade = {};
        for (let d = 0; d <= 6; d++) {
          const horas = [...new Set(nova.grade?.[d] || [])];
          if (horas.some((h) => !RE_HORA.test(h))) throw new ErroApi('Há um horário inválido na grade.', 400);
          grade[d] = horas.sort();
        }
        const antecedenciaHoras = Number(nova.antecedenciaHoras);
        const janelaDias = Number(nova.janelaDias);
        if (!(antecedenciaHoras >= 0 && antecedenciaHoras <= 168)) throw new ErroApi('Antecedência deve ficar entre 0 e 168 horas.', 400);
        if (!(janelaDias >= 7 && janelaDias <= 365)) throw new ErroApi('A agenda deve abrir entre 7 e 365 dias à frente.', 400);
        const c = { grade, antecedenciaHoras, janelaDias };
        gravar(K.config, c);
        return c;
      },
    },

    agenda: {
      // público: só data/hora ocupadas ou bloqueadas, sem dados de clientes.
      // hora = null significa dia inteiro bloqueado.
      async ocupados(de, ate) {
        await pronto;
        const r = ativas().filter((a) => a.data >= de && a.data <= ate).map((a) => ({ data: a.data, hora: a.hora }));
        ler(K.bloq, []).forEach((b) => {
          for (let d = b.de < de ? de : b.de; d <= b.ate && d <= ate; d = proxDia(d)) r.push({ data: d, hora: b.hora || null });
        });
        return r;
      },
      async criar(d) {
        const u = await exigir();
        let dono = u;
        if (u.perfil === 'psicologa') {
          dono = ler(K.usuarios, []).find((x) => x.id === d.usuarioId && x.perfil === 'cliente');
          if (!dono) throw new ErroApi('Escolha o cliente da consulta.', 400);
        }
        if (!RE_DATA.test(d.data || '') || !RE_HORA.test(d.hora || '')) throw new ErroApi('Data ou horário inválido.', 400);
        const quando = momento(d.data, d.hora).getTime();
        if (quando < Date.now()) throw new ErroApi('Escolha uma data e horário no futuro.', 400);
        if (slotOcupado(d.data, d.hora)) throw new ErroApi('Este horário acabou de ser ocupado. Escolha outro.', 409);

        // cliente só agenda dentro das regras; a psicóloga pode encaixar fora da grade e em bloqueios
        if (u.perfil === 'cliente') {
          const c = cfg();
          const naGrade = (c.grade[momento(d.data).getDay()] || []).includes(d.hora);
          if (!naGrade || slotBloqueado(d.data, d.hora)) throw new ErroApi('Este horário não está disponível. Escolha outro.', 409);
          if (quando < Date.now() + c.antecedenciaHoras * 3600000) {
            throw new ErroApi(`Agende com pelo menos ${c.antecedenciaHoras} horas de antecedência.`, 409);
          }
          if (quando > Date.now() + (c.janelaDias + 1) * 86400000) throw new ErroApi('Esta data ainda não está aberta para agendamento.', 409);
        }

        const lista = ler(K.agend, []);
        const a = {
          id: novoId(), usuarioId: dono.id, data: d.data, hora: d.hora,
          modalidade: d.modalidade === 'Online' ? 'Online' : 'Presencial',
          primeira: d.primeira === 'Não' ? 'Não' : 'Sim', obs: (d.obs || '').slice(0, 500),
          status: 'agendada', criadoPor: u.perfil, criadoEm: agora(),
          canceladoPor: null, motivoCancelamento: '', canceladoEm: null,
        };
        lista.push(a);
        gravar(K.agend, lista);
        return comCliente(a);
      },
      async minhas() {
        const u = await exigir();
        return ler(K.agend, []).filter((a) => a.usuarioId === u.id).map(comCliente);
      },
      async todas() {
        await exigir('psicologa');
        return ler(K.agend, []).map(comCliente);
      },
      async cancelar(id, motivo = '') {
        const u = await exigir();
        const lista = ler(K.agend, []);
        const a = lista.find((x) => x.id === id);
        if (!a) throw new ErroApi('Consulta não encontrada.', 404);
        if (u.perfil !== 'psicologa' && a.usuarioId !== u.id) throw new ErroApi('Você não pode cancelar esta consulta.', 403);
        if (a.status !== 'agendada') throw new ErroApi('Esta consulta não está mais ativa.', 409);
        Object.assign(a, { status: 'cancelada', canceladoPor: u.perfil, motivoCancelamento: motivo.trim(), canceladoEm: agora() });
        gravar(K.agend, lista);
        return comCliente(a);
      },
      async concluir(id) {
        await exigir('psicologa');
        const lista = ler(K.agend, []);
        const a = lista.find((x) => x.id === id);
        if (!a) throw new ErroApi('Consulta não encontrada.', 404);
        if (a.status !== 'agendada') throw new ErroApi('Esta consulta não está mais ativa.', 409);
        a.status = 'realizada';
        gravar(K.agend, lista);
        return comCliente(a);
      },
    },

    bloqueios: {
      async listar() {
        await exigir('psicologa');
        return ler(K.bloq, []).sort((x, y) => (x.de + (x.hora || '')).localeCompare(y.de + (y.hora || '')));
      },
      // retorna o bloqueio e as consultas já marcadas que caem nele (não são canceladas sozinhas)
      async criar({ de, ate, hora, motivo }) {
        await exigir('psicologa');
        ate = ate || de;
        hora = hora || null;
        if (!RE_DATA.test(de || '') || !RE_DATA.test(ate)) throw new ErroApi('Informe a data do bloqueio.', 400);
        if (ate < de) throw new ErroApi('A data final precisa ser igual ou depois da inicial.', 400);
        if (hora && !RE_HORA.test(hora)) throw new ErroApi('Horário inválido.', 400);
        const b = { id: novoId(), de, ate, hora, motivo: (motivo || '').trim().slice(0, 120), criadoEm: agora() };
        gravar(K.bloq, [...ler(K.bloq, []), b]);
        const conflitos = ativas()
          .filter((a) => a.data >= de && a.data <= ate && (!hora || a.hora === hora))
          .map(comCliente);
        return { bloqueio: b, conflitos };
      },
      async remover(id) {
        await exigir('psicologa');
        gravar(K.bloq, ler(K.bloq, []).filter((b) => b.id !== id));
        return { ok: true };
      },
    },

    clientes: {
      async listar(busca = '') {
        await exigir('psicologa');
        const t = busca.trim().toLowerCase();
        const dig = t.replace(/\D/g, '');
        return ler(K.usuarios, [])
          .filter((u) => u.perfil === 'cliente')
          .filter((u) => !t || u.nome.toLowerCase().includes(t) || (u.email || '').includes(t)
            || (dig.length >= 3 && (u.telefone || '').replace(/\D/g, '').includes(dig)))
          .sort((a, b) => a.nome.localeCompare(b.nome))
          .map(publico);
      },
      // cliente cadastrado pela psicóloga: sem senha até ele mesmo criar a conta
      async criar({ nome, email, telefone }) {
        await exigir('psicologa');
        email = (email || '').trim().toLowerCase();
        if (!nome?.trim()) throw new ErroApi('Informe o nome do cliente.', 400);
        if ((telefone || '').replace(/\D/g, '').length !== 11) throw new ErroApi('Informe o WhatsApp com DDD (11 números).', 400);
        const us = ler(K.usuarios, []);
        if (email && us.some((u) => u.email === email)) throw new ErroApi('Já existe um cliente com este e-mail. Busque por ele na lista.', 409);
        const u = { id: novoId(), nome: nome.trim(), email, telefone, perfil: 'cliente', senhaHash: null, criadoPor: 'psicologa', criadoEm: agora() };
        us.push(u);
        gravar(K.usuarios, us);
        return publico(u);
      },
    },
  };
})();

const Api = DB_CONFIG.modo === 'api' ? HttpApi : LocalApi;
