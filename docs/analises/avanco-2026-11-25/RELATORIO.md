# Avanço do Ora 5G — revisão de 25/11/2026

Revisor: Codex. Fuso das datas de negócio: America/Sao_Paulo. Base anterior: `003421d83985f68b04db200c4a168e2872ebd836`. Corte atual: `e7f55b2f0a4f8beaef4109307ab3a7ad40019131`. A coleta terminou na noite de 25/11; alguns registros técnicos usam 26/11 UTC.

**Diagnóstico:** o código, a publicação e a integração de leitura da Nogle avançaram de forma verificável. A aplicação ainda não está homologada para substituir toda a operação das lojas. A maior lacuna é fechar as jornadas com dados atuais, configurações comerciais, operações externas confirmadas e aceite. Existem também correções de código que independem de novas credenciais.

## 1. O que foi verificado e limites da conclusão

- GitHub: comparação de 75 commits (24 com título de merge; não são 75 funcionalidades); inventário e verificação SHA-1 Git de todos os **1.718 arquivos** do corte, sem divergência; 225 arquivos adicionados/modificados em relação à base anterior (136 novos). Inspeção dos contratos, migrations, permissões e testes dos fluxos críticos alterados. O inventário integral não equivale a provar semanticamente cada linha dos 1.718 arquivos.
- Planejamento: backlog de 179 requisitos, status, checkpoint integral, decisões D-051 a D-063, fila integral, lista do proprietário, matriz de APIs, jornadas de aceite e evidências de publicação. Os relatórios anteriores continuam vinculados no README.
- Supabase: metadados de migrations, configurações consultadas sem valores secretos, contagens operacionais, lojas, fotos, estoque, Nogle, advisories e logs. **151 versões no GitHub e as mesmas 151 no banco**; eram 134. Correspondência de versões não prova igualdade de cada corpo SQL remoto, nem execução bem-sucedida de cada fluxo.
- CI do commit exato: Verificações e Supabase Preview com sucesso. Logs de testes e etapas inspecionados.
- Domínio: versão, vitrine, entrada, proteção das rotas Connect/Financeiro e demo, em 360 e 1440 pixels. Não houve login privado nesta auditoria; provas autenticadas históricas estão atribuídas ao registro do Claude.
- Testes locais: plataforma, worker, seis suítes de banco e duas regressões independentes, em dados fictícios. Nenhuma venda, cobrança, ativação, transferência real ou escrita no Supabase foi executada pelo Codex.
- Nenhum acesso SSH ou arquivo real de ambiente. Stack preservada. Este pacote altera somente documentação.

Fontes primárias: [checkpoint](https://github.com/oraconect5g-boop/sistema-ora5g/blob/e7f55b2f0a4f8beaef4109307ab3a7ad40019131/docs/alinhamento/execucao-integral-status.json), [status](https://github.com/oraconect5g-boop/sistema-ora5g/blob/e7f55b2f0a4f8beaef4109307ab3a7ad40019131/docs/alinhamento/status-requisitos.json), [decisões](https://github.com/oraconect5g-boop/sistema-ora5g/blob/e7f55b2f0a4f8beaef4109307ab3a7ad40019131/docs/10_DECISOES_PENDENTES.md), [registro de publicações](https://github.com/oraconect5g-boop/sistema-ora5g/blob/228295ea902dc5ecfb3dff377343612889275d44/publicacoes.jsonl).

## 2. Quanto avançou

| Medida | Corte anterior | Corte atual | Interpretação |
|---|---:|---:|---|
| Requisitos formais | 179 | 179 | O escopo não ficou menor |
| Testados | 73 | 73 | Nenhum requisito inteiro mudou de estado |
| Parciais | 78 | 78 | Houve desenvolvimento dentro deles |
| Não iniciados | 14 | 14 | Continuam no backlog |
| Bloqueados | 12 | 12 | Contratos, fiscal, canais e habilitações |
| Respeitados | 2 | 2 | Restrições de arquitetura/escopo, não funcionalidades extras concluídas |
| Homologados no checkpoint | 0 | 0 | Não há autorização para chamar o sistema de 100% pronto |
| Lotes com roteiro | 81 | 102 | 21 entregas adicionais |
| Lotes aceitos | 1 | 1 | PWA-b; os outros 101 estão sem resposta registrada |
| Testados sem ligação explícita a lote de aceite | 36 | 33 | Rastreabilidade melhorou, ainda incompleta |
| Migrations | 134 | 151 | 17 novas versões, presentes no Supabase |
| Testes unitários/integração aprovados no CI | 3.474 | 3.758 | +284; separados dos E2E |
| E2E aprovados / pulados no CI | 331 / 87 | 331 / 107 | Os novos testes reais dependem do ambiente autenticado |
| Páginas no código | 101 | 111 | Mais telas não representam, por si, mais requisitos concluídos |
| Produtos ativos | 2.277 | 2.278 | Inclusão ligada ao fluxo de chips |
| Produtos publicados online | 634 | 634 | Catálogo já existe |
| Fotos ativas | 2.269 | 2.269 | Agora 9 produtos ativos sem foto, 3 deles online |

**18 registros de requisitos tiveram notas/evidências atualizadas, embora seus estados não tenham mudado.** Não é correto concluir que não houve desenvolvimento. Também não é correto converter 73/179 em um percentual de aplicativo pronto: os requisitos têm tamanhos diferentes e “testado” não significa “homologado”.

A tabela completa por área está em [PLACAR_POR_AREA.md](PLACAR_POR_AREA.md); os 179 IDs e o antes/depois estão em [MATRIZ_179.csv](MATRIZ_179.csv).

## 3. Entregas concretas desde a auditoria anterior

| Frente | O que entrou | Evidência e limite |
|---|---|---|
| Loja online | ONLINE-g/h/i: vitrine com identidade de loja, categorias, endereço de retirada vindo da configuração vigente e consulta agregada mais rápida | Vitrine pública inspecionada; endereço deixou de depender de uma coluna legada vazia. Disponibilidade comercial continua bloqueada |
| Site → balcão | PAY-014b: reconhecer o pagamento do pedido no PDV, preservar o preço pago e impedir uma nova cobrança do mesmo valor | Migration e suíte de banco revisadas; prova local passou. Não houve transação Asaas real nesta auditoria |
| Transferências | TRF-f: abertas e histórico separados, paginação e busca pelo número; rótulos e retorno à busca do estoque corrigidos | A regressão independente F24-01 passou sem alterar sua expectativa |
| Documentação | AUD-e: placar gerado e 15 jornadas reunindo aceites | Gerador executado com `--conferir`: “Rastreabilidade em dia” |
| Nogle: estoque e PDVs | CONNECT-d/e/f: leitura real, vínculo dos PDVs, chips por ICCID, planos no caixa e pedido de transferência pelo dono | Banco comprova 18 PDVs, 11 vinculados e sincronizações sem falha. Pedido de transferência pela nova fila ainda sem registros |
| Nogle: consultas/ações | CONNECT-g/h/i/j/k: linha, cliente, carteira, relatórios, atendimento, ações e produção por vendedor/loja | Consultas reais registradas. Documentação/código cobrem a coleção de 62 funções; isso NÃO equivale a 62 operações homologadas |
| Nogle: pagamento | CONNECT-l: Pix da Nogle na ativação/recarga, distinguindo quem paga à operadora e o valor recebido no caixa | UI e regras publicadas; nenhuma ativação/recarga/portabilidade registrada ainda |
| Asaas no caixa | PAY-015a/b: Pix com QR e cartão à vista por link, confirmado pelo provedor | Código e testes existem; operação desligada e tabelas novas vazias |
| Assinatura | PAY-015c: link recorrente, identificação da assinatura, cobranças e cancelamento na ficha do cliente | Código publicado, teste nominal passou; defeito de cancelamento concorrente F25-01 abaixo |
| Interface Connect | CONNECT-m/n/o: nove abas, assistente de ativação em cinco passos e Carteira e relatórios inspirados na demo | Real usa consultas e permissões reais; registro do Claude demonstra navegação autenticada, sem concluir operação comercial |

O trabalho recente foi predominantemente em **Ora Connect, pagamentos e acabamento das jornadas relacionadas**. Não há evidência de conclusão simultânea de WhatsApp, fiscal, marketplaces ou financeiras via API.

## 4. O que o Supabase comprova agora

### Lojas, estoque e fotos

As 11 lojas existem: **Água Verde, Almirante Tamandaré, Balneário, Butiatuvinha, Colombo, Colônia, Dubai, Muffato Santa, Santa Cândida, Santa Felicidade e Ventania**. **DEFEITOS** existe como local de exceção, sem venda. Há ainda três unidades de teste; elas não representam três lojas comerciais adicionais.

As 11 lojas comerciais estão ativas, mas **nenhuma tem CNPJ preenchido**. Duas lojas de teste têm CNPJ. O endereço vigente está disponível para Água Verde, Almirante Tamandaré e Butiatuvinha. Ele fica em `unidade_configuracoes`; consultar somente `unidades.endereco` produziria um diagnóstico incorreto de que os três endereços sumiram.

Há 12 cargas de estoque aplicadas, todas com corte **10/11/2026 às 13:12 de Brasília**. Não é estoque atualizado de 25/11. A indicação inicial do usuário de 13:20 deve permanecer como divergência de horário a conferir com o arquivo de origem; não se deve rebatizar silenciosamente o corte.

O catálogo tem 2.278 produtos ativos, 634 online, 2.269 fotos ativas e nenhuma foto marcada como ilustração. **9 produtos ativos sem foto, dos quais 3 online**. A frase antiga “faltam 8” deve ser atualizada. Contagem de fotos não comprova correspondência visual com cada SKU/variação.

A nova sincronização de chips da Nogle é uma atualização específica do telecom; ela não atualiza todo o estoque de acessórios e celulares importado da Rein. A documentação ainda registra a necessidade de posição nova de estoque e IMEIs dos celulares.

### Nogle

- 18 PDVs da operadora; 11 vinculados às lojas.
- As três últimas leituras consultadas: 18 de 18 PDVs lidos e **zero falhas**, incluindo a leitura de 25/11 às 22:00.
- Estoque informado nos PDVs: 298 chips físicos e 69 eSIM. Esses totais não incluem necessariamente o estoque geral sem PDV.
- Consultas registradas: saldo, saídas da carteira, programadas, histórico da linha, titularidade, FAQ e portabilidades. Há uma consulta a planos de campanha com resultado “não encontrada”; isso não prova defeito sem o contexto da API.
- Ativação, recarga e portabilidade estão habilitadas, mas `connect_operacoes` continua com **zero registros**. `connect_acoes` e `connect_transferencias_chips` também estavam vazias.
- O registro do Claude documenta uma transferência real de um eSIM para Santa Cândida antes da implementação da nova fila. É evidência pontual de comunicação com o provedor, não de homologação da jornada completa pela interface atual.
- O relatório de vendas/produção por vendedor pode estar corretamente vazio, porque não existem operações confirmadas para alimentá-lo.

Não repetir o diagnóstico antigo de “Nogle não conectada”. A leitura está conectada. A conclusão comercial de cada jornada ainda precisa ser demonstrada.

### Asaas e recorrência

A configuração do pagamento do site foi consultada desativada, sem ambiente definido. As tabelas de Pix do caixa, cartão do caixa e assinaturas estavam com zero registros. A lista de pendências registra que faltam conta/chaves de sandbox e e-mail dos avisos.

A decisão D-062 escolheu Asaas para pagamentos da loja e manteve Nogle no telecom. **D-063 segue aberta:** cobrar mensalmente no cartão não recarrega automaticamente a linha na Nogle. Faltam decisão de liquidação/financiamento e implementação da ligação cobrança confirmada → recarga → conciliação → tratamento de falha/estorno. Não anunciar recorrência telecom automática como concluída.

## 5. Defeitos anteriores e novos achados

| ID | Situação | Resultado desta revisão |
|---|---|---|
| F24-01 | Corrigido no caminho atual | Antiga transferência pendente continua visível após 50 canceladas mais recentes; teste independente aprovado |
| F24-02 | Corrigido no código | Lista de saldo usa “reservado”; explicação inclui venda e transferência |
| F24-03 | Corrigido no código | Produto abre “Onde tem” preservando contexto de busca/página |
| F24-04 | Corrigido no código | Mensagem e ação distinguem pedir/reservar de enviar fisicamente |
| F24-05 | Parte central corrigida | Placar e jornadas gerados; restam dados narrativos antigos e checkpoints de revisão |
| F24-06 | Pendente | Vitrine ainda exibe “Sem estoque” também quando falta liberação comercial da loja |

O fallback para banco antigo da tela de transferências ainda tem paginação reduzida. O banco atual possui a migration nova; essa limitação não invalida a correção reproduzida no caminho atual.

**F25-01 — P1, antes de habilitar cobrança: cancelamento de assinatura pode abandonar a reconciliação.**

Em [assinaturas.ts](https://github.com/oraconect5g-boop/sistema-ora5g/blob/e7f55b2f0a4f8beaef4109307ab3a7ad40019131/apps/worker/src/pagamentos/assinaturas.ts#L89), o worker consulta cobranças; sem assinatura identificada, aplica `sem_cadastro`; se o banco devolver `pode_desativar`, desativa o link e marca o cancelamento. Na [migration de assinaturas](https://github.com/oraconect5g-boop/sistema-ora5g/blob/e7f55b2f0a4f8beaef4109307ab3a7ad40019131/packages/banco/supabase/migrations/20261125211142_assinatura_no_cartao.sql#L354), a fila só busca aguardando cartão, ativa/pausada e cancelando sem ID. Depois de `assinatura_cancelada_na_asaas`, a assinatura fica fora da fila.

Interleaving de risco: consulta externa não vê assinatura → cliente conclui cadastro/cartão → link é desativado → Ora marca cancelada sem conhecer o ID externo. Desativar o link não é a mesma operação de remover uma assinatura já criada. A assinatura externa pode continuar sem acompanhamento.

A prova local em [PROVA_F25_01.test.ts.txt](PROVA_F25_01.test.ts.txt) reproduz **a saída definitiva da fila**, não uma cobrança real. O cenário concorrente do provedor ainda deve ser exercitado em sandbox. Corrigir com reconciliação posterior e estado explícito de cancelamento em confirmação, incluindo expiração e respostas tardias; somente encerrar após tratar assinaturas/cobranças que chegaram no intervalo. Não presumir estorno automático da primeira cobrança.

A documentação oficial distingue [criar link recorrente](https://docs.asaas.com/docs/criando-um-link-de-pagamentos) de [remover assinatura](https://docs.asaas.com/reference/remover-assinatura). Pix/cartão avulso usam filas semelhantes que também deixam de consultar estados cancelado/vencido; ampliar os testes de pagamento tardio nesses caminhos. Esta auditoria reproduziu especificamente a lacuna da assinatura.

**F25-02 — P1 operacional: empresa ainda ligada à raiz de CNPJ do cenário de teste.**

Consulta por igualdade com a fixture do repositório confirmou uma empresa nessa situação, sem expor CNPJ real. O gatilho `privado.validar_unidade` exige que os oito primeiros dígitos do CNPJ da loja coincidam com a empresa. Isso explica a recusa do CNPJ verdadeiro já relatada. A própria fila do Claude reconhece que é trabalho técnico pendente.

Não remover a validação nem substituir toda a raiz às cegas: modelar a empresa correta e os vínculos, preservar a separação das lojas de teste e respeitar D-054/D-055. D-054 condiciona cadastrar/liberar Butiatuvinha à posição nova de estoque e acesso de uma pessoa da loja. Não pedir novamente um CNPJ já fornecido.

**F25-03 — P2 operacional: instabilidade do painel financeiro ainda sem encerramento.**

O registro de PAY-015c relata timeout; os logs do Supabase confirmaram **um HTTP 500 em `/rest/v1/rpc/financeiro_painel` entre 18:30 e 18:45 de 25/11**. O teste posterior passou. Isso não prova estabilidade: medir e corrigir o caminho lento, comparar loja/rede e validar com dados representativos. Não atribuir automaticamente o erro ao lote de assinatura, que não modificou a função.

**F25-04 — P2 de rastreabilidade: revisão e aceite não fecham os requisitos.**

Os 179 itens ainda têm `revisado_codex=false` e `homologado=false`. Isso não significa que nunca foram revisados: há relatórios e correções incorporadas. Significa que o checkpoint não representa as revisões parciais realizadas. Existem 33 itens “testados” sem lote de aceite explicitamente associado. Atualizar ligações e registrar evidências por jornada; não marcar todos como homologados porque o CI passou.

A fila ainda contém trabalho de código (CNPJ, disponibilidade, performance, segurança, auditoria) e não pode terminar afirmando que “todo o resto depende do proprietário”. O gerador mantém as contagens consistentes; ele não verifica a verdade de cada afirmação narrativa.

## 6. CI, testes e publicação

CI do corte: [run 45726420946](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/45726420946). Plataforma 2.118, worker 117, banco 1.313, config 64 e domínio 146 testes aprovados: total **3.758**, além de 2 pulados e 1 TODO. E2E: **331 aprovados e 107 pulados**. As suítes reais exigem `ORA_E2E_URL` e contas de teste; não são exercitadas pelo CI comum sem esse contexto. Lint, tipos, build e auditoria de dependências passaram no job inspecionado.

Localmente:
- Plataforma: 2.117 aprovações e um timeout no teste de exportação de 20 mil itens durante a execução concorrente. Reexecução isolada da suíte: 71/71, incluindo o caso.
- Worker: 113 aprovações; os quatro casos com banco não passaram do hook de inicialização de 10 s. Reexecução isolada com hook de 60 s: 4/4, duração total de 6,93 s.
- Banco: seis suítes de transferência, ações/transferência Nogle, assinatura e pedido pago: 40/40.
- Regressões independentes: F24-01 passou; F25-01 falhou pela ausência de reconciliação descrita acima.
- Não classificar os timeouts locais de capacidade como bugs funcionais confirmados. Também não ocultá-los como se a primeira execução tivesse passado.
- Os testes de Asaas usam respostas simuladas. Precisam de validação contratual e financeira no sandbox antes da operação.

Domínio `ora5g.com.br/saude/versao`: mesmo SHA da main e build de **25/11 às 21:07:34**, ambiente **homologacao**. O domínio estar público não transforma homologação em produção comercial liberada.

Após a publicação atual, janela 21:07:34–23:00 de Brasília: logs retornaram **5.054 HTTP 200 e 8 HTTP 204**, nenhum 4xx/5xx nessa coleta. Não é prova de todas as funções; inclui rotinas e consultas técnicas. A ingestão de logs pode alterar contagens quando consultada depois.

A vitrine e entrada responderam; Connect e Financeiro sem sessão redirecionaram corretamente para entrar. Sem overflow horizontal nem erro JS nas rotas públicas examinadas em 360 e 1440 px. A inspeção visual exigiu exceção de confiança TLS do Chromium deste ambiente; não serve como auditoria do certificado.

**A demo responde 404 por decisão documentada D-051, de 18/11 (“a versão demo já não é mais necessária”, “Sim, desligar”).** Não é falha nova de deploy. O pedido posterior reaproveitou as telas da demo dentro da aplicação real. O código demo permanece no repositório como referência. Manter esta decisão recente evita reabrir a discussão antiga de publicar dois produtos.

## 7. O que ainda falta por frente

- **Acesso/lojas:** corrigir empresa/CNPJ; concluir dados e pessoas reais; SMTP, recuperação de senha e convites próprios; validar escopo de dono/gerente/vendedor.
- **Catálogo/estoque:** posição atual da Rein, IMEIs, diferença entre físico/disponível, inventário; completar 9 fotos e verificar correspondência; executar ida/recebimento/cancelamento/divergência entre lojas e DEFEITOS com base controlada.
- **PDV/financeiro:** fechar venda, pagamentos mistos, devolução/estorno, caixa e conciliação numa jornada; resolver timeout; conferir extratos reais e conciliação Asaas. Parcelamento no cartão Asaas continua fora do lote à vista.
- **Ora Connect:** realizar primeiros fluxos autorizados de ativação, recarga e portabilidade; confirmar identificação externa, pagamento, resultado, produção e reconciliação; testar timeout sem duplicidade e recarga recorrente D-063.
- **Loja online:** liberar unidade comercial elegível; ensaiar pagamento → atendimento → retirada → financeiro; devolução/arrependimento/reembolso online continua não iniciado; venda online de chips/eSIM depende das regras de contratação.
- **Clientes/fiscal/WhatsApp:** cadastro rápido com nome completo/WhatsApp e e-mail opcional continua sendo regra; emissão fiscal efetiva depende de contador/provedor/certificados; envio oficial de nota por WhatsApp e atendimento integrado ainda não estão completos.
- **PayJoy/Aiva:** venda e repasse manuais existem; aprovação por API exige contrato, documentação e implementação validada. QI Tech/J7 continuam como expansão planejada; documentação pública isolada não concede acesso.
- **Marketplaces/Meta:** importações e estruturas não equivalem a sincronização automática de estoque, pedidos, repasses e eventos. Mercado Livre/TikTok Shop, canais relacionados e Meta exigem aplicativos/contratos/consentimento e fluxos reais.
- **Assistência, metas, relatórios:** já possuem código e testes; faltam aceites das jornadas, valores/faixas reais quando aplicável e validação dos números. Bônus mensal D-014 não deve virar comissão por venda.
- **IA e operação:** vários itens de IA/WhatsApp seguem não iniciados. O piloto com usuário, caixa e fechamento diário (ORA-QUAL-009) também não iniciou no placar.

Não houve troca de linguagem. O projeto já usa **TypeScript, Node 22, Next.js/React e Supabase/PostgreSQL**. “Adicionar Node” não resolve este gargalo: ele já existe no frontend servidor e nos workers. Outra linguagem aumentaria os contratos e a manutenção perto do prazo.

## 8. Segurança, duplicidades e governança

Advisories: proteção contra senhas vazadas desativada; 12 avisos de execução anônima e 238 de execução autenticada de funções SECURITY DEFINER; 25 tabelas RLS sem policy, majoritariamente privadas/RPC-only. Esses avisos exigem classificar função/grant/guardas, não provam vazamento por contagem. Não abrir policies indiscriminadamente. Dois índices de FK são sugeridos (`connect_pdvs` e `fotos_produto`); medir antes de alterar. Não excluir os muitos índices “sem uso” em ambiente de baixo tráfego.

A main foi consultada sem proteção de branch. CI verde é evidência de execução, mas não uma barreira de merge obrigatória. Considerar proteção/checks requeridos com o fluxo atual de publicação. Não misturar upgrades de TypeScript/Node/ESLint major com a estabilização.

Não apareceu migração com versão duplicada ou desaparecida neste corte. Novas migrations substituem funções por `CREATE OR REPLACE`; manter o histórico não é duplicação indevida. Código demo e fallbacks têm propósito declarado; sua presença não comprova conflito. Não executei uma prova universal de ausência de duplicidade lógica: os riscos principais verificados foram cobrança, idempotência e projeção de estoque.

## 9. Ordem recomendada para estabilizar

1. **Concluir um lote técnico curto:** empresa/CNPJ e comunicação de disponibilidade; corrigir F25-01 antes de habilitar assinatura; registrar F24-01 a 04 como revisados com evidência, sem homologar requisitos inteiros por extensão.
2. **Preparar a loja piloto:** posição atual de estoque, IMEIs, pessoa com acesso e cadastro comercial correto. Respeitar a sequência D-054; Santa Cândida (teste) não é Santa Cândida comercial.
3. **Fechar J04/J05/J07/J08:** transferência, venda, devolução e caixa, com resultados comparados ao livro de estoque e financeiro. Tratar performance do painel.
4. **Fechar J09 no sandbox Asaas:** cobrança, timeout, repetição, cancelamento concorrente, confirmação tardia, estorno e pedido atendido sem dupla cobrança.
5. **Fechar J10:** primeiros fluxos Nogle acompanhados, rastreabilidade externa e produção interna. Decidir D-063 e só então fechar a recorrência de ponta a ponta.
6. **Registrar aceite por jornada**, usando as 15 jornadas existentes. Relacionar os 33 testados ainda sem roteiro; separar “revisão técnica concluída” de “aceite comercial”.
7. **Depois continuar integrações externas** conforme contratos e credenciais, preservando os itens restantes no escopo. Não anunciar 179/179 com base em número de commits ou botões.

Do proprietário/fornecedores ainda são necessários: exportação atual e IMEIs; dados e pessoas das lojas que faltam; configuração segura do sandbox Asaas e e-mail; decisão D-063; amostras de extratos; contador/provedor fiscal; acessos e contratos PayJoy/Aiva/marketplaces/Meta/WhatsApp. A lista única do repositório detalha os canais de entrega. A Nogle já está conectada; não pedir sua chave como se nunca tivesse sido configurada. O próprio documento registra exposição anterior e necessidade de rotação no fornecedor, sem enviar a chave pelo chat.

O próximo ganho de prazo vem de **encerrar jornadas já construídas e retirar bloqueios concretos**, mantendo a stack e publicando cada lote verificado. Não há evidência suficiente para prometer que todas as integrações externas e os 179 requisitos estarão homologados dentro dos cinco dias.

