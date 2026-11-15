# Verificação do prompt #86, código publicado e base operacional

**Revisor:** Codex. **Corte final do código/publicação:** 15/11/2026, 02:27 UTC (14/11, 23:27 em São Paulo). **Consulta do banco:** 02:11 UTC.
**Base final:** `56c4bde003e719f3ea902c3335f7526b6d1f6a67`, comparada a `dd31e91465335b7ad4a4f1ff59e80f7981ddd78d`.
**Prompt:** [PR #86](https://github.com/oraconect5g-boop/sistema-ora5g/pull/86), commit `568ad2d`.
Esta revisão incorpora as decisões recentes sobre lojas, estoque, transferências, financeiras e publicação da aplicação real.

## 1. Conclusão e ponto de parada

**O Claude ainda não concluiu o prompt.** Avançou em 80 commits e 217 arquivos desde a base do prompt, preservando TypeScript/Next.js/React/Node.js/Supabase/PostgreSQL. Após ORG-009b (resultado por região) e registro de migrations, entrou **CAT-006: busca por marca, código de barras e final do IMEI**, em `9495691`. O último commit, **R4 (`56c4bde`)**, revisou estados de requisitos, acrescentou um teste de mensagens de IMEI e corrigiu o texto de pendências financeiras. A conclusão preliminar em f55856e, que apontava L12b como último lote, ficou superada. Os commits novos demonstram continuidade do trabalho, não uma parada definitiva.

**A versão real está sendo atualizada. A base para os testes do proprietário continua ausente.** O rodapé de /entrar mostra `56c4bde · build 14/11/2026 23:26` (observado às 02:27 UTC); /saude responde 200. As rotas reais /estoque, /financeiro e /connect retornam 307 para /entrar sem sessão. Isso confirma versão/proteção, não funcionamento autenticado.

**O CI da base final ainda não está confirmado:** run 43667800641 em execução no fechamento da análise. O CI de `9495691` foi cancelado quando entrou R4. O CI de `3e198a6` falhou: importação de 2.000 produtos em 8.354 ms, acima dos 8.000 ms; build, audit e E2E foram pulados nessa execução. Ver o estado do SHA exato antes de aprovar: não usar verde ancestral.

**Não é possível confirmar por que a sessão privada do Claude terminou:** não temos seus logs de execução, contexto ou mensagem de pausa. O GitHub mostra o último resultado e os bloqueios declarados; não prova que a falha de CI tenha encerrado a sessão. Contrato externo pendente não impede cadastro, carga validada, testes e outras tarefas independentes.

## 2. Banco e publicação conferidos

Consulta direta, somente leitura, ao Supabase identificado como ora5g-dev; sem servidor ou .env:

| Dado | Encontrado |
|---|---:|
| Unidades | 3, todas de teste |
| Produtos / variantes | 6 / 6 |
| Itens serializados | 17 |
| Importações / entradas / transferências | 0 / 0 / 0 |
| Usuários no Auth | 1 |
| Clientes / vendas | 0 / 1 |
| Habilitações / referências / operações Connect | 0 / 0 / 0 |
| Migrations | 72 |

Unidades: **Santa Cândida (teste), Loja de teste 2 e Assistência (teste)**. Não são as 11 lojas e DEFEITOS. Publicar código não carrega lojas, saldos, fotos, usuários ou provedores.

As 72 versões remotas correspondem aos arquivos: 71 MD5 exatos e uma diferença apenas de quebra de linha final em `20261113065706_margem_painel.sql`. Não reaplicar migration antiga por isso. São 19 migrations adicionais desde a base do prompt.

**J1:** a documentação do Claude informa falta de SUPABASE_SECRET_KEY no worker e pendências de SMTP. O Codex não leu essa configuração; confirmou um único usuário no Auth. O canal administrativo de leitura não prova configuração do worker. Os três usuários fictícios já foram autorizados; falta executar/configurar, não pedir novamente consentimento genérico.

O link privado do projeto ChatGPT não disponibiliza as demais conversas neste ambiente. A revisão usa esta conversa, anexos disponíveis e documentos do GitHub; não alega leitura de conversas inacessíveis.

## 3. Contagem dos 179 requisitos

A matriz anexa contém todos os 179 IDs, estado anterior/atual, lote, bloqueio, nota e evidência declarada pelo projeto.

| Estado | Base do prompt | Atual |
|---|---:|---:|
| Testado em desenvolvimento | 38 | 52 |
| Parcial | 65 | 73 |
| Não iniciado | 73 | 49 |
| Bloqueado | 2 | 3 |
| Restrição respeitada | 1 | 2 |
| Homologado | 0 | 0 |
| Total | 179 | 179 |

**52/179 = 29,1% estão marcados como testados**, não como operacionais/homologados. Dois itens são restrições respeitadas. Os outros 125 estão parciais, não iniciados ou bloqueados. Alguns parciais também dependem de terceiros; os três “bloqueados” não resumem todas as dependências.

R3 reclassificou comportamentos existentes, inclusive AI-005 (autorização humana); não implantou uma IA nova. CAT-006 elevou a contagem de 48 para 49. R4 passou INV-006, QUAL-003 e QUAL-007 de parcial para testado, chegando a 52: são reclassificações apoiadas no código já existente, não três novos módulos. QUAL-007 ainda declara procedimento de produção pendente. A contagem acima é a do repositório. Os achados desta revisão continuam sendo ressalvas, inclusive para requisitos marcados “testado”; não se alterou a matriz para fabricar conclusão.

## 4. Prompt × entrega

| Exigência/lote | Entregue no código | Falta/ressalva |
|---|---|---|
| B1–B5: #78/#79/#80/#82/#83 e paginação | Correções integradas; regressões selecionadas passaram em f55856e | Homologação por papel e dados reais |
| K1a, cadastro | Nome completo + WhatsApp; e-mail opcional no cadastro geral | Não reintroduzir obrigatoriedade geral por texto antigo da PayJoy |
| K1b, destinatário fiscal | Cliente/endereço/versão na solicitação | #87: correção posterior perde os campos |
| L10a/K1c | Documentos privados, fila e rotina abstrata de envio | #88; adaptador oficial, execução completa do worker, recibos/webhooks e homologação Meta |
| L8e | Recebíveis por loja/adquirente | Prazos/taxas contratuais, extratos, conciliação automática e inadimplência |
| L12a–f | Custódia, orçamento, resposta, cobrança de OS no PDV, peças, relatórios e alertas | P5 para acesso do técnico, comunicação automática e aceite real |
| L5d/e | Anexos privados, ficha 360 e histórico de reparo | Assinatura digital/retenção e histórico completo dos canais |
| L10b/c | Conciliação fiscal local; registro de cancelamento/correção de chave | Registrar ato feito no portal não é emitir/cancelar por API |
| G3b/G6 | Valor do estoque a custo e sino de alertas | Custo vigente da variante não equivale a custo individual de cada IMEI; #96 |
| CAT-009 / CAT-006 | Códigos externos por variante; busca por marca, código de barras e final do IMEI | Mapeamento de SKU não implementa marketplace; busca nova passou em 23 testes selecionados |
| ORG-009/b | Regiões e resultado por região | Lojas reais não cadastradas |
| Q1–Q3 | Painel de filas, contingência/incidentes, rotina de segurança e proposta de backup | Documento não comprova restauração/contingência executadas |
| Nogle | Cliente/worker, fila, reconsulta e três operações principais já existiam | Nenhuma habilitação/referência na base; paridade da demo e prova oficial pendentes |
| PayJoy/Aiva | Registro financeiro manual/recebíveis | API obrigatória pela decisão recente, ainda não implementada |
| Lojas e arquivo de estoque | Informações fornecidas/documentadas | Carga operacional ausente: #89 |
| Escopo integral | 18 domínios preservados | Matriz completa continua aberta; não encerrar no MVP |

## 5. Bugs confirmados e CI

Os três defeitos foram reproduzidos novamente em `9495691`. O delta até `56c4bde` não altera as funções fiscais nem a memória do sino; continuam pendentes neste corte.

### REV-PROMPT-001 — P1 — destinatário fiscal apagado na correção ([#87](https://github.com/oraconect5g-boop/sistema-ora5g/issues/87))

K1b ampliou `notas_solicitar`; `notas_corrigir`, na migration `20261109123757_fila_fiscal.sql`, ainda apaga e recria o destinatário apenas com pedido/documento. A prova com **72 migrations** confirmou cliente, endereço e versão nulos após corrigir.

**Corrigir por migration nova:** alinhar solicitação/correção/leitura do snapshot, validar dados e versionamento transacional. Testar alteração posterior do cadastro. Não modificar histórico aplicado. L10c corrige a chave da nota registrada, não este pedido.

### REV-PROMPT-002 — P1 — PDF anterior na fila de outro cliente ([#88](https://github.com/oraconect5g-boop/sistema-ora5g/issues/88))

Após nota do cliente Alfa, `venda_vincular_cliente` permite trocar a venda para Beta. `nota_enviar_whatsapp` usa o cliente/telefone atual e associa o documento fiscal anterior. O teste confirmou a fila para Beta.

**Corrigir:** preservar identidade fiscal, validar destinatário transacionalmente e novamente no worker. Envio a terceiro requer regra explícita e auditoria. Nenhuma mensagem externa foi disparada e não foi observado vazamento real.

### REV-PROMPT-003 — P2 — sino reutiliza informações de outra identidade ([#96](https://github.com/oraconect5g-boop/sistema-ora5g/issues/96))

`SinoDePendencias.tsx:16–45` usa `lembrancaDoSino` de `lib/inicio/sino.ts:43–54`: sessionStorage só contém unidade/horário/itens. Logout/login na mesma aba e loja conserva pendências administrativas; não há usuário/sessão na chave nem limpeza no logout. A prova local confirmou que os itens anteriores são aceitos. Falha na releitura também conserva dados em memória sem conferir a idade.

**Corrigir:** isolar ou remover cache, invalidar ao mudar sessão/permissão/loja e não exibir dados anteriores durante a transição. A prova não demonstra bypass do RLS nem ação administrativa pelo vendedor. Exigir E2E autenticado dono → vendedor.

### CI/importador — P1 — limite de tempo ([#95](https://github.com/oraconect5g-boop/sistema-ora5g/issues/95))

[Run 43657640844](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43657640844), job 132639724873, `concorrencia.test.ts:977`: **8.354 ms contra 8.000 ms**. Mede chamada completa e confirmação em PostgreSQL 17; não prova isoladamente timeout da SQL no Supabase nem corrupção.

**Corrigir:** medir planos/gatilhos, otimizar ou implementar lotes retomáveis com margem, preservando revisão, concorrência, idempotência e rollback. Não elevar/remover asserção apenas para ficar verde. Executar o pipeline completo no SHA corrigido.

## 6. Base real e transferências: prioridade imediata

Lojas confirmadas: **SANTA FELICIDADE, ÁGUA VERDE, COLÔNIA, ALMIRANTE TAMANDARÉ, DUBAI, COLOMBO, MUFFATO SANTA, BUTIATUVINHA, VENTANIA, BALNEARIO, SANTA CANDIDA**. Mais **DEFEITOS**, local para itens com problema, sem venda. Assistência não substitui DEFEITOS. Usar códigos e aliases estáveis, evitando duplicidade por acento.

Os nomes já foram fornecidos. O cadastro atual exige CNPJ para loja física. Não inventar CNPJ/endereço: separar cadastro preliminar de prontidão fiscal ou completar os campos pelo canal apropriado, mantendo a proteção da emissão.

O arquivo **relatorioProdutos131258.xlsx** é a posição de **10/11/2026, 13:20**. Inspeção local: 2.271 produtos, 83 colunas; quantidades AA–AL, disponíveis AM–AX, custos AY–BJ, localização BK–BV, para 12 locais. Há 18 células numéricas de rodapé com valor brasileiro textual incompatível com leitura numérica direta. Original/valores comerciais não entram no Git.

O importador atual aceita CSV, 2.000 linhas e 60 colunas, para catálogo, sem saldos por loja. **Não recebe diretamente a planilha fornecida.** Preparar normalização com prévia, mapa SKU/variante/loja, data/hash, totais, rejeições, idempotência e lote auditável. Não sobrescrever movimentos posteriores, fabricar IMEI, somar rodapés ou converter unidades por hipótese. A carga histórica não é contagem atual.

A solicitação atual de transferência não reserva; a separação reserva; o envio baixa físico; o recebimento entra no destino. Na confirmação operacional de “colocar em transferência”, efetuar reserva atomicamente; distinguir rascunho/solicitação da transferência confirmada.

| Exemplo: físico 10, transferir 3 | Físico origem | Reservado | Disponível | Trânsito |
|---|---:|---:|---:|---:|
| Antes | 10 | 0 | 10 | 0 |
| Separada/confirmada | 10 | 3 | 7 | 0 |
| Enviada | 7 | 0 | 7 | 3 |
| Recebida | 7 | 0 | 7 | 0; destino recebe 3 |

Não baixar duas vezes ao enviar. Destino não vende trânsito. Soma física da rede + trânsito conserva total; transferência não é receita. Cancelamento, divergência/recebimento parcial e DEFEITOS exigem trilha. O registro atual é por variante: falta pedido agrupado com X/Y. Filtro por loja existe no painel; torná-lo consistente na lista, busca e detalhe, com autorização.

**Aceite #89:** três perfis, duas lojas nomeadas, dois produtos, reservar/enviar/receber/cancelar, conferir ambas e repetir sem duplicar; concorrência com venda do último item. Publicar e executar jornada autenticada antes de abrir outro módulo.

## 7. Nogle e financeiras

Nogle é o sistema externo oficial integrado por API. A demo contém nove áreas: operações, ativar, linha, recarga, portabilidade, atendimento, chips, carteira e integração. A real tem três operações centrais condicionadas às habilitações/listas, hoje vazias. Exibir estado de configuração e mapear cada capacidade da demo a requisito, contrato, implementação, persistência e aceite.

Ativações, cobrança, recorrência, chips, carteira e repasses devem refletir os registros oficiais conforme contrato. Separar produção comercial local de saldo oficial, reconsultar resultado desconhecido e impedir dupla cobrança. Não inventar endpoints nem afirmar que bastam chaves para concluir funcionalidades ausentes.

**PayJoy/Aiva por API são obrigatórias**, substituindo a restrição antiga ao lançamento manual. QI Tech/J7 entram na preparação futura. Documentação pública não prova parceria ou escopo habilitado; J7 não foi confirmada como J17. Detalhes e perguntas no [adendo](../alinhamento/PRIORIDADES_BASE_REAL_E_APIS_FINANCEIRAS_2026-11-14.md).

Distinguir falta de código, contrato, acesso, configuração, dados e homologação:
- J1: identidade/SMTP e três contas/vínculos autorizados.
- Nogle: conta/escopo e teste autorizados, worker/listas/habilitações e reconciliação.
- WhatsApp: adaptador, entrypoint, webhook verificado, Meta/modelos e entrega.
- Fiscal: contador/matriz/provedor, certificado quando exigido e ciclo oficial.
- Financeiras: contratos por provedor, taxas/prazos/status e repasses comprovados.
- Rotinas: reservas, filas, alarmes, backup/restore executados. Exit 0 de rotina desabilitada não comprova serviço funcionando.

## 8. Merges, duplicidades e documentação

No delta não há edição direta de src/app/demo ou src/demo: as mudanças evoluem a aplicação real, com alguns componentes compartilhados. Não houve troca de linguagem ou adoção de Firebase.

Migrations antigas e redefinições de funções fazem parte da reconstrução do banco; conferir a última definição efetiva. **Não apagar histórico para “remover duplicidades”.** #87 revela dois caminhos de negócio desalinhados: um foi atualizado, outro permaneceu legado.

Demo/real, tipos gerados e cópias da skill são duplicações intencionais; não foi demonstrado que causem dupla cobrança. O inventário acompanha esta revisão. O texto antigo “arquivo/lojas não recebidos”, financeiras apenas manuais e próximos passos já entregues gera orientação incorreta. Este PR atualiza a lista central de integrações/variáveis e acrescenta adendo prevalente; limites históricos devem manter data.

## 9. Retomada em ordem

1. Corrigir #87/#88/#96 e #95; CI completo no SHA integrado.
2. Entregar J1, lojas e estoque validado (#89), catálogo/fotos aptos ao teste e prontidão fiscal explicitada.
3. Fechar transferência multi-item e testes autenticados, com disponível, físico e trânsito corretos.
4. Homologar venda → pagamento → caixa → devolução → financeiro/gráficos, preservando cadastro com e-mail opcional.
5. Completar Nogle por capacidades oficiais; obter documentos/habilitações externas sem bloquear trabalhos independentes.
6. Implementar PayJoy/Aiva por API e preparação QI Tech/J7 (#90).
7. Completar fiscal/WhatsApp oficiais com os defeitos de destinatário corrigidos.
8. Executar as lacunas de todos os 179 IDs: organização, catálogo, estoque, CRM, PDV, pagamentos, financeiro, metas, fiscal, Connect, OS, relatórios, online, marketplaces, WhatsApp, Meta, IA e qualidade.
9. Restauração e contingência ensaiadas, observabilidade, revisão de segurança, operação paralela e aceite antes do corte da Rein.

Uma tarefa termina com código, schema compatível, configuração/dados necessários, CI, publicação autorizada, jornada autenticada, evidência e atualização do requisito. Não encerrar somente pela tela ou por teste com mock.

## 10. Verificação e artefatos

Snapshot atual: **902 arquivos, 185 diretórios, 114 Markdown**; 890 textos materializados e conferidos pelo SHA Git; 12 binários inventariados. Inventário não equivale a revisão manual exaustiva de cada linha.

- Corte f55856e: 381 testes selecionados passaram; dois defeitos fiscais reproduzidos.
- Corte `3e198a6`: **157 testes selecionados passaram** (54 banco/8 arquivos; 103 plataforma/12 arquivos), dos lotes novos de OS, anexos, fiscal, regiões, códigos externos, estoque e interfaces.
- Em `9495691`: **23 testes** de busca/produtos passaram e **três provas observacionais** confirmaram novamente os defeitos. Em `56c4bde`: **10 testes** de regras de venda passaram. Não somar execuções de bases distintas como uma única suíte.
- CI `3e198a6`: **2.012 passaram, 1 falhou e 1 TODO**; build/audit/E2E pulados. CI `9495691`: cancelado. CI `56c4bde`: em execução no fechamento, sem conclusão afirmada.
- Consultados versão pública, contagens e 72 migrations; sem login, transação real, chamada Nogle/financeira, envio WhatsApp, .env, servidor, alteração de banco, deploy ou merge.
- Não há alegação de que cada funcionalidade de cada diretório tenha sido homologada.

Arquivos:
- [Matriz integral dos 179 requisitos](MATRIZ_EXECUCAO_PROMPT_86_179_2026-11-14.md).
- [Prioridades e APIs financeiras](../alinhamento/PRIORIDADES_BASE_REAL_E_APIS_FINANCEIRAS_2026-11-14.md).
- [Evidências/reprodução](evidencias/2026-11-14-execucao-prompt/LEIA-ME.md).
- [Inventário](evidencias/2026-11-14-execucao-prompt/INVENTARIO.md).

