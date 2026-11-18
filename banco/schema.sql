-- ============================================================
-- Banco de dados do site de agendamento (PostgreSQL)
-- Para MySQL: trocar UUID/gen_random_uuid por CHAR(36)/UUID(),
-- TIMESTAMPTZ por DATETIME e o índice parcial por uma checagem no backend.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- Usuários: clientes e a psicóloga (nível de acesso em "perfil")
CREATE TABLE usuarios (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome          VARCHAR(120) NOT NULL,
    email         VARCHAR(160) UNIQUE,               -- minúsculas; opcional só p/ cliente cadastrado pela psicóloga
    telefone      VARCHAR(20),
    senha_hash    VARCHAR(255),                      -- bcrypt/argon2; NULL = cadastrado pela psicóloga, ainda sem acesso
    senha_provisoria BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = senha definida pela psicóloga; o site pede para trocar
    perfil        VARCHAR(20)  NOT NULL DEFAULT 'cliente'
                  CHECK (perfil IN ('cliente', 'psicologa')),
    criado_por    VARCHAR(20)  NOT NULL DEFAULT 'cliente'
                  CHECK (criado_por IN ('cliente', 'psicologa')),
    aceite_lgpd_em TIMESTAMPTZ,                      -- preenchido quando o próprio cliente cria/ativa a conta
    criado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ,
    excluido_em   TIMESTAMPTZ                        -- exclusão lógica: some das listas e perde o acesso,
                                                     -- mas o histórico de consultas fica guardado
);
-- Consultas
CREATE TABLE agendamentos (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id           UUID NOT NULL REFERENCES usuarios(id),
    data                 DATE NOT NULL,
    hora                 TIME NOT NULL,
    modalidade           VARCHAR(20) NOT NULL DEFAULT 'Online'
                         CHECK (modalidade IN ('Presencial', 'Online')),  -- hoje só 'Online'; 'Presencial' fica para o histórico
    primeira             BOOLEAN NOT NULL DEFAULT TRUE,
    obs                  VARCHAR(500),
    status               VARCHAR(20) NOT NULL DEFAULT 'agendada'
                         CHECK (status IN ('agendada', 'cancelada', 'realizada')),
    criado_por           VARCHAR(20) NOT NULL DEFAULT 'cliente'
                         CHECK (criado_por IN ('cliente', 'psicologa')),
    cancelado_por        VARCHAR(20) CHECK (cancelado_por IN ('cliente', 'psicologa')),
    motivo_cancelamento  VARCHAR(300),
    cancelado_em         TIMESTAMPTZ,
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Impede dois agendamentos ativos no mesmo horário (garantia no banco,
-- mesmo que dois clientes confirmem ao mesmo tempo)
CREATE UNIQUE INDEX ux_agendamento_horario_ativo
    ON agendamentos (data, hora)
    WHERE status = 'agendada';

CREATE INDEX ix_agendamentos_usuario ON agendamentos (usuario_id);
CREATE INDEX ix_agendamentos_data    ON agendamentos (data);

-- Grade semanal: horários de início das sessões (0 = domingo ... 6 = sábado)
CREATE TABLE grade_horarios (
    dia_semana  SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora        TIME     NOT NULL,
    PRIMARY KEY (dia_semana, hora)
);

-- Regras gerais editáveis no painel
CREATE TABLE configuracoes (
    chave  VARCHAR(50) PRIMARY KEY,
    valor  VARCHAR(200) NOT NULL
);
INSERT INTO configuracoes (chave, valor) VALUES
    ('antecedencia_horas', '12'),   -- mínimo para o cliente agendar
    ('janela_dias', '60');          -- até quantos dias à frente a agenda abre

-- Bloqueios: dia inteiro (hora NULL, inicio = fim), período (hora NULL) ou horário específico
CREATE TABLE bloqueios (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data_inicio  DATE NOT NULL,
    data_fim     DATE NOT NULL,
    hora         TIME,
    motivo       VARCHAR(120),      -- interno, não vai para o site público
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (data_fim >= data_inicio)
);
CREATE INDEX ix_bloqueios_periodo ON bloqueios (data_inicio, data_fim);

-- Grade inicial (mesma do protótipo)
INSERT INTO grade_horarios (dia_semana, hora)
SELECT d, h::TIME FROM
    (VALUES (1),(2),(4)) AS dias(d),
    (VALUES ('08:00'),('09:00'),('10:00'),('11:00'),('14:00'),('15:00'),('16:00'),('17:00'),('18:00')) AS horas(h);
INSERT INTO grade_horarios (dia_semana, hora) VALUES
    (3,'14:00'),(3,'15:00'),(3,'16:00'),(3,'17:00'),(3,'18:00'),(3,'19:00'),
    (5,'08:00'),(5,'09:00'),(5,'10:00'),(5,'11:00'),(5,'14:00'),(5,'15:00'),(5,'16:00'),
    (6,'08:00'),(6,'09:00'),(6,'10:00');

-- Conta da psicóloga (gerar o hash da senha no backend antes de inserir)
-- INSERT INTO usuarios (nome, email, telefone, senha_hash, perfil)
-- VALUES ('Helena Moraes', 'psicologa@exemplo.com', '', '<hash bcrypt>', 'psicologa');
