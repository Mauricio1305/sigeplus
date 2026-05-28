# Sige Plus - Sistema de Gestão Inteligente

O **Sige Plus** é um sistema SaaS (Software as a Service) completo desenvolvido para simplificar a gestão de pequenas e médias empresas. Oferece uma solução robusta para controle de estoque, financeiro, vendas (PDV), ordens de serviço e gestão multi-tenant.

## 🚀 Tecnologias Utilizadas

O sistema utiliza uma stack moderna e performática:

- **Frontend:**
  - [React](https://reactjs.org/) (com Vite)
  - [Tailwind CSS](https://tailwindcss.com/) para estilização
  - [Zustand](https://docs.pmnd.rs/zustand/getting-started/introduction) para gerenciamento de estado
  - [Motion](https://motion.dev/) para animações
  - [Lucide React](https://lucide.dev/) para ícones
- **Backend:**
  - [Node.js](https://nodejs.org/) com [Express](https://expressjs.com/)
  - [TypeScript](https://www.typescriptlang.org/) para segurança de tipos
  - [PostgreSQL](https://www.postgresql.org/) (via Pool de conexões)
- **Integrações:**
  - [Stripe](https://stripe.com/) para pagamentos e assinaturas
  - [Nodemailer](https://nodemailer.com/) para envio de e-mails transacionais (boas-vindas, recuperação de senha)

## 📁 Estrutura do Projeto

- `/src/pages`: Componentes de página (PDV, Financeiro, Estoque, etc.)
- `/src/components`: Componentes reutilizáveis (UI, Layout, Auth)
- `/src/store`: Gerenciamento de estado global com Zustand
- `/src/utils`: Funções utilitárias (formatação, validação)
- `server.ts`: Ponto de entrada do backend API
- `schema-pg.sql`: Definição do banco de dados relacional (PostgreSQL)

## 🛠️ Como Iniciar

1. **Instalação:**
   ```bash
   npm install
   ```

2. **Configuração de Ambiente:**
   Crie um arquivo `.env` baseado no `.env.example` com suas credenciais de banco de dados e chaves de API.

3. **Inicialização (Desenvolvimento):**
   ```bash
   npm run dev
   ```

4. **Build para Produção:**
   ```bash
   npm run build
   npm start
   ```

## 📖 Documentação Detalhada

Para mais informações sobre partes específicas do sistema, consulte:

- [Documentação de Banco de Dados](DATABASE.md)
- [Documentação de API](API.md)
- [Guia de Funcionalidades](FEATURES.md)
- [Regras de Negócio](BUSINESS_RULES.md)
- [Registro de Alterações (Changelog)](CHANGELOG.md)
- [Guia de Versionamento](VERSIONING.md)
