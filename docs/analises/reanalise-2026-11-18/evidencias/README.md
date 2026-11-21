# Evidências e reprodução — corte `27b4f6e`

## Arquivos

- `runtime-consolidado.json`: contagens agregadas, estoque por unidade, papéis sem identificadores pessoais, cron, logs agregados e migrations do Supabase. Consultas somente leitura.
- `advisors-resumo.json`: nomes, quantidades e links de remediação; avisos não são automaticamente vulnerabilidades exploráveis.
- `dominio.json`: HTTP público e SHA observado. Inclui consulta de changelog do Supabase usada na revisão.
- `ci-resumo.txt`: trechos do job 134728340931, execução 44283001540.
- `testes-dirigidos-app.log`: 101 testes passaram; inclui prova do arquivo original corrigida.
- `testes-dirigidos-banco.log`: 246 testes passaram em banco local isolado, não no Supabase.
- `auditoria-20261118.test.ts` e `testes-regressao-novos.log`: duas provas novas, sintéticas, que falham e demonstram F18-01/F18-02.
- `auditoria-planilha-real.test.ts`: prova da planilha original; exige arquivo privado local, não incluído neste pacote.

## Executar as duas provas novas

1. Use um checkout isolado do commit auditado e a versão Node exigida pelo projeto.
2. Instale as dependências pelo lockfile.
3. Copie `auditoria-20261118.test.ts` para `apps/plataforma/src/lib/importacao/`.
4. Execute:

```sh
npm test --workspace=@ora5g/plataforma -- src/lib/importacao/auditoria-20261118.test.ts
```

**Resultado esperado antes da correção:** duas falhas. A primeira recebe 625 onde uma fração deveria ir para conferência. A segunda classifica uma linha incompleta como total. Não conectar esses testes ao banco remoto: os arquivos XLSX são criados em memória com dados fictícios.

## Prova da planilha original

Copie o teste original para o mesmo diretório e forneça a variável `ARQUIVO_ESTOQUE_AUDITORIA` com o caminho privado do XLSX já entregue pelo proprietário. Execute:

```sh
npm test --workspace=@ora5g/plataforma -- src/lib/importacao/auditoria-planilha-real.test.ts
```

Espera 83 colunas, 2.271 produtos e partes de 2.000 e 271. No corte de 17/11 essa prova falhava; no corte de 18/11 passou. A versão publicada da prova omite saídas de depuração com conteúdo da planilha. Não inserir o arquivo no repositório público e não importar estoque remoto para executar o teste.

## Limites

Os estados dos 179 itens são as declarações versionadas do implementador, não resultado de 179 homologações. A auditoria não criou usuário, não gravou estoque, não abriu cobrança, não ativou chip, não emitiu nota e não enviou mensagem externa. Logs e contagens refletem o momento consultado; dados de teste podem mudar depois.
