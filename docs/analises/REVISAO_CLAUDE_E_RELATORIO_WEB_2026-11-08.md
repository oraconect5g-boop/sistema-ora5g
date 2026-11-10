# Revisão das alterações do Claude e do relatório de navegação — 08/11/2026

**Revisor:** Codex. **Base:** `55d10afec95a6a556546b2b2e1f439302a86bfff`. **Comparação:** `7f5fd413eee756015723a53b29680db0ec655a1f` → base, 19 commits e 78 arquivos. Inclui seis commits de documentação do próprio Codex e merges; não atribuir todo o lote ao Claude. **Fonte adicional:** “Texto colado.txt”, relatório enviado pelo proprietário, lido integralmente.

## 1. Parecer

O Claude corrigiu os seis defeitos anteriores (#19–#24), avançou no acesso real, gestão de equipe e worker de identidade, sem trocar a stack. As reproduções independentes antigas agora passam. O núcleo comercial ainda não está operacional: venda, caixa, pagamento, operação Nogle e conciliação continuam sem fluxo real completo.

Foram reproduzidos **seis problemas adicionais**: quatro no acesso/equipe e dois nos indicadores da demonstração. O módulo de equipe exige correções de autorização e concorrência antes do aceite. A navegação do Claude Web é útil como avaliação de interface, mas contém recomendações que contrariam decisões aprovadas e não substitui os testes de banco, persistência e integração.

A orientação recente do proprietário é vinculante: operações e contabilização oficial de telecom devem ocorrer pela **Nogle/Contel**; a Ora correlaciona esses registros com venda, loja, vendedor, desempenho e repasse. “Nugo”, no relato ditado, foi entendido como a Nogle já documentada no projeto. Não foi inferida a razão social da operadora mencionada no áudio.

## 2. O que mudou, com evidência

| Lote / commits | Mudança efetiva | Conferência e limite |
|---|---|---|
| `d12993e` | Migration nova de integridade do estoque: identificadores conjuntos, posição do item, idempotência por conteúdo, ordem de travas, autorização para liberar reserva de colega | Migration de 657 linhas revisada; seis reproduções originais verdes; regressões e 11 disputas com duas conexões reais passaram |
| Mesmo lote | Corrigiu uma saída legítima que falhava no antigo upsert de saldo | Suíte confirma saída, venda com reserva consumida, devolução e transferência, sem saldo negativo ou duplicado |
| `a80bc54` | Lista de APIs/habilitações; gravação de configuração suporta cifrão e aspas; variável `NOGLE_SECONDARY_KEY` no exemplo | 13 testes do leitor de ambiente passaram. Arquivo de exemplo não comprova credenciais configuradas |
| `1543b7b` | eSIM respeita/baixa estoque central; recarga LINK paga conserva meio e origem do recebimento | Reproduções originais passaram no celular e computador; #23/#24 encerradas |
| `d885b6d` | Migration de sessão por turno e equipe: consulta Auth.sessions, revogação, convites e funções restritas ao worker | Migration de 635 linhas revisada; testes existentes verdes, mas REV-026 a REV-029 reproduzidos nesta revisão |
| `bf3986b` | Rotas reais de escolha da loja, início, equipe, confirmação do convite, senha, recuperação e saída; tipos gerados do banco | Auth.getUser, RLS/RPC e erros de transporte separados. `/inicio` informa expressamente que vendas/estoque/caixa serão liberados depois |
| `58dec9c` | Worker separado cria/convida identidade e reflete bloqueio no Auth; publicação separa chave secreta/conexão SQL da web | Quatro testes unitários do worker passaram; revisão estática do adaptador e scripts. Convite por e-mail e execução agendada reais não foram homologados pelo Codex |
| Documentação posterior | Fila, estado, ADR-002 e respostas à auditoria | Melhor rastreabilidade. A fila ainda dizia “aguarda Codex” nas correções agora confirmadas; esta revisão atualiza o parecer |

Acertos a preservar: TypeScript, React/Next.js, Node.js e PostgreSQL/Supabase; migrations incrementais; estados e autorização no banco; auditoria; testes concorrentes em PostgreSQL real; chave privilegiada fora da aplicação web; demonstração identificada e desligada em produção.

Tipos gerados não substituem validação em runtime. A conversão segura de `bigint`/centavos para a aplicação continua pendente na fila. O catálogo/estoque nas telas reais e as fotos ainda não foram entregues no commit revisado.

## 3. CI, testes e Supabase

- [CI da main 42521842775](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42521842775): **concluído com sucesso**, vinculado ao SHA acima.
- Instalação limpa com Node 22.23.4; lint, typecheck e build passaram. ESLint emite aviso informativo de diretório pages em workspaces sem páginas; o processo terminou com sucesso.
- Suíte existente: **397 testes passaram e 4 TODO**. Por workspace: plataforma 110, worker 4, banco 148 (+4 TODO), configuração 53, domínio 82.
- Playwright existente: **124 passaram e 10 pulados**. Isso não comprova os cenários pulados de autenticação real.
- Verificação extra das correções antigas: **6 testes de banco e 4 execuções de navegador passaram**.
- Novas provas adversariais separadas: **6 falhas esperadas**, demonstrando os achados abaixo. Não foram adicionadas à descoberta normal do CI como testes vermelhos.
- Evidências reproduzíveis: [pasta desta revisão](evidencias/2026-11-08-web/LEIA-ME.md).

Consulta conectada ao Supabase foi **somente de leitura**, de metadados e contagens agregadas: 22 tabelas públicas com RLS, zero usuários/sessões Auth, perfis e convites. Não houve leitura de registros pessoais individuais, valores de chaves, .env, SSH, chamadas Nogle ou alteração de banco remoto.

As **oito migrations no Git** têm versão/nome/hash iguais às oito correspondentes no histórico remoto. Há uma **nona migration remota**, `20261108204536_fotos_dos_produtos`, ainda ausente da main no corte consultado. Isso indica trabalho de fotos em andamento no desenvolvimento; não é prova de entrega, regressão do antigo problema de versões nem autorização para reescrever migrations. O código e as policies de Storage dessa entrega precisam de revisão quando publicados.

A documentação de passagem informa que a homologação pública permanece em `0a19c71`. O relatório Web não informa timestamp, build, perfil exato, traço ou SHA; portanto **não prova qual versão foi navegada**. Não foi feita publicação nem interação mutante no site público pelo Codex.

## 4. Novos achados

Linhas referem-se à base fixada. Os quatro primeiros estão em `packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql`.

| ID / issue | Local | Gravidade | Resultado reproduzido / correção necessária |
|---|---|---|---|
| REV-026 / [#27](https://github.com/oraconect5g-boop/sistema-ora5g/issues/27) | `alterar_situacao_pessoa`, 316–339 | P1, autorização | Gestor de A bloqueia perfil global de vendedor compartilhado e retira venda em B. Limitar bloqueio/desbloqueio ao escopo autorizado e alinhar banimento do Auth |
| REV-027 / [#28](https://github.com/oraconect5g-boop/sistema-ora5g/issues/28) | `convidar_pessoa`, 430; `identidade_concluir_convite`, 540–563 | P1, autorização | Com e-mail Auth diferente do perfil, administrador convida o próprio e-mail novo como gerente; worker concede vínculo ao mesmo UUID e libera venda. Comparar identidade imutável e revalidar proibição de autoconcessão no worker |
| REV-028 / [#29](https://github.com/oraconect5g-boop/sistema-ora5g/issues/29) | `encerrar_vinculo`, 276–297 | P1, concorrência | Dois donos encerram o vínculo um do outro em transações sobrepostas; ambas passam e a organização termina com zero donos. Serializar por organização antes das travas individuais e revalidar após a espera |
| REV-029 / [#30](https://github.com/oraconect5g-boop/sistema-ora5g/issues/30) | `identidade_concluir_convite`, 540–568 | P2, revogação assíncrona | Convite criado antes do bloqueio do emissor ainda concede novo administrador. Definir e aplicar revogação/reaprovação dos convites pendentes; não foi localizada decisão de autorização irrevogável |
| REV-030 / [#31](https://github.com/oraconect5g-boop/sistema-ora5g/issues/31) | `src/demo/dados/vendas.ts:232`; `consultas.ts:69–72,111–118`; `demo/produtos/page.tsx:35,80` | P2, demonstração financeira | Recarga pura de R$30 produz R$30 de faturamento; custo zero produz margem de 100%. Separar face/volume, receita própria comprovada, recebimento, custo/uso da carteira, comissão e repasse |
| REV-031 / [#32](https://github.com/oraconect5g-boop/sistema-ora5g/issues/32) | `src/demo/dados/vendas.ts:234`; `demo/_paineis/PainelGestao.tsx:78` | P2, demonstração de desempenho | Ativação pendente entra no indicador “Só as confirmadas”; usa .length em vez de quantidade. Compartilhar regra de produção, separar chip vendido de telecom confirmado e deduplicar fatos |

As provas de autorização usam banco descartável e identidades fictícias; não demonstram exploração em produção. As duas falhas de indicador são anteriores ao lote novo e foram identificadas ao conferir o relatório, não atribuídas como regressão recém-introduzida.

Critérios completos estão nas issues. Corrigir o banco por **migration nova**, conservar as aplicadas e fazer regressões positivas, negativas e concorrentes. A ausência de confirmação de senha recente para gestão da equipe já está declarada como pendente no ADR-002 §6; não considerar esse critério entregue.

## 5. Conferência minuciosa do relatório do Claude Web

| Ponto do relatório | Parecer | Orientação alinhada ao projeto |
|---|---|---|
| “Todos os botões respondem” | Limite da evidência | Resposta visual não comprova autorização, persistência, pagamento nem Nogle. CSV foi excluído da navegação; não declarar varredura funcional completa |
| “Chip + ativação” escolhe ICCID e não pede plano/CPF/DDD | Confirmado no código do PDV, linhas 160–167 | Seleção explícita de chip da loja, reserva real e acesso ao fluxo único de ativação com contexto preservado. A venda não pode prometer ativação concluída |
| Portabilidade no PDV difere do Connect | Confirmado como fluxo incompleto | Atalho pode abrir o mesmo fluxo validado; não precisa eliminar o acesso rápido. Linha ativa, número doador e operadora devem seguir contrato oficial |
| Recarga com valores livres, planos e custo do extrato diferentes | Confirmado como inconsistência de fixtures | Unificar fonte de plano/oferta, preço ao cliente, custo oficial, vigência e origem. Não inferir preço/custo contratual dos exemplos |
| Recarga entra em receita/margem | Confirmado; REV-030 | Separar montantes e natureza contábil. Os R$535/R$455 citados são fotografia sem contexto suficiente para conferir os números exatos; a causa foi reproduzida isoladamente |
| Ativação/portabilidade/recarga deveriam sair de todos os itens de venda | **Não adotar como regra geral** | Venda mista tipada e serviços sem estoque já são decisões do domínio. Separar item comercial, evento operacional e lançamento financeiro; evitar botões/linhas que representem falso sucesso. Organização visual do catálogo pode distinguir telecom de mercadoria |
| Caixa e contas só de leitura | Confirmado como implementação faltante | Abertura, suprimento, sangria, fechamento, diferença e baixa real ainda precisam de backend, permissões e auditoria. Sem inventar limite de aprovação |
| Lista sem detalhe/comprovante/cancelamento | Confirmado como implementação faltante | Priorizar venda persistente e detalhe, comprovante e pedidos; estados independentes de pagamento, telecom e fiscal. Aprovações precisam nascer de ações rastreáveis |
| Venda cancelada com nota emitida e recarga | Inconsistência de fixture e cenário necessário | Pendência fiscal/financeira explícita, compensações idempotentes. Não presumir cancelamento externo impossível nem garantido sem contrato; não desfazer automaticamente telecom confirmado |
| Cancelamento deve devolver todo estoque | **Corrigir a recomendação** | Retorno depende de devolução física/condição/identidade e política; chip usado não volta virgem. Cancelamento comercial, retorno físico, estorno financeiro e ação fiscal são fatos separados |
| Importação de estoque não estava aprovada | **Desatualizado** | DEC-U24 já aprovou CSV de produtos, preços **e estoque**, sem API Rein. Não perguntar novamente nem reduzir a importação a preços |
| Importação de celular por quantidade sem IMEI | Risco correto | Linha incompleta fica em pendência de conferência, sem saldo serializado vendável. Acessórios seguem quantidade. Exigir arquivo real para mapear colunas; não inventar layout definitivo |
| Lojas/usuários só bloqueiam | Verdade na demo, **parcialmente superado no código real** | A main já tem /equipe, convites, vínculos e recuperação. Revisar/corrigir esse módulo (#27–#30), não recriá-lo. Cadastro/edição completo de lojas e homologação de e-mail seguem pendentes |
| Cinco papéis exigem nova decisão | **Já decidido** | ADR-002/P2 registra cinco papéis iniciais; outros entram por migration futura. Administrador técnico não vende/aprova. Ausência de gerente titular não remove o papel previsto |
| Canais online informativos | Melhoria de comunicação de fase | Identificar previsão/demonstração. Integrações futuras não viram prontas por haver botão; preservar roadmap omnichannel |
| Assistência fora do escopo | **Incorreto** | DEC-U44/U47 aprovaram OS e técnico central. Formalizar rastreabilidade/IDs faltantes e implementar depois do núcleo, sem nova aprovação genérica do módulo |
| WhatsApp “Enviar” / rascunho | Recomendação válida com distinção | Simulação deve ser explícita; rascunho que abre aplicativo é envio manual. Automação real requer API oficial e confirmação de entrega |
| CSV não testado pelo navegador Web | Lacuna do relatório, não prova de defeito | Existe E2E de download em demonstracao.spec.ts:418, passou nesta revisão (BOM, cabeçalho, arquivo e 14 dias). Ainda ampliar para conteúdo exato/escopo/filtros e demais exportações pertinentes |

Não usar a skill “sistema-supercell” ou a “seção 24” citadas no prompt como fonte canônica: não foram fornecidas para esta revisão. A base disponível são AGENTS.md, CLAUDE.md, ADRs, decisões e instruções explícitas do proprietário. O link privado do projeto ChatGPT não disponibiliza o histórico integral neste ambiente; nenhuma conversa inacessível foi presumida como lida.

## 6. Os sete blocos de prompt propostos pelo Web

| Bloco | Manter | Ajustar antes de executar |
|---|---|---|
| 1. Connect / PDV | Fluxo único, seleção/reserva ICCID, contexto de venda, fonte de planos, indicadores separados | Não eliminar tipos de venda aprovados; não congelar plano/preço das fixtures; não transformar diferença preço–custo em comissão automática; corrigir confirmação e atribuição oficial |
| 2. Venda / cancelamento / nota | Detalhe, trilha de status, pedidos, comprovante, compensação auditada | Devolução física não é automática; fiscal depende de emissor/contador e prazos. Operação telecom pode ser confirmada apesar da venda local pendente; preservar o fato externo e resolver a divergência |
| 3. Caixa / financeiro | Ações persistentes, justificativa, auditoria, baixa com evidência, P8 explícita | Não inventar limites de diferença, prazo/taxa de financeira ou integração automática com maquininha. Separar recursos locais e externos |
| 4. Rein | Prévia, erros, lote, idempotência, conferência IMEI | Estoque já aprovado pela DEC-U24; falta amostra para contrato de arquivo, não autorização genérica |
| 5. Lojas / equipe | Gestão auditada e matriz de acesso | Reutilizar código real já criado, corrigir #27–#30 e completar senha recente; não repetir ADR dos cinco papéis |
| 6. Fases / OS / mensagens | Transparência de futuro e uso de APIs oficiais | OS já aprovada; não reclassificar como ampliação sem autorização nem adiar por pergunta já respondida |
| 7. Testes | Jornadas de negócio, concorrência, downloads e critérios financeiros | Não clicar em todo botão indiscriminadamente nem exigir mudança visual de ações idempotentes/desabilitadas. Testar contratos e efeitos; expectativas contrárias ao escopo não viram testes |

## 7. Situação do planejamento e ordem de execução

Backlog na base: **173 requisitos**, incluindo ORA-CAT-011 (fotos), **71 no recorte do piloto**. Status declarados recalculados: **3 testados em desenvolvimento, 26 parciais, 22 demonstrações, 2 bloqueados, 119 não iniciados, 1 restrição respeitada e 0 homologados**. “Testado” não equivale ao requisito aceito em produção. Os três são auditoria automática, unicidade serializada e livro de estoque; as correções delimitadas de estoque foram conferidas nesta revisão.

1. Corrigir #27–#30 no acesso/equipe, manter #11 aberta até renovar sessão real, segunda visita e revogação com usuário autorizado. Completar senha recente; configurar worker/SMTP pelos responsáveis sem compartilhar segredos.
2. Corrigir #31/#32 e unificar a jornada PDV/Connect na apresentação, conservando as correções #19–#24. Não marcar operação simulada como real.
3. Concluir catálogo/estoque reais, conversão segura de centavos e fotos (#26): foto principal, variação visual, câmera, miniatura/ampliação, Storage privado, autorização e pendências. Revisar a migration de fotos quando seu código estiver no Git.
4. Preparar importação Rein com o contrato atual; homologar layout e conciliar saldo/IMEI quando chegar o CSV. Sem API Rein.
5. ADR-004 e venda real transacional: rascunho/reserva/aprovação/pagamento/conclusão, detalhe/comprovante, pedidos e compensações. Reusar domínio existente.
6. Caixa/pagamentos/recebíveis: dinheiro, Pix, maquininhas com evidência, misto, financeiras, link e confirmação externa. Não depender de valores contratuais inventados.
7. **Em conjunto com os contratos de venda/pagamento**, especificar e implementar o adaptador e o ledger Nogle conforme [diretriz oficial de telecom](../alinhamento/NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md). Fixtures permitem avançar sem chave; tráfego real depende da habilitação. Não deixar atribuição do vendedor como remendo posterior.
8. Fila fiscal, emissão/consulta/compensação e comunicações pelos provedores oficiais. Os testes podem avançar com adaptadores simulados identificados.
9. Piloto conciliado, falhas/recuperação e go/no-go para saída da Rein; expandir 1 → 3 → 7 → 14 lojas.
10. Formalizar OS no backlog e seguir CRM, custódia/transferências, metas/comissões, loja online e canais conforme roadmap integral.

Não prometer ausência de ajustes futuros; contratos compartilhados, idempotência, domínio separado e aceites verificáveis reduzem retrabalho. Nenhum CI verde ou mockup autoriza desligar a Rein.

## 8. Próxima instrução ao Claude

Ler esta revisão, a diretriz Nogle e o [adendo de execução](../alinhamento/ADENDO_PROMPT_REVISAO_WEB_E_NOGLE.md) junto do prompt prioritário existente. Cada issue mantém uma entrega delimitada, branch, testes e evidência. Não reabrir decisões respondidas e não trocar a stack.

Correções #19–#24 foram encerradas após conferência. #11 e #26 permanecem pendentes nos limites indicados. As novas #27–#32 estão abertas. A documentação desta revisão não altera código operacional nem aplica migrations.

