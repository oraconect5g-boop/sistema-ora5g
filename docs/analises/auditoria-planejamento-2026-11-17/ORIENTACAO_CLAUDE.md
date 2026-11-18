# Prompt de continuidade para Claude Code — auditoria de 17/11/2026

> **Publicação integral solicitada pelo proprietário após a entrega da auditoria.** Este documento preserva o corte de 17/11/2026, commit `03123d0`; não representa uma nova auditoria dos commits posteriores. O bloqueio inicial de divulgação foi seguido de autorização expressa para adicionar os materiais completos ao GitHub. Planilha original e credenciais continuam fora do pacote.

Você é o programador responsável pelo Ora 5G. Continue a partir do estado existente, preservando TypeScript, React/Next.js, Node.js e Supabase/PostgreSQL. Node já é usado: não iniciar uma reescrita ou outro backend para resolver ausência de dados/configuração. O Codex atua como revisor; o proprietário homologa as jornadas e decisões comerciais.

## Leitura e atualização do estado

1. Leia AGENTS.md, ESTADO_ATUAL_E_PASSAGEM, ANALISE_DO_PLANO, CLAUDE.md e as regras aplicáveis. A decisão explícita mais recente do proprietário prevalece sobre documentos históricos.
2. Leia integralmente os arquivos desta auditoria: RELATORIO, MATRIZ_179, EXTRAS_E_CONFIGURACOES e o README das evidências. Cruze com backlog.json, status-requisitos.json, execucao-integral-status.json e os roteiros de aceite. O inventário e FONTES.md apontam as fontes anteriores, inclusive PRs #33, #66, #67, #68, #77, #81, #85, #86, #97 e #100. Relatório em PR aberto deve ser lido; não presumir que foi integrado ou ignorado.
3. O corte deste diagnóstico é 03123d042f0d51493a17eec449967a5a48124a59, confirmado no domínio em homologação. Verifique commits posteriores antes de corrigir; não reintroduza um bug nem duplique uma solução já integrada.
4. A matriz registra 63 testados, 69 parciais, 42 não iniciados, 3 bloqueados e 2 regras respeitadas. Nenhum homologado. Preserve os IDs; estados só mudam com evidência. Um teste controlado não demonstra API externa configurada.

## Primeiro lote: base utilizável e defeito do XLSX

Corrija o reconhecimento do rodapé numérico do arquivo original em `lib/importacao/catalogo.ts`. A função atual exige a palavra Total, ausente na linha 2273. A prova do Codex lê 2.272 linhas, em vez de 2.271 produtos, e a segunda prévia contém uma linha sem código/nome. Use fixture sintética fiel e valide o arquivo original fora do repositório público. Não descartar linhas inválidas silenciosamente.

O arquivo já foi fornecido pelo proprietário. Se ele não está no seu ambiente, registre a necessidade de transferência segura do anexo existente, sem dizer que não foi entregue. Não publique a planilha, os custos ou dados operacionais no GitHub público. O relatório identifica arquivo/hash/data para conferência privada.

Prepare a importação de estoque por loja com prévia e identificação de origem. São 11 lojas comerciais + DEFEITOS, posição de 10/11/2026 às 13:20. Separe físico, disponível e pendências; trate as 56 células negativas identificadas, seriais obrigatórios e movimentos posteriores. Não criar IMEI/ICCID nem CNPJ fictício. Importe em lotes idempotentes com comparação, aprovação segundo papéis, aplicação transacional e relatório de divergências. O importador de catálogo/preço não equivale à carga de saldos.

As 12 unidades agora existem, mas estão sem estoque e dados fiscais. As três unidades antigas de teste permanecem; evite confusão com Santa Cândida operacional. Preserve trilhas de auditoria ao tratar dados de teste. Crie/provisione as contas de vendedor e gerente solicitadas e o papel executor da importação conforme política existente. Não compartilhar senha do dono nem remover autorização para contornar a falta de usuário.

Critério de conclusão: o catálogo do arquivo e saldos reconciliados aparecem no app real, com filtro por loja; nome/data de corte claros; vendedor/gerente/dono exercem seus fluxos; repetição da carga não duplica movimentos; diferenças e itens não importáveis têm explicação.

## Segundo lote: transferência e consistência da entrega

O TRF-a já implementa remessa de vários produtos. A prova atual mostra físico/reservado 10/0 ao solicitar, 10/2 ao separar, 8/0 ao enviar e 8/0 ao repetir envio. Não corrigir dupla baixa inexistente nessa prova. Reconciliar a expectativa de retirada imediata do disponível com os estados do fluxo. Se o negócio exige reserva na confirmação do pedido de transferência, desenhar uma única transição atômica de aceitação/reserva e atualizar o contrato/testes/UI. Não misturar pedido de reposição, reserva, saída física e recebimento.

Exibir físico/reservado/disponível/em trânsito; testar X e Y na mesma remessa, seriais, cancelamento, recebimento parcial/divergência, repetição e acesso por loja. DEFEITOS recebe transferências e não vende.

No corte da auditoria, o Supabase tem 99 migrations e a main 98. A extra é `20261117174218_origem_das_reservas_do_site`. Identifique o commit/branch correspondente, integre com revisão e testes e prove compatibilidade da aplicação. Não aplicar rollback destrutivo ou migration duplicada apenas para igualar a contagem.

Atualize os nomes da demo, eliminando Loja 02…11 e a instrução de 13 lojas restantes. A demo usa dados fictícios; não buscar os dados comerciais reais para fazê-la parecer atualizada. Complete os novos fluxos demonstráveis e seus estados.

## Operação prioritária

Conclua venda/pagamento/caixa/Ora Connect com jornadas reais de homologação. Verifique, em duas lojas e três papéis, venda de aparelho e acessório, pagamento misto, desconto/aprovação, caixa, cancelamento, devolução, transferência, solicitação fiscal e relatórios. Cada gráfico precisa corresponder aos fatos de origem, com filtro/período/permissão corretos. Estados vazios devem explicar falta de dados, sem números fictícios.

Na Nogle, preserve o papel de API externa oficial para registro das operações telecom, pagamentos, recorrência e repasses. Não substituir a Nogle por um registro interno apresentado como confirmação externa. Habilite cada operação somente com contrato/credenciais/escopos verificados; mantenha idempotência, estados desconhecidos, reconsulta e reconciliação. Não realizar operações financeiras/telecom reais sem a autorização aplicável e um cenário homologado.

O núcleo fiscal precisa de provedor, parâmetros e cenários validados com contador. Fila/solicitação e PDF anexado não são emissão fiscal oficial. Preserve o destinatário registrado na operação e a proteção de identidade corrigida em INTEG-c.

No WhatsApp, ainda falta código: ADAPTADOR_DA_META_PRONTO=false e canal=null. Credenciais não concluem essa etapa. Desenvolva o adaptador conforme contrato oficial, templates, assinatura/webhooks, retorno de envio/entrega e privacidade. Só considere envio operacional quando uma jornada autorizada comprovar a nota recebida pelo destinatário correto.

PayJoy/Aiva via API são obrigatórias no escopo final pedido pelo proprietário, mesmo que documentos antigos classifiquem como fase manual. Prepare os contratos/fluxos independentes enquanto aguarda documentação/parceria. J7 e QI Tech ficam como extensão planejada com pesquisa de elegibilidade; não inventar endpoints ou aprovação de crédito.

## Loja online, canais e restante dos 179 requisitos

O pedido recente exige compra completa em `https://ora5g.com.br/loja`, com botão Comprar. O limite antigo do ADR-009 — reservar e pagar na loja — não encerra o escopo. Entregue catálogo elegível/fotos, carrinho, checkout, pedido persistente, gateway/retorno verificado, reserva concorrente, retirada/frete/rastreio e pós-venda. Para mercadorias, confirme o provedor adequado; não presumir que o gateway telecom atende qualquer produto.

Implemente Mercado Livre/TikTok/Shopee conforme contratos: OAuth, mapeamento, carga inicial/incremental, estoque/preço/anúncios, pedidos, logística, cancelamentos e conciliação de taxas/repasse. Meta deve ter custos/insights, leads/UTM, eventos deduplicados e métricas de atribuição com denominadores verificáveis. Não somar a mesma receita mais de uma vez.

Depois de cada lote, avance no próximo item executável da matriz completa: CRM/omnichannel, assistência, metas/bônus, relatórios, IA supervisionada e qualidade. Não concluir só as prioridades e declarar os 179 prontos. Se uma API estiver bloqueada, registre documentação/conta/escopo/configuração/teste faltante e prossiga nas tarefas independentes.

## Publicação, testes e encerramento

- Trabalhe por branch, menor lote completo, testes adequados e revisão. Confira duplicidades antes de criar módulo/rota/tabela nova. Não apague migrations históricas que redefinem funções intencionalmente.
- Execute lint, typecheck, testes, build e verificações de autorização/concorrência pertinentes. Inclua as provas de regressão do rodapé e das transições de estoque. Os 13 E2E pulados e 1 TODO não contam como aprovados.
- Resolva a proteção de main/rulesets conforme política do proprietário. O CI atual verde não garante bloqueio técnico para merges futuros.
- O audit de produção estava sem alertas, mas o de desenvolvimento tem advisory de picomatch. Reavalie a cadeia com compatibilidade, sem atualização major indiscriminada ou troca de linguagem.
- Publique cada etapa funcional concluída no ambiente já autorizado e confira `/saude/versao`, migrations, worker aplicável e uma jornada real. Não confundir integração GitHub–Supabase com deploy Next.js, nem checkpoint com prova independente de versão.
- Atualize demo, tela de entregas, status e critérios de aceite com o que efetivamente está no ar. Homologação no domínio principal ainda é homologação, não liberação comercial automática.
- Informe ao proprietário por lote: requisito, comportamento entregue, arquivo/commit, teste, URL/versão, prova de banco e pendência remanescente. Use “pronto no código”, “configuração pendente”, “publicado” e “homologado” com significados distintos.
- A publicação deste pacote foi expressamente solicitada pelo proprietário após a entrega. Essa autorização não inclui publicar a planilha original, valores de credenciais ou novos dados pessoais coletados durante o desenvolvimento.

O arquivo SOLUCOES_VIAVEIS traz alternativas conceituais solicitadas pelo proprietário. Elas não são patches aprovados e não devem ser copiadas diretamente para a aplicação: avalie adequação ao código e aos contratos existentes.
