# ADR-006 — Fila fiscal interna (pedido, aprovação e registro da nota)

**Data:** 08/11/2026 · **Autor:** Claude Code · **Revisor:** Codex · **Aceite:** proprietário e contador
**Status:** **proposto**. Aplicado só no **desenvolvimento** (dados fictícios). **O sistema não emite nota**: não há emissor contratado (A4) nem orientação do contador (P7, D-006, D-007). Pode mudar por migration nova.
**Requisitos:** ORA-FISC-001 (pedir da venda no celular), 002 (aprovação sem impedir a obrigação legal), 005 (guardar chave e evidência) e 006 em parte (cancelamento ligado à venda). Decisões do proprietário: DEC-U20 (toda nota passa por quem emite, com aviso) e DEC-U42 (aprovam o dono e o gerente).

## Resumo para o proprietário (o que você aceita)

1. **No comprovante da venda concluída, o botão "Pedir nota fiscal"**, com nome e CPF/CNPJ na nota se o cliente quiser. O CPF fica guardado à parte só até a emissão; depois fica mascarado.
2. **A fila "Notas fiscais"** (dono e gerente) mostra cada pedido da loja **da venda mais antiga para a mais nova, com há quanto tempo a venda foi feita**. Quem aprova pode aprovar ou pedir correção (quem vendeu corrige e o pedido volta à fila).
3. **Enquanto não houver emissor**, você emite no portal de sempre e **registra a chave de acesso de 44 dígitos** na fila. O sistema confere o dígito verificador e se a chave é do CNPJ da loja da venda; a mesma chave não serve a dois pedidos. A nota fica ligada à venda (modelo, série e número lidos da chave).
4. **A aprovação nunca segura a emissão**: registrar a nota de um pedido ainda não aprovado vale como aprovação, com o fato gravado. O alerta de atraso usa **o prazo que o contador orientar** (você registra o prazo e a fonte); sem prazo registrado, a fila só mostra o tempo.
5. **Venda cancelada** cancela o pedido de nota ainda não emitido. **Venda com nota emitida não é cancelada pelo PDV**: o cancelamento ou a devolução fiscal vem antes, com o contador.

## Decisões técnicas

- Tabelas `notas_pedidos` (um pedido vivo por venda, chave de idempotência, chave de acesso única), `notas_eventos` (só inserção), `privado.notas_destinatarios` (CPF/CNPJ até a emissão) e `fiscal_politicas` (prazo de alerta com fonte, auditado).
- Funções: `notas_solicitar` (quem vendeu ou quem aprova, `nota.solicitar`), `notas_decidir` e `notas_registrar_emissao` (`nota.aprovar`), `notas_corrigir`, `notas_cancelar`, `fiscal_definir_politica` (`unidades.gerir`). Gatilho na venda: cancela pedidos sem nota e recusa o cancelamento com nota emitida (OR015). OR014: venda já tem pedido vivo.
- Chave de acesso: padrão nacional de 44 dígitos (UF, ano/mês, CNPJ, modelo, série, número, emissão, código e dígito módulo 11). O sistema **não escolhe** modelo nem tributação: só lê o que está na chave registrada.
- Contrato do emissor em `packages/dominio/src/fiscal.ts` (`EmissorFiscal`), com a única implementação **bloqueada**. Quando o emissor for escolhido com o contador, o worker ganha o adaptador (emitir, consultar, cancelar) com a mesma regra do ADR-005: resultado desconhecido não reemite; consulta antes.

## Provas

`packages/banco/src/notas.test.ts` (6 cenários: pedido só de venda concluída, idempotência, um vivo por venda, isolamento de loja/rede/papel, correção, aprovação, registro com dígito e CNPJ conferidos, emissão sem aprovação prévia, chave repetida, venda cancelada com e sem nota, prazo com fonte), reversão em `migrations.test.ts`, `packages/dominio/src/fiscal.test.ts` (dígito verificador calculado à mão, partes da chave, tempo na fila, emissor bloqueado) e as regras da tela.

## Fora desta etapa (depende do contador e do emissor)

Emissão automática, consulta e cancelamento no emissor; anexos (XML/PDF) e envio ao cliente por e-mail/WhatsApp; carta de correção; devolução fiscal; NFS-e da assistência (sem chave de 44 dígitos); matriz de documento por operação/UF (ORA-FISC-003/007); conciliação fiscal (008); multi-UF (010).

## Perguntas

1. **Contador (e-mail 2.2):** documento de cada operação, prazo legal entre venda e emissão, emissor por API e certificado A1 das filiais.
2. **D-006:** o gerente aprova toda nota ou só exceções? Hoje o sistema segue a DEC-U20 (todas), sem nunca bloquear a emissão.
3. **Quem pediu pode aprovar a própria nota?** Hoje pode (diferente do desconto), porque a aprovação da nota não pode atrasar a obrigação legal. Confirma?

## Decisão sobre a identidade do destinatário (INTEG-c, 17/11/2026; #101)

A revisão do Codex de 16/11 (PR #100, commit e311060) reproduziu o #101: a migration do INTEG-a ligou as notas antigas, já sem o destinatário guardado (ele sai na emissão), ao cliente de hoje da venda. Com a venda trocada de cliente, a nota de Alfa iria pelo WhatsApp para Beta.

1. **A identidade do cliente da nota tem origem registrada** (`notas_pedidos.cliente_origem`):
   - `pedido`: gravada no pedido, ou na correção antes da emissão;
   - `destinatario_guardado`: conferida no destinatário guardado;
   - `conferencia`: a gerência conferiu o documento da nota e confirmou; o registro guarda quem e quando.

   Sem origem, não há prova. Nada é deduzido do cliente de hoje da venda.
2. **O envio pelo WhatsApp exige a prova.** `nota_enviar_whatsapp` recusa com `OR037` (HTTP 400). O worker confere de novo antes de expedir: o envio que já estava na fila falha com o motivo, e nada sai.
3. **A conferência é da gerência** (`nota_confirmar_destinatario`, permissão `nota.aprovar`). Ela vale só para a nota de venda emitida sem prova. Confirma o cliente de hoje da venda, depois de conferir o PDF, e o motivo vai para a auditoria. Se a nota é de outra pessoa, não se confirma, e ela não vai pelo WhatsApp.
4. **Novas funções não usam o código `P0002`** (a API do banco responde HTTP 500 a ele; ADR-009, decisão 15): a recusa por loja ou permissão usa `42501`.

Migration `20261117135133_identidade_da_nota_e_cota_da_loja`. Testes:
- `packages/banco/src/identidade-da-nota.test.ts`: o banco de antes do INTEG-a recebe as migrations em ordem;
- `apps/plataforma/src/app/vendas/nota-whatsapp.test.ts`: a tela.
