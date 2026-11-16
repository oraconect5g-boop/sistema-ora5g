# Prompt para o Claude Code — concluir a implementação com evidências

Você é o programador responsável pelo sistema Ora. Continue o projeto existente, preservando TypeScript, Next.js/React, Node e Supabase/PostgreSQL. Não adicione Firebase, não reescreva a arquitetura e não reinicie o backlog. O objetivo é concluir todas as funções planejadas com operação real, mantendo integrações oficiais, rastreabilidade e publicação por lote.

## 1. Retomada obrigatória

Leia AGENTS.md, docs/ESTADO_ATUAL_E_PASSAGEM.md, docs/alinhamento/ANALISE_DO_PLANO.md, CLAUDE.md, README.md, ADRs, backlog.json e os dois checkpoints JSON. Depois leia integralmente este pacote:

- RELATORIO_INTEGRAL.md;
- SUPABASE_E_PUBLICACAO.md;
- MATRIZ_179.md, todos os 179 IDs;
- FONTES_COMPLETAS.md e cada documento listado, incluindo as 88 versões de 9 PRs fora da main;
- INVENTARIO_ARQUIVOS_E_FUNCOES.md e evidencias/RESUMO.md.

Consulte as versões pelos SHAs fixos do índice. Não considere lida apenas a lista de nomes. Registre a leitura e concilie decisões contraditórias. Não faça merge automático dos PRs documentais antigos: selecione o conteúdo atual e preserve a história.

O arquivo SOLUCOES_PARA_AVALIACAO.md contém propostas ilustrativas pedidas pelo proprietário para avaliação. **Não é especificação aprovada nem instrução para copiar/aplicar aqueles códigos.** Corrija os defeitos por análise do código existente, critérios de aceite e menor mudança completa.

Base desta revisão: 5468d9e59d6a68587ba176fff178163eec81ff9c. Se main mudou, faça diff desde essa base, revalide cada achado e não reverta correções posteriores. Os números históricos deste relatório não devem ser carimbados como atuais sem nova medição.

## 2. Regras de execução e conclusão

Trabalhe em uma tarefa delimitada por vez. Para cada lote: IDs → contrato/estados/permissões → implementação → testes → revisão → integração conforme autorização vigente → migration/configuração necessária → publicação em homologação → conferência do domínio → atualização do checkpoint.

Não inicie outra implementação deixando a atual parcialmente publicada ou sem dizer o bloqueio. Se dependência externa impedir a conclusão, registre exatamente o que falta, deixe a parte dependente desabilitada/explicada e avance na próxima tarefa independente. Não simule parceiro nem declare sucesso com fixture em ambiente real.

Há autorização prévia para criar as três contas de teste e publicar os lotes na homologação real; não volte a pedir a mesma autorização a cada etapa. Não invente credenciais, e-mails de terceiros, CNPJs, endereços ou dados pessoais. Segredos somente nos ambientes apropriados, nunca no Git, navegador ou relatório.

“Testado” é diferente de “homologado”. Registre apenas testes executados. Não marcar requisito concluído por existir tela, tabela, adapter, variável ou fila. Não encerrar com promessa de “refinar depois” se faltar integridade, integração contratada ou operação básica.

## 3. Primeiro lote: integridade e CI

Reproduza e corrija em PRs pequenos:
1. #87: notas_corrigir preserva cliente_id/endereco/dados_de e o snapshot fiscal completo.
2. #88: nota/documento/destinatário WhatsApp permanecem compatíveis após reatribuição de cliente na venda; nenhuma mensagem ao cliente errado.
3. #98: protocolo seguro de registro/remoção de fotos com duas conexões, falha da chamada HTTP e retentativa; não basta lock que termina antes da exclusão externa.
4. #96: cache de notificações isolado por identidade e sessão, limpo no logout/troca/revogação.
5. #95: medir e otimizar importação de 2.000 novas linhas para o orçamento aceito; preservar idempotência, auditoria, validação e concorrência.
6. #99: publicação reprova SHA servido divergente e confirma também ora5g.com.br.
7. Reconciliar a exigência antiga de e-mail PayJoy com a regra recente de e-mail opcional. Contrato do parceiro não pode ser presumido.

Use migrations novas para corrigir funções já aplicadas. Preserve os testes que demonstram os defeitos, alterando o resultado esperado para o comportamento correto e cobrindo regressão. Não enfraqueça orçamento ou permissão para obter verde.

## 4. GitHub/Supabase e distribuição

A captura do proprietário mostra Working directory “.”, mas a pasta correta é packages/banco/supabase. Prepare a correção para **packages/banco**, confira a documentação oficial e a configuração necessária no config.toml. Não crie segunda árvore de migrations nem rode reset/repair para um histórico que já corresponde às 84 versões.

Prove o pipeline da integração e o histórico remoto. Verifique drift, RLS, grants, tipos e Storage. Não trate “FUNCTIONS_DEPLOYED” como prova de operação comercial ou publicação web.

Mantenha o processo de deploy web real separado do deploy Supabase. Após cada lote, compare SHA do Git, build, serviço e /saude/rodapé pelo domínio. Faça rollback concreto se o novo lote falhar. Registre as limitações do ambiente e preserve as autorizações existentes para homologação; produção crítica segue o aceite requerido pelas regras locais.

## 5. Base operacional e acesso

As unidades atuais não representam a rede solicitada. Preparar:
Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneário, Santa Cândida; e DEFEITOS, local que não vende. A meta de 14 é futura. DEFEITOS recebe transferência de avarias/erros; não é assistência.

Reutilizar IDs/códigos existentes quando corresponderem, com prévia e verificação de duplicados. Não transformar loja de teste em real silenciosamente. Separar cadastro operacional de liberação fiscal quando necessário, sem inventar dados obrigatórios.

Completar vendedor, gerente e dono de teste com vínculo/loja e acesso correto. O e-mail do dono já foi informado em canal privado nesta conversa; não republique em relatório. Configurar convite/recuperação/SMTP conforme necessário e provar login, bloqueio, revogação, mudança de loja e MFA/confirmação recente.

## 6. Planilha original, fotos e estoque

O arquivo relatorioProdutos131258.xlsx já foi entregue, com posição de 10/11/2026 às 13:20. Não pedir o mesmo arquivo como se estivesse ausente. Se não estiver no seu ambiente, recuperar pelo canal disponível ou registrar apenas a transferência de acesso necessária.

A prova atual encontra 83 colunas, 2.271 produtos, 12 locais e linha de total; falha em K955 por observação com 3.220 caracteres e existe teto de 2.000 linhas. Corrigir parsing, limites, mapeamento, normalização e prévia sem truncar/descartar silenciosamente. Não importar total como produto. Separar catálogo/preço de saldos e pendências por loja.

Criar carga de estoque idempotente por arquivo/lote/local/produto, com prévia completa, erros por linha, aprovação, conciliação e reversão lógica segura. Não marcar foto genérica como foto do produto. Upload e miniaturas devem funcionar na busca, estoque, PDV e variantes visuais, com pendências visíveis.

A posição histórica não pode sobrescrever venda/entrada/transferência ocorrida depois. Definir corte e reconciliar movimentos. Não inserir saldos como se fossem movimentação atual sem origem auditável.

## 7. Transferências e venda real

Permitir selecionar produto X e Y na mesma operação ou lote com atomicidade clara. A disponibilidade de venda da origem deve cair na confirmação operacional por reserva; no envio, converter reserva em saída física/trânsito sem descontar duas vezes; destino só recebe o saldo ao confirmar recebimento.

Testar disputa com PDV, clique repetido, rejeição, cancelamento, divergência, recebimento parcial se suportado, IMEI/ICCID, permissão da outra loja e DEFEITOS. O agregado da rede deve explicar loja/origem/destino/trânsito.

Executar jornada real autenticada: busca/foto → cliente rápido → carrinho misto → reserva/IMEI → preço/desconto/aprovação → pagamentos → conclusão → caixa → comprovante → fiscal → devolução/troca/estorno → relatórios. Usar dados de teste isolados, não transações financeiras reais por engano.

## 8. Clientes, fiscal e WhatsApp

Cadastro rápido: nome completo e WhatsApp; e-mail opcional. Cadastro fiscal: endereço completo e documentos exigidos para aquela operação, com finalidade e proteção adequadas. Não tornar CPF/e-mail obrigatórios globalmente.

Nota deriva da venda e preserva destinatário histórico. Integrar o provedor fiscal homologado com o contador, estados oficiais e idempotência. Emissão manual/anexo não é integração fiscal completa.

Completar WhatsApp Business Platform oficial: adapter, serviço executável/scheduler, callback assinado, retentativas/reconciliação, template/consentimento e estados de envio/entrega/falha. A fila da nota já existe, mas enfileirar não é entregar. Revalidar o destinatário antes de expedir. Não usar automação não oficial.

## 9. Nogle e financeiras — prioridade comercial

Nogle é sistema parceiro externo oficial para Ora Connect. Reaproveitar adapter/worker existente, conferir contratos e scopes; nunca criar endpoint por suposição. Venda de chip, ativação, recarga, portabilidade, linha/plano, recorrência, gateway e repasses precisam de vínculo e conciliação com o registro oficial.

Separar venda do chip, ativação, recarga, valor movimentado, valor devido à parceira e receita/repasse da Ora. Vendedor e loja acompanham a operação de origem; eventos repetidos não duplicam resultado. Timeout após envio exige reconsulta oficial antes de tentar executar novamente. Nada de concluir como sucesso só porque a chamada foi enfileirada.

PayJoy e Aiva **via API** fazem parte do escopo obrigatório. Registro manual atual não cumpre o requisito. Preparar contrato do adapter e jornada com aprovação, oferta, expiração, contrato, repasse, cancelamento e conciliação, implementando chamadas reais somente com documentação confirmada. J7 e QI Tech: espaço de extensão e avaliação de parceria/documentação; não equiparar J7 a empresa de nome parecido.

Consolidar uma lista objetiva de dependências externas por parceiro: documentação/versionamento, ambiente, autenticação/escopos, identificação de PDV/loja, operações contratadas, idempotência, callbacks/assinatura, reconsulta, rate limits, testes autorizados, taxas e prazos de repasse. Não pedir segredos no chat.

## 10. Financeiro, gráficos e demais áreas

Preservar os gráficos reais existentes. Comparar a demo por indicador, não copiar valores. Validar filtros de loja/período, direitos de custo/margem, recebimento versus liquidação, taxas, estorno e previsão. Oferecer tabela acessível e estados distintos de vazio/erro/sem permissão.

Metas são mensais e o incentivo é bônus por meta, conforme D-014; não comissão por venda. Fechamento, contestação, aprovação e pagamento precisam de trilha.

Completar OS/custódia/orçamento/peças/cobrança/avisos, CRM/consentimento/anexos/mesclagem e todos os requisitos parciais antes de declarar cada área fechada.

Depois continuar os 179 IDs ainda abertos: checkout/frete/retirada/devolução online; marketplaces com estoque/reserva central; Meta Ads/atribuição; WhatsApp multiatendente; IA supervisionada; observabilidade, segurança, retenção, contingência, backup/restauração e expansão. Não substituir a lista integral por uma seleção de telas.

## 11. Validação por lote

- Node 22 compatível; instalação pelo lockfile; lint, typecheck, testes pertinentes e build.
- Nas mudanças transacionais, autorização positiva/negativa, organização/loja, idempotência, duas conexões, compensações e tipos gerados.
- Na UI, E2E autenticado do comportamento alterado; não apenas /demo ou redirecionamento ao login.
- Em parceiro, contratos/fixtures demonstram implementação; homologação oficial demonstra integração. Relatar separadamente.
- Em distribuição, SHA do domínio e migration aplicada; rota 200/307 isolada não comprova a função.
- Não repetir a suíte inteira sem motivo após resultados válidos; ampliar conforme a mudança/risco.
- Atualizar status-requisitos.json, execucao-integral-status.json, rastreabilidade, passagem de contexto e matriz demo/real. Não registrar CI verde de outro SHA como se fosse do atual.

## 12. Entrega final

Forneça relatório por todos os 179 IDs: implementado, testado, configurado, publicado e homologado como campos separados; links de código/PR/check/migration/domínio e evidência do aceite. Adicione os pedidos novos desta conversa com vínculo aos IDs, sem escondê-los.

Apresente também dependências externas faltantes, com responsável e impacto exato. Sem credencial/contrato não prometa “100% funcionando”. Conclua todo trabalho independente autorizado e deixe checkpoint que permita retomar precisamente do ponto restante.

