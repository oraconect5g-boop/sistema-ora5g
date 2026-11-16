# Planejamento × implementação — 11/11/2026

Base `953b21e`. Estados declarados pelo programador, não novos aceites do Codex. Nenhum requisito está homologado no registro. A soma não representa percentual de plataforma pronta. O [parecer](REVISAO_INTEGRAL_CLAUDE_2026-11-11.md) identifica defeitos que a suíte existente ainda não cobre.

## Os 18 domínios

| Domínio | Testado em dev | Parcial | Demo | Bloqueado | Não iniciado | Restrição respeitada | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| ORG | 1 | 6 | 0 | 0 | 3 | 0 | 10 |
| CAT | 4 | 5 | 0 | 0 | 1 | 1 | 11 |
| INV | 3 | 6 | 0 | 0 | 3 | 0 | 12 |
| CRM | 0 | 0 | 0 | 0 | 10 | 0 | 10 |
| POS | 5 | 7 | 0 | 0 | 4 | 0 | 16 |
| PAY | 2 | 5 | 1 | 0 | 6 | 0 | 14 |
| FIN | 0 | 4 | 0 | 0 | 6 | 0 | 10 |
| PERF | 0 | 1 | 1 | 0 | 8 | 0 | 10 |
| FISC | 2 | 2 | 0 | 2 | 4 | 0 | 10 |
| CONNECT | 6 | 4 | 0 | 0 | 1 | 0 | 11 |
| ONLINE | 0 | 0 | 0 | 0 | 8 | 0 | 8 |
| MKTPL | 0 | 0 | 0 | 0 | 8 | 0 | 8 |
| WHATS | 0 | 0 | 0 | 0 | 8 | 0 | 8 |
| META | 0 | 0 | 0 | 0 | 6 | 0 | 6 |
| AI | 0 | 0 | 0 | 0 | 7 | 0 | 7 |
| REPORT | 0 | 3 | 4 | 0 | 1 | 0 | 8 |
| QUAL | 0 | 5 | 0 | 0 | 9 | 0 | 14 |
| OS | 0 | 0 | 0 | 0 | 6 | 0 | 6 |

Total: 23 testados, 48 parciais, 6 demonstração, 2 bloqueados, 99 não iniciados, 1 restrição respeitada. Base anterior: 19/47/6/2/104/1. Quatro IDs passaram a “testado”; isso não significa quatro módulos completos ou homologados.

## Mudanças documentadas em 11 requisitos

### ORA-ORG-001 — Cadastrar empresa, organização, 11 lojas comerciais, o local DEFEITOS e a loja piloto (meta de 14 lojas)

Estado: **parcial → parcial**.

Tabelas organização/empresa/unidade com CNPJ validado no banco; escolha real da loja na sessão (/escolher-loja; uma loja só é escolhida sozinha), gravada e auditada pelo banco. Tela real /lojas (lote L2, 10/11): dono e administrador cadastram (repetição devolve a mesma loja), editam nome/CNPJ/UF/cidade e inativam ou reativam com motivo e auditoria, sem apagar; código e tipo não mudam; loja inativa sai da escolha de loja e não recebe caixa, venda, reserva, estoque, aparelho nem transferência nova (OR019, também por escrita direta), e inativar exige a loja sem pendências (caixa, estoque, aparelhos, reservas, transferências, vendas e notas). Disputa inativar × abrir caixa provada nas duas ordens num PostgreSQL 17 real. Falta: cadastrar as lojas reais (CNPJs e endereços da lista B2), revisão do Codex e homologação.

### ORA-ORG-008 — Configurar horários, endereços, caixas e dados fiscais por loja

Estado: **nao_iniciado → parcial**.

Configuração por loja com vigência (lote L2, 10/11): telefone, endereço (CEP, rua, número, complemento, bairro), inscrições estadual e municipal e horário por dia da semana, em versões só de inclusão com 'vale desde' agora ou futuro (nunca retroativo), motivo e auditoria; repetir a mesma vigência ou salvar sem mudar não duplica; histórico de versões na tela /lojas; leitura segue a visibilidade da loja (RLS). Falta: caixas e terminais por loja (lote L7), dados reais (lista B2), revisão do Codex e homologação.

### ORA-CAT-001 — Cadastrar categorias, marcas, produtos, variantes e SKUs

Estado: **parcial → testado**.

Categorias, marcas, produtos por tipo e variações com SKU e código de barras únicos no banco (ADR-003 proposto, aplicado no ora5g-dev em 08/11). Desde 08/11 (noite): tela real /catalogo lendo pelo RLS, sem custo para quem não tem custo.ver. 09/11 (lote 3): busca por nome, SKU e nome da variante feita no banco antes do limite (#40). Lote L3a (10/11): tela /produtos com cadastro e edição de categorias, marcas, produtos e variações por quem tem catalogo.gerir (dono e administrador), com motivo e auditoria; repetir não duplica (nome sem diferença de maiúsculas, SKU, chave do formulário); SKU fixo depois de usado; inativar exige estoque zerado (OR020). A importação da Rein é o ORA-CAT-002. Aguardando revisão do Codex e homologação.

### ORA-CAT-002 — Importar produtos e preços da Rein somente por CSV/XLSX

Estado: **nao_iniciado → parcial**.

Lote L3c (11/11): importação por planilha CSV em /produtos/importar, sem supor o formato da Rein (a pessoa diz qual coluna é cada campo; o servidor relê o arquivo, em UTF-8 ou Windows-1252, e calcula a impressão digital). Prévia no banco sem mexer no catálogo (criar, atualizar, igual ou erro, com o relatório de erros por linha e as diferenças), aprovação por outra pessoa (administrador gera, dono aplica; OR024), aplicação tudo-ou-nada com antes e depois por linha, o mesmo arquivo não se aplica duas vezes (OR023) e desfazer lógico (volta o que ainda está como a importação deixou, sem apagar nada). Até 2.000 linhas por arquivo (3.000 linhas medidas em 3 s num PostgreSQL 17; o limite da API é 8 s). Aplicada no ora5g-dev. Falta: testar com o arquivo real da Rein (pendência B1), estoque inicial por arquivo (lote L4) e XLSX direto (hoje: salvar a planilha como CSV); revisão do Codex e homologação.

### ORA-CAT-004 — Cadastrar preços vigentes por loja/canal conforme regra

Estado: **parcial → testado**.

Preço com histórico por loja e canal, campanha com período e preço vigente consultável em qualquer momento (preco_vigente), sem apagar o anterior. A venda guarda o preço do momento e recusa concluir se ele mudou (OR007, ADR-004). Lote L3b (11/11): tela /produtos/precos por quem tem preco.alterar, com o que vale em cada loja e por quê (campanha, preço da loja ou da rede), preço novo agora ou agendado (um agendamento por alcance, OR022), cancelamento do que não começou e o passado protegido no banco (precos_protegidos: valor, início e o que já valeu não mudam, nem pelo dono do banco). Aplicada no ora5g-dev. Aguardando revisão do Codex e homologação.

### ORA-CAT-005 — Diferenciar smartphone, acessório, chip e serviço comercial

Estado: **parcial → testado**.

Tipos no banco iguais aos de packages/dominio, com exigências: aparelho só com IMEI, chip só com ICCID, acessório por quantidade, serviços sem estoque. A venda real (ADR-004, adicionar_item) aplica o tipo: aparelho e chip um a um com o item, acessório por quantidade com reserva, serviço sem estoque. Lote L3a (10/11): o cadastro pela tela escolhe o tipo uma vez (não muda depois) e só pede estoque mínimo para quem tem estoque. Aguardando revisão do Codex e homologação.

### ORA-CAT-007 — Programar vigência de promoções e campanhas comerciais

Estado: **nao_iniciado → testado**.

Lote L3b (11/11): campanha com início e fim por loja ou rede e por canal, gravada por quem tem preco.alterar, com motivo e auditoria; vale acima do preço da loja e do geral só no período; campanhas do mesmo alcance não se sobrepõem (OR021); dura no máximo um ano; a que não começou é cancelada e a em curso é encerrada agora, sem reescrever o passado. Aplicada no ora5g-dev. Aguardando revisão do Codex e homologação.

### ORA-CAT-008 — Custo de produto/lote/entrada e margem gerencial

Estado: **parcial → parcial**.

Custo com histórico, visível só com custo.ver (vendedor não vê; testado). A venda guarda o custo do momento (venda_itens_custos): custo novo não muda venda passada. Lote L4a (11/11): custo por entrada (compra ou carga inicial) vira o custo atual da variação, com a referência da entrada; a importação também grava custo (L3c). Falta: relatório de margem gerencial (lote L8).

### ORA-CAT-010 — Permitir importação assistida em lote de fotos/atributos

Estado: **nao_iniciado → parcial**.

Lote L3c (11/11): atributos em lote (nome, cor, capacidade, código de barras, preço e custo) pela importação por planilha, com prévia que mostra cada mudança, SKU e código de barras únicos (sem duplicar) e campo vazio que não apaga o valor atual (sem sobrescrita silenciosa). Falta: fotos em lote.

### ORA-INV-004 — Receber estoque inicial validado por contagem real

Estado: **parcial → parcial**.

Conferência física do dia na tela /estoque: progresso, conferir pelo IMEI/ICCID digitado ou item a item, gravada e auditada pelo banco (conferir_item); relatório de divergências no banco. Lote L4a (11/11): carga inicial pela tela /estoque/entrada (aparelho e chip pelo IMEI/ICCID validado e único, acessório por quantidade, condição e custo), por quem tem estoque.receber, com motivo, auditoria e estorno pelo livro. Falta: carga inicial pelo arquivo da Rein (B1), aprovadores do ajuste e inventário assinado (lote L4b).

### ORA-INV-009 — Compras e recebimento de fornecedores

Estado: **nao_iniciado → parcial**.

Lote L4a (11/11): recebimento de compras na tela /estoque/entrada por quem tem estoque.receber (dono e gerente, permissão nova; o gerente na loja do turno): fornecedor (cadastro com CNPJ opcional e validado), documento (nota ou pedido), aparelho e chip pelo IMEI/ICCID, acessório por quantidade, custo de entrada por linha, tudo numa transação com a chave do formulário (sem duplicar; OR004) e estorno pelo livro enquanto os itens estiverem livres (OR001/OR002). Aplicada no ora5g-dev. Falta: pedido de compra antes do recebimento e conferência da nota com o fornecedor; revisão do Codex e homologação.

## O que permanece aberto

- Organização: cadastro real das 11 lojas + DEFEITOS, parâmetros fiscais, três perfis fictícios em Auth e UAT, MFA e expansão conforme matriz. Não recriar o dono já autorizado.
- Catálogo/estoque: corrigir os achados desta revisão; importar arquivo real da Rein com conferência, fotos por variante e exibição integrada; inventário/ajustes aprovados, reservas e histórico físico. L4b é a próxima fatia documentada.
- CRM: os dez requisitos continuam não iniciados; cliente compartilhado, finalidade/consentimento, identificadores protegidos, histórico, funil e atividades.
- PDV/pagamentos: vincular cliente, completar pendências, campanhas, contingência/câmera; terminais/NSU, estados financeiros, saídas autorizadas e conciliação. Separar venda, recebimento, liquidação e estorno.
- Financeiro/relatórios: preservar gráficos reais existentes e avançar margem protegida, contas, baixa/aging, despesas, conciliação, DRE gerencial, repasses e projeções; relatórios/exportações completos.
- Metas/comissões: eventos de produção, regras aprovadas/versionadas, atribuição e reversões. Não inferir receita da face da recarga ou comissão por diferença.
- Fiscal: fila/manual existentes; emissor, tributação e operação real dependem de contador/fornecedor. Continuar as partes locais independentes.
- Nogle: sem avanço funcional nesse delta. Completar contratos locais/reconciliação e as capacidades previstas; operações oficiais dependem de habilitações, credenciais e teste autorizado. 62 funções catalogadas não são 62 funções homologadas.
- OS: seis requisitos não iniciados; custódia, diagnóstico/orçamento/aceite, peças, comunicação e cobrança/entrega.
- Online/marketplaces/WhatsApp/Meta/IA: módulos continuam abertos; criar núcleos locais e integrar por contrato, mantendo bloqueios específicos explícitos.
- Qualidade: backup restaurado, observabilidade, contingência, testes autenticados e go/no-go continuam necessários. Não encerrar porque CI ou demo passam.

A fila integral deve continuar após as correções. Para cada ID, ligar interface, contrato, persistência, autorização, prova, revisão, publicação e homologação. Não remover do escopo o que depende de terceiros para declarar conclusão.
