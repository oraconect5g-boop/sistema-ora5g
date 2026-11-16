# Provas independentes — novos lotes do Claude, 11/11/2026

Base: `953b21e0b90f4823759de9bba8f38452dd6769e8`. [Parecer](../../REVISAO_INTEGRAL_CLAUDE_2026-11-11.md).

## O que estes arquivos provam

- `provas.test.ts`: cinco observações em PGlite, com todas as migrations do SHA auditado e fixtures do projeto. Casos 001 (custo legível), 002 (prévia desatualizada), 003 (contrato de inativação ao desfazer), 004 (IMEI estornado) e 005 (produto inativo com entrada).
- `concorrencia.test.ts`: PostgreSQL 17 local descartável, duas conexões reais, mesmos contratos/migrations. Casos 006 (categoria duplicada entre CRUD e importador) e 007 (reversão de preço manual posterior).
- `resultados.json`: saídas observadas. O caso 003 é discussão de contrato e não está contado entre os seis defeitos reproduzidos.
- `inventario.json`: arquivos/hashes da main, intervalo de mudanças, branches e referências de issues/PRs/comentários. Não contém credenciais ou conteúdo de ambiente.
- `verificacoes.json`: resultados e limites da validação local e do CI/publicação consultados.

**As asserções descrevem o comportamento encontrado e passam quando o reproduzem. Não são aceites de segurança ou negócio.** Ao corrigir, transformar os casos aplicáveis em regressões do módulo com o resultado seguro esperado; conservar estas provas como evidência histórica. Nenhum teste chama fornecedor ou banco remoto.

## Reproduzir

Usar clone/worktree isolada, com o código da base e estes arquivos documentais, Node conforme `.nvmrc` e dependências do lockfile. Não descartar trabalho atual nem alterar migrations aplicadas. O banco local é iniciado pelo helper existente, com dados fictícios, e removido no encerramento.

```sh
npm ci
node node_modules/vitest/vitest.mjs run --config docs/analises/evidencias/2026-11-11-lotes/vitest.config.mjs
```

O resultado observado na base foi **7 casos aprovados por reproduzirem o estado descrito**. Os seis defeitos não estão cobertos pela suíte normal. As provas ficam fora do `include` padrão dos workspaces.

Os testes escrevem `resultados-provas.jsonl` e `resultados-concorrencia.jsonl` nesta pasta para permitir conferência; `resultados.json` é o registro consolidado da auditoria.

## Validação da suíte existente

Instalação limpa, lint, typecheck, build, auditoria npm de produção e geradores foram aprovados. Testes existentes: 854 passaram e 2 TODO; navegador: 205 passaram e 11 skips. Os skips são condicionais/repetições por viewport e dependências de configuração; o UAT autenticado dos três perfis não foi executado.

O primeiro disparo local do E2E encontrou um conflito de opções herdadas pelo `npx` ao usar o wrapper `npm exec` para selecionar Node. A execução final usou diretamente o PATH do Node instalado e o cache local de Chromium, sem alterar código/config do projeto, e passou. A primeira captura do caso 004 mascarou o SQLSTATE pelo rollback de uma transação abortada; o harness foi corrigido para capturar dentro do savepoint. O primeiro ensaio do caso 006 disputou a preparação de duas sessões do mesmo usuário; a prova final usa administrador no CRUD e dono na aprovação, duas pessoas autorizadas. Esses ajustes são do harness local, não correções do sistema.

Não se repetiu localmente o scanner de histórico Git sobre este snapshot materializado. O detector de textos do próprio projeto foi aplicado aos arquivos recuperados e à entrega; o CI remoto já havia passado as etapas de scanner do commit. O parecer distingue resultados locais, GitHub Actions e publicação.
