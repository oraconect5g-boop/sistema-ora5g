# Plano de estabilização em cinco dias

Hipótese de trabalho: cinco dias de execução, D1 a D5, com Claude Code disponível e validação diária do proprietário. É uma proposta de sequência, não uma garantia de completar integrações cujo contrato/ambiente ainda não existe. O escopo de 179 requisitos permanece; registrar o que entra na versão estável e os bloqueios externos, sem apagá-los do backlog.

## D1 — travar a base e retirar bloqueadores

- Atualizar SHA, ler os relatórios e reconciliar estado JSON/Markdown/ambiente, incluindo fotos e carga já presentes.
- Corrigir F24-01 com fila/paginação/busca e teste que reproduz o desaparecimento; manter as regras de estoque.
- Corrigir F24-02, 03 e 04 com rótulos e navegação coerentes, sem refazer o domínio.
- Confirmar a loja piloto e sua base: CNPJ/endereço, responsáveis, máquinas, posição de estoque e IMEIs. Não recarregar histórico sobre movimentações novas sem reconciliação.
- Saída: um lote corrigido, CI, evidências no domínio e checklist da base; gargalos externos com responsável/data.

## D2 — fechar estoque, transferência e venda na piloto

- Executar J01 a J05 com vendedor/gerente/dono: transferência com reserva imediata, envio, recebimento, cancelamento, divergência e disputa pelo último item.
- Unificar entrada de produtos/estoque e preservar o contexto de consulta. Verificar fotos efetivas dos produtos do piloto, sem supor que a contagem de arquivos resolve variações.
- Compra/entrada/inventário incluídos no teste de saldo; concluir a jornada antes de abrir outro módulo.
- Saída: estoque e venda conciliados, sem P1 aberto, roteiro curto para o proprietário conferir.

## D3 — fechar dinheiro e pedido online

- Validar caixa, pagamento misto/financiado assistido, desconto, devolução e estorno; reconciliar com arquivos reais disponíveis.
- Dar ao dono acesso claro aos gráficos e agrupar financeiro com filtros comuns, reutilizando os componentes atuais.
- Implementar e testar PAY-014b antes de ligar Asaas: pedido pago no site chega ao balcão sem nova cobrança; definir caminho de cancelamento/estorno autorizado.
- Se sandbox/credenciais estiverem disponíveis, testar o ciclo Asaas, callbacks duplicados e reconsulta. Sem isso, manter desligado e informar o bloqueio.
- Saída: J07–J09 provados no ambiente adequado; nenhum pagamento real para “testar” sem autorização.

## D4 — regressão completa, permissões e aceite

- Reexecutar CI e casos de concorrência/RLS; provas no domínio com perfis; examinar cada teste pulado que cubra o escopo da versão estável.
- Conferir telas em celular real, acessibilidade, impressão, fotos, gráficos, mensagens e recuperação de sessão/rede.
- Nogle, fiscal, WhatsApp e APIs financeiras/canais: validar apenas operações com contrato e ambiente liberados; bloquear e explicar as demais sem apresentar mocks como operação real.
- Consolidar aceites por jornada e pareceres vinculados aos requisitos; não deixar tudo para um aceite genérico “100%”.
- Saída: candidato de release, bugs classificados e contingências explícitas.

## D5 — congelamento e decisão de entrada em operação

- Sem funcionalidades novas: resolver somente defeitos do candidato, executar os testes afetados e os checks obrigatórios.
- Ensaiar restauração do banco e arquivos/fotos no destino autorizado; backup sem restauração demonstrada não encerra a tarefa.
- Conferir ambiente, domínio/SHA, migrations, workers, alertas externos, recursos e latência observada. Validar a ausência de dados de teste na operação comercial.
- Apresentar evidências, limitações e plano de reversão. Publicação em homologação já autorizada no processo existente; entrada comercial segue a decisão do proprietário.
- Saída: versão estável para o recorte comprovado, ou decisão explícita de não liberar um fluxo crítico. Prazo não transforma pagamento/estoque inconsistente em aceitável.

## O que depende do proprietário/fornecedores

| Prioridade | Dado/decisão | Situação atual e efeito |
|---|---|---|
| D1 | CNPJ, endereço e dados das lojas; pessoas da piloto | Nomes existem; CNPJ das 11 lojas ainda ausente. Destrava venda real e disponibilidade comercial |
| D1 | Estoque atualizado/contagem e IMEIs | Carga de 10/11 já aplicada; não pedir novamente escolha de Código/TABELA NORMAL já decidida. Precisamos da posição da virada |
| D1–D2 | Fotos/variações que faltarem ou estiverem incorretas | Já há 2.269 registros; validar cobertura e correspondência antes de solicitar complementos |
| D1–D3 | Asaas sandbox, e-mail do webhook e habilitação do worker | Adaptador existe desligado; PAY-014b continua sendo tarefa de código do Claude |
| D1–D3 | Extratos reais, máquinas e prazos/taxas das financeiras | Necessários para demonstrar conciliação e previsão; regras de depósito não podem ser presumidas |
| D1–D4 | SMTP próprio e usuários reais | Contas de teste existem; convite/recuperação da equipe precisam do envio configurado |
| Conforme liberação | Nogle: tipo/escopo da chave, linha/chip de teste e habilitações | Nenhuma operação habilitada; não repetir ativação de resultado desconhecido |
| Conforme liberação | Fiscal/contador, Meta/WhatsApp, PayJoy/Aiva, marketplaces | Contratos, homologações e autorizações externos não têm prazo garantido de cinco dias |
| Até D4 | Regras de desconto, troca, ajuste, bônus e aceites das jornadas | Usar decisões recentes já registradas; perguntar apenas o que estiver sem definição |
| Até D5 | Infraestrutura comercial, backup/restore e decisão de operação | O domínio ainda serve homologação; é diferente de operação comercial liberada |

Credenciais entram pelo mecanismo privado existente, nunca por chat ou GitHub. Os bugs F24-01 a F24-05 e a integração PDV/pedido pago não são pendências do proprietário.

## Medidas diárias

Publicar um checkpoint com: jornada encerrada; defeitos P0/P1/P2 abertos; testes executados/pulados; SHA no domínio; requisito ainda parcial e razão; dependência externa com responsável; próxima entrega. Medir fluxo concluído e demonstrado, não quantidade de commits ou linhas de código.
