# Regras de Negócio - Sige Plus

Este documento detalha as regras lógicas e comportamentais do sistema para garantir a integridade dos dados e a consistência nos processos de negócio.

## 1. Isolamento de Dados (Multi-Tenancy)
- **Tenant ID:** Todo registro (usuário, produto, venda, lançamento) é obrigatoriamente vinculado a um `tenant_id`.
- **Filtro Estrito:** Nenhuma consulta SQL ou operação de API pode ser realizada sem o filtro do `tenant_id` do usuário autenticado. Isso garante que uma empresa nunca visualize dados de outra.

## 2. Gestão de Vendas e PDV
### 2.1 Orçamentos vs. Vendas
- **Orçamento (Status: 'orcamento'):** Não gera baixa de estoque nem gera lançamentos no financeiro. Serve apenas para registro e conferência.
- **Venda Finalizada (Status: 'finalizada'):** Operação irreversível (exceto via cancelamento) que dispara:
  - Baixa automática no estoque para itens do tipo 'produto'.
  - Geração de lançamentos financeiros (Receber ou Entrada no Caixa).

### 2.2 Controle de Estoque
- **Tipos de Itens:** Apenas itens marcados como 'produto' sofrem movimentação de estoque. Itens do tipo 'serviço' não possuem saldo físico.
- **Venda de Itens:** Ao finalizar uma venda, o `estoque_atual` do produto é reduzido pela quantidade vendida.
- **Cancelamento:** Se uma venda finalizada for cancelada, a quantidade dos produtos retorna automaticamente ao estoque.

### 2.3 Regras de Pagamento e Financeiro
- **Local de Lançamento:** Definido no cadastro do 'Tipo de Pagamento':
  - **Caixa:** Se houver um caixa aberto para o tenant, a entrada é registrada em `movimentacoes_caixa`. Se o caixa estiver fechado, o sistema cria um lançamento em 'Contas a Receber' com o local 'Caixa' (pendente de liquidação).
  - **Banco/Cartão/Receber:** Gera registros na tabela `lancamentos` (CR - Contas a Receber).
- **Parcelamento:** Se o pagamento possuir parcelas, o sistema divide o valor total e cria múltiplos lançamentos com vencimentos sucessivos (intervalo de 30 dias entre parcelas).
- **Status Automático:** Lançamentos com destino 'Banco' ou 'Cartão' e prazo zero são marcados automaticamente como 'paga' no momento da venda.

## 3. Ordens de Serviço (OS)
- **Fluxo de Trabalho:** Uma OS pode ser editada livremente enquanto estiver em status de orçamento.
- **Faturamento:** Ao finalizar uma OS, ela segue as mesmas regras de estoque e financeiro de uma venda comum.
- **Campos Específicos:** Requer obrigatoriamente descrição da Solicitação (defeito relatado) e permite o preenchimento de Laudo Técnico.

## 4. Assinaturas e Planos
- **Limites do Plano:** O sistema bloqueia a criação de novos usuários caso o limite definido no plano da empresa tenha sido atingido.
- **Vencimento:** Através do middleware `authMiddleware`, o sistema verifica a data `vencimento_assinatura`. Se vencida, o acesso às funcionalidades de escrita é bloqueado, permitindo apenas visualização ou acesso à tela de renovação.
- **Status da Assinatura:**
  - `ativo`: Acesso total.
  - `atrasado`: Alerta ao usuário (grace period).
  - `cancelado` ou `suspenso`: Bloqueio de acesso.

## 5. Permissões de Usuário
- **Perfil Admin:** Possui acesso total dentro de seu tenant.
- **Perfil Usuário:** Restrito às permissões definidas em seu `grupo_id`.
- **Grupos Master:** Grupos criados pelo sistema (como o Admin padrão) não podem ter seu nome alterado ou serem excluídos, garantindo que sempre haja ao menos uma conta com poder total de gestão no tenant.

## 6. Integridade Referencial
- **Exclusão de Produtos:** Não se pode excluir um produto que já possua histórico de movimentação em vendas ou estoque. Nesses casos, o produto deve ser marcado como 'Inativo'.
- **Exclusão de Clientes:** Clientes com vendas ou títulos financeiros vinculados não podem ser removidos do sistema.
