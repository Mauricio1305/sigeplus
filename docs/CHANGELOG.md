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


## [1.1.2] - 2026-06-02
- Modularizaçao do código separando a regra de negócios /serve/routes
- Criacao de CRON para enviar mensagens de lembrete de agendamento via e-mail e whatsApp
- Implementação de Integração com API EVOLUTION para envio de Mensagens pelo WhatsApp
- Melhoria na regra de Agendamento para cancelar a gendamento apenas de nao houver pedido com status Finalizado e cancelar o pedido automatico se o status for em Orcamento.
- Melhorias de responsívidade para telas Mobile

## [1.1.3] - 2026-06-02
 - Correção serviço de Cron que parou de ser executado após modularização
 - Correção de funcionalidades do Excel que nao aparesia para o usuário admin
 - Atualização da biblioteca PDFJS para ultima versão que acusava como erro critido
 - Troca da biblioteca XLSX pela EXCELJS
 - Implementado Filtro no Relatório de Log de Mensagem

 ## [1.1.4] - 2026-06-03
 - Correção tela de Registro que dava erro no numero do WhatsApp
 - Implementação de Filtros ta tela de Logs do Cron
 - Melhoria FrontEnd na tela de Pedidos e Orçamentos que nao conseguia Editar o Primeiro Registro do Grid
 - Melhoria no FrontEnd quando o tamanho da tela era Tablet ficava desconfigurado o campo de pesquisa por nome na tela de Pedidos e Orcamentos.
 - Melhoria o Balao de aviso de assinatura que nao permitia ser fechado, agora tem a opçao de fechar.

 ## [1.1.5] - 2026-06-03
 - Correcao listagem de pedidos de origem comandas
 - Melhoria PDV para nao listar produtos e exibir a logo da empresa.
 - Melhoria no Estoque: Implementada importação de produtos via XML (NFe) com validação de dados, sanitização de segurança, limite de 100 itens e notificações estilizadas.

 
 ## [1.1.6] - 2026-06-05
 - Implementaçao de novo parametro de desconto nas configuracoe do sistema na aba Vendas.
 - Correçao no relatório de Vendas que nao estava trazendo corretamente as informacoes de vendas por origem.
 - Implementado Regra em todas as telas de venda para validar corretamente o percentual de desconto do novo parametro.

## [1.1.7] - 2026-06-08
 - Resolução de bloqueio de pop-up que impedia a visualização da impressão do Recibo Não Fiscal em produção e OS.
 - Módulo de Etiquetas (Impressão de Etiquetas) adicionado como funcionalidade configurável nos Planos, garantindo restrição de abas e proteção na API.
 - Melhoria Lancamento de Contas a Pagar/Receber parcelada.
 
---
*Este projeto adere ao [Semantic Versioning](https://semver.org/spec/v2.0.0.html).*
