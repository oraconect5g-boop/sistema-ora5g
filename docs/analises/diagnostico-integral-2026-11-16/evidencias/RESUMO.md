# Evidências e reprodução

SHA: 5468d9e59d6a68587ba176fff178163eec81ff9c. Ambiente local descartável, Node 22.23.4.

- Lint/typecheck concluídos; build e orçamento de bundle passaram.
- Suíte local: 2.278 passaram, 2 falharam, 1 TODO. Relatório >20 mil linhas: timeout na suíte, passou isolado. Importação: 13.712 ms, limite 8.000.
- GitHub Actions: 2.279 passaram, 1 falhou, 1 TODO; importação 8.518 ms.
- Playwright: **277 passaram, 11 ignorados, 0 falharam** (2,7 min). Sem login bem-sucedido nos três perfis contra a base real.
- Quatro reproduções anteriores repetidas no SHA atual: #87/#88/#96/#98 continuam observáveis.
- Duas provas novas: XLSX original rejeitado e e-mail PayJoy obrigatório. O teste do arquivo usa ORA_PLANILHA_AUDITORIA; sem o arquivo, é ignorado, não aprovado.
- Três testes de propostas puras passaram; código ilustrativo fora da aplicação.
- Todas as consultas remotas foram de leitura. Nenhuma mensagem, ativação, cobrança ou carga de estoque real executada.

## Artefatos

resumo.json contém o fechamento quantitativo. schema.json lista relações/políticas/triggers; funcoes-metadados.json contém assinaturas, grants, settings e hash da definição coletada, sem publicar a definição integral. migrations.json permite conferir histórico/hash. storage.json/counts.json registram a base. advisors.json mantém os avisos exatos e URLs oficiais. dominio-final.json contém nova verificação HTTP pública. Nenhum segredo ou planilha bruta incluído.

## Repetição da prova nova

Na raiz do repositório, com Node 22 e dependências do lockfile:
```sh
ORA_PLANILHA_AUDITORIA=/caminho/local/relatorioProdutos131258.xlsx npx vitest run --config docs/analises/diagnostico-integral-2026-11-16/evidencias/vitest.config.mjs
```

É teste que documenta o comportamento defeituoso observado. Após corrigir, o resultado esperado deve mudar e os testes de aceitação devem provar a leitura completa, prévia e aplicação correta; não apagar a evidência histórica.

As provas anteriores estão no PR #97 e em seu SHA a7ff0f5e9c429a7b67fbae7f52377e628a227d56:
- docs/analises/evidencias/2026-11-14-execucao-prompt/provas.test.ts
- docs/analises/evidencias/2026-11-14-execucao-prompt/cache-sino.test.ts
- docs/analises/evidencias/2026-11-15-continuacao/concorrencia-fotos.test.ts
- docs/analises/evidencias/2026-11-15-publicacao/verificador-publicacao.test.ts

Não copiar credenciais para repetir. As reproduções SQL utilizam PostgreSQL/PGlite descartáveis e fixtures.

## Limitações de medição

A primeira tentativa local de E2E foi interrompida pela validação de APP_ENV/URL ausentes no comando do revisor; a execução seguinte recebeu configuração fictícia de desenvolvimento e passou. Não é defeito de produção.

A execução completa sofreu um timeout de relatório que não se repetiu isoladamente; não há prova de erro lógico naquele exportador por esse timeout. A falha de importação apareceu também no CI e permanece pendente.

O scanner aplicado ao pacote verifica padrões conhecidos; não certifica ausência universal de segredo. Os binários do repositório não foram analisados linha a linha.
