# Guia de Funcionalidades do Sige Plus

Este guia descreve as principais capacidades do sistema do ponto de vista do usuário final e regras de negócio.

## 🏢 Multi-Tenancy (Saas)
O sistema foi projetado para rodar como um serviço onde múltiplas empresas podem coexistir no mesmo hardware de forma totalmente isolada.
- Controle de acesso baseado em domínios de dados (Tenant Partitioning).
- Gestão centralizada de planos (`SuperAdmin`).

## 🛒 PDV e Vendas
- **Frente de Caixa (PDV):** Interface rápida e otimizada para vendas de balcão. Suporte a múltiplos itens e várias formas de pagamento em uma única venda.
- **Orçamentos:** Vendas podem ser iniciadas como orçamentos, que não afetam financeiro nem estoque até serem "Finalizadas".
- **Identificação:** Opção de identificar mesas ou comandas em ambientes de alimentação.

## 🔧 Ordens de Serviço (OS)
Módulo voltado para empresas de assistência técnica e serviços.
- Acompanhamento de status (Aberta, Em Andamento, Concluída).
- Laudos técnicos e registro de solicitações do cliente.
- Conversão direta de OS em Venda Finalizada.

## 📈 Gestão Financeira
- **Contas a Pagar/Receber:** Controle rigoroso de vencimentos.
- **Fluxo de Caixa:** Abertura e fechamento de caixa com conferência de saldo inicial e final.
- **DRE Simplificado:** Visão rápida da lucratividade do negócio após todas as despesas e receitas.

## 📦 Controle de Estoque
- **Movimentação Automática:** Saída automática de itens ao finalizar vendas (PDV/Mesas).
- **Estoque Mínimo:** Alertas visuais para produtos que atingem o limite de segurança.
- **Categorização:** Organização por Grupos e Categorias para facilitar relatórios.

## 💳 Sistema de Assinaturas
Integração nativa com **Stripe** para gestão de faturamento:
- Pagamento via Cartão de Crédito.
- Upgrade de plano automático após confirmação de pagamento.
- Período de Trial (Teste Grátis) configurável por plano.
- Bloqueio automático de funcionalidades caso a assinatura expire.

## 🖨️ Relatórios e Impressão
- Impressão de Comprovante de Venda (Formato 80mm).
- Exportação de dados para Excel em diversos módulos.
- Geração de PDF para relatórios financeiros e listas de estoque.
