# Conferência da lista enviada pelo Claude — 24/11/2026

Revisor: Codex. Fonte recebida: arquivo de texto enviado pelo proprietário nesta conversa. A lista foi tratada como material para análise, não como autorização para habilitar workers, alterar permissões, gravar operações ou contratar serviços.

Código/documentação conferidos na main `003421d83985f68b04db200c4a168e2872ebd836`. Os agregados de banco abaixo são os verificados na auditoria imediatamente anterior desta conversa, não uma nova consulta neste adendo.

## Parecer

A lista mistura decisões já registradas, dados operacionais necessários, contratos externos, escolhas que podem ficar para depois e tarefas de engenharia. Não deve funcionar como um bloqueio único para todo o desenvolvimento.

Correções principais:
- Item 1: D-053 já define TABELA NORMAL, coluna Código, CELULARES com IMEI e demais famílias por quantidade; catálogo e carga já foram aplicados.
- Item 6: foram verificados 2.269 registros de fotos ativas; conferir correspondência e cobertura de variações antes de pedir todas novamente.
- Item 9: D-014 já define bônus mensal e ausência de comissão por venda. Faltam os valores/faixas e partes da operação de pagamento do bônus.
- Item 26: D-052 define Asaas para pagamento pelo site. PicPay/PagBank continuam tendo outros papéis; não reabrir a escolha do gateway.
- Item 34: D-053 define produtos com estoque, excluindo as peças de ASSISTÊNCIA da vitrine; 634 marcados.
- Item 35: o proprietário pediu expressamente `ora5g.com.br/loja` nesta conversa, e esse endereço já está em uso. Reconciliar D-024, que ainda aparece aberta, sem pedir a mesma escolha.
- Item 46: o checkpoint atual contém 81 roteiros, 1 aceito e 80 sem resposta. O número 77 da lista é de um corte anterior.
- Item 19: “hoje já funciona assim” precisa ser qualificado. Há regra implementada, mas a última consulta tinha zero habilitações de Nogle. SALDO exige pagamento do serviço no caixa; LINK é pago pelo cliente diretamente à Nogle. Não cobrar no caixa um pagamento já direcionado à Nogle.

## Conferência item a item

“Pendente” significa que não encontrei resolução nas fontes consultadas; não significa que o proprietário precise repetir algo já respondido em outra conversa ainda não reconciliada. A prioridade é relativa ao prazo de cinco dias.

| Item | Assunto | Estado e encaminhamento |
|---|---|---|
| 1 | Tabela, família, Código/SKU e prévia | Resolvido pela D-053. Não pedir novamente nem repetir a carga aplicada. Agora falta a posição da virada e IMEIs; a carga atual é histórica |
| 2 | Dados das 11 lojas | Necessário. Nomes já cadastrados; completar CNPJ, endereço, telefone e horários. Começar pela piloto e seguir as demais; manter DEFEITOS fora da venda |
| 3 | E-mail/SMTP | Necessário para convite e recuperação. Proprietário fornece acesso/configuração do serviço; Claude prepara e testa URLs, templates, falhas e entrega. Não é bloqueio para corrigir estoque |
| 4 | Equipe da Santa Cândida | Necessário para operação real. Nome, papel e vínculo; contas de teste já existem. Não usar usuários fictícios como equipe comercial |
| 5 | Maquininhas | Necessário para registro/conciliação real. Identificar aparelho/provedor/loja e conta de recebimento. Não presumir API automática |
| 6 | Fotos | Atualizar pedido. Já há 2.269 fotos registradas; validar produto e variação, pedir apenas ausentes/incorretas. Contagem não certifica fidelidade |
| 7 | Celular real | Necessário para aceite móvel: câmera/código de barras, teclado, conectividade, impressão e ergonomia. Engenharia já pode executar testes em navegador |
| 8 | Papéis novos | Evolução de autorização, se necessária para a equipe real. Usar papéis atuais apenas quando as permissões forem adequadas; não dar dono para suprir papel ausente |
| 9 | Bônus/comissão | Parcialmente resolvido. Sem comissão por venda, bônus mensal (D-014). Pedir somente medidas/faixas/valores ainda ausentes |
| 10 | Pagamento do bônus | Pendente: meio, vencimento e vínculo com conta a pagar/folha. Não confundir apuração aprovada com pagamento realizado |
| 11 | Descontos/margem | Pendente: limites por categoria e autorização. A regra atual pede aprovação; manter enquanto a política não vier, sem inventar percentuais |
| 12 | Aprovação de ajustes | Pendente: proprietário define se gerente pode aprovar em sua loja. Padrão registrado: dono aprova; contagem e solicitação continuam disponíveis |
| 13 | Troca/devolução | Pendente, com validação comercial/fiscal/jurídica. Definir política respeitando obrigações aplicáveis; não tratar regra comercial como dispensa legal |
| 14 | Combos | Pendente (D-035). Pode ficar fora do primeiro recorte estável se não for indispensável à venda da piloto; manter rastreado no escopo |
| 15 | Ranking nominal | Decisão de visibilidade pendente. Não impede venda, transferência ou caixa; manter acesso limitado enquanto não definido |
| 16 | Produção da assistência | Pendente: dono define atribuição comercial. Preservar eventos de abertura, recebimento e execução para não perder rastreabilidade |
| 17 | Técnico com login | Pendente conforme operação. O papel técnico já existe; cadastro/vínculo e escopo devem refletir quem usa o sistema |
| 18 | Aprovação fiscal | Parcial: ADR-006 já dá aprovação a dono/gerente, segue todas as notas e admite autoaprovação atualmente; perguntas sobre exceções/segregação continuam. Não segurar obrigação de emissão à espera de aprovação interna |
| 19 | Pagamento antes do telecom | Distinguir modalidades da ADR-005: SALDO exige serviço quitado no caixa; LINK paga à Nogle. Zero habilitações na verificação anterior; regra/teste não comprova integração operacional |
| 20 | Centro de distribuição vende? | D-043 segue decisão aberta; padrão implementado não vende. DEFEITOS é local de exceção definido, não uma nova loja comercial. Não pedir de novo os nomes/localização já decididos |
| 21 | Crédito próprio | Decisão financeira pendente. Se não autorizado, não habilitar boleto/crediário próprio. Venda pelas financeiras continua um fluxo separado |
| 22 | Extratos reais | Necessários para prova de conciliação. Arquivos entram pelo canal privado/sistema, não pelo GitHub público. Claude deve preparar formatos/erros/reprocessamento |
| 23 | Agrupamento dos depósitos | Necessário para validar FIN-006a. Hoje há escolha reversível de um depósito por maquininha/dia; conferir com contrato/extrato real |
| 24 | Prazo/taxa PayJoy/Aiva | Necessário para previsão e apuração. Prazo já pode ser cadastrado; sem dado não inventar vencimento. Taxa observada no repasse já tem implementação |
| 25 | API PayJoy/Aiva | Dependência externa real: contrato, documentação, acesso e homologação. Operação assistida/manual não encerra o requisito da API |
| 26 | Gateway do site | Escolha resolvida: Asaas (D-052). Pedir sandbox/configuração e habilitação adequada. PAY-014b, retirada sem cobrança repetida, é tarefa do Claude antes de ativar |
| 27 | Nogle: chaves/escopos/testes | Dependência externa real. Confirmar tipo da chave, segunda chave se aplicável, operação autorizada e linha/chip de teste. Renovação de chave exposta pelo canal privado |
| 28 | Comissão/repasse Nogle | Pedir fonte oficial e formato; não deduzir receita/repasse de resposta incompleta da API. Manter distinção entre produção interna e contabilidade do fornecedor |
| 29 | Contador/emissor fiscal | Dependência real: emissor, certificados, regime/parâmetros e regras de cada operação. Claude continua preparando contratos, telas e testes; emissão oficial exige habilitação |
| 30 | WhatsApp oficial | Dependência externa: número, conta, acesso/modelos quando aplicáveis e consentimento. Prazo de verificação é variável, não garantir semanas nem cinco dias. Abrir conversa não é envio automático de nota |
| 31 | Meta Ads | Dependência de conta/acesso e política de atribuição. Não impede estabilidade do caixa/estoque; manter no escopo de canais |
| 32 | Marketplaces/estoque | Contas e autorização são externas. O planejamento já exige sincronização/contabilidade; Claude deve propor evento exato de reserva, baixa, cancelamento e devolução, não transformar integridade de estoque numa pergunta genérica “baixa ou não?” |
| 33 | Provedor de IA | Pode ficar fora do recorte de estabilização, salvo necessidade indispensável definida. Gráficos e relatórios factuais já devem funcionar sem IA |
| 34 | Produtos online | Resolvido pela D-053: com estoque, sem peças de ASSISTÊNCIA. Não republicar indiscriminadamente todo o catálogo |
| 35 | Endereço online | Escolha explícita da conversa: `https://ora5g.com.br/loja`; implementado. Atualizar registro D-024; não reabrir sem nova necessidade concreta |
| 36 | CNPJ/origem/frete | Parcial: retirada por loja é o caminho atual. CNPJ e elegibilidade de cada loja são necessários; envio nacional/transportadora exige regra própria, não bloqueia por si só uma modalidade restrita à retirada corretamente configurada |
| 37 | Contato de pedido não convertido | Decisão de privacidade/CRM pendente. Não incluir automaticamente em marketing; separar atendimento do pedido, cadastro e consentimento |
| 38 | Falta de internet | Código já protege contra gravação financeira offline; procedimento operacional ainda precisa de definição. Claude deve oferecer alternativa concreta e testar reconexão sem duplicidade |
| 39 | Incidentes/suporte | Definir responsável/canal/horário. Claude prepara identificação da falha, logs sem dados indevidos e roteiro de atendimento |
| 40 | Piloto paralelo com Rein | Definir corte, conferência e critérios de saída; quantidade de semanas sozinha não comprova estabilidade. Não abandonar a fonte oficial sem decisão de entrada em operação |
| 41 | Produção/backup/monitor externo | Compartilhado: proprietário decide custo, perda/tempo toleráveis e responsável; Claude dimensiona, configura, demonstra restore e monitoramento. “Servidor novo” não deve ser pedido sem diagnóstico da infraestrutura atual |
| 42 | MFA obrigatório | Decisão de política pendente (D-046), com mecanismo de recuperação. Claude implementa/testa enforcement; usuário habilitar individualmente não prova obrigatoriedade global |
| 43 | Retenção/descarte | Contador/jurídico definem prazos e responsáveis; Claude implementa controle/auditoria. Não automatizar eliminação com prazo presumido |
| 44 | LGPD | Organização e jurídico tratam bases/finalidades/contratos; Claude corrige acessos, minimização e exposição no código independentemente dessa reunião |
| 45 | Configurações dos painéis | Dividir tarefas: usuário concede/decide acesso e política; Claude prepara configuração exata de URLs, proteção de branch e Dependabot. Na consulta desta rodada, a main retornou `protected=false`; a proteção ainda precisa ser aplicada. Não afirmar estado da proteção de senha vazada sem consulta específica |
| 46 | Aceites | Atualizar para 81 roteiros, 1 aceito, 80 sem resposta no checkpoint. Consolidar por jornada e ligar evidências aos requisitos; não pedir 80 respostas sem apresentar um caminho de teste utilizável |

## Pedidos opcionais de provas que gravam

O texto anexo pede “sim” para operações que deixam registros nas lojas de teste. Este envio da lista pelo proprietário não é resposta afirmativa a cada prova. Preservar a decisão registrada de provas nas lojas de teste, uma a uma.

O Claude pode continuar preparando testes isolados, corrigindo bugs e executando verificações somente de leitura. Identificar quais provas já foram executadas, inclusive proteção contra perda de rede, antes de repetir uma solicitação antiga. Consumir indefinidamente o estoque fictício não deve gerar tarefa recorrente para o proprietário: propor fixtures e recomposição auditável em ambiente de teste, sem apagar evidência ou mexer em estoque real.

As metas de velocidade constam suspensas a pedido anterior; o prazo novo exige medir viabilidade operacional, mas não autoriza presumir que toda otimização suspensa foi reaberta.

## O que priorizar nas próximas 24 horas

1. Cadastro e acesso da loja piloto: CNPJ/endereço, equipe e SMTP; dados das demais lojas em seguida.
2. Estoque da virada e IMEIs; validar cobertura das fotos já cadastradas.
3. Maquininhas, extratos reais e prazos das financeiras.
4. Asaas sandbox/configuração; Claude termina PAY-014b antes de habilitar pagamento.
5. Nogle: tipo/escopo da chave, linha/chip e operações liberadas; contador em paralelo.
6. Regras indispensáveis à operação: desconto, ajuste, troca e bônus quando entrar no recorte.
7. Roteiro de aceite por jornada, recuperação/backup e decisão de entrada em operação.

IA, ranking nominal, papéis opcionais e novos combos não devem interromper a correção de um bug de transferência ou o fechamento de uma venda básica. Isso é priorização da entrega, não exclusão do escopo.

## Responsabilidades de engenharia que continuam executáveis

- F24-01: transferência pendente invisível após 50 movimentações posteriores.
- F24-02 a F24-04: reserva rotulada como venda, perda de contexto e botão de envio que apenas solicita.
- F24-05: placares e listas desatualizados; reconciliar as decisões deste adendo.
- PAY-014b: pedido pago no site convertido/retirado sem cobrança duplicada.
- Agrupamento de navegação, gráficos, testes de permissões/concorrência e publicação na homologação já autorizada.

## Texto para encaminhar ao Claude

> Reconcilie sua lista com as decisões atuais e com este adendo. O catálogo já foi definido e importado pela D-053; use TABELA NORMAL, coluna Código, celulares com IMEI e demais famílias por quantidade. A vitrine usa itens com estoque, sem peças de ASSISTÊNCIA. O gateway é Asaas (D-052), o endereço é ora5g.com.br/loja e a regra é bônus mensal, sem comissão por venda (D-014). Confira as fotos já presentes antes de solicitar complementos. Atualize o número de aceites e apresente roteiros agrupados por jornada. Liste somente as respostas que realmente faltam e diga qual função cada uma bloqueia. Continue agora as correções F24-01 a F24-05 e PAY-014b, testes e publicação na homologação. Não trate este encaminhamento como autorização para operações externas ou provas que gravam ainda não aprovadas.

## Fontes

- [D-014, D-052 e D-053](https://github.com/oraconect5g-boop/sistema-ora5g/blob/003421d83985f68b04db200c4a168e2872ebd836/docs/10_DECISOES_PENDENTES.md).
- [Lista única do proprietário](https://github.com/oraconect5g-boop/sistema-ora5g/blob/003421d83985f68b04db200c4a168e2872ebd836/docs/PENDENCIAS_DO_PROPRIETARIO.md).
- [Modalidades e habilitação Nogle — ADR-005](https://github.com/oraconect5g-boop/sistema-ora5g/blob/003421d83985f68b04db200c4a168e2872ebd836/docs/adr/ADR-005-ora-connect-operacoes.md).
- [Fila fiscal — ADR-006](https://github.com/oraconect5g-boop/sistema-ora5g/blob/003421d83985f68b04db200c4a168e2872ebd836/docs/adr/ADR-006-fila-fiscal-interna.md).
- [Auditoria visual e de fluxos — PR #108](https://github.com/oraconect5g-boop/sistema-ora5g/pull/108).
