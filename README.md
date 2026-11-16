# Site — Psicóloga (protótipo)

Site estático (HTML + CSS + JS puro, sem build). Abra o `index.html` no navegador.

## Páginas
| Arquivo | Para quem | O que faz |
|---|---|---|
| `index.html` | todos | Site + agenda. Escolher horário é livre; para confirmar, precisa estar logado. |
| `entrar.html` | todos | Entrar / criar conta. Guarda o horário escolhido e volta para concluir. |
| `minha-conta.html` | cliente | Próximas consultas (pode cancelar) e histórico, com o motivo quando a psicóloga cancela. |
| `painel.html` | psicóloga | **Consultas**: todas por dia, cancelar com motivo, marcar como realizada, **Nova consulta** em nome de um cliente (cadastrado ou novo, com encaixe fora da grade). **Grade de horários**: editar horários por dia da semana, antecedência mínima e até quando a agenda abre. **Bloqueios**: dia inteiro, período ou horário específico. |

## Níveis de acesso
- **cliente**: cria conta pelo site, agenda e cancela as próprias consultas.
- **psicologa**: não se cadastra pelo site (é criada no banco). Vê e cancela qualquer consulta, edita a grade e os bloqueios, agenda em nome de clientes.
- Cliente cadastrado pela psicóloga fica **sem senha**; para acessar o site, ele usa "Criar conta" com o mesmo e-mail.

No protótipo, a conta da psicóloga já existe: **psicologa@exemplo.com / troque123**.

## Código
- `assets/db.js` — **camada de dados**. Única parte que conversa com o armazenamento.
  - `modo: 'local'` → simula o banco no navegador (localStorage), com as mesmas regras de permissão.
  - `modo: 'api'` → chama o backend via HTTP. Para ligar no banco, troque o modo e ajuste `apiUrl`.
- `assets/comum.js` — dados fixos (`CONFIG`: nome, WhatsApp) e utilidades. Grade, antecedência e bloqueios ficam no banco e são editados no painel.
- `assets/app.js`, `entrar.js`, `minha-conta.js`, `painel.js` + `painel-config.js` — uma por página.
- `banco/schema.sql` — tabelas (PostgreSQL).
- `banco/API.md` — rotas que o backend precisa ter e as regras de segurança.

## Para testar do zero
F12 → Application → Local Storage → apague as chaves `psi_*`.

## Textos fictícios para trocar
Nome "Helena Moraes", CRP 00/00000, endereço, e-mail, telefone/WhatsApp, valores e fotos (Unsplash).
