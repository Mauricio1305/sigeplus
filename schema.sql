-- SQL Script for MySQL / SQLite
-- Updated for Scalability, Performance and Data Integrity

CREATE TABLE IF NOT EXISTS planos (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(255) UNIQUE NOT NULL,
    valor_mensal DECIMAL(10, 2) NOT NULL,
    limite_usuarios INTEGER NOT NULL,
    stripe_price_id VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS empresas (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) UNIQUE NOT NULL,
    nome_fantasia VARCHAR(255) NOT NULL,
    razao_social VARCHAR(255),
    cnpj VARCHAR(20),
    email VARCHAR(255) NOT NULL,
    telefone_fixo VARCHAR(20),
    telefone_celular VARCHAR(20),
    endereco TEXT,
    numero VARCHAR(20),
    cep VARCHAR(20),
    cidade VARCHAR(255),
    estado VARCHAR(2),
    plano_id INTEGER,
    status_assinatura VARCHAR(50) DEFAULT 'ativo', -- ativo, suspenso, cancelado
    vencimento_assinatura DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plano_id) REFERENCES planos(id) ON DELETE RESTRICT,
    INDEX idx_empresas_tenant_id (tenant_id)
);
-- MySQL doesn't support IF NOT EXISTS for indices in the same way, but we can just use CREATE INDEX
-- or let the table creation handle it if we define them in the table.
-- For simplicity, I'll remove IF NOT EXISTS from indices or just omit them if they are redundant.

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    senha VARCHAR(255) NOT NULL,
    avatar LONGTEXT,
    perfil VARCHAR(50) DEFAULT 'usuario', -- admin, usuario, superadmin
    ativo BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email),
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    INDEX idx_usuarios_tenant_id (tenant_id),
    INDEX idx_usuarios_email (email)
);

CREATE TABLE IF NOT EXISTS pessoas (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
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
    ativo BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    INDEX idx_pessoas_tenant_id (tenant_id),
    INDEX idx_pessoas_cpf_cnpj (cpf_cnpj),
    INDEX idx_pessoas_nome (nome)
);

CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- produto, servico
    unidade VARCHAR(20),
    custo DECIMAL(10, 2) DEFAULT 0,
    preco_venda DECIMAL(10, 2) DEFAULT 0,
    estoque_atual DECIMAL(10, 2) DEFAULT 0,
    estoque_minimo DECIMAL(10, 2) DEFAULT 0,
    categoria VARCHAR(100),
    codigo_barras VARCHAR(13),
    ativo BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    INDEX idx_produtos_tenant_id (tenant_id),
    INDEX idx_produtos_codigo_barras (codigo_barras),
    INDEX idx_produtos_nome (nome)
);

CREATE TABLE IF NOT EXISTS categorias_contas (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- receita, despesa
    ativo BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    INDEX idx_categorias_contas_tenant_id (tenant_id)
);

CREATE TABLE IF NOT EXISTS tipos_pagamento (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    nome VARCHAR(255) NOT NULL, -- Dinheiro, Cartão, PIX, etc
    prazo_dias INTEGER DEFAULT 0,
    qtd_parcelas INTEGER DEFAULT 1,
    local_lancamento VARCHAR(50) DEFAULT 'Caixa', -- Caixa, Banco, Cartão, Contas a Receber
    ativo BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    INDEX idx_tipos_pagamento_tenant_id (tenant_id)
);

CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    sequencial_id INTEGER,
    pessoa_id INTEGER,
    usuario_id INTEGER NOT NULL,
    data_venda DATETIME DEFAULT CURRENT_TIMESTAMP,
    valor_total DECIMAL(10, 2) NOT NULL,
    desconto DECIMAL(10, 2) DEFAULT 0,
    frete DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'finalizada',
    tipo VARCHAR(50) DEFAULT 'venda',
    origem VARCHAR(50) DEFAULT 'Balcao',
    solicitacao TEXT,
    laudo_tecnico TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    INDEX idx_vendas_tenant_id (tenant_id),
    INDEX idx_vendas_pessoa_id (pessoa_id),
    INDEX idx_vendas_data_venda (data_venda),
    INDEX idx_vendas_sequencial_id (tenant_id, sequencial_id)
);

CREATE TABLE IF NOT EXISTS vendas_itens (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    venda_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    quantidade DECIMAL(10, 2) NOT NULL,
    preco_unitario DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT,
    INDEX idx_vendas_itens_tenant_id (tenant_id),
    INDEX idx_vendas_itens_venda_id (venda_id),
    INDEX idx_vendas_itens_produto_id (produto_id)
);

CREATE TABLE IF NOT EXISTS lancamentos (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    tipo VARCHAR(2) NOT NULL, -- 'CR' (Contas a Receber) or 'CP' (Contas a Pagar)
    pessoa_id INTEGER,
    venda_id INTEGER,
    categoria_id INTEGER,
    tipo_pagamento_id INTEGER,
    data_lancamento DATETIME DEFAULT CURRENT_TIMESTAMP,
    vencimento DATETIME NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    valor_pago DECIMAL(10, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'aberta', -- aberta, paga, parcial
    data_pagamento DATETIME,
    descricao TEXT,
    local VARCHAR(50) DEFAULT 'Caixa', -- Caixa, Banco, Cartão, Contas a Receber
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE RESTRICT,
    FOREIGN KEY (categoria_id) REFERENCES categorias_contas(id) ON DELETE RESTRICT,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (tipo_pagamento_id) REFERENCES tipos_pagamento(id) ON DELETE RESTRICT,
    INDEX idx_lancamentos_tenant_id (tenant_id),
    INDEX idx_lancamentos_vencimento (vencimento),
    INDEX idx_lancamentos_venda_id (venda_id),
    INDEX idx_lancamentos_pessoa_id (pessoa_id)
);

CREATE TABLE IF NOT EXISTS caixa (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    usuario_id INTEGER NOT NULL,
    data_abertura DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_fechamento DATETIME,
    valor_inicial DECIMAL(10, 2) DEFAULT 0,
    valor_final DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'aberto', -- aberto, fechado
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    INDEX idx_caixa_tenant_id (tenant_id),
    INDEX idx_caixa_status (status)
);

CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    caixa_id INTEGER NOT NULL,
    venda_id INTEGER,
    tipo_pagamento_id INTEGER,
    origem VARCHAR(50) DEFAULT 'Venda',
    tipo VARCHAR(50) NOT NULL, -- entrada, saida
    valor DECIMAL(10, 2) NOT NULL,
    descricao TEXT,
    data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (caixa_id) REFERENCES caixa(id) ON DELETE CASCADE,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (tipo_pagamento_id) REFERENCES tipos_pagamento(id) ON DELETE RESTRICT,
    INDEX idx_movimentacoes_caixa_tenant_id (tenant_id),
    INDEX idx_movimentacoes_caixa_caixa_id (caixa_id),
    INDEX idx_movimentacoes_caixa_venda_id (venda_id)
);

CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    sequencial_id INTEGER,
    pessoa_id INTEGER,
    data_os DATETIME DEFAULT CURRENT_TIMESTAMP,
    descricao TEXT,
    valor_total DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'aberta',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE RESTRICT,
    INDEX idx_ordens_servico_tenant_id (tenant_id),
    INDEX idx_ordens_servico_pessoa_id (pessoa_id),
    INDEX idx_ordens_servico_sequencial_id (tenant_id, sequencial_id)
);

CREATE TABLE IF NOT EXISTS movimentacoes_banco (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    venda_id INTEGER,
    lancamento_id INTEGER,
    categoria_id INTEGER,
    origem VARCHAR(50) DEFAULT 'Venda',
    tipo VARCHAR(50) NOT NULL, -- entrada, saida
    valor DECIMAL(10, 2) NOT NULL,
    descricao TEXT,
    data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE SET NULL,
    FOREIGN KEY (categoria_id) REFERENCES categorias_contas(id) ON DELETE RESTRICT,
    INDEX idx_movimentacoes_banco_tenant_id (tenant_id)
);

CREATE TABLE IF NOT EXISTS movimentacoes_cartao (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    tenant_id VARCHAR(255) NOT NULL,
    venda_id INTEGER,
    lancamento_id INTEGER,
    categoria_id INTEGER,
    origem VARCHAR(50) DEFAULT 'Venda',
    tipo_cartao VARCHAR(50) DEFAULT 'credito',
    tipo VARCHAR(50) NOT NULL, -- entrada, saida
    valor DECIMAL(10, 2) NOT NULL,
    descricao TEXT,
    data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE,
    FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
    FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE SET NULL,
    FOREIGN KEY (categoria_id) REFERENCES categorias_contas(id) ON DELETE RESTRICT,
    INDEX idx_movimentacoes_cartao_tenant_id (tenant_id)
);

-- Seed Initial Plans
INSERT IGNORE INTO planos (id, nome, valor_mensal, limite_usuarios, stripe_price_id) VALUES (1, 'Start', 49.90, 1, 'price_1T9qwJD69xPL9EMAIzuI14xh');
INSERT IGNORE INTO planos (id, nome, valor_mensal, limite_usuarios, stripe_price_id) VALUES (2, 'Basic', 69.90, 2, 'price_1T9qwJD69xPL9EMAIzuI14xh');
INSERT IGNORE INTO planos (id, nome, valor_mensal, limite_usuarios, stripe_price_id) VALUES (3, 'Essential', 99.90, 5, 'price_1T9qwJD69xPL9EMAIzuI14xh');
INSERT IGNORE INTO planos (id, nome, valor_mensal, limite_usuarios, stripe_price_id) VALUES (4, 'Enterprise', 149.90, 9999, 'price_1T9qwJD69xPL9EMAIzuI14xh');

CREATE TABLE IF NOT EXISTS recuperacao_senha (
    id INTEGER PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    codigo VARCHAR(10) NOT NULL,
    expira_em DATETIME NOT NULL,
    usado BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_recuperacao_senha_email (email),
    INDEX idx_recuperacao_senha_codigo (codigo)
);

-- Migrations
-- Handled in server.ts initDB()
