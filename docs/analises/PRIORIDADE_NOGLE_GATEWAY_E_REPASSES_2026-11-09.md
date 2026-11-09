# Nogle/Contel: operações, gateway e repasses da Ora Connect

**Data:** 09/11/2026, São Paulo. **Origem:** decisão explícita do proprietário nesta conversa. **Corte inicial:** main `371cef0c02affad30f6fe2ebd1468cbcec67009f`; **atualização incorporada:** `9b1109e49d9304651d20224563f8e5bdaf950894`. [Revisão atual e cinco bloqueantes](REVISAO_NOGLE_9B1109_E_CONSOLIDADO_2026-11-09.md). **Execução:** Claude Code; revisão: Codex. [Issue de implementação #54](https://github.com/oraconect5g-boop/sistema-ora5g/issues/54).

## 1. Requisito confirmado

A Nogle/Contel é o sistema externo oficial ao qual a Ora Connect se integra por API. A equipe trabalha na Ora; o backend comunica as operações à API contratada e mantém os IDs, estados e evidências oficiais. Ativação, chip, recarga, portabilidade, recorrência, cobrança/gateway e repasse da Ora Connect devem ficar correlacionados com o provedor e com a venda, loja e vendedor da Ora.

Não é uma instalação da Nogle na infraestrutura da Ora. Preencher uma URL ou criar um painel de demonstração não entrega a integração. O requisito de gateway Nogle aqui se refere à **Ora Connect**; os meios do PDV geral continuam conforme as decisões anteriores, sem desviar silenciosamente cobrança telecom para outro gateway.

## 2. Estado real atualizado em 9b1109e

| Camada | Encontrado | Falta para funcionamento completo |
|---|---|---|
| Documentação | Coleção oficial atual, 62 funções em 16 grupos, geração e CI | Contrato completo/escopo da conta, repasse e correlação de recarga |
| Configuração | Variáveis e verificações no runner; habilitação por tipo no banco e no ambiente | Homologação e isolamento real dos segredos (#55); valores privados não inspecionados pelo Codex |
| Autenticação/transporte | Cliente HTTP server-side no worker, token e corpo em GET | Permissões reais P9, GET habilitado conforme contrato, testes oficiais |
| Interface | /connect real e demo separadas | Corrigir pagamento/custo/identidade e ampliar a cobertura da operação |
| Banco/processamento | Outbox, tentativas, eventos, estados, consulta e produção | Bloqueantes #56–#59 e correlação de cobrança/repasse |
| Telecom | Ativação, recarga e portabilidade implementadas em desenvolvimento | Homologação, recorrência, compra/entrega/transferência e demais recursos |
| Gateway | LINK/SALDO no pedido e link devolvido por algumas respostas | Cobrança/pagamento autoritativos, /pagamento, conciliação e prevenção de pagamento duplo (#57) |
| Repasse | Obrigação de negócio confirmada | API/relatório contratual, apuração/liquidação e ledger reconciliável |

**Conclusão de prontidão:** o lote novo superou a ausência de adaptador do corte 371cef0. Existem implementação e testes locais, porém cinco novos bloqueantes, escopo financeiro incompleto e nenhuma homologação oficial desta revisão. Não foi acessado o .env da VPS; não se afirma que as chaves estão ausentes lá.

## 3. Fonte oficial reconferida

Em 09/11/2026, a página oficial [docs.nogle.tech](https://docs.nogle.tech/) apontou a coleção publicada. O conteúdo obtido é idêntico à cópia do repositório `docs/integracoes/nogle/colecao-postman-2026-11-07.json`: **233355 bytes**, SHA-256 **`002d13dab3099a95c1e018bdc9d0d63dba30adcacfa141efccdd062f29c88ead`**. São 62 pares método/rota distintos em 16 grupos. Não foi criada outra cópia da coleção para evitar fonte duplicada.

Recursos financeiros confirmados na coleção:

| Recurso | Uso documentado / limite de conclusão |
|---|---|
| `POST /auth/token` | Obter Bearer conforme chave marca/franquia/PDV; não inventar validade do token |
| `POST /ativacao/solicitar` | Solicitar ativação com método LINK/SALDO; resposta pode trazer meios/instruções de pagamento. Solicitação aceita não prova plano pago ou linha ativa |
| `GET /ativacao/detalhar`, `/ativacao/verificaPlanoPago` | Reconsultar operação/pagamento conforme contrato; há GET com corpo a validar com a Contel |
| `POST /recarga/solicitar` | Cobrança/recarga LINK/SALDO e linhas; tabela e exemplo do payload precisam de confirmação |
| `GET /linhas/historico`, `/linhas/cobrancasGeradas` | Reconciliação de recargas e cobranças; registrar IDs e competências, sem repetir receita |
| `POST /compra/solicitar` | Compra de chip com cobrança documentada e logística; solicitação não cria estoque físico recebido |
| `POST /pagamento` | Corpo documentado com `tipo` e `id`; consulta/obtenção de dados de pagamento conforme recurso. Não é autorização genérica para enviar qualquer valor ou liquidar repasse bancário |
| `GET /saldo/saldo`, `/saldo/extrato` | Carteira e extrato oficiais; saldo da operadora e dinheiro em caixa local são contas distintas |
| `/recarga/alterarStatusRecargaAutomatica`, `/recarga/saldo/adicionar`, `/saldo/programado` | Recorrência/programação conforme contrato; quantidade programada e execuções efetivas por competência são fatos diferentes |

A coleção não apresenta contrato explícito de liquidação bancária de repasse, webhook, idempotência, sandbox, limite de uso ou validade de token. Regras e calendário de comissão/repasse também dependem do contrato Ora–Contel. **Isso limita a implementação comprovável; não permite inventar recursos nem declarar o requisito atendido por uma estimativa local.** Claude deve consolidar a lacuna exata e a documentação/habilitação necessária da Contel.

## 4. Contrato de consistência e pagamento

1. A ação autorizada persiste a intenção no banco da Ora, com organização, unidade, vendedor/turno, venda/item, ICCID/linha e chave lógica. O processamento chama o adaptador Nogle e registra tentativa/resultado sem segredo.
2. A API externa e a transação PostgreSQL local não são uma única transação. Se houver timeout, interrupção ou falha local após sucesso externo, manter resultado desconhecido e reconciliar antes de reenviar. Não prometer simultaneidade atômica entre os sistemas.
3. Distinguir venda local, cobrança, pagamento confirmado, operação telecom e repasse. `HTTP 200`, `retorno: true`, `normalizarResposta.ok`, link ou QR Code não comprovam isoladamente liquidação nem ativação final.
4. LINK segue a cobrança oficial e a confirmação do provedor; não soma entrada no caixa físico pela criação do link. SALDO consome a carteira da Ora na Contel e mantém margem/valor de face/receita separados; não simula dinheiro novo na gaveta.
5. Repasse previsto, apurado e recebido têm estados e evidências diferentes. Usar IDs/relatório/extrato oficial e regra contratada; ausência de recurso deve aparecer como pendência contratual, sem baixa automática fictícia.
6. Deduplicação compartilhada pelos caminhos de UI, rotina, reconsulta e eventos: mesma operação lógica não cria segunda cobrança, ativação, receita, comissão, estoque ou repasse. Se não houver ID externo estável, formalizar chave natural e provar unicidade antes da homologação.
7. Reconsultas recuperam operações concluídas fora da Ora quando o contrato fornecer esse histórico, preservando origem/atribuição e sem creditar vendedor arbitrário. Correções usam eventos compensatórios e histórico.
8. Segredos, token e autenticação Nogle ficam no backend/worker autorizado. Vendedor recebe DTO limitado, sem credenciais, custo ou dados pessoais desnecessários. RLS e autorização são verificadas no servidor.

## 5. Ordem de implementação para o Claude

1. Corrigir #55–#59 do adaptador/integração novos, além dos bloqueantes já reproduzidos de acesso, caixa, estoque e estorno (#27–#29, #45–#51), além das pendências de contrato/concorrência pertinentes (#30, #52/#53). Não levar essas falhas para o núcleo telecom.
2. Escrever ADR incremental das operações/cobranças/repasse Nogle, com invariantes e tabela de estados/correlação. Definir adaptador canônico e consumidores; não criar uma segunda regra de financeiro na tela da demo.
3. Construir configuração tipada e cliente HTTP server-side, com fixtures por rota, timeout e tratamento de erros. Implementar e testar as variantes de autenticação sem esperar credenciais reais; chamadas reais só com configuração e escopo autorizados.
4. Persistir intenção, fila durável, tentativas e reconsulta; locks e deduplicação por operação/ICCID/cobrança, com tratamento de resposta ambígua. Não reenviar escrita cegamente após renovação de token.
5. Entregar primeiro fluxo vertical real: venda de chip → cobrança Nogle → confirmação de pagamento/ativação → produção por loja/vendedor → conciliação de carteira/repasse. Provar a ligação com o registro oficial.
6. Avançar recarga, recorrência por competência, portabilidade, compra/recebimento/transferência e atendimento conforme recursos habilitados. Gerar painel real a partir dos registros reconciliáveis.
7. Conciliar o financeiro: bruto, face, custo da carteira, margem, comissão e repasse, sem taxas/prazos inventados. Garantir ausência de dupla cobrança e de dupla contabilização ao migrar caminho antigo.
8. Homologar com conta/linha/ICCID de teste autorizados pela Contel, incluindo pagamento pendente/pago, carteira insuficiente, timeout antes/depois do sucesso externo, repetição, ordem invertida, falha local e recuperação, estorno e corte de acesso. Guardar evidências sem dados reais no GitHub.

## 6. Dependências a consolidar — somente nomes e contratos

- Tipo/escopo da chave Ora: marca, franquia ou PDV; recursos financeiros e relatórios de repasse habilitados.
- Credenciais NOGLE no local seguro já aprovado; URL HTTPS validada; segredos nunca enviados ao chat/GitHub.
- Regras oficiais para GET com corpo, payload de recarga, repetição/idempotência, token, limites, callbacks se houver, e ambiente/conta de teste.
- Contrato de gateway LINK/SALDO, meios efetivos habilitados e confirmação de pagamento; contrato de comissão, extrato, repasse, estorno e evento de liquidação.

Claude implementa o que não depende de acesso e fornece apenas a lista consolidada de habilitações/contratos faltantes ao proprietário. “Totalmente funcionando/configurada” somente após fluxo real autorizado e reconciliação comprovada; documentação e CI de demonstração não cumprem esse aceite.

## 7. Cobertura das 62 funções na base revisada

Todas as linhas estão catalogadas. O transporte inicial da main 9b1109e cobre autenticação, listas e envio/evidência de três tipos, com flags de habilitação e testes locais. Isso não significa integração completa de todas as 62 funções nem homologação. A tabela não certifica permissões da conta Ora.

| Grupo | Função documentada | Método / rota | Implementação operacional |
|---|---|---|---|
| Token | Autenticação | `POST /auth/token` | implementada no fluxo inicial; homologação pendente |
| Geral | Listar DDDs | `GET /ddds` | implementada no fluxo inicial; homologação pendente |
| Geral | Listar Planos | `GET /planos` | implementada no fluxo inicial; homologação pendente |
| Geral | Listar Planos Campanhas | `GET /planosCampanhas` | pendente |
| Geral | Listar Estados | `GET /estados` | pendente |
| Geral | Listar Cidades | `GET /cidades/UF` | implementada no fluxo inicial; homologação pendente |
| Geral | Logística | `GET /logistica` | pendente |
| Cliente | Criar | `POST /cliente/criar` | pendente |
| Cliente | Atualizar | `PUT /cliente/atualizar` | pendente |
| Cliente | Consultar | `GET /cliente/buscar` | pendente |
| Cliente | Linhas do Cliente | `GET /cliente/linhas` | pendente |
| Cliente | Listar | `GET /cliente/listar` | pendente |
| Linha | Detalhes da linha | `GET /linhas/detalhes` | pendente |
| Linha | Consultar Saldo | `GET /linhas/saldo` | pendente |
| Linha | Histórico de Recargas | `GET /linhas/historico` | implementada no fluxo inicial; homologação pendente |
| Linha | Validar Existência | `GET /linhas/verificaExistencia` | pendente |
| Linha | Consultar pelo ICCID | `GET /linhas/numeroPeloIccid` | pendente |
| Linha | Validar Titularidade | `GET /linhas/validaTitularidade` | pendente |
| Linha | Listar Todas | `GET /linhas/listar` | pendente |
| Linha | Estoque Virgem | `GET /linhas/estoque` | pendente |
| Linha | Recargas Solicitadas | `GET /linhas/cobrancasGeradas` | pendente |
| Linha | Atualizar Apelido Linha | `POST /linhas/atualizar` | pendente |
| Histórico de consumo | Dados | `GET /linhas/consumo/dados` | pendente |
| Histórico de consumo | Voz | `GET /linhas/consumo/voz` | pendente |
| Histórico de consumo | SMS | `GET /linhas/consumo/sms` | pendente |
| Ativação | Ativação | `POST /ativacao/solicitar` | implementada no fluxo inicial; homologação pendente |
| Ativação | Detalhar Ativação | `GET /ativacao/detalhar` | pendente |
| Ativação | Verifica Plano Pago | `GET /ativacao/verificaPlanoPago` | pendente |
| Ativação | Validar ICCID | `POST /ativacao/validaIccid` | implementada no fluxo inicial; homologação pendente |
| Recarga | Solicitar Recarga | `POST /recarga/solicitar` | implementada no fluxo inicial; homologação pendente |
| Recarga | Bloqueio / Desbloqueio | `POST /recarga/alterarStatusRecargaAutomatica` | pendente |
| Recarga | Saldo - Programar | `POST /recarga/saldo/adicionar` | pendente |
| Portabilidade | Solicitar Portabilidade | `POST /portabilidade/solicitar` | implementada no fluxo inicial; homologação pendente |
| Portabilidade | Consultar Status | `GET /portabilidade/status` | implementada no fluxo inicial; homologação pendente |
| Portabilidade | Operadoras Disponíveis | `GET /portabilidade/operadorasDisponiveis` | implementada no fluxo inicial; homologação pendente |
| Portabilidade | Reenviar SMS | `POST /portabilidade/reenviarsms` | pendente |
| Compra | Cadastrar Compra | `POST /compra/solicitar` | pendente |
| Compra | Rastreio | `POST /compra/rastrear` | pendente |
| Atendimento | Bloqueio | `POST /atendimento/bloqueio` | pendente |
| Atendimento | Desbloqueio | `POST /atendimento/desbloqueio` | pendente |
| Relatórios | Portabilidades | `GET /portabilidade/listar` | pendente |
| Relatórios | Ativações | `GET /relatorios/ativacoes` | pendente |
| Relatórios | Recargas | `GET /relatorios/recargas` | pendente |
| Relatórios | Transações | `GET /relatorios/transacoes` | pendente |
| FAQ | Categorias | `GET /faq/categorias` | pendente |
| FAQ | Perguntas e Respostas | `GET /faq/categoria/X` | pendente |
| Validações | CEP | `POST /validar/cep` | pendente |
| Validações | CPF | `POST /validar/cpf` | pendente |
| Validações | CNPJ | `POST /validar/cnpj` | pendente |
| Pagamento | Pagamento | `POST /pagamento` | pendente |
| Saldo | Consulta de saldo | `GET /saldo/saldo` | pendente |
| Saldo | Extrato | `GET /saldo/extrato` | pendente |
| Saldo | Recargas Programadas | `GET /saldo/programado` | pendente |
| PDV | Criar | `POST /pdv/cadastrar` | pendente |
| PDV | Novo usuário | `POST /pdv/usuario` | pendente |
| PDV | Inativar | `DELETE /pdv/inativar` | pendente |
| PDV | Atualizar | `PUT /pdv/atualizar` | pendente |
| PDV | Buscar Estoque | `GET /pdv/estoque` | pendente |
| PDV | Listar | `GET /pdv/listar` | pendente |
| PDV | Transferir chip físico - unidade | `POST /pdv/transferir-chip-fisico-unidade` | pendente |
| PDV | Transferir chip físico - lote | `POST /pdv/transferir-chip-fisico-lote` | pendente |
| PDV | Transferir chip eSIM | `POST /pdv/transferir-chip-esim` | pendente |
