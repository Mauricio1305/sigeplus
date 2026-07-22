-- SQL Script for MySQL / SQLite
-- Updated for Scalability, Performance and Data Integrity

CREATE TABLE IF NOT EXISTS planos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) UNIQUE NOT NULL,
    valor_mensal DECIMAL(10, 2) NOT NULL,
    limite_usuarios INTEGER NOT NULL,
    modulos JSONB,
    is_trial SMALLINT DEFAULT 0,
    trial_days INTEGER DEFAULT NULL,
    stripe_price_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) UNIQUE NOT NULL,
    nome_fantasia VARCHAR(255) NOT NULL,
    razao_social VARCHAR(255),
    cnpj VARCHAR(20),
    email VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20),
    telefone_fixo VARCHAR(20),
    telefone_celular VARCHAR(20),
    endereco TEXT,
    numero VARCHAR(20),
    cep VARCHAR(20),
    cidade VARCHAR(255),
    estado VARCHAR(2),
    plano_id INTEGER,
    status_assinatura VARCHAR(50) DEFAULT 'ativo', -- ativo, suspenso, cancelado
    vencimento_assinatura TIMESTAMP,
    max_desconto_venda DECIMAL(5, 2) DEFAULT 0,
    whatsapp_api_url VARCHAR(255),
    whatsapp_api_key VARCHAR(255),
    whatsapp_instance VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plano_id) REFERENCES planos(id) ON DELETE RESTRICT
);
-- MySQL doesn't support IF NOT EXISTS for indices in the same way, but we can just use CREATE INDEX
-- or let the table creation handle it if we define them in the table.
-- For simplicity, I'll remove IF NOT EXISTS from indices or just omit them if they are redundant.

CREATE TABLE IF NOT EXISTS grupos_usuarios (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    is_master BOOLEAN DEFAULT false,
    permissoes JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    senha VARCHAR(255) NOT NULL,
    avatar TEXT,
    perfil VARCHAR(50) DEFAULT 'usuario', -- admin, usuario, superadmin
    grupo_id INTEGER,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email),
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (grupo_id) REFERENCES grupos_usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pessoas (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    sequencial_id INTEGER,
    nome VARCHAR(255) NOT NULL,
    tipo_pessoa VARCHAR(50) DEFAULT 'cliente', -- cliente, fornecedor, ambos
    cpf_cnpj VARCHAR(20),
    telefone VARCHAR(20),
    email VARCHAR(255),
    endereco TEXT,
    numero VARCHAR(20),
    bairro VARCHAR(255),
    cidade VARCHAR(255),
    uf VARCHAR(2),
    cep VARCHAR(20),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS grupos_produtos (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    sequencial_id INTEGER,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- produto, servico
    unidade VARCHAR(20),
    custo DECIMAL(10, 2) DEFAULT 0,
    preco_venda DECIMAL(10, 2) DEFAULT 0,
    estoque_atual DECIMAL(10, 2) DEFAULT 0,
    estoque_minimo DECIMAL(10, 2) DEFAULT 0,
    categoria VARCHAR(100),
    codigo_barras VARCHAR(13),
    tempo_execucao INTEGER DEFAULT 0, -- Tempo em minutos para serviços
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS categorias_contas (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- receita, despesa
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tipos_pagamento (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL, -- Dinheiro, Cartão, PIX, etc
    prazo_dias INTEGER DEFAULT 0,
    qtd_parcelas INTEGER DEFAULT 1,
    local_lancamento VARCHAR(50) DEFAULT 'Caixa', -- Caixa, Banco, Cartão, Contas a Receber
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vendas (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    sequencial_id INTEGER,
    pessoa_id INTEGER,
    usuario_id INTEGER NOT NULL,
    data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    valor_total DECIMAL(10, 2) NOT NULL,
    desconto DECIMAL(10, 2) DEFAULT 0,
    frete DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'finalizada',
    tipo VARCHAR(50) DEFAULT 'venda',
    origem VARCHAR(50) DEFAULT 'Balcao',
    solicitacao TEXT,
    laudo_tecnico TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS vendas_itens (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    venda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    quantidade DECIMAL(10, 2) NOT NULL,
    preco_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS lancamentos (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    tipo VARCHAR(2) NOT NULL, -- 'CR' (Contas a Receber) or 'CP' (Contas a Pagar)
    pessoa_id INTEGER,
    venda_id INTEGER,
    categoria_id INTEGER,
    tipo_pagamento_id INTEGER,
    data_lancamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    vencimento TIMESTAMP NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    valor_pago DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'aberta', -- aberta, paga, parcial
    data_pagamento TIMESTAMP,
    descricao TEXT,
    local VARCHAR(50) DEFAULT 'Caixa', -- Caixa, Banco, Cartão, Contas a Receber
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE RESTRICT,
    FOREIGN KEY (categoria_id) REFERENCES categorias_contas(id) ON DELETE RESTRICT,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (tipo_pagamento_id) REFERENCES tipos_pagamento(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS caixa (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    usuario_id INTEGER NOT NULL,
    data_abertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_fechamento TIMESTAMP,
    valor_inicial DECIMAL(10, 2) DEFAULT 0,
    valor_final DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'aberto', -- aberto, fechado
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    caixa_id INTEGER NOT NULL,
    venda_id INTEGER,
    tipo_pagamento_id INTEGER,
    origem VARCHAR(50) DEFAULT 'Venda',
    tipo VARCHAR(50) NOT NULL, -- entrada, saida
    valor DECIMAL(10, 2) NOT NULL,
    descricao TEXT,
    data_movimentacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (caixa_id) REFERENCES caixa(id) ON DELETE CASCADE,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (tipo_pagamento_id) REFERENCES tipos_pagamento(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS ordens_servico (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    sequencial_id INTEGER,
    pessoa_id INTEGER,
    data_os TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    descricao TEXT,
    valor_total DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'aberta',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS movimentacoes_banco (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    venda_id INTEGER,
    lancamento_id INTEGER,
    categoria_id INTEGER,
    origem VARCHAR(50) DEFAULT 'Venda',
    tipo VARCHAR(50) NOT NULL, -- entrada, saida
    valor DECIMAL(10, 2) NOT NULL,
    descricao TEXT,
    data_movimentacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE SET NULL,
    FOREIGN KEY (categoria_id) REFERENCES categorias_contas(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS movimentacoes_cartao (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    venda_id INTEGER,
    lancamento_id INTEGER,
    categoria_id INTEGER,
    origem VARCHAR(50) DEFAULT 'Venda',
    tipo_cartao VARCHAR(50) DEFAULT 'credito',
    tipo VARCHAR(50) NOT NULL, -- entrada, saida
    valor DECIMAL(10, 2) NOT NULL,
    descricao TEXT,
    data_movimentacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE SET NULL,
    FOREIGN KEY (categoria_id) REFERENCES categorias_contas(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS agendamentos (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    usuario_id INTEGER NOT NULL, -- Profissional
    pessoa_id INTEGER, -- Cliente
    data_inicio TIMESTAMP NOT NULL,
    data_fim TIMESTAMP NOT NULL,
    valor_total DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Pendente', -- Pendente, Confirmado, Check-in Realizado, Concluido, Cancelado
    observacao TEXT,
    venda_id INTEGER, -- Vinculo com a venda quando concluir
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agendamentos_itens (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    agendamento_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL, -- Produto ou Servico
    quantidade DECIMAL(10, 2) DEFAULT 1,
    preco_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS recuperacao_senha (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    codigo VARCHAR(10) NOT NULL,
    expira_em TIMESTAMP NOT NULL,
    usado BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrations
-- Handled in server.ts initDB()

-- Postgres Indexes
CREATE INDEX IF NOT EXISTS idx_empresas_tenant_id ON empresas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_id ON usuarios (tenant_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);
CREATE INDEX IF NOT EXISTS idx_pessoas_tenant_id ON pessoas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf_cnpj ON pessoas (cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON pessoas (nome);
CREATE INDEX IF NOT EXISTS idx_produtos_tenant_id ON produtos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON produtos (codigo_barras);
CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos (nome);
CREATE INDEX IF NOT EXISTS idx_categorias_contas_tenant_id ON categorias_contas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tipos_pagamento_tenant_id ON tipos_pagamento (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendas_tenant_id ON vendas (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendas_pessoa_id ON vendas (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data_venda ON vendas (data_venda);
CREATE INDEX IF NOT EXISTS idx_vendas_sequencial_id ON vendas (tenant_id, sequencial_id);
CREATE INDEX IF NOT EXISTS idx_vendas_itens_tenant_id ON vendas_itens (tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendas_itens_venda_id ON vendas_itens (venda_id);
CREATE INDEX IF NOT EXISTS idx_vendas_itens_produto_id ON vendas_itens (produto_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_tenant_id ON lancamentos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_vencimento ON lancamentos (vencimento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_venda_id ON lancamentos (venda_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_pessoa_id ON lancamentos (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_caixa_tenant_id ON caixa (tenant_id);
CREATE INDEX IF NOT EXISTS idx_caixa_status ON caixa (status);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_tenant_id ON movimentacoes_caixa (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_caixa_id ON movimentacoes_caixa (caixa_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_venda_id ON movimentacoes_caixa (venda_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_tenant_id ON ordens_servico (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_pessoa_id ON ordens_servico (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_ordens_servico_sequencial_id ON ordens_servico (tenant_id, sequencial_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_banco_tenant_id ON movimentacoes_banco (tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_cartao_tenant_id ON movimentacoes_cartao (tenant_id);
CREATE INDEX IF NOT EXISTS idx_recuperacao_senha_email ON recuperacao_senha (email);
CREATE INDEX IF NOT EXISTS idx_recuperacao_senha_codigo ON recuperacao_senha (codigo);

CREATE TABLE IF NOT EXISTS stripe_logs (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255),
    stripe_event_id VARCHAR(255) UNIQUE,
    event_type VARCHAR(255) NOT NULL,
    status VARCHAR(50),
    payload JSONB,
    previous_attributes JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stripe_logs_tenant_id ON stripe_logs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_agendamentos_tenant_id ON agendamentos (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_usuario_id ON agendamentos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos (data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_agendamentos_itens_agendamento ON agendamentos_itens (agendamento_id);
