# Continuação da revisão — 15/11/2026

**Revisor:** Codex. **Base funcional testada:** `37faa93e45a7ad67303c86e718ea024434afc7c6`.
**Registro final conferido:** `a4cf3257753dfc1405ef41bcf2ce2a88cc341aab`, publicado no site.
**Comparação:** desde `56c4bde`, corte da revisão anterior da PR #97. São **30 commits e 130 arquivos alterados**.
**Horário de referência:** 15/11, aproximadamente 11:38 de São Paulo (14:38 UTC), com verificações locais posteriores identificadas nas evidências.

Esta continuação atualiza o relatório de 14/11 sem apagar os cortes anteriores. A stack continua TypeScript/Next.js/React/Node.js/Supabase/PostgreSQL.

## 1. Resultado

Houve avanço real de código: exportações XLSX, fotos em lote, margem por vendedor, documentos de contas a pagar, ligação da conta à entrada de mercadoria, correção de custo e alertas de estoque mínimo. A última entrega funcional foi **CAT-011b, limpeza de fotos sem registro**; depois foi registrada sua migration aplicada.

**Não houve entrega da base operacional solicitada.** A nova consulta ao Supabase continua mostrando três unidades de teste, seis produtos, nenhuma importação/entrada/transferência e um único usuário. Nogle continua sem habilitações, referências ou operações. Não há mudança de PayJoy/Aiva para API neste delta.

**Os três defeitos anteriores continuam reproduzíveis**, e a limpeza de fotos introduziu um quarto, provado com duas conexões PostgreSQL: a exclusão pode disputar com o registro de uma foto e deixar uma foto ativa sem objeto correspondente.

A publicação avançou; não é correto dizer que somente a demo foi atualizada. Também não é correto dizer que a ferramenta está pronta porque o build apareceu no site. A demonstração e as rotas reais continuam distintas, e o domínio permanece ambiente de homologação segundo a configuração/documentação do projeto.

## 2. Contagem dos 179 requisitos

| Estado declarado | Corte anterior 56c4bde | Atual |
|---|---:|---:|
| Testado em desenvolvimento | 52 | **61** |
| Parcial | 73 | **64** |
| Não iniciado | 49 | **49** |
| Bloqueado | 3 | **3** |
| Restrição respeitada | 2 | **2** |
| Homologado | 0 | **0** |
| Total | 179 | 179 |

**61/179 = 34,1% marcados como testados**, não homologados. Restam 116 itens parciais, não iniciados ou bloqueados, além das ressalvas desta revisão.

Dos nove itens que mudaram para “testado”:
- **Quatro são reclassificações R5**: ORG-008, POS-008, FIN-008 e REPORT-004, com base em comportamento anterior. Não representam quatro funcionalidades novas.
- **Cinco receberam entregas novas**: CAT-008 (custo), CAT-010 (fotos em lote), FIN-004 (contas/origem/documentos), FIN-009 (exportações) e PERF-003 (margem por vendedor).

ORG-008 continua sem dados reais das lojas; POS-008 participa do caminho de troca de cliente envolvido em #88. O estado “testado” do registro não encerra esses problemas. A [matriz de todos os IDs](MATRIZ_CONTINUACAO_179_2026-11-15.md) distingue a contagem declarada do aceite operacional.

## 3. O que foi acrescentado

| Entrega | Implementação encontrada | Limite importante |
|---|---|---|
| REPORT-005b | Painel de pagamentos por maquininha, com valores confirmados, conciliados, líquidos e estornados; consulta com RLS | Não é integração automática com adquirente nem taxa contratual |
| FIN-009b/c/d | XLSX nativo e CSV nas exportações; estoque, financeiro, resultado, contas, previsão, recebíveis, metas, equipe e auditoria; PDF pela impressão | **Exportar XLSX não implementa importar a planilha de estoque recebida**; aceite no Microsoft Excel ainda declarado pendente |
| R5 | Reconciliação de estados atrasados | Reclassificação documental, sem homologação |
| PERF-003b | Margem por vendedor de origem, respeitando custo.ver, com gráfico/tabela/exportação | Margem bruta não é lucro, comissão ou saldo recebido; bônus continuam por meta mensal |
| FIN-004a | Conta a pagar ligada ao grupo de parcelas e à entrada de compra, com fornecedor/loja/rede validados | Estorno da entrada mantém o vínculo e exige tratar a obrigação financeira separadamente |
| FIN-004b | Boleto, nota e comprovante privados vinculados à conta, histórico e link temporário | Guarda/descarte dependem de política; anexar documento não paga a conta |
| CAT-008b | Correção de custo com motivo; estorno recalcula custo atual pelo histórico; auditoria protegida | Usa último custo definido, não custo médio; vendas anteriores conservam snapshot |
| CAT-010 | Prévia e envio de até 50 fotos pelo SKU, destino por produto/variante e retry sem reenviar arquivo já enviado | Faltam fotos reais e catálogo operacional para o aceite; não carrega saldos |
| REPORT-001b | Estoque abaixo do mínimo no Início | Depende de saldos/mínimos confiáveis |
| CAT-011b | Listagem/liberação/exclusão de fotos antigas sem registro | **#98: disputa com registro da foto pode remover objeto ainda necessário** |

Não houve edição direta do código da demo neste delta. O núcleo de limpeza reaproveita registrar_foto, mas não coordenou suas travas: é um exemplo concreto de problema na integração entre caminho antigo e novo, mesmo com testes unitários verdes.

## 4. Código, banco e site

Às 11:38 de São Paulo, /entrar informou **a4cf325 · build 15/11/2026 11:37**.

| Base consultada em somente leitura | Resultado |
|---|---:|
| Unidades | 3 |
| Produtos / variantes | 6 / 6 |
| Clientes / vendas | 0 / 1 |
| Importações / entradas / transferências | 0 / 0 / 0 |
| Usuários Auth | 1 |
| Nogle: habilitações / referências / operações | 0 / 0 / 0 |
| Migrations remotas | **78** |

Unidades: Santa Cândida (teste), Loja de teste 2 e Assistência (teste). Continuam faltando as 11 lojas e DEFEITOS, além dos acessos de teste necessários.

O último registro de migration já apareceu no banco como `20261115142547_limpeza_das_fotos`. O snapshot funcional anterior chamava o mesmo conteúdo de `20261115110000`; o commit a4cf325 atualiza o registro. **78 migrations comparadas: 77 hashes exatos e uma diferença apenas de quebra final na margem_painel de 13/11.** Não reaplicar a versão antiga da limpeza: a mudança de nome/versão foi conciliada.

A planilha original já fornecida continua sem importação registrada. Seu formato tem 2.271 produtos/83 colunas e saldos de 12 locais; o importador de catálogo permanece CSV, limitado a 2.000 linhas/60 colunas e sem carga equivalente de estoque por loja. As novas exportações não resolvem esse caminho.

## 5. Bugs e prioridades de correção

### REV-CONT-001 — P1 — limpeza concorrente de foto (#98)

**Reprodução em PostgreSQL 17 local:**
1. Objeto de produto enviado há 30 horas, sem registro de foto.
2. Transação A executa registrar_foto com sucesso, ainda sem commit.
3. Transação B libera a limpeza e exclui o objeto como authenticated, passando pela política do Storage.
4. B confirma; A confirma.
5. Resultado: **uma foto ativa e zero objetos correspondentes**.

O teste não chamou a API de Storage real; comprova o defeito da autorização/consistência no banco. Não foi constatado incidente com fotos reais.

A função registrar_foto usa trava consultiva pelo caminho. A nova política e a limpeza não compartilham um protocolo de exclusão com essa função; a visão de B não enxerga o registro não confirmado de A. A separação em RPC e chamada HTTP exige coordenação que continue válida na exclusão efetiva.

**Correção:** migration nova e protocolo de registro/exclusão com revalidação e coordenação comum. Testar as duas ordens concorrentes, retry, falha de Storage e retomada de upload antigo. Não basta adicionar uma trava à RPC que já terminou antes da chamada de exclusão.

A auditoria também registra `storage.fotos_sem_registro_limpas` antes da chamada ao Storage. Distinguir “limpeza solicitada/liberada” de “exclusão concluída”, com resultado verificável, para não afirmar sucesso após falha externa.

[Issue #98](https://github.com/oraconect5g-boop/sistema-ora5g/issues/98) e prova TypeScript nas evidências.

### Defeitos anteriores confirmados novamente

| Issue | Resultado atual |
|---|---|
| #87 — corrigir pedido fiscal apaga destinatário | Reproduzido: cliente/endereço/versão ficam nulos |
| #88 — troca de cliente redireciona PDF anterior | Reproduzido: documento fiscal de Alfa pode ser enfileirado para Beta; sem envio externo no teste |
| #96 — memória do sino cruza identidades | Reproduzido: memória por loja não isola usuário/sessão; não demonstra bypass do RLS |
| #95 — importação supera orçamento de 8 segundos | Reconfirmada no CI final de a4cf325: 8.505 ms; precisa de correção e CI completo |

Não fechar essas issues pelo crescimento da contagem de requisitos ou por testes de caminhos felizes.

## 6. CI e testes

**Resultado final conferido às 11:50 de São Paulo:** a run [43725391328](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43725391328), do commit publicado **a4cf325**, terminou com **failure**. Foram **2.145 testes aprovados, um reprovado e um TODO**. A falha é a mesma da #95: “aplicação de outras 2.000 a criar” em **8.505 ms**, orçamento **8.000 ms**, em concorrencia.test.ts:977. Lint/typecheck passaram; build, audit e E2E foram pulados. Não é CI aprovado. A duração é medida da chamada e confirmação, sem prova isolada de timeout no Supabase.

Aumentar o tempo total do job, por si só, não corrige essa operação acima do orçamento de oito segundos. Otimizar/segmentar com consistência e margem, mantendo a prova operacional.

A run **43708425656**, do SHA funcional 37faa93, foi **cancelada durante npm test**. Lint/typecheck passaram; 1.170 testes da plataforma e 15 do worker passaram; vários arquivos do banco passaram, mas a suíte não terminou. Build, auditoria e E2E foram pulados.

O workflow usa **timeout-minutes: 15**; o cancelamento ocorreu aproximadamente 15 minutos após iniciar. O último resultado de arquivo do banco apareceu às 11:30:37 UTC; a interrupção foi às 11:35:30. Isso é compatível com o limite do job. O log disponível não atribui explicitamente uma causa ao cancelamento; não afirmar que foi corrupção ou que todos os testes passaram.

O arquivo migrations.test.ts recria dois bancos para cada reversão. Foi executado isoladamente nesta revisão para separar o custo desse teste da execução total. Passaram 76 testes de controle/reversão em 357,73 segundos. O resultado da run posterior de a4cf325 consta na evidência final de CI/testes.

Testes locais na base funcional 37faa93:
- **24 testes de banco** dos seis módulos novos passaram.
- **193 testes de plataforma** em 17 arquivos passaram.
- **76 testes de migrations/reversões** passaram. Total: **293 testes do projeto**.
- As **três provas anteriores** confirmaram novamente os defeitos.
- A **prova nova de concorrência de fotos** passou, confirmando #98.
- As provas observacionais passam quando o defeito existe; não são aprovação do comportamento.

Não se executou login real, movimentação de estoque real, venda/cobrança, envio WhatsApp ou chamada Nogle/financeira. A consulta remota foi somente leitura; o banco dos testes foi descartável. Nenhum .env ou servidor foi acessado.

## 7. Por que ainda não atende ao teste do proprietário

O gargalo demonstrado é a diferença entre **código disponível e operação preparada**:
- Código novo chega ao site e migrations chegam ao banco.
- Os dados das lojas/estoque e os três perfis continuam ausentes.
- Nogle permanece sem habilitações e base operacional; PayJoy/Aiva continuam manuais.
- As jornadas autenticadas não foram homologadas.
- Bugs de fiscal/privacidade continuam abertos enquanto novos módulos são acrescentados.

O relatório anterior e as prioridades da PR #97 ainda não foram integrados na main. Isso não prova que o Claude não os leu; porém, o delta não entrega suas correções nem a base solicitada. A tarefa seguinte precisa ter um aceite operacional verificável.

## 8. Próximos passos obrigatórios, em ordem

1. Corrigir #87, #88, #96 e #98; transformar as provas em regressões do comportamento correto.
2. Concluir CI no SHA integrado, investigando a duração da suíte e a importação #95. Se separar jobs ou ampliar o orçamento total, manter testes, limite operacional por chamada e checks de segurança; não desativar prova para obter verde.
3. Entregar #89: três perfis, 11 lojas + DEFEITOS, prévia/carga histórica validada da planilha, catálogo e fotos. Não inventar CNPJ/endereço/IMEI nem sobrescrever movimentos.
4. Completar e homologar transferência multi-item: reserva na confirmação, disponível reduzido, físico/trânsito/destino corretos e repetição sem duplicar.
5. Testar venda, pagamentos, caixa e relatórios com a base; manter e-mail opcional, WhatsApp no cliente e destinatário fiscal íntegro.
6. Nogle oficial por capacidade e contrato; PayJoy/Aiva obrigatórias por API; preparação QI Tech/J7 sem confundir J7 com J17.
7. Terminar fiscal/WhatsApp oficiais e os demais 179 requisitos, sem considerar mock ou registro manual como integração concluída.
8. Restauração/contingência, operação paralela e aceite antes do corte da Rein.

Manter o [adendo de prioridades](../alinhamento/PRIORIDADES_BASE_REAL_E_APIS_FINANCEIRAS_2026-11-14.md). Cada tarefa termina com código, schema/configuração/dados necessários, CI, publicação autorizada, teste autenticado e evidência.

## 9. Evidências e limites de cobertura

[Índice e comandos](evidencias/2026-11-15-continuacao/LEIA-ME.md), [matriz de 179 requisitos](MATRIZ_CONTINUACAO_179_2026-11-15.md), inventário do delta, versões/hashes, publicação, contagens e provas acompanham este relatório.

Foram inventariados 962 arquivos e 192 diretórios; 12 binários foram apenas inventariados. Os textos materializados foram conferidos contra hashes Git. Isso não equivale a afirmar revisão manual de cada linha nem homologação de todas as áreas. Os contratos e as outras conversas inacessíveis continuam sendo limites explícitos.

Este PR documenta revisão e planejamento. Não executa carga real, correção funcional, deploy ou merge.

