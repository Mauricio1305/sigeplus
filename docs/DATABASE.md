# Documentação do Banco de Dados

O Sige Plus utiliza uma arquitetura **Multi-Tenant** baseada em um campo `tenant_id` presente em quase todas as tabelas. O sistema utiliza exclusivamente o banco de dados **PostgreSQL**.

## 🏗️ Esquema Principal

### Gestão de Assinaturas
- **planos:** Armazena os planos de assinatura (Mensal, Anual, etc.), limites de usuários e módulos liberados.
- **empresas:** Dados principais do cliente (tenant). Contém informações de contato, endereço e o status da assinatura atual.

### Autenticação e Usuários
- **usuarios:** Login e perfil do usuário. Cada usuário pertence a uma empresa (`tenant_id`).
- **recuperacao_senha:** Tokens temporários para reset de senha.
- **grupos_usuarios:** Permissões granulares por grupo.

### Negócio (Estoque e Vendas)
- **pessoas:** Cadastro unificado de Clientes e Fornecedores.
- **produtos:** Itens para venda ou serviços. Inclui controle de custo, preço de venda e estoque atual.
- **categorias_contas:** Planos de contas para classificação financeira.
- **vendas:** Cabeçalho de pedidos de venda e orçamentos.
- **vendas_itens:** Itens vinculados a cada venda.
- **tipos_pagamento:** Configuração de formas de recebimento e prazos.

### Financeiro e Operacional
- **lancamentos:** Contas a pagar e a receber (CP/CR).
- **caixa:** Controle de abertura e fechamento de fluxo de caixa diário.
- **movimentacoes_caixa:** Registro detalhado de entradas e saídas de cada caixa aberto.
- **movimentacoes_banco / movimentacoes_cartao:** Logs de conciliação financeira.
- **ordens_servico:** Gestão de solicitações técnicas e laudos (integrado ao sistema de vendas).

## 🔗 Relacionamentos Chave

- Praticamente todas as tabelas possuem `FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id)`.
- **Vendas** originam **Lançamentos** automáticos no contas a receber ou movimentações diretas no **Caixa**.
- **Produtos** têm seu `estoque_atual` atualizado automaticamente ao finalizar uma venda.

Para visualizar o script SQL completo, consulte o arquivo `schema.sql` na raiz do projeto.
