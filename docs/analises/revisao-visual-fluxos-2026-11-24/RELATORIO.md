# Diagnóstico técnico e evidências

## Estado observado

O projeto já tem Next.js 16, React 19, TypeScript, Node 22, worker e Supabase/PostgreSQL. **Node já está em uso.** Trocar linguagem ou criar outro backend durante a estabilização acrescentaria migração e testes, sem resolver CNPJ, dados de estoque, contratos de APIs ou aceite.

O corte final contém 101 rotas `page.tsx`: 82 fora de `/demo` e 19 dentro. As 82 incluem páginas públicas, autenticação e detalhes; não são 82 módulos comerciais homologados. Há 705 arquivos `.ts`, 290 `.tsx` e 272 `.sql`, contando testes e reversões. Foram verificados os hashes dos 1.582 arquivos originais.

O domínio está atualizado com `003421d`, mas se identifica como **homologação**. Não basta estar no domínio para ser uma implantação comercial aprovada.

### O que Claude acrescentou desde o primeiro corte desta revisão

| Entrega | Evidência da mudança | O que continua faltando |
|---|---|---|
| FIN-002a | Taxa observada de PayJoy/Aiva no resultado do mês e planilha | Impostos, regra de bônus/comissão e validação contábil; não comprova API das financeiras |
| FIN-006a | Depósito agrupado da maquininha conciliado com uma linha de extrato; exclusividade de uso | OFX real e confirmação de como cada maquininha deposita |
| QUAL-006a | Worker relata erros do site e dispara alertas | Monitor externo para detectar a queda de todo o servidor |
| ONLINE-e | Uma ação principal de carrinho; contador no topo | Fluxo comercial integral e aceite |
| PAY-014a | Adaptador Asaas, webhook, reconsulta, UI de Pix; desligado | Sandbox, configuração, autorização de agendamento e PAY-014b: retirada sem cobrar novamente |
| ONLINE-f | Vitrine paginada em 60 itens, busca/categoria preservadas | Disponibilidade comercial das lojas, fotos validadas, pagamento homologado |
| B1 / D-053 | Documentação registra importação de 2.271 produtos; banco tem 12 cargas aplicadas | Estoque atualizado na virada e IMEIs dos celulares |

### Banco consultado nesta rodada

- 2.277 produtos no total do banco, que também contém registros de teste; a documentação atribui 2.271 à importação da Rein. Não confundir o total global com a carga importada.
- 634 produtos ativos marcados para publicação online; página pública mostra “1–60 de 634”.
- 12 cargas aplicadas, corte `2026-11-10T16:12:00Z` (13:12 em São Paulo). O usuário informou referência de 13:20 nesta conversa: confirmar o instante de corte na virada, sem inventar atualização pelo nome do arquivo.
- 11 lojas comerciais reais e DEFEITOS cadastrados; 3 unidades de teste adicionais. Todas as 11 lojas comerciais reais estão sem CNPJ. A regra operacional recusa venda nessas condições; a vitrine mostra “Sem estoque” apesar do estoque importado.
- 2.269 fotos ativas, associadas a 2.269 produtos e sem `variante_id`, marcadas `ilustracao=false`. Esse cadastro **não prova** correspondência visual de cada foto, cobertura de todas as variações ou direito de uso. As primeiras imagens foram vistas na vitrine; não houve revisão individual de todas.
- Configuração do pagamento pelo site: provedor `asaas`, `ligado=false`, ambiente ainda nulo. Nenhuma habilitação ativa de Ora Connect.
- Histórico de 134 migrations consultado chega a `20261124171542_vitrine_com_paginas`; consulta de nomes/versões não é prova de igualdade de todas as definições SQL instaladas.

## Achados novos e prioridades

### F24-01 — P1 — transferência pendente desaparece da fila acessível

**Reproduzido no corte atual em PGlite, aplicando as migrations do projeto.** Uma transferência continua `solicitada` no banco, mas não é retornada pela tela depois de 50 transferências canceladas mais recentes. O problema pode impedir o operador de localizar uma solicitação que ainda reserva estoque.

Fontes: [apps/plataforma/src/lib/transferencias/tela.ts:15](https://github.com/oraconect5g-boop/sistema-ora5g/blob/003421d83985f68b04db200c4a168e2872ebd836/apps/plataforma/src/lib/transferencias/tela.ts#L15), `:82`, `:101`; [packages/banco/supabase/migrations/20261123133323_transferencia_resolver_divergencia.sql:266](https://github.com/oraconect5g-boop/sistema-ora5g/blob/003421d83985f68b04db200c4a168e2872ebd836/packages/banco/supabase/migrations/20261123133323_transferencia_resolver_divergencia.sql#L266); [apps/plataforma/src/app/transferencias/page.tsx:35](https://github.com/oraconect5g-boop/sistema-ora5g/blob/003421d83985f68b04db200c4a168e2872ebd836/apps/plataforma/src/app/transferencias/page.tsx#L35).

Causa: RPC e fallback ordenam por número decrescente e limitam a 50 sem priorizar pendências; a página não tem paginação nem busca por número. O contador agregado de pendências não torna o item acessível.

Prova: `evidencias/F24-01-transferencia-pendente.test.ts.txt`. Cria 1 solicitação, depois 50 solicitações canceladas; confirma que a primeira segue solicitada; a asserção de sua presença na lista falha. Os 25 testes existentes selecionados passaram.

Correção proposta: fila de operações abertas com paginação própria; histórico paginado; busca e endereço de detalhe por transferência; manter autorização por origem/destino, locks e idempotência. Aumentar 50 para 200 apenas adia a falha. Testar também mais de 50 abertas e acesso por perfil.

### F24-02 — P2 — reserva de transferência aparece como “em venda”

[apps/plataforma/src/app/estoque/page.tsx:377](https://github.com/oraconect5g-boop/sistema-ora5g/blob/003421d83985f68b04db200c4a168e2872ebd836/apps/plataforma/src/app/estoque/page.tsx#L377) usa o total `reservado` com o texto “em venda”. Esse saldo também inclui reservas de transferência. A migration `20261118142358_transferencia_reserva_no_pedido.sql` implementa essa reserva.

Correção proposta: rótulo imediato “reservado”. Separar motivos somente com consulta cuja soma confira com o total. Não alterar os saldos para corrigir um problema de apresentação.

### F24-03 — P2 — consulta de estoque perde o contexto de busca

[apps/plataforma/src/app/estoque/page.tsx:381](https://github.com/oraconect5g-boop/sistema-ora5g/blob/003421d83985f68b04db200c4a168e2872ebd836/apps/plataforma/src/app/estoque/page.tsx#L381) monta `/estoque?variante=...`, descartando os filtros e a página de origem. O nome do produto não é o acesso principal; a ação “na rede” é pequena.

Correção proposta: detalhe por produto com retorno à busca preservado; link no nome/linha com área de toque adequada; manter `q`/página/filtros admitidos pela tela. Não tratar parâmetro de loja como autorização para movimentar estoque.

### F24-04 — P2 — botão anuncia envio, mas cria solicitação

`apps/plataforma/src/app/estoque/page.tsx:350–357`: o botão “Registrar envio” chama `solicitarTransferencia`. Solicitar reserva disponibilidade; enviar é uma etapa posterior que movimenta o físico.

Correção proposta: nomear “Solicitar transferência” ou equivalente compatível com a ação. Mostrar a sequência solicitar → separar → enviar → receber e os efeitos em disponível/físico/trânsito. Não eliminar etapas do banco para aproximá-las do texto atual.

### F24-05 — P2 — placares e bloqueios documentais contraditórios

`status-requisitos.json` contém 73 testados, 78 parciais, 14 não iniciados, 12 bloqueados e 2 restrições. `FILA_INTEGRAL_2026-11-23.md`, seção Placar, ainda informa 72/78/14/13/2, e os passos 3–8 continuam pedindo respostas e carga já registradas como concluídas em D-053/B1. `PENDENCIAS_DO_PROPRIETARIO.md` ainda diz 0 fotos; a consulta atual encontrou 2.269, possivelmente adicionadas depois do documento.

Impacto: Claude e proprietário podem repetir pedidos, reabrir tarefa concluída ou concluir que nada aparece. Gerar os totais a partir da fonte única e distinguir dados verificados no ambiente de texto histórico. Validar cobertura de fotos, em vez de repetir “mande todas”.

### F24-06 — P2 — disponibilidade comercial é apresentada como falta física

Na vitrine pública todos os primeiros itens observados estão “Sem estoque”; os cadastros reais não têm CNPJ e a regra de elegibilidade exclui essas lojas da venda. Manter a trava comercial; no painel interno explicar “estoque existente; venda pendente de cadastro da loja”. No site, avaliar “indisponível para compra” em vez de afirmar uma falta física. Não revelar parâmetros fiscais internos ao consumidor.

## Por que nenhum requisito aparece homologado

No checkpoint atual: 81 roteiros de lotes, 1 aceito (PWA-b), 80 sem resposta; todos os 179 têm `revisado_codex=false` e `homologado=false`. Dos 73 testados, 36 não estão explicitamente associados a um roteiro pela lista `aceites[*].requisitos`.

Revisões históricas não foram convertidas em parecer individual rastreável por requisito. Aceitar uma parte de um requisito não aceita todas as partes; PWA-b não encerra integralmente os requisitos aos quais se vincula. Há também lacunas reais de configuração, integração e regra de negócio.

Proposta: agrupar os aceites por jornada operacional, ligar cada evidência aos requisitos e lotes correspondentes, revisar pendências remanescentes e registrar a decisão humana uma vez por conjunto apresentado. Não converter “testado” em “homologado” por script nem preencher aprovação pelo proprietário.

## Duplicidades e continuidade de código

Unificar navegação não exige fundir handlers transacionais. Páginas de cadastro, venda, aprovação e liquidação têm permissões distintas. Migrations e suas reversões não são código duplicado descartável; componentes da demo preservados também não provam rota ativa. Não foi identificada nesta rodada uma duplicidade semântica global de todos os algoritmos: fazer a revisão por fluxo, procurando validações divergentes e dupla gravação nos limites entre UI, action, RPC e worker.

O teste novo demonstra uma lacuna de cobertura mesmo com CI verde. A correção deve aumentar a cobertura do comportamento real, não mudar a expectativa para aceitar uma pendência invisível.
