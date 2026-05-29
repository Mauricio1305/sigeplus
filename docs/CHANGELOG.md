# Changelog

Todos os marcos importantes e mudanças notáveis neste projeto serão documentados neste arquivo.

## [1.0.0] - 2026-05-28
### 🚀 Lançamento Inicial (Versão Estável)

#### Adicionado
- **Core SaaS**: Sistema Multi-Tenant completo com isolamento de dados por `tenant_id`.
- **PDV (Frente de Caixa)**: Interface otimizada para vendas rápidas com suporte a múltiplos métodos de pagamento.
- **Gestão Financeira**: Fluxo de caixa, Contas a Pagar/Receber e relatórios de DRE.
- **Estoque & Produtos**: Controle de movimentação automática e suporte a categorias.
- **Assinaturas**: Integração nativa com Stripe para gestão de planos e pagamentos recorrentes.
- **Ordens de Serviço**: Módulo completo para assistência técnica com laudos e orçamentos.
- **Segurança**: Autenticação via JWT e controle de permissões por grupos de usuários.

#### Alterado
- **Migração de Banco**: Refatoração completa do backend para utilizar exclusivamente **PostgreSQL**, otimizando consultas e performance.
- **IDs de Venda**: Implementado suporte híbrido para `ID` interno e `sequencial_id` nas rotas de API.

#### Melhores Práticas
- Documentação técnica completa (`README.md`, `API.md`, `DATABASE.md`, `BUSINESS_RULES.md`).
- Padronização de logs de erro e monitoramento preliminar.

---
*Este projeto adere ao [Semantic Versioning](https://semver.org/spec/v2.0.0.html).*

## [1.0.0] - 2026-05-29

### Adicionado
- **Modulo de Agendamento**: 