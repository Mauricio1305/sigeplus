# Documentação da API

A API do Sige Plus é construída em Node.js usando Express. Todos os endpoints privados requerem um token de autenticação JWT enviado no header `Authorization: Bearer <token>`.

## 📂 Endpoints de Autenticação

- `POST /api/register`: Registro de nova empresa e primeiro usuário admin.
- `POST /api/login`: Autentica usuário e retorna JWT + dados da empresa.
- `POST /api/forgot-password`: Solicita código de recuperação por e-mail.
- `POST /api/reset-password`: Redefine a senha usando o código recebido.

## 📦 Produtos e Estoque

- `GET /api/products`: Lista todos os produtos/serviços do tenant.
- `POST /api/products`: Cria um novo produto.
- `PUT /api/products/:id`: Atualiza dados do produto.
- `DELETE /api/products/:id`: Remove produto (se não houver vínculos).
- `GET /api/inventory/groups`: Gerencia grupos de produtos.

## 🤝 Pessoas (Clientes e Fornecedores)

- `GET /api/pessoas`: Lista cadastros conforme `tipo_pessoa` (cliente, fornecedor ou ambos).
- `POST /api/pessoas`: Cria novo cadastro.
- `PUT /api/pessoas/:id`: Edita cadastro existente.

## 💰 Financeiro

- `GET /api/finance/accounts`: Lista lançamentos (CR/CP) com filtros de data e status.
- `POST /api/finance/accounts`: Cria lançamento manual.
- `POST /api/finance/cashier/open`: Abre o caixa do dia.
- `POST /api/finance/cashier/close`: Fecha o caixa calculando saldos.
- `GET /api/finance/categories`: Gerencia categorias de receitas/despesas.

## 🛒 Vendas e PDV

- `POST /api/sales`: Registra uma nova venda ou orçamento. Gera baixas de estoque e lançamentos financeiros.
- `GET /api/sales`: Histórico de vendas do tenant.
- `POST /api/sales/:id/cancel`: Cancela venda, estornando financeiro e devolvendo itens ao estoque.
- `GET /api/sales/:id`: Detalhes de uma venda específica.

## 📊 Dashboard e Relatórios

- `GET /api/dashboard/stats`: Resumo de faturamento, vendas e cobranças do mês.
- `GET /api/dashboard/charts`: Dados mensais para gráficos comparativos de receitas x despesas.
- `GET /api/reports/dre`: Gera Relatório de Demonstração do Resultado do Exercício.

## 💳 Assinaturas (Stripe)

- `GET /api/plans`: Lista planos disponíveis para upgrade/downgrade.
- `POST /api/subscription/create-checkout`: Inicia fluxo de pagamento no Stripe.
- `POST /api/stripe-webhook`: Endpoint para processamento de eventos do Stripe em tempo real.
