# Evidências e reprodução

Corte `c1b8e6086d509f388e6080eb829af7a8b6ac316b`. Node 22.23.4. Testes em snapshot isolado; nenhuma gravação no Supabase remoto.

## Resultados

| Execução | Resultado |
|---|---|
| Plataforma: 15 arquivos selecionados (importação, carga, financeiro, pagamentos por linha, conciliação Connect, permissões, catálogo/estoque/transferência/conexão) | 131 passaram; 1 falhou: arquivo original |
| Worker: todos os 12 arquivos de teste | 51 passaram |
| Banco: 10 arquivos selecionados | 58 passaram |
| Prova nova F21-01 | 1 falha esperada antes da correção |
| Provas novas F21-02a/b | 2 falhas esperadas antes da correção |

Os logs completos estão nesta pasta. A cópia comercial original não está incluída. `planilha-diagnostico.json` contém apenas cabeçalhos, tipos e indicadores de conferência, sem valores de estoque/custo.

## Como reproduzir em checkout isolado

1. Use o SHA auditado e dependências pelo lockfile, Node 22. Não rode contra produção.
2. Copie `F21-01-importacao.test.ts` para `apps/plataforma/src/lib/importacao/auditoria-sintetica-20261121.test.ts`; seus imports são relativos a esse diretório. Execute:

```bash
npm test --workspace=@ora5g/plataforma -- src/lib/importacao/auditoria-sintetica-20261121.test.ts
```

3. Copie `F21-02-conciliacao.test.ts` para `packages/banco/src/auditoria-local-20261121.test.ts`; execute:

```bash
npm test --workspace=@ora5g/banco -- src/auditoria-local-20261121.test.ts
```

4. O teste do arquivo original já está no projeto. Configure `ARQUIVO_ESTOQUE_AUDITORIA` para a cópia privada, sem exibir o conteúdo nem commitar a planilha:

```bash
npm test --workspace=@ora5g/plataforma -- src/lib/importacao/auditoria-planilha-real.test.ts
```

O banco local é criado com `criarBanco`/PGlite e descartado. As três novas provas falham porque exigem o comportamento correto, não porque executam integração externa. Após corrigir, tornar as provas regressões permanentes; preservar o sentido das expectativas e evitar repetir listas de testes como nova cobertura.

## CI observado

Run: https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/44910397289

3.176 testes aprovados; um skip (arquivo privado) e um TODO. E2E 331 aprovados/55 pulados. Build/lint/typecheck/audit com sucesso. As falhas novas não estavam cobertas pelo CI desse corte. Não confundir o verde daquele run com o resultado vermelho das provas fornecidas aqui.

`dominio.json` e `navegador-publico.json` registram URLs, textos públicos, status e limites da navegação. As capturas de tela foram inspecionadas localmente. `migrations.json` contém as 121 versões aplicadas; `supabase-contagens-e-controles.json` preserva contagens e metadados, sem identidade de clientes/credenciais.
