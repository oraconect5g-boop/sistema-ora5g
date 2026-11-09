# Prompt completo — Claude Code: da revisão ao funcionamento real

**Preparado pelo Codex em 09/11/2026.** Repositório: `oraconect5g-boop/sistema-ora5g`. Decisão confirmada pelo proprietário nesta conversa: **manter Supabase/PostgreSQL e a stack atual**. A menção a Firebase não autoriza inclusão ou migração para essa plataforma.

Referências no preparo: main `d730e9a05e65e6449f7068a8e89b98a16534570b`; PR de revisão **#33**, ainda aberta. Esses SHAs são cortes históricos: obtenha o estado mais recente antes de trabalhar. A main já avançou além da auditoria 9b1109e, inclusive com devolução parcial/troca/vale-troca. Isso ainda precisa ser conciliado com os achados; não se declara que as issues abertas foram corrigidas.

**Copie o texto a partir de “Instrução ao Claude Code” e execute integralmente.** Este documento consolida a orientação de execução dos prompts anteriores; preserva suas decisões válidas, sem repetir instruções antigas que contrariem as decisões recentes.

---

## Instrução ao Claude Code

Você é o programador principal da plataforma Ora 5G. O Codex atua como analista de sistemas e revisor. Sua tarefa é **ler todos os relatórios do Codex disponíveis no GitHub, comparar cada achado com o código atual, corrigir as pendências e entregar funcionalidades reais integradas**. Trabalhe no repositório `oraconect5g-boop/sistema-ora5g`.

Não encerre a execução somente com análise, cronograma, documentação ou nova demonstração. Faça o diagnóstico necessário, escolha o primeiro lote seguro e implemente, teste, documente e prossiga nas tarefas independentes autorizadas. Uma dependência externa deve bloquear somente a parte que realmente depende dela.

### 1. Decisões obrigatórias do proprietário

1. **Stack preservada:** TypeScript, React, Next.js, Tailwind, Node.js, PostgreSQL e Supabase. Mantenha os workspaces, o lockfile e a arquitetura existente. Não adicionar Firebase/Firestore/Firebase Auth nem criar um segundo backend, banco, autenticação ou armazenamento paralelos.
2. **Rede atual:** 11 lojas comerciais e o local **DEFEITOS**, usado para transferências de itens com erro/problema. A informação anterior de 14 lojas está superada. DEFEITOS não é uma 12ª loja comercial e seu saldo não vira automaticamente estoque vendável.
3. Lojas confirmadas: **Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneario e Santa Candida**. Preserve os rótulos de origem e concilie códigos/acentuação com o cadastro; não invente CNPJ ou identificador. A loja piloto continua conforme o planejamento vigente, salvo decisão posterior do proprietário.
4. **Prioridade operacional:** acesso/estoque/dinheiro íntegros, vendas/caixa/pagamentos, Ora Connect oficial e pedidos internos de transferência. Depois, ampliar o restante do backlog por dependência.
5. **Ora Connect integra-se ao sistema externo Nogle/Contel pela API oficial**, incluindo operações, cobrança/gateway, recorrência e repasse conforme os recursos contratados. Não tratar a Nogle como aplicação a instalar. Registrar apenas no banco da Ora não comprova a operação oficial.
6. **Todos os produtos precisam de identificação por foto**, com imagem própria quando a variante muda visualmente. Placeholder não comprova foto cadastrada.
7. **Rein:** importação por arquivo e operação paralela reconciliada durante a transição. Não criar API Rein, apagar histórico ou desligá-la por iniciativa própria.
8. Claude implementa no ambiente autorizado de desenvolvimento/homologação; Codex revisa. Produção e operações reais sensíveis continuam sujeitas ao fluxo e às autorizações já definidos. Não pedir autorização genérica novamente para tarefas rotineiras já autorizadas.

### 2. Recupere o estado atual e os relatórios que ainda estão na PR

- Inspecione o checkout, alterações locais, branch, commits, versões em uso e instruções `AGENTS.md`/`CLAUDE.md`. Preserve trabalho alheio; não usar reset destrutivo para “limpar”. Use branch/worktree isolado por issue ou lote coerente.
- Atualize as referências e registre o SHA atual da main. Consulte a PR **#33**, seu HEAD, arquivos, comentários, revisão e CI. Parte importante dos relatórios e das decisões de 11 lojas está nessa PR, **ainda que não exista na main**.
- Leia o conteúdo da PR sem fazer merge cego, sem copiar arquivos inteiros antigos sobre a main nova e sem reimplementar arquivos só porque não apareceram no checkout atual.

Uma forma de leitura que não altera o checkout é:

```bash
git status --short
git fetch origin
git rev-parse HEAD origin/main
git fetch origin refs/pull/33/head
ORA_REVISAO_CODEX_SHA=$(git rev-parse FETCH_HEAD)
git ls-tree -r --name-only "$ORA_REVISAO_CODEX_SHA" -- docs
git show "$ORA_REVISAO_CODEX_SHA:docs/alinhamento/REVISOES_CODEX.md"
```

Obtenha a situação real da PR antes de usar o exemplo: se já foi integrada, leia o conteúdo atual da main e a revisão histórica pelos SHAs. Use GitHub/CLI autorizado quando disponível. Se a deploy key não permitir Actions/issues, registre essa limitação e use o mecanismo autorizado de acesso; nunca peça token em chat e não declare CI confirmado sem consultá-lo.

### 3. Leitura completa e confronto entre fontes

Leia primeiro:

- `docs/ESTADO_ATUAL_E_PASSAGEM.md`, `docs/alinhamento/ANALISE_DO_PLANO.md`, `AGENTS.md`, `CLAUDE.md` e `README.md`;
- `docs/alinhamento/INDICE_RELATORIOS_CODEX_2026-11-09.md` e **todos os relatórios nele listados**;
- todos os demais relatórios encontrados em `docs/analises/` na main e na PR #33, sem limitar a busca à lista preparada nesta data;
- `docs/alinhamento/REVISOES_CODEX.md`, `PEDIDO_DE_REVISAO_CODEX.md`, respostas do Claude e as **issues/comentários** relacionados;
- `backlog.json`, `docs/01_REQUISITOS.md`, `status-requisitos.json`, `RASTREABILIDADE.md`, `FILA_DE_EXECUCAO.md`, ADRs e decisões de negócio aplicáveis;
- `PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md` e `ADENDO_PROMPT_REVISAO_WEB_E_NOGLE.md`, conciliando seus trechos históricos com esta orientação atual;
- especificações de fotos, cadastro confirmado de lojas, busca/transferências, registro oficial Nogle, go/no-go do piloto, APIs/habilitações e pendências do proprietário;
- fontes e instruções em `docs/analises/evidencias/`, especialmente as reproduções vermelhas pertinentes ao lote que você corrigirá;
- coleção oficial Nogle, catálogo gerado, referência técnica e `docs/integracoes/PERGUNTAS_PARA_CONTEL_NOGLE_2026-11-09.md`.

**Ordem de autoridade:** decisão explícita recente do proprietário → regras/ADRs validados → requisito vigente → proposta → relatório/código histórico → inferência. A leitura cronológica não deve restaurar a premissa de 14 lojas, a ausência antiga de um adaptador que já existe, nem tratar uma proposta como contrato aprovado.

Não afirmar acesso a outras conversas privadas de ChatGPT pelo link de um projeto. Use os materiais acessíveis e declare lacunas pontuais sem inventar decisões.

### 4. Faça uma reconciliação objetiva e comece a implementar

Para cada achado/requisito, registre numa tabela curta:

`ID → regra/decisão → SHA auditado → código atual → reprodução atual → estado real → correção/aceite → dependência → evidência`.

Classifique como: corrigido com evidência; reproduzido na versão atual; regressão; divergência de contrato; implementação parcial; apenas demonstração; bloqueio externo; não iniciado. Se um achado já foi corrigido, comprove e preserve a correção em vez de refazê-la. Se a reprodução usa assinatura antiga, adapte a chamada sem enfraquecer a regra testada e explique a diferença.

Recalcule o inventário. No último consolidado havia **179 requisitos e 71 do piloto**, mas os números não são metas fixas de entrega. Diferencie testado em desenvolvimento, homologado e funcionando em produção. Não promover status por existência de tela, migration, teste com mock ou CI verde.

Registre essa reconciliação no GitHub e, **na mesma execução**, inicie a primeira correção independente. Não transformar esta etapa em outro ciclo extenso de planejamento sem código.

### 5. Primeiro lote: bloqueantes de acesso e configuração

Revalide na versão atual e corrija os achados ainda reproduzidos:

- **#55:** publicação deve entregar ao web somente a configuração necessária. Credenciais Nogle e chave administrativa do Supabase pertencem ao worker. Testar publicação, republicação e rollback com valores fictícios; nenhum segredo no navegador, log, commit ou relatório.
- **#27–#29:** autoridade do gestor limitada ao seu escopo, convite sem autoconcessão por divergência de e-mail e proteção concorrente contra remover o último dono.
- **#30:** convite não pode ser efetivado por autoridade que deixou de ser válida conforme a regra aprovada.
- **#45:** leitura de aprovação própria deve respeitar perfil, vínculo, sessão e turno vigentes, inclusive pelo SELECT direto da API.
- **#56:** vendedor sem `custo.ver` não pode obter débito/custo da carteira ou margem por tabela, RPC, eventos, evidência, DTO ou tela. Não basta esconder texto na interface.
- **#11:** provar login/renovação SSR, persistência dos cookies, saída, revogação e segunda visita com usuário de teste autorizado.

Revisar RLS, grants, funções SECURITY DEFINER, views e serviços conforme o acesso real. Não usar service_role no fluxo web para contornar autorização. A chave pública do Supabase atende o login; não exigir chave administrativa para a simples entrada do usuário.

### 6. Segundo lote: integridade financeira, identidade e estoque

- **#46:** comprovante exigido também para entrada Pix/cartão de financiamento.
- **#47:** estorno de entrada em dinheiro não deixa o caixa negativo; validar e travar o saldo para todas as saídas.
- **#48/#49:** alinhar financiamento ao preço/entrada/recebível e estorno ao recebido líquido, descontando troco já entregue. Mesmos vetores devem produzir regras coerentes em SQL e TypeScript.
- **#50:** separar pedido de estorno, pendência e confirmação externa/manual auditada; não marcar Pix/cartão estornado antes da evidência da devolução.
- **#51:** separar cancelamento comercial, devolução física conferida, condição/identidade do item, estorno financeiro, tratamento fiscal e telecom. Não repor automaticamente aparelho não recebido ou chip usado como virgem.
- **#52/#53:** rejeitar valor inválido sem convertê-lo em zero e padronizar ordem de locks de edição/aprovação para eliminar o deadlock.
- **#34/#35:** identidade completa dos retries e um ICCID por chip físico na operação; parâmetros nulos ou campos omitidos não podem burlar a conferência.
- **#57:** impedir que LINK gere nova cobrança pelo mesmo serviço já recebido no caixa, salvo fluxo compensatório formalmente aprovado e testado.
- **#58:** chave de ativação deve ficar vinculada ao conteúdo relevante do cliente, com privacidade; repetir com outro titular/conteúdo exige rejeição, preservando o pedido original.
- **#59:** uma evidência oficial não pode confirmar duas recargas; timestamp sozinho não é chave única sem garantia contratual. Detectar ambiguidade e reuso entre operações, não apenas duplicidade dentro de uma operação.

**Atenção ao avanço da main:** a devolução parcial/troca/vale-troca já foi integrada após 9b1109e, com migration `20261109134507_devolucao_e_troca.sql`. Leia esse código e o adendo do ADR-004 antes de alterar cancelamento, estorno ou meios de pagamento. Não criar um segundo fluxo de devolução ou apagar a funcionalidade nova para aplicar uma correção antiga. Verificar devoluções parciais repetidas, saldo de vale, uso concorrente, estorno e coerência com fiscal/telecom.

### 7. Entregue o núcleo real de ponta a ponta

Reaproveite `apps/plataforma`, `apps/worker`, `packages/dominio`, `packages/banco` e `packages/config`. O repositório já contém funções reais; complete as lacunas sem reiniciar a arquitetura.

Fluxo mínimo a provar no celular:

`login → loja/turno → produto/foto/variante → IMEI/ICCID ou quantidade → reserva → desconto/aprovação → pagamento → conclusão transacional → comprovante → fiscal/telecom aplicáveis → conciliação → devolução/estorno quando necessário`.

Regras obrigatórias:

- persistência entre requisições/reinício, autorização no servidor/banco e auditoria;
- preço vigente e snapshots; dinheiro em centavos com limites seguros e conversão SQL/TypeScript consistente;
- reserva e baixa atômicas, identidade serial preservada e saldo nunca negativo;
- autoaprovação impedida, conteúdo/prazo da aprovação verificados e alteração do pedido invalidando aprovação incompatível;
- caixa por operador/loja, suprimento/sangria, fechamento, diferença e conferência, conforme regras aprovadas;
- pagamento, autorização, liquidação, estorno e conciliação com estados distintos;
- PayJoy/Aiva conforme DEC-U38: preço, entrada e restante a receber; juros não viram receita/comissão; não inventar taxa/prazo;
- comprovantes de maquininha/Pix rastreáveis quando o fluxo é manual; não presumir API PicPay POS;
- rascunho, erro e resultado desconhecido recuperáveis, sem nova venda/cobrança/baixa por clique duplo;
- dados fictícios e estado useState não entrando no livro operacional.

### 8. Ora Connect oficial — concluir a issue #54

Já há cliente HTTP, worker, operações persistentes e três tipos iniciais. Verifique a cobertura atual; não declarar as 62 funções documentadas como 62 integrações prontas.

Complete por fluxos verticais, mantendo um adaptador canônico:

1. autenticação/configuração e permissões da conta Ora (marca, franquia ou PDV);
2. intenção durável, tentativa, chamada oficial, resposta, consulta de evidência e recuperação;
3. venda do chip, ativação, recarga e portabilidade com IDs oficiais, loja/vendedor e produção uma vez;
4. cobrança/gateway Nogle, estado de pagamento, carteira/extrato e conciliação;
5. recorrência com IDs e competências de cada execução;
6. repasse previsto/apurado/recebido com evidência e contrato oficiais;
7. compra/recebimento/entrega, estoque/transferência de PDVs, consulta e atendimento conforme os recursos habilitados.

A chamada externa não é parte da transação PostgreSQL. Se houver timeout, resposta ambígua ou falha local após sucesso externo, manter estado recuperável e reconciliar antes de qualquer reenvio. Não repetir automaticamente escrita porque renovou token, recebeu 401/403/429 ou perdeu a conexão sem conhecer a garantia do provedor.

LINK criado/QR Code/retorno do navegador não prova pagamento. SALDO debita a carteira da Ora, não cria dinheiro na gaveta. Valor de face da recarga, recebido na loja, custo da carteira, receita, incentivo do vendedor e repasse são fatos diferentes. Não usar percentuais de fixture como contrato.

Não inventar endpoint de repasse, webhook, assinatura, prazo, taxa, sandbox ou identificador único. Use o questionário de 51 perguntas já preparado e registre as respostas verificáveis. Perguntas críticas: correlação do ID da recarga com histórico; unicidade de data_cadastro; estados de pagamento/liquidação; comportamento após timeout; recursos e detalhamento de repasse; transferência entre PDVs.

Implemente contratos confirmados, fixtures, testes e componentes independentes enquanto as respostas/credenciais não chegam. Habilite operação real somente no escopo autorizado e após homologação com conta/linha/ICCID de teste e evidência oficial. A homologação de três operações não entrega automaticamente a carteira/recorrência/repasse.

### 9. Estoque visual, fotos e transferência interna — #26 e #60

Leia o cadastro confirmado, a imagem estruturada, a especificação e o protótipo em `docs/prototipos/estoque-por-loja-2026-11-09`. O protótipo é referência visual, não backend pronto.

- Busca com foto, descrição/variante, saldo da loja e acesso às demais lojas, inclusive produto sem saldo local. Corrigir **#40** no catálogo e no estoque: filtrar/paginar na fonte antes de limitar resultados.
- Produto abre painel de rede com disponível, físico, reservas e pendências explicados; loja atual primeiro; DEFEITOS separado das lojas comerciais.
- Pedido interno persistente: solicitar → autorizar/separar → enviar → receber/conferir ou registrar divergência. Definir a matriz de autorização sem pressupor gerente oficial em todas as lojas.
- Reserva de venda e transferência não podem consumir o mesmo item; pedido não cria estoque no destino; trânsito e recebimento têm movimentos correlacionados e idempotentes.
- Transferência para DEFEITOS e regularização possuem motivo, responsável, condição/identidade e trilha; cancelamento após envio exige compensação correta, não estoque duplicado.
- Para chips/eSIM, correlacionar movimentação interna e API Nogle de PDVs quando exigida. Outros produtos usam o livro interno Ora; a API telecom não foi presumida como ERP de capinhas/aparelhos.
- **#41–#43:** corrigir recuperação da imagem, retry estável e seleção de arquivo. Fotos obrigatórias por produto/variante visual, Storage privado, câmera/galeria, miniatura/ampliação e pendências de importação.

Os totais da imagem precisam ser conciliados: físico 6755 confere; disponível 6688 no cabeçalho versus 6725 nas linhas; pendências 31 versus diferença física 30 nas linhas. Não alterar saldos para fechar a conta por suposição. Examinar exportação/regras de reserva, trânsito e exceção e documentar a fórmula oficial antes da carga.

### 10. Merges, duplicidade e migrations

- Antes de integrar, atualizar referências e comparar branch, main e base comum. Inspecionar os dois pais e o resultado de conflitos, renomeações e remoções.
- Identificar implementações canônicas e todos os consumidores. O arquivo antigo de regras Nogle é reexport para o domínio; não apagar compatibilidade ainda usada nem manter uma segunda implementação divergente.
- Conferir assinaturas antigas de RPC/defaults/grants, policies permissivas concorrentes, triggers, índices, rotas/proxy, jobs e crontab. Novo worker exige atualizar também publicação, configuração e observabilidade; #55 mostra o risco do caminho antigo esquecido.
- Não remover por hash igual sem entender o uso. Wrappers de workspace, código gerado, histórico e migrations têm funções próprias. Índice sem uso em banco vazio não autoriza exclusão.
- Migrations aplicadas são imutáveis. Criar correções incrementais com a CLI do projeto, conferir ordem, versão única, registro/hash aplicado, schema, grants/RLS e tipos gerados. Reversão é ensaiada em banco descartável, sem reset destrutivo de dados reais.
- Integrar JSON de requisitos por ID e documentação de estado sem sobrescrever avanços novos com o arquivo inteiro de um corte antigo. Recalcular rastreabilidade.
- Conferir o **SHA realmente testado pelo CI**, inclusive merge temporário. Se a main avançou, examinar a diferença e não atribuir o teste a uma árvore anterior.

### 11. Corrija resíduos e avance o restante do escopo

Concilie também #31/#32 (receita/produção da demo), #36/#37 (aprovações e comparativos), #38 (CSV) e #39 (saldo simulado), sem confundir a correção do mock com a implementação real. Trate #44 por atualização compatível, sem downgrade automático da stack por `audit --force`. Questões fechadas #19–#24 não devem ser reabertas/reimplementadas sem regressão demonstrada.

Depois do núcleo íntegro, avance importador Rein com prévia/aprovação/lote idempotente, CRM, relatório diário de conciliação, metas/comissões por evento, OS/assistência, financeiro/relatórios, fiscal e canais do backlog. A ausência do arquivo Rein bloqueia a validação/carga reais, não o contrato e os testes com fixtures claramente identificadas.

Fiscal: preservar a fila existente, o tratamento de devolução e a obrigação de emissão sem atraso por aprovação interna. Integração fiscal, modelo, tributos, certificado e prazo dependem do contrato e orientação do contador. Não apresentar registro manual de chave como emissão por API.

OS já possui requisitos no backlog; não criá-los outra vez nem contá-los como entregues. Seguir dependências e decisões pendentes sem inventar papéis, comissão, taxa ou política comercial.

### 12. Configuração e dependências externas

- Conferir `.env.example`, documentação de variáveis, consumo no código e configuração efetivamente necessária por serviço. Exibir somente nomes, presença/validação e erro seguro; nunca valores.
- Manter `.env` reais fora do Git, segredo só no processo necessário e ambientes separados. Não pedir credencial de produção para testar desenvolvimento.
- Ao proprietário, entregar uma única lista consolidada: **fornecedor/capacidade, função bloqueada, prioridade, contrato/habilitação, ambiente de teste, nomes das variáveis e critério de desbloqueio**.
- Não perguntar novamente se a rede tem 14 lojas, se Firebase deve substituir Supabase ou se Rein precisa de API: essas decisões estão resolvidas aqui.
- Em bloqueio externo, continuar correções e funcionalidades independentes e registrar o que falta exatamente. Não fabricar integração “pronta” nem interromper todo o projeto esperando uma chave.

### 13. Testes e aceite por entrega

Para cada lote corrigido: prova antiga reproduzida/adaptada, correção, regressão permanente e controle positivo. Não colocar teste deliberadamente vermelho no CI normal, apagar asserção válida, ignorar erro ou reduzir proteção para obter verde.

Provar, conforme o domínio alterado:

- usuário autorizado e negado; custo/PII protegidos; isolamento entre lojas/organizações; revogação durante sessão;
- duas pessoas disputando estoque/último dono/aprovação/vale/transferência com conexões reais quando a concorrência importa;
- valores, centavos, mistos, entrada, troco, estorno e saldo; paridade entre SQL/TypeScript;
- idempotência com mesmo conteúdo e rejeição de conteúdo divergente, inclusive cliente; repetição e eventos fora de ordem;
- falha antes/depois do envio externo, resposta tardia, interrupção do worker, reconsulta e mesma evidência em duas operações;
- persistência no Supabase, estado após recarregar/reiniciar, erros de serviço e recuperação;
- fluxo no celular, foto/variante, busca/paginação, estoque de outra loja e pedido/recebimento;
- fiscal/cancelamento/devolução/telecom preservando seus efeitos e históricos;
- backup/restauração e retorno de versão/configuração no ambiente autorizado, sem operações destrutivas em produção.

Inspecione `package.json` e o workflow vigente e execute os checks adequados e exigidos: instalação pelo lockfile, segredos/commits, rastreabilidade, catálogo Nogle, lint, typecheck, testes, build, auditoria de produção e E2E. Registre versões, SHA, número real de testes, TODO/pulados, limites e evidências. CI verde não substitui homologação da API, aceite fiscal ou uso real do piloto.

### 14. Entrega ao Codex e continuidade

Em cada PR/lote, apresentar:

1. problema concreto, comportamento anterior/novo e requisitos/issues atendidos;
2. arquivos/commits, contratos e mudanças de schema/permissão/configuração;
3. prova da correção, concorrência/RLS quando pertinente, CI e checkout efetivo;
4. riscos reais, recuperação/reversão e dependências externas restantes;
5. o que ficou operacional, o que foi apenas testado localmente e o que ainda depende de homologação;
6. próximo lote independente em execução, com fila/status/rastreabilidade atualizados.

Use o fluxo de branch, revisão e integração já autorizado no projeto. Corrigido aguardando revisão não é homologado; não encerrar achado de revisão apenas por declaração. Integração na main, publicação em homologação e produção devem seguir as autorizações já existentes e suas diferenças, sem inventar nova aprovação para cada edição rotineira.

O resultado esperado é **o aplicativo funcionando progressivamente de verdade**: dados persistidos, regras corretas, permissões, estoque e dinheiro reconciliáveis, API oficial comprovada e interface simples no celular. Não prometer integração “perfeita” ou zero alterações futuras; reduzir retrabalho com contratos compartilhados, migrações incrementais, rastreabilidade e testes.

**Comece agora:** obtenha main/PR/relatórios atuais, produza a matriz breve de reconciliação e execute o primeiro bloqueante ainda reproduzido. Continue nos próximos lotes sem esperar uma nova mensagem do proprietário para cada tarefa já autorizada.
