# Cadastro de clientes e envio da nota fiscal por WhatsApp

**Decisão do proprietário:** 12/11/2026. **Base confrontada:** `8af4b34758558e3e754ae82a067f2d380a38e4e8`.
**Acompanhamento:** [issue #76](https://github.com/oraconect5g-boop/sistema-ora5g/issues/76).
**Escopo:** ORA-CRM-001/002/007, ORA-POS-008/011, ORA-FISC-001/002/005 e ORA-WHATS-001/004/006. Detalhamento de requisitos existentes; não aumenta artificialmente os 179 IDs.
**Entrega deste documento:** especificação e confronto; a implementação é do Claude Code, com revisão pelo Codex.

## 1. Regra confirmada

| Dado | Cadastro rápido | Cadastro completo / preparação fiscal |
|---|---|---|
| Nome completo (ou razão social para cliente PJ) | Obrigatório | Obrigatório |
| Número de WhatsApp com DDD | Obrigatório | Obrigatório |
| E-mail | Sempre opcional | Sempre opcional |
| Endereço completo | Pode ficar pendente | Coletar e validar para a nota |
| CPF/CNPJ e demais dados fiscais | Conforme necessidade da operação; não obrigatórios no rápido por padrão | Conforme documento, operação e exigência fiscal validada |

O cadastro rápido deve permitir salvar somente nome completo e WhatsApp. O campo de e-mail fica disponível, com indicação de opcional; vazio é ausência de dado. Se preenchido, validar formato. Não gerar e-mail fictício nem tornar o campo obrigatório por botão, finalidade, frontend, backend, constraint, importação ou template.

Endereço completo: CEP, logradouro, número (ou indicação explícita de sem número), bairro, cidade e UF; complemento quando existir, opcional. Preservar informação de município/país exigida pelo contrato fiscal aplicável sem inventar dados.

O cadastro rápido evolui para o completo na mesma identidade de cliente; não criar outro cadastro para emitir a nota. Telefone compartilhado não prova que duas pessoas são iguais: preservar o tratamento de duplicidade/mesclagem controlada existente.

A obrigatoriedade refere-se ao cadastro de **clientes**. Não altera o e-mail de autenticação da equipe nem as regras de convite de usuários.

## 2. Fiscal e financiamento

Ao preparar a nota, mostrar os dados do cliente já vinculado à venda e coletar o endereço e demais dados faltantes. Guardar o destinatário/documento e a versão dos dados usados na emissão, preservando a nota histórica quando o cliente corrigir o cadastro depois.

Não exigir endereço nem CPF/CNPJ para salvar o cadastro rápido. A regra de endereço para o fluxo fiscal não autoriza atrasar obrigação legal de emissão: respeitar o ADR-006 e a matriz de documento/operação/UF homologada com contador/emissor.

A nova decisão substitui a obrigatoriedade de e-mail no **cadastro** por finalidade, inclusive financiamento. A regra antiga do PayJoy deve ser reconciliada: se houver exigência comprovada de um fornecedor para uma contratação específica, tratá-la naquela operação e documentar o contrato, mantendo o cadastro e os demais fluxos disponíveis sem e-mail. Não inventar exigência externa, aprovação de crédito ou dado de contato.

Cadastros antigos sem WhatsApp precisam de regularização explícita, sem excluir pessoas, quebrar vendas/documentos ou inventar números. Indicar o que falta e validar o contato antes de enviar a nota. Alterar migrations já aplicadas não é caminho de correção: usar migration nova e compatível quando necessário.

## 3. Enviar a nota diretamente pelo WhatsApp

Disponibilizar a ação **Enviar nota pelo WhatsApp** na nota/detalhe da venda e no histórico autorizado do cliente:

1. Verificar sessão, organização, loja/perfil e acesso à venda, ao cliente e à nota.
2. Confirmar o WhatsApp de destino e a preferência do cliente por esse canal. Validar/normalizar o número; distinguir cadastro do telefone de confirmação de conta existente pelo provedor.
3. Enviar somente a nota realmente emitida/autorizada e os anexos corretos da venda. Pode usar o documento auxiliar/PDF e, quando disponível e suportado, XML ou link protegido para download.
4. Usar a integração **oficial** do WhatsApp, respeitando habilitação, janela de atendimento e templates verificados. Abrir uma conversa por link pode ser alternativa manual identificada, mas não encerra este requisito de integração direta.
5. Registrar intenção, documento/versão, destinatário protegido, ator e tentativas; não tratar o clique ou a inclusão na fila como envio concluído.
6. Distinguir aguardando processamento, aceito pelo provedor, entregue, lido quando informado, falha e resultado desconhecido. Processar confirmações de forma idempotente e tolerar callbacks duplicados/fora de ordem.
7. Permitir reenvio autorizado com motivo e histórico, sem duplicar disparos por duplo clique, retry ou timeout. Em resultado desconhecido, reconciliar a tentativa antes de reenviar.
8. Registrar o resultado no histórico do cliente/venda/nota. Falha de WhatsApp não cancela a nota nem dispara nova emissão.

O envio fiscal tem finalidade própria: não exigir consentimento para ofertas/campanhas como condição para receber a nota. Aplicar as preferências e a política autorizada do canal sem inventar fundamento jurídico ou dispensar requisitos do provedor.

Se emissor, anexo ou WhatsApp oficial não estiver disponível, mostrar a dependência real e continuar as partes independentes. Não marcar enviado/entregue com simulação. Credenciais ficam no backend/worker autorizado; documentos, telefones e e-mails reais não vão para GitHub, URLs abertas ou logs de diagnóstico.

## 4. Divergências observadas na base

- `apps/plataforma/src/lib/clientes/regras.ts:137`: o identificador mínimo ainda é documento **ou** telefone; permite cadastrar sem WhatsApp.
- Mesmo arquivo, `:142`: financiamento exige `saida.email`. O rótulo de e-mail opcional do formulário não elimina essa obrigatoriedade.
- `packages/banco/supabase/migrations/20261111191909_clientes_compartilhados.sql:579` e `:588`: o banco repete as duas regras; mudar só o formulário não resolve.
- `GUARDAM_ENDERECO` já inclui `nota_fiscal`, mas o validador exige endereço completo somente para `entrega`. Exibir o endereço não garante o preenchimento fiscal.
- `packages/banco/supabase/migrations/20261111200054_pdv_nota_do_cliente.sql`: o pedido fiscal copia nome/documento do cliente; ainda é necessário completar o contrato do endereço, documento emitido/anexos e entrega pelo canal.
- ADR-008 e estado de passagem contêm regras anteriores de e-mail/financiamento. O adendo atual prevalece nesses pontos, sem descartar as demais proteções de dados e permissões.
- Não foi localizado, na árvore consultada, um fluxo operacional de envio da nota pela API do WhatsApp. A habilitação continua na lista única de integrações, não deve bloquear o cadastro local.

São diferenças em relação à decisão nova; este documento não afirma que o código já foi corrigido ou publicado.

## 5. Critérios de aceite para a implementação

- **AC-01:** cadastro rápido com nome completo + WhatsApp válido salva sem e-mail, endereço ou CPF/CNPJ e pode ser selecionado na venda.
- **AC-02:** falta de nome/WhatsApp é tratada com mensagem clara no formulário e pelo servidor; regras de edição preservam dados existentes quando o campo é omitido.
- **AC-03:** e-mail vazio é aceito no rápido/completo e ao marcar finalidades. E-mail informado inválido é recusado sem perder o formulário; não existe preenchimento fictício.
- **AC-04:** o cliente rápido é completado para a nota na mesma identidade; endereço tem todos os campos necessários, complemento é opcional e a nota usa dados coerentes com sua emissão.
- **AC-05:** o envio funciona para cliente sem e-mail pela integração oficial homologada, com o documento e destinatário corretos.
- **AC-06:** usuário sem permissão ou de outra organização/loja não lê documentos nem envia a nota; números e anexos continuam protegidos.
- **AC-07:** falha, fila parada, timeout, callback repetido, duplo clique e reenvio não duplicam mensagem ou nota; estados correspondem às evidências disponíveis.
- **AC-08:** entrega fiscal não exige adesão a marketing. Retirada de preferência e requisitos do canal são tratados por finalidade.
- **AC-09:** atualizar testes de formulário, RPC/banco, contrato do emissor/canal e jornada autenticada mobile. Fixtures não comprovam envio real; homologação precisa de canal e destinatário autorizados.
- **AC-10:** atualizar ADR-008, estado/checkpoint, matriz demo × real e rastreabilidade com o SHA e o que ainda depende de fornecedor. Preservar stack, histórico e fluxo de publicação vigentes.

## 6. Ordem de execução

Primeiro corrigir o contrato de cadastro nas três camadas (UI, domínio/ações e banco), mantendo compatibilidade dos registros existentes. Depois completar a preparação fiscal e implementar a entrega por WhatsApp com a fila e evidências oficiais. Homologar a jornada “cadastro rápido sem e-mail → venda → completar dados fiscais → nota emitida → entrega no WhatsApp” antes de marcar a capacidade como concluída.
