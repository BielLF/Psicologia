# Contrato da API

O front-end já chama estas rotas quando `DB_CONFIG.modo = 'api'` (em `assets/db.js`).
O backend pode ser em qualquer linguagem; só precisa respeitar o contrato abaixo.

- Base: `DB_CONFIG.apiUrl` (ex.: `https://seusite.com.br/api`)
- Autenticação: JWT no header `Authorization: Bearer <token>`
- Erros: status HTTP adequado + corpo `{ "mensagem": "texto para mostrar ao usuário" }`
- Datas `AAAA-MM-DD`, horas `HH:MM`

## Objetos

```json
// Usuario (nunca devolver senha_hash)
{ "id": "uuid", "nome": "Ana Souza", "email": "ana@email.com", "telefone": "(11) 98765-4321",
  "perfil": "cliente", "temAcesso": true }          // temAcesso = tem senha definida

// Config
{ "grade": { "0": [], "1": ["08:00", "09:00"], "...": [] },   // 0 = domingo ... 6 = sábado
  "antecedenciaHoras": 12, "janelaDias": 60 }

// Bloqueio
{ "id": "uuid", "de": "2027-01-10", "ate": "2027-01-24", "hora": null, "motivo": "Férias" }

// Agendamento
{
  "id": "uuid", "usuarioId": "uuid", "data": "2026-11-20", "hora": "10:00",
  "modalidade": "Presencial", "primeira": "Sim", "obs": "",
  "status": "agendada",               // agendada | cancelada | realizada
  "criadoPor": "cliente",             // cliente | psicologa
  "canceladoPor": null,               // cliente | psicologa
  "motivoCancelamento": "", "canceladoEm": null, "criadoEm": "2026-11-12T13:45:00Z",
  "cliente": { /* Usuario */ }
}
```

## Rotas

### Conta
| Método | Rota | Quem pode | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| POST | `/auth/cadastro` | público | `{nome, email, telefone, senha}` | `{token, usuario}` — sempre perfil `cliente`. Se o e-mail já existe **sem senha** (cadastrado pela psicóloga), ativa essa conta |
| POST | `/auth/login` | público | `{email, senha}` | `{token, usuario}` · 401 se inválido ou conta sem senha |
| GET | `/auth/me` | logado | — | `Usuario` |

### Configuração e grade
| Método | Rota | Quem pode | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| GET | `/config` | público | — | `Config` |
| PUT | `/config` | psicóloga | `Config` | `Config` salva (horas ordenadas, sem repetição) · 400 se inválida |

### Agendamentos
| Método | Rota | Quem pode | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| GET | `/agendamentos/ocupados` | público | `?de=&ate=` | `[{data, hora}]` — consultas ativas + bloqueios; `hora: null` = dia todo. **Sem dados de cliente nem motivo** |
| POST | `/agendamentos` | cliente ou psicóloga | `{data, hora, modalidade, primeira, obs}` + `usuarioId` quando for a psicóloga | `Agendamento` · 409 se ocupado/indisponível |
| GET | `/agendamentos/meus` | logado | — | `[Agendamento]` do usuário logado |
| GET | `/agendamentos` | psicóloga | — | `[Agendamento]` de todos, com `cliente` |
| POST | `/agendamentos/:id/cancelar` | dono ou psicóloga | `{motivo}` | `Agendamento` · 403 se não for dono · 409 se não estiver `agendada` |
| POST | `/agendamentos/:id/concluir` | psicóloga | — | `Agendamento` com status `realizada` |

### Bloqueios
| Método | Rota | Quem pode | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| GET | `/bloqueios` | psicóloga | — | `[Bloqueio]` |
| POST | `/bloqueios` | psicóloga | `{de, ate, hora, motivo}` | `{bloqueio, conflitos: [Agendamento]}` — consultas ativas que caem no bloqueio (**não** são canceladas) |
| DELETE | `/bloqueios/:id` | psicóloga | — | `{ok: true}` |

### Clientes
| Método | Rota | Quem pode | Corpo / parâmetros | Resposta |
|---|---|---|---|---|
| GET | `/clientes` | psicóloga | `?busca=` (nome, e-mail ou telefone) | `[Usuario]` |
| POST | `/clientes` | psicóloga | `{nome, telefone, email?}` | `Usuario` sem senha · 409 se e-mail já existe |

## Regras que o servidor deve garantir (não confiar no navegador)

1. O perfil vem do token, nunca do corpo da requisição. Cadastro público sempre cria `cliente`.
2. **Cliente** ao agendar: horário precisa estar na grade do dia da semana, fora de bloqueios,
   respeitar `antecedenciaHoras` e `janelaDias`, e estar livre.
3. **Psicóloga** ao agendar: precisa informar `usuarioId` de um cliente; pode encaixar fora da
   grade e em bloqueios, mas não no passado nem em horário já ocupado. `criadoPor = 'psicologa'`.
4. O índice único `ux_agendamento_horario_ativo` impede dois agendamentos no mesmo horário.
5. Cliente só lê e cancela as próprias consultas; a psicóloga lê e cancela todas.
6. `canceladoPor` é preenchido pelo servidor a partir do perfil de quem cancelou.
7. Ativação de conta cadastrada pela psicóloga: **exigir confirmação por e-mail** (link com token)
   antes de definir a senha — senão qualquer pessoa que souber o e-mail poderia tomar a conta.
8. Senhas com bcrypt/argon2; HTTPS obrigatório; limitar tentativas de login.

A simulação local (`LocalApi` em `assets/db.js`) segue essas mesmas regras (exceto a confirmação
por e-mail do item 7), então serve de referência de comportamento.
