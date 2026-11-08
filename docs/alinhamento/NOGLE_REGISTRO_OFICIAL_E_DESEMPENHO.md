# Nogle: registro oficial, venda, recorrência e desempenho

**Data:** 08/11/2026. **Origem:** orientação explícita recente do proprietário, complementar à DEC-U46 e aos requisitos ORA-CONNECT-001 a 011, ORA-PERF e ORA-FIN. **Status:** obrigação de negócio confirmada; contratos técnicos abaixo orientam a implementação e os testes, não declaram integração entregue.

## 1. Resultado obrigatório

A Ora deve permitir vender chip, ativar, recarregar, acompanhar renovação/recorrência e conferir repasses sem perder o registro **oficial na Nogle/Contel**. A atividade feita na operadora deve aparecer no desempenho do vendedor e no painel da loja, com origem verificável e sem dupla contagem.

A aplicação da Ora será o ponto de trabalho da equipe e consultará/acionará a Nogle pelo backend. Isso não substitui a Nogle como plataforma oficial de telecom nem autoriza registrar sucesso apenas no banco local. O problema relatado pelo proprietário é a falta de vínculo entre a operação oficial e a venda diária do vendedor; esse vínculo integra o núcleo prioritário.

## 2. Responsabilidade de cada registro

| Fato | Fonte / responsabilidade | Regra de aceite |
|---|---|---|
| Produto, foto, venda comercial, vendedor, loja/turno | Ora, com RLS, auditoria e ID estável | Requer autenticação e vínculo válido; preserva atribuição histórica |
| Disponibilidade/situação telecom do ICCID, ativação e linha | Nogle nos recursos documentados; Ora mantém projeção reconciliável | Confirmar pelo provedor; não presumir que estoque local implica chip virgem |
| Estoque físico/custódia na loja | Livro da Ora + confirmação física e conciliação com estoque/transferências Nogle | Entrada, saída, reserva e transferência idempotentes; divergência vira pendência |
| Compra de chips e logística na operadora | Nogle, conforme contrato de compra/entrega | Correlacionar pedido externo, pagamento, recebimento e ICCIDs; não dar entrada vendável pela simples solicitação |
| Ativação, portabilidade, recarga, programação de recargas | Nogle | Persistir solicitação, resposta e consultas de confirmação com IDs oficiais |
| Pagamento do cliente, uso da carteira e recebimento | Provedor responsável e caixa/extrato correspondente | LINK, SALDO e recebimento na loja são fluxos distintos; nenhum retorno do navegador prova quitação |
| Comissão/bonificação e repasse da operadora | Contrato + evidência oficial Nogle/operadora | Não inventar percentual, calendário ou montante. Se o recurso não estiver exposto, sinalizar dependência e pendência de conciliação |
| Produção e incentivo interno do vendedor | Ledger da Ora ligado aos fatos comerciais/telecom confirmados | Mesmo fato conta uma vez; comissão do vendedor exige política aprovada, distinta da comissão paga pela operadora |

A orientação “tudo precisa ser registrado na Nogle” aplica-se aos fatos que a plataforma oficial suporta. A coleção atual **não comprova uma rota genérica para registrar uma venda de varejo da Ora ou a comissão de seu vendedor**. Não inventar essa rota nem usar compra com entrega como substituto. Onde a API não cobrir um fato necessário ao negócio, registrar capacidade pendente, evidência e modo de conciliação autorizado; não marcar cobertura completa.

## 3. Quatro estados que não podem ser confundidos

Manter dimensões independentes de **venda**, **pagamento**, **operação telecom** e **repasse**. Exemplos:

- Venda local pode estar paga enquanto a ativação aguarda a operadora.
- LINK pode existir e ainda não ter sido pago; ele não aumenta o caixa físico da loja.
- Recarga pode estar confirmada na Nogle e o recebimento local ainda precisar de conciliação.
- Repasse/bonificação pode estar previsto, mas não apurado ou recebido.
- Uma venda cancelada não apaga a ativação oficial, o pagamento nem a obrigação fiscal.

Estados técnicos podem distinguir rascunho, aguardando pagamento, enviado, processamento, confirmado, falha confirmada, resultado desconhecido e conciliação pendente. Formalizar os enums na ADR apropriada; não usar um único “concluído” para todas as dimensões.

HTTP 200 não é sucesso suficiente: a documentação possui `retorno:false`, envelopes diferentes e mensagens ambíguas. Reutilizar o normalizador existente e exigir prova apropriada ao tipo de operação.

## 4. Registro mínimo para evitar retrabalho

O contrato persistente deve guardar, com autorização por organização/unidade:

- ID da operação local, tipo, organização, loja, venda/item associados e operador que a executou.
- Vendedor de origem e origem comercial da linha/chip, separados do usuário que fez a reconsulta ou manutenção. Alteração de loja/papel não reescreve o histórico.
- Chave de idempotência local e impressão do conteúdo normalizado; a mesma chave com conteúdo diferente é conflito.
- Identificadores oficiais disponíveis: operação/pedido/cobrança, ICCID, linha e plano. Não pressupor que todos os endpoints forneçam os mesmos campos.
- Origem do dado, instante do evento no provedor, instante da consulta, estado interno/externo, tentativas e última confirmação.
- Valor de face, valor cobrado, custo informado, movimento de carteira, eventual margem retida, comissão/bonificação apurada, repasse previsto/recebido e moeda, em campos de naturezas separadas.
- Versão da regra de atribuição/comissão, período de competência, motivo/evidência de ajuste e relações com reversões.
- Payloads estritamente necessários, protegidos e com retenção; logs sem chaves, tokens ou dados pessoais completos.

Usar PostgreSQL/Supabase e TypeScript existentes; DTOs de vendedor não revelam custos/margens. Dados monetários atravessam SQL/TypeScript sem perda: validar texto/BigInt/inteiro seguro, inclusive intermediários. Fotos e identificadores seguem os contratos de catálogo/estoque, sem criar catálogo paralelo dentro do Connect.

A modelagem deve incluir operação, tentativas/eventos externos, sincronização/conciliação, fatos de produção e lançamentos de comissão/repasse, com chaves únicas nos escopos corretos. Nomes e tabelas finais pertencem à ADR/migration do Claude; isto não autoriza alterar migrations aplicadas.

## 5. Jornada única PDV ↔ Connect

1. Vendedor escolhe produto/variante com foto e chip disponível da sua loja; ICCID é selecionado/lido e reservado no servidor. eSIM segue o provisionamento oficial, sem inventar ICCID antes da emissão.
2. Venda identifica cliente quando necessário e define pagamento. Venda física de chip e ativação são fatos relacionados e separados.
3. Atalho do PDV ou aba Connect chama o **mesmo caso de uso**, preservando venda, chip, titular, plano, DDD e vendedor de origem. Não duplicar validações e requisições em componentes diferentes.
4. Backend registra intenção/outbox idempotente e aciona o adaptador Nogle fora de transação longa com travas de estoque.
5. Resultado é persistido e reconsultado quando necessário. Uma resposta perdida gera estado desconhecido e reconciliação, não novo pedido automático.
6. Confirmação oficial aplica uma única transição e um único fato de produção. Pagamento e margem/repasse seguem seus próprios estados.
7. Portabilidade reutiliza linha ativa e dados do número doador conforme API; atalhos não significam portabilidade concluída.
8. Recarga usa plano/oferta com origem e vigência; preço público e débito/custo Nogle não se confundem. Valores livres só entram se o contrato habilitado realmente permitir.

Não remover os tipos comerciais `chip`, `ativacao`, `portabilidade` e `recarga` do domínio aprovado para resolver apresentação. Uma linha de serviço pode representar intenção/associação; não é prova de operação realizada nem gera estoque de serviço.

## 6. Recorrência: dois controles distintos

**Renovação/recarga recorrente do plano:** programação e situação oficial na Nogle, com quantidade/período/linha/plano e resultado de cada execução. A rota documentada `/recarga/saldo/adicionar` recebe `quantidade_recargas`; não descartar esse campo como faz a simulação simplificada. Agendar não significa executar nem pagar todas as renovações.

**Comissão/repasse recorrente:** direito econômico que depende do contrato e da apuração oficial. Uma programação de recarga não prova direito a comissão recorrente. Cada competência deve ter evento/base/evidência e ser conciliada sem duplicação.

É necessário determinar quais renovações oficiais são atribuíveis ao vendedor de origem. Renovação feita pelo cliente no portal/aplicativo da operadora também precisa ser importada/reconciliada se a API a expuser. Linhas antigas ativadas antes da Ora não recebem vendedor arbitrário: aparecem como “origem não conciliada” até mapeamento auditado.

Enquanto taxa, duração, base, elegibilidade, reversões e regra interna do incentivo não estiverem confirmadas, mostrar **apuração pendente**, manter contagem física/operacional verificável e não inventar valores de comissão.

## 7. LINK, SALDO, face e receita

| Situação | Registrar | Evitar |
|---|---|---|
| Cliente paga LINK da operadora | Cobrança/estado oficial, referência da venda e efeitos contratuais comprovados | Somar esse valor como dinheiro recebido na loja |
| Operação usa SALDO Nogle | Débito oficial da carteira e recebimento local quando realmente houve | Tratar carteira como caixa ou repetir débito por timeout |
| Recarga vendida | Valor de face/volume separado da receita própria e do repasse | Custo zero fictício, margem 100% e face integral no faturamento |
| Contrato retém margem na carteira | Valor/competência comprovados e método de conciliação | Contabilizar também depósito externo do mesmo direito |
| Repasse futuro | Competência, base e situação de apuração; a receber apenas com fundamento | Marcar recebido sem extrato/evidência |
| Cancelamento/contestação | Solicitação, resposta externa e lançamentos compensatórios auditados | Apagar eventos ou devolver chip usado ao estoque virgem |

A proporção 80/20 está identificada no mockup como ilustrativa. Não deve entrar como regra real. O relatório transacional da coleção apresenta dados de linha/plano/pagamento; não demonstra um demonstrativo completo de comissão líquida, elegibilidade ou liquidação de repasse.

## 8. Capacidade documentada e pendências externas

A cópia oficial, seu hash e as 62 funções estão em [NOGLE_API_REFERENCIA.md](../integracoes/NOGLE_API_REFERENCIA.md). Confirmar alterações contratuais com a Nogle sem criar endpoints presumidos.

| Necessidade | Recursos já documentados a conferir no adaptador |
|---|---|
| Token, planos e catálogo de ofertas | `/auth/token`, `/planos`, `/planosCampanhas` |
| ICCID e estoque | `/ativacao/validaIccid`, `/linhas/estoque`, `/pdv/estoque`, transferências físicas/eSIM do catálogo oficial |
| Ativação | `/ativacao/solicitar`, `/ativacao/detalhar`, `/ativacao/verificaPlanoPago` |
| Recarga/programação | `/recarga/solicitar`, `/recarga/alterarStatusRecargaAutomatica`, `/recarga/saldo/adicionar`, histórico/cobranças de linha |
| Portabilidade | `/portabilidade/solicitar`, `/portabilidade/status`, `/portabilidade/listar` |
| Compra de chips/logística | `/compra/solicitar`, `/compra/rastrear`, `/logistica` |
| Pagamento/carteira | `/pagamento`, `/saldo/saldo`, `/saldo/extrato`, `/saldo/programado` |
| Conferência operacional | `/relatorios/ativacoes`, `/relatorios/recargas`, `/relatorios/transacoes`, consulta de linhas |

Habilitações e esclarecimentos a acrescentar à entrega de APIs, sem solicitar valores de chaves no chat:

- Tipo de credencial (P9), recursos liberados e correspondência marca/franquia/PDVs ↔ lojas Ora.
- Registro exigido para venda física no varejo, compra de estoque e transferência; como vincular IDs oficiais, unidades e atribuição comercial.
- Fonte oficial de comissões/bonificações/recorrência, extrato de liquidação, competência e identificador estável; confirmar se há API/relatório exportável além da coleção disponível.
- Como buscar renovações feitas fora da Ora, paginação, período de retenção, filtros e informação disponível para atribuição.
- Planos/campanhas habilitados, custo/preço, uso de SALDO/LINK, retenção de margem, estorno/ajuste e contrato de repasse.
- Consulta antes de repetição, idempotência, webhooks/assinatura, limites, expiração de token, sandbox/linha de teste e comportamento após timeout.
- Formato dos GET com corpo e divergências documentadas de payload. Não enviar GET com body usando fetch do Node; não trocar método/parâmetros sem confirmação do provedor.

Variáveis já previstas, somente no servidor: `NOGLE_API_BASE_URL`, `NOGLE_AUTH_KEY_TYPE`, `NOGLE_ACCESS_KEY`, `NOGLE_SECONDARY_KEY`. Nenhuma credencial nova foi obtida ou exposta nesta revisão. A falta de acesso real não impede contratos, migrations não destrutivas, fixtures e testes; impede declarar integração homologada.

## 9. Painel necessário para motivar e conferir a operação

**Vendedor:** chips vendidos; ativações, portabilidades e recargas confirmadas; pendentes/falhas; origem comercial; renovações atribuíveis; apuração do incentivo quando houver política aprovada. Vê apenas seu escopo e não custos/margens restritos.

**Gestão:** filtros por loja/vendedor/período/competência, produção oficial × local, estoque/ICCID, pendências, carteira, valor de face, receita própria, comissão apurada, repasse previsto/recebido e divergências.

**Conciliação:** operação que existe só na Nogle; só na Ora; valor/status divergente; pagamento sem operação; operação sem atribuição; repasse sem base; duplicidade e confirmação tardia. Cada pendência tem motivo, responsável, evidência e resolução auditada. “Não encontrado”, erro de integração e “zero operações” são estados diferentes.

Informar data/hora da última sincronização, cobertura do período/paginação e fonte. Ausência de integração ou falha de consulta não pode ser apresentada como total zero oficial.

## 10. Aceite antes de liberar a operação

1. Venda de chip + ativação: pagamento/reserva corretos, sucesso somente após confirmação Nogle, produção ligada ao vendedor e à loja uma vez.
2. Dois vendedores disputam o mesmo ICCID; apenas uma reserva/operação válida. Reenvio não duplica estoque, cobrança ou produção.
3. Timeout antes/depois do processamento externo: reconsulta e recuperação sem segunda ativação/recarga.
4. LINK pendente/pago e SALDO com/sem fundos: caixa local, carteira e pagamento coerentes e separados.
5. Programação de N recargas: quantidade persistida; execução por competência; renovação fora da Ora importada quando contratualmente disponível.
6. Reconsulta, paginação sobreposta e evento repetido/fora de ordem não duplicam produção ou repasse. Definir chave natural de deduplicação se o provedor não entregar ID estável; não homologar sem evidência de unicidade.
7. Comissão desconhecida fica pendente; recebida exige evidência; reversão conserva histórico e evita dupla baixa.
8. Vendedor transferido/inativo, linha antiga e origem desconhecida: histórico preservado e política de incentivo aplicada pela versão aprovada.
9. Cancelamento comercial, devolução física e telecom confirmado são tratados separadamente, com fiscal/financeiro conciliáveis.
10. RLS impede acesso cruzado de loja/organização e autoaprovação; DTO do vendedor não revela custo.
11. Falta de credencial/provedor indisponível gera pendência clara e recuperável; dados fictícios nunca entram no ledger real.
12. Homologação autorizada com chip/linha de teste e confronto com painel/extrato oficial, antes do go/no-go para saída da Rein.

Nenhuma chamada financeira ou ativação real foi feita por esta revisão. Claude implementa; Codex revisa evidências; proprietário homologa e autoriza publicação crítica.

