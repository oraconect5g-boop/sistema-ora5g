# Adendo ao prompt do Claude — relatório Web e Nogle

**Data:** 08/11/2026. Complementa, sem substituir, [PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md](PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md).

Copiar a instrução abaixo para o Claude Code, ou ler diretamente neste repositório:

---

## Entrega posterior: catálogo e fotos reais em aebbdcc

Ler [REVISAO_CATALOGO_FOTOS_AEBBDCC_2026-11-08.md](../analises/REVISAO_CATALOGO_FOTOS_AEBBDCC_2026-11-08.md) e tratar #40–#43 antes do aceite de fotos. Corrigir busca antes do limite/paginação, recuperação de URL de imagem, retry com identidade estável e limpeza da seleção do arquivo. A RPC de foto precisa reconhecer repetição confirmada, por migration nova se necessário.

Não adicionar índice redundante só para apagar o INFO da FK: o índice existente foi confirmado no EXPLAIN. Avaliar #44 pela cadeia de desenvolvimento, sem downgrade automático de Next nem mudança de stack. Integrar as regressões das correções; as provas estão em docs/analises/evidencias/2026-11-08-fotos. #26 continua até o aceite completo, sem declarar o fluxo Storage real homologado pela fixture.


## Rodada adicional de testes por setor

Ler também [TESTES_E_ANALISE_POR_SETOR_2026-11-08.md](../analises/TESTES_E_ANALISE_POR_SETOR_2026-11-08.md) e tratar #34–#39, sem perder as prioridades P1 anteriores. Os achados cobrem equivalência de payload de estoque, unidade por ICCID, autoria de aprovação, período comparável em relatórios, segurança do CSV e saldo insuficiente na ativação.

Preservar os testes permanentes novos de desconto e navegação/exportações. As provas deliberadamente vermelhas ficam em docs/analises/evidencias/2026-11-08-setores até virarem regressões das correções. O núcleo real de vendas, pagamentos e Connect mantém prioridade; a revisão abrange todos os setores sem reabrir linguagem, escopo e decisões já aprovadas.


Continue a implementação do núcleo real da Ora 5G. Preserve TypeScript, React/Next.js, Tailwind, Node.js e PostgreSQL/Supabase. Não recomece módulos existentes nem troque linguagem/framework.

Leia AGENTS.md, CLAUDE.md, estado atual, ADRs, decisões, fila e a [revisão independente](../analises/REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md). A base revisada é 55d10af; antes de alterar, confira os commits posteriores e não sobreponha trabalho em andamento.

**Prioridade nova confirmada:** todo fato telecom precisa de registro/estado oficial Nogle nos recursos habilitados; a Ora liga esses fatos à venda, loja, vendedor, recorrência e repasse. Siga [NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md](NOGLE_REGISTRO_OFICIAL_E_DESEMPENHO.md).

## Ordem e entregas

1. Resolver #27/#28/#29 e a política de processamento #30 por migrations novas e regressões. Provar isolamento entre organizações, ausência de autoconcessão com e-mail Auth divergente, preservação concorrente do último dono e tratamento de convite após perda de autoridade. Conservar #19–#24, já conferidas pelo Codex.
2. Corrigir #31/#32 na demo e nos contratos que alimentarão a aplicação real: face de recarga separado de receita própria, sem margem fictícia; telecom pendente não conta como confirmado. Fonte única de regras, planos e atribuição.
3. Completar acesso real: renovação/segunda visita/revogação com usuário autorizado (#11), confirmação de senha recente, convite/recuperação por SMTP e worker. Nenhuma chave privilegiada na web. Se habilitação externa faltar, concluir todo o trabalho independente e registrar a dependência concreta.
4. Terminar catálogo/estoque reais e fotos #26; tipos e centavos seguros. Publicar o código da migration de fotos já aplicada em dev, mantendo versão/hash e sem reescrever outras. Testar RLS, Storage privado, expiração do acesso à imagem, miniaturas, câmera e foto de variação. Placeholder não conta como produto fotografado.
5. Construir venda persistente/caixa/pagamentos sobre ADR-004 e domínio existente: seleção/reserva de IMEI/ICCID; aprovação; recebimentos mistos; confirmação idempotente; detalhe, comprovante, pedidos e histórico. Cadastro/edição de lojas segue os dados fiscais validados. Desconto, diferenças de caixa e contratos financeiros não recebem limites inventados.
6. Trabalhar o adaptador/ledger Nogle junto aos contratos comerciais: operação, tentativas, resultado desconhecido, reconsulta, atribuição e conciliação. Não aguardar credencial para escrever código testável com fixtures. Não fazer chamada real de ativação/cobrança/compra sem ambiente e linha de teste autorizados.
7. Importador CSV Rein com prévia, erros e aprovação: DEC-U24 já inclui produtos, preços e estoque. Celular sem IMEI fica em pendência, sem saldo vendável. Amostra do CSV define o mapeamento; falta de amostra não impede contratos e esqueleto.
8. Fiscal desacoplado, comunicações oficiais e go/no-go conciliado para sair da Rein. Depois seguir OS, CRM, metas, loja online e canais no roadmap, preservando o escopo integral.

## Regras que corrigem o prompt do Claude Web

- Não pedir de novo autorização genérica para estoque da Rein, cinco papéis iniciais ou OS: DEC-U24, ADR-002 e DEC-U44/U47 já definiram.
- Não excluir os tipos comerciais ativação/portabilidade/recarga do domínio para consertar telas. Separar item, evento externo e financeiro; atalhos usam o mesmo caso de uso.
- Renomear/promover atalhos de modo honesto, selecionar chip explicitamente e preservar contexto ao abrir a ativação. Nunca indicar ativado por concluir a venda local.
- Não usar custo zero, proporção 80/20 ou preço/custo de fixture como contrato real. Comissão da operadora, margem retida, repasse e incentivo do vendedor têm naturezas distintas.
- Programação de recarga não prova comissão recorrente. Persistir quantidade de renovações; importar/reconciliar fatos externos e relacionar origem sem atribuição arbitrária.
- Não devolver todo estoque automaticamente por cancelamento: confirmar retorno físico, condição e identidade; chip usado não fica virgem. Não apagar telecom confirmado nem presumir reversão externa.
- Não usar /compra/solicitar como endpoint genérico de venda local. Confirmar cobertura oficial de compra, varejo, PDV, comissão e repasse.
- Não declarar “todos os botões funcionam” como aceite de backend. Testar efeito esperado, persistência, autorização, falhas e repetição. Downloads precisam corresponder ao escopo/filtros.

## Provas e comunicação

Para cada issue, entregar branch/commits, IDs de requisito, contrato, arquivos, nova migration/reversão quando cabível, testes positivos e negativos, evidência concorrente quando transacional e limites de homologação. Rodar a sequência do CI com instalação limpa; registrar SHA. Não integrar testes de reprodução deliberadamente vermelhos na suíte normal: transformá-los em regressões após a correção.

Atualizar fila, status-requisitos e rastreabilidade sem transformar mockup em entrega. Aguardar revisão do Codex para encerrar os novos achados; não marcar #11/#26 prontas por declaração ou apenas metadados de migration.

Ao proprietário, consolidar somente dependências externas/decisões comerciais realmente pendentes, de forma simples: API/capacidade, fornecedor, função, prioridade, habilitação, ambiente de teste e **nomes** das variáveis. Atualizar APIS_E_HABILITACOES_NECESSARIAS.md com fonte oficial de comissão/repasse Nogle, renovações fora da Ora e mapeamento de PDVs. Nunca solicitar valores de chave no chat.

Não alterar produção, emitir cobrança/ativação real nem desligar a Rein como parte desta instrução. Preparar trabalho completo e evidências para a homologação autorizada. Não prometer zero ajustes futuros; reduzir retrabalho por contratos compartilhados e testes.

---


## Rodada adicional: vendas reais 371cef0 — prioridade de correção

Leia [a análise de vendas/caixa](../analises/REVISAO_VENDAS_PAGAMENTOS_CAIXA_371CEF0_2026-11-08.md) e as issues #45–#53 antes de avançar ao próximo módulo. São sete novos bloqueantes e dois importantes, com 20 provas locais (3 verdes, 17 vermelhas agrupadas em nove causas). Os achados anteriores de acesso #27–#29 permanecem.

1. Corrigir revogação/bloqueio no RLS da aprovação própria (#45).
2. Conferir comprovante da entrada Pix/cartão e saldo para estorno de entrada em dinheiro (#46/#47).
3. Alinhar financiamento ao preço/entrada/recebível e estorno ao recebido líquido (#48/#49).
4. Separar pedido e confirmação de estorno externo (#50); separar cancelamento comercial e retorno físico conferido, sem chip usado disponível como virgem (#51). Alinhar ADR-004 ao adendo anterior.
5. Rejeitar valores monetários inválidos sem convertê-los em zero (#52) e padronizar travas de venda/aprovação, com teste de duas conexões (#53).
6. Reexecutar provas, transformar os casos corrigidos em regressões permanentes, manter controles de venda/reserva/caixa e homologar fluxo autenticado autorizado. Só então prosseguir com Ora Connect oficial e conciliação; prioridades e stack permanecem.

Não editar migrations aplicadas nem presumir API/credencial. Há SQL real novo e PDV real, mas CI verde não equivale a piloto liberado. A demo anuncia exclusividade do dono abaixo do custo, enquanto o ADR-004 permite gerente/dono; registrar a decisão P14 e alinhar, sem inventar regra de negócio.

## Reforço de 09/11/2026 — integração oficial e remoção de versões anteriores

Executar #54 conforme [a análise Nogle/gateway/repasse](../analises/PRIORIDADE_NOGLE_GATEWAY_E_REPASSES_2026-11-09.md). O proprietário confirmou que a Ora Connect inteira precisa operar pela API Nogle/Contel, incluindo recursos financeiros contratados. A implementação atual tem catálogo/regras/demo; faltam transporte HTTP, configuração validada, fila persistente, cobrança oficial, reconciliação e homologação. Não tratar Nogle como aplicação a instalar nem declarar prontidão só pelo preenchimento de variáveis. Não usar outro gateway silenciosamente para cobrar operações telecom.

Respeitar o ciclo intenção local → chamada oficial → estado consultado → projeção/produção/repasse idempotentes. Falha entre sistemas fica recuperável; timeout não autoriza nova cobrança. Se contrato de repasse, webhook, sandbox ou idempotência não estiver publicado, listar precisamente o recurso/habilitação que falta à Contel. Não inventar endpoints, taxas, prazo ou confirmação.

Ler também a [revisão dos 35 merges](../analises/REVISAO_MERGES_E_DUPLICIDADES_2026-11-09.md): identificar módulos e assinaturas canônicos, atualizar consumidores e testes antes de retirar obsoletos. Não apagar migrations aplicadas ou rollback em uso. Código duplicado entre TypeScript/SQL exige paridade (caso #48); Git merge e CI verde não provam essa paridade. Conferir jobs/crontab antigos no ambiente autorizado, sem segredos em mensagens.

## Atualização atual 9b1109e e imagem do proprietário

Prioridade atual: [consolidado9b1109e](../analises/REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md). O adaptador/worker inicial já existe; corrigir #55–#59 antes de homologar. A ligação oficial com cobrança/gateway/repasse da Ora Connect permanece #54, com [51 perguntas prontas à Contel](../integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md). Não misturar fonte oficial de evidência com estado local nem tratar um timestamp como ID único sem contrato.

A decisão recente corrige o cadastro para 11 lojas comerciais e o local DEFEITOS. Não usar os nomes fictíciosLoja02…14 como cadastro real. Implementar #60 com [busca/foto/disponibilidade/pedido interno](BUSCA_ESTOQUE_E_TRANSFERENCIAS_2026-11-09.md), preservando livro, concorrência, separação de trânsito/reserva e recebimento conferido. Confrontar as diferenças dos totais da imagem antes da importação. A propostaReact/TypeScript está fora da aplicação; pedido simulado não é entrega de backend.
