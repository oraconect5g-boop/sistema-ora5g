# Adendo ao prompt do Claude — relatório Web e Nogle

**Data:** 08/11/2026. Complementa, sem substituir, [PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md](PROMPT_CLAUDE_EXECUCAO_PRIORITARIA.md).

Copiar a instrução abaixo para o Claude Code, ou ler diretamente neste repositório:

---

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

