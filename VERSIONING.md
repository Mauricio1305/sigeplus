# Guia de Versionamento - Sige Plus

Este projeto segue as diretrizes do **Semantic Versioning 2.0.0 (SemVer)**.

## Estrutura da Versão
A versão é composta por três números: `MAJOR.MINOR.PATCH` (Ex: `1.0.0`)

1. **MAJOR (Maior)**: Mudanças incompatíveis com versões anteriores (Ex: Troca de banco de dados, refatoração de API que quebra o contrato).
2. **MINOR (Menor)**: Novas funcionalidades que não quebram a compatibilidade (Ex: Novo módulo de relatórios, novos filtros).
3. **PATCH (Correção)**: Correções de bugs que não afetam a compatibilidade (Ex: Conserto de um cálculo visual, correção de tradução).

## Fluxo de Lançamento
1. **Identificação**: Determine o tipo de mudança (Major, Minor ou Patch).
2. **Registro**: Adicione os detalhes da mudança no topo do arquivo `CHANGELOG.md` sob a data atual.
3. **Atualização**: Altere o campo `"version"` no arquivo `package.json`.
4. **Build**: Execute `npm run build` para garantir que a nova versão compila sem erros.
5. **Tagging (Git)**: Se estiver usando Git, crie uma tag:
   ```bash
   git tag -a v1.0.1 -m "Descrição curta da correção"
   git push origin v1.0.1
   ```

## Boas Práticas
- Nunca lance uma versão `PATCH` que altere a estrutura do banco de dados (isso deve ser no mínimo `MINOR`).
- Sempre atualize a versão visual no `Layout.tsx` se desejar que o suporte identifique a versão do cliente rapidamente.
