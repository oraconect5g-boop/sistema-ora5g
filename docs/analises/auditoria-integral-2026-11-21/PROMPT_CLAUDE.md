# Prompt de continuidade para Claude Code

Atue como programador responsável pelo sistema Ora 5G, com revisão independente do Codex. Continue a implementação existente; não recomece o projeto e não troque a stack TypeScript/React/Next.js/Node 22/Supabase/PostgreSQL. O objetivo é completar os fluxos reais do planejamento, publicados e demonstráveis no domínio, sem mascarar bloqueios externos ou dados fictícios como operação comercial.

## 1. Leia e reconcilie antes de alterar

Leia `AGENTS.md`, `CLAUDE.md`, `docs/ESTADO_ATUAL_E_PASSAGEM.md`, `docs/alinhamento/ANALISE_DO_PLANO.md` e todo este pacote `docs/analises/auditoria-integral-2026-11-21/`, especialmente RELATORIO, MATRIZ_179.json (179 entradas e notas integrais), EXTRAS_DA_CONVERSA, DEPENDENCIAS_E_CONFIGURACOES e as evidências dos dois novos bugs.

Use `FONTES_DOCUMENTAIS.csv`, `FONTES_E_LIMITES.md`, `docs/alinhamento/INDICE_RELATORIOS_CODEX_2026-11-09.md` e `ISSUES_E_PRS_2026-11-17.md` para incluir planejamento, ADRs, relatórios e branches das PRs #33, #66, #67, #68, #77, #81, #85, #86, #97, #100 e #104. Leia por tema as fontes históricas ainda não lidas; registre caminho/SHA, conclusão revalidada, mudança posterior e requisito relacionado. Não declare leitura integral só por verificar nomes ou contagem. Não aplique recomendação antiga sem comparar com a main atual.

Esta auditoria usa `c1b8e6086d509f388e6080eb829af7a8b6ac316b`. Antes de trabalhar, obtenha o HEAD atual e compare os commits posteriores. Não sobrescreva trabalho novo. Decisões explícitas recentes prevalecem; D-049/050/051 estão registradas no repositório. A demo foi dispensada e desligada: não religue automaticamente por causa de mensagens antigas. A aplicação real deve continuar no domínio `https://ora5g.com.br`, em homologação até o GO/NO-GO.

## 2. Primeiro, feche os dois defeitos reproduzidos

**F21-02 (financeiro):** uma única linha de extrato pode conciliar venda Pix e um repasse independente. Copie a prova documental `evidencias/F21-02-conciliacao.test.ts` para o diretório de testes indicado no README de evidências em branch de correção; reproduza o vermelho no corte auditado. Projete exclusividade/alocação comum, trava na linha, recusa nas duas ordens, sugestões e desfazer coerentes, idempotência e RLS. Acrescente concorrência real com duas conexões PostgreSQL. Não mude somente o frontend nem remova a expectativa do teste. Não confunda esse defeito com soma duplicada automática do saldo bancário: a prova é dupla vinculação de obrigações.

**F21-01 (Rein):** o teste existente com o XLSX privado falha 2.272 versus 2.271. Há 18 células `t=n` com formato brasileiro no rodapé da linha 2.273. Reproduza com a prova sintética fornecida e, privadamente, com o original. Corrija o contrato de leitura/normalização e a identificação comprovada do rodapé, preservando `0.625` como fração, preço sem arredondamento silencioso e último item incompleto com EAN visível. Aceite: 83 colunas, 2.271 produtos, partes 2.000/271, prévia completa e sem perda. A fixture sintética deve rodar no CI sem expor o arquivo comercial.

As soluções de `SOLUCOES_PARA_AVALIACAO.md` são alternativas apresentadas ao proprietário, não uma instrução para colar snippets. Implemente a menor correção completa após analisar os contratos atuais. Uma migration nova deve preservar o histórico, passar pelas provas e ter reversão coerente; não edite retroativamente migration aplicada.

## 3. Dados e implantação do piloto

Consolide F21-03: chaves/contas já entregues não devem continuar como pendência ausente. Mantenha os valores de segredos fora de logs, chat, repositório e frontend. A verificação permitida é de presença/nome, no ambiente autorizado.

Regularize F21-04 pelo procedimento operacional autorizado: duas transferências de teste foram enviadas para Muffato Santa. Não apague histórico nem registre recebimento físico inventado. Faça o ajuste/retorno auditado compatível com a situação e confirme saldo antes da carga.

Os nomes já estão no banco: Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneário, Santa Cândida e DEFEITOS. Não criar 14 lojas fictícias. DEFEITOS não vende. Complete os dados fiscais/endereço reais fornecidos pelo proprietário; não invente CNPJ.

A planilha de 10/11/2026 às 13:20 já foi entregue ao Codex, mas o banco tem zero importações/cargas. Disponibilize-a por canal privado ao ambiente de desenvolvimento autorizado. Execute prévia de catálogo e carga por loja, com mapeamento confirmado, reconciliação do físico/disponível, tratamento de SKU desconhecido e fração, IMEI/ICCID para serializados e aprovação separada. Reconcilie movimentos desde 10/11 antes de chamar a posição de estoque atual. Use primeiro uma loja piloto e preserve rastreabilidade/reversão.

Fotos devem identificar produtos/variantes, inclusive na busca e no pedido. Inclua as imagens verdadeiras autorizadas; não use fotografia ilustrativa como identificação de uma variante diferente. Cadastre/preencha o catálogo e publique os produtos autorizados em `/loja`.

## 4. Termine o núcleo operacional

Conclua e prove, um lote por vez: acesso por papel/loja; cadastro/preço/foto; entrada e inventário; transferências multiitem; PDV misto; desconto; pagamento; caixa; cancelamento/devolução; contas a pagar/receber; extratos/conciliação; metas e bônus mensal; CRM e assistência. Pedido de transferência reduz disponível; envio baixa físico uma vez; recebimento adiciona no destino. Não descontar duas vezes nem inventar reserva a partir da planilha.

PayJoy/Aiva financiam celular; entrada e demais itens/chips são separados conforme D-050. Chips contam em meta própria. Confirme limites comerciais de parcelas, hoje padrões reversíveis. Bônus é mensal, não converter em comissão por venda. Fechamento mensal pode ser testado com relógio/fixtures isolados; não é necessário parar todo o projeto esperando a virada do calendário.

Os gráficos reais já existem: mantenha componentes/consultas, confira por loja/período/papel contra o banco e restaure qualquer lacuna demonstrada pelo usuário. Falha de consulta aparece como falha, nunca zero inventado. Não copie dados da demo para o real.

Cadastro rápido do cliente: nome completo e WhatsApp; e-mail sempre opcional. Cadastro fiscal exige documento/endereço completo conforme a operação. Preserve máscara, autorização e auditoria de revelação. Não obrigue e-mail para poder enviar nota por WhatsApp.

## 5. Integrações e funcionalidades finais

- **Ora Connect / Nogle:** é sistema parceiro via API oficial, não outro servidor a instalar. Reutilize o adaptador/worker; confirme tipo de chave, segunda chave e flags. Comece por leitura de listas oficiais; depois homologue cada operação autorizada. Finalize ativação, recarga, portabilidade, carteira/extrato, recorrência/gateway e repasses conforme recursos documentados. A fonte oficial deve conciliar com registro interno; custo/repasse/comissão não podem ser inventados. Ausência de API de comissões requer a fonte oficial alternativa definida com a Nogle.
- **Fiscal:** emissor contratado/contador/certificado e regras por CNPJ/UF/natureza; autorização, rejeição, consulta, cancelamento/correção, contingência e documento guardado. Aprovação interna não pode atrasar obrigação legal. Pedido de nota sem emissão não encerra a integração.
- **WhatsApp:** Cloud API oficial, número/WABA/template/permissões, assinatura do callback, idempotência e confirmação; fila da nota primeiro, depois caixa multiatendente, CRM, etiquetas, SLA, histórico e automação consentida.
- **Online:** `/loja` deve permitir compra de fato, com catálogo/fotos/estoque, checkout, cobrança, reconsulta oficial, callbacks, expiração e pagamento tardio, fiscal, retirada/frete e devolução/reembolso. A atual reserva com pagamento presencial é intermediária. Link de pagamento fica na compra online, conforme D-050.
- **PayJoy/Aiva:** APIs obrigatórias no escopo final; manual/recebível é etapa intermediária. Solicite apenas contrato/documentação/acesso que realmente falta. J7 e QI Tech ficam preparadas como extensões futuras, sem inventar API/parceria.
- **Marketplaces:** Mercado Livre e TikTok Shop (e Shopee conforme roadmap), OAuth/renovação, SKU/preço/estoque/anúncios, pedidos/cancelamentos/devoluções, repasses e monitoramento. Importação de arquivo não encerra a automação. Corrigir F21-02 antes de extratos operacionais.
- **Meta:** gasto automático, atribuição e CAPI com consentimento/deduplicação; separar Meta Commerce de Ads. Relatório por arquivo não equivale à API pronta.
- **IA:** somente supervisionada e depois do núcleo estável, com custo/qualidade/retenção; nunca aprova crédito, pagamento, nota, desconto ou ativação sozinha.

Percorra todos os 179 itens da matriz; estes grupos não permitem omitir os não citados individualmente. Se um contrato impedir a chamada externa, finalize partes independentes e registre exatamente código, acesso, decisão e teste faltantes. Não afirmar que o aplicativo está completo ou que faltam apenas chaves se ainda há adaptador não implementado.

## 6. Publicação e prova após cada lote

Faça uma tarefa delimitada por vez. Ao concluir: lint/typecheck/testes relevantes, regressões transacionais, revisão, merge conforme autorização vigente e publicação na homologação já autorizada. `GitHub → Supabase` aplica SQL; não publica Next.js sozinho. Use o procedimento existente, confira versão do serviço e domínio com `conferir-publicacao.sh` e prove a função no endereço real.

Registre: requisito/lote, commit, link CI, migrations, build/ambiente/domínio, prova funcional com papel/loja, pendências e roteiro de aceite. Não marque “publicado” só por push ou HTTP 200. Não marque “homologado” por contagem de testes. Atualize status estruturado e resumo sem deixar bloqueios antigos ativos. Não peça novamente autorização já válida para homologação; respeite limites de produção, operações externas e dados reais.

Os testes autenticados que gravam precisam de fixture isolada e autorização do cenário. Não use lojas reais como descarte de testes; não esgote estoque para repetir prova sem preparação. Segredos de teste não passam pelo Git/chat. A PR desta auditoria contém provas vermelhas sob documentação, não código de aplicação novo.

## 7. Critério de encerramento

Só declare um requisito encerrado quando seus critérios funcionais, permissões, falhas, repetição/concorrência, persistência, publicação e aceite cabíveis estiverem comprovados. Para encerrar o aplicativo comercial: piloto com estoque/caixa/financeiro reconciliados, fiscal e telecom oficialmente operantes, integrações contratadas funcionais, segurança/backup/restore/observabilidade testados e GO/NO-GO documentado. Até lá entregue progresso objetivo e a lista exata de dependências externas, sem tratar tudo como concluído.
