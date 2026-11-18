# Site — Psicóloga (protótipo)

Site estático (HTML + CSS + JS puro, sem build). Abra o `index.html` no navegador.

## Páginas
| Arquivo | Para quem | O que faz |
|---|---|---|
| `index.html` | todos | Site + agenda. Os 3 próximos horários livres aparecem para todos; a grade completa só aparece depois de entrar. |
| `entrar.html` | todos | Entrar / criar conta (`?aba=cadastro` abre direto em "Criar conta"). Guarda o horário escolhido e volta para concluir. |
| `minha-conta.html` | cliente | Próximas consultas (pode cancelar, com motivo obrigatório), histórico com o motivo quando a psicóloga cancela, e **Alterar senha**. |
| `painel.html` | psicóloga | **Consultas**: todas por dia, cancelar com motivo, marcar como realizada, **Nova consulta** em nome de um cliente (cadastrado ou novo, com encaixe fora da grade). **Grade de horários**: editar horários por dia da semana, antecedência mínima e até quando a agenda abre. **Bloqueios**: dia inteiro, período ou horário específico. **Clientes**: lista com busca, incluir, editar, excluir e agendar direto pelo cliente. |

## Níveis de acesso
- **cliente**: cria conta pelo site, agenda e cancela as próprias consultas.
- **psicologa**: não se cadastra pelo site (é criada no banco). Vê e cancela qualquer consulta, edita a grade e os bloqueios, agenda em nome de clientes.
- Atendimento **só online**: não há escolha de modalidade; toda consulta é gravada como `Online`.
- Bloqueios valem para todos: nem a psicóloga consegue agendar num dia/horário bloqueado.
- Cliente cadastrado pela psicóloga: se tiver e-mail, ela já define uma senha inicial (vem preenchida com `Senha@123`, em `CONFIG.senhaPadrao`) e pode mandar o acesso pelo WhatsApp. O cliente vê um aviso para trocar a senha. Sem e-mail, fica sem acesso; para acessar depois, ele usa "Criar conta" com o mesmo e-mail.
- Excluir cliente é uma **exclusão lógica**: ele some das listas e perde o acesso, as consultas futuras são canceladas e o histórico fica guardado. Cadastrar de novo com o mesmo e-mail reativa o cadastro.

No protótipo, a conta da psicóloga já existe: **psicologa@exemplo.com / troque123**.

## Código
- `assets/db.js` — **camada de dados**. Única parte que conversa com o armazenamento.
  - `modo: 'local'` → simula o banco no navegador (localStorage), com as mesmas regras de permissão.
  - `modo: 'api'` → chama o backend via HTTP. Para ligar no banco, troque o modo e ajuste `apiUrl`.
- `assets/comum.js` — dados fixos (`CONFIG`: nome, WhatsApp) e utilidades. Grade, antecedência e bloqueios ficam no banco e são editados no painel.
- `assets/app.js`, `entrar.js`, `minha-conta.js`, `painel.js` + `painel-config.js` + `painel-clientes.js` — uma por página.
- `banco/schema.sql` — tabelas (PostgreSQL).
- `banco/API.md` — rotas que o backend precisa ter e as regras de segurança.

## Para testar do zero
F12 → Application → Local Storage → apague as chaves `psi_*`.

## Textos fictícios para trocar
Nome "Helena Moraes", CRP 00/00000, endereço, e-mail, telefone/WhatsApp, valores e fotos (Unsplash).
