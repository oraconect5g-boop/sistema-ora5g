# ADR-008 — Cliente compartilhado da rede e proteção dos dados pessoais (lote L5a)

> **Decisão posterior do proprietário, 12/11/2026 (issue #76; especificação na PR #77, `docs/alinhamento/CADASTRO_CLIENTES_E_NOTA_WHATSAPP_2026-11-12.md` da branch `docs/clientes-nota-whatsapp-20261112`):** cadastro rápido exige nome completo e WhatsApp; e-mail é sempre opcional no cadastro de clientes (inclusive no financiamento); completar o endereço para a nota e oferecer o envio direto pela integração oficial do WhatsApp. Substitui os mínimos anteriores (documento ou telefone) e a exigência de e-mail por finalidade nos pontos conflitantes. **Implementado no cadastro em 14/11 (lote K1a, migration `20261114145608_clientes_nome_e_whatsapp`):** a regra vale na tela, nas regras compartilhadas e no banco; o cadastro antigo sem WhatsApp continua válido e é regularizado pela correção, sem inventar número; a exigência do e-mail na venda PayJoy (DEC-U30) ficou na venda até 16/11/2026, quando caiu (lote INTEG-a): o e-mail é opcional também na PayJoy, e exigência de parceiro só com o contrato dele, no adaptador. A preparação fiscal (K1b) e o envio pelo WhatsApp (K1c) vêm nos lotes seguintes.


**Situação:** proposta (11/11/2026), reversível, aplicada só no desenvolvimento. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário; a política de retenção e os direitos do titular dependem do jurídico/encarregado (ORA-QUAL-011).
**Base:** ADR-002 §2.4 (clientes são da empresa, busca exata registrada, teste T11), D-004 (CPF conforme necessidade, não obrigatório global), `docs/03_DADOS.md` (clientes e CRM), PROMPT_MESTRE §5.4 (não criar outro cadastro de pessoa por módulo; manter a origem do que já existe).

## Resumo para o proprietário (o que você aceita)

1. **Um cadastro de cliente para a rede inteira.** O mesmo cliente compra em qualquer loja; a venda, a nota, a Ora Connect, o financiamento e a assistência usam o mesmo cadastro (não cada módulo o seu).
2. **Só o necessário.** Sempre: nome e CPF/CNPJ **ou** telefone (é por eles que se encontra o cliente). O resto depende do uso marcado no cadastro:
   - nota no nome do cliente → CPF ou CNPJ;
   - Ora Connect → documento, telefone e, para pessoa física, a data de nascimento;
   - financiamento → CPF, telefone, e-mail e data de nascimento (só pessoa física);
   - assistência → telefone; entrega → endereço completo.
   Data de nascimento e endereço **não ficam guardados** se nenhum desses usos pedir.
3. **Busca sempre exata.** O vendedor e o gerente acham o cliente pelo CPF/CNPJ ou pelo telefone completos; não existe "lista de clientes" para eles. Só o dono lista e busca por código ou nome.
4. **Tudo registrado.** Cada busca, cada ficha aberta e cada dado mostrado por inteiro fica na auditoria (quem, quando, qual dado), **sem** o número procurado. Mais de 30 buscas ou revelações em 10 minutos pela mesma pessoa são barradas.
5. **Dados protegidos.** CPF/CNPJ, telefone, e-mail, nascimento e endereço ficam numa área do banco que a internet não alcança. A tela mostra máscaras (`•••.•••.247-25`, `(41) •••••-0001`); o dado inteiro aparece só quando alguém pede, e isso fica registrado.
6. **O mesmo CPF não entra duas vezes.** Telefone repetido (família) pede confirmação de que é outra pessoa.
7. **Consentimento de mensagens.** Ofertas e pós-venda por WhatsApp, SMS, e-mail ou ligação só com o "sim" do cliente, registrado com canal, finalidade, origem e quem anotou. Retirar vale na hora para as mensagens automáticas futuras. Avisos do próprio serviço (nota, OS pronta) não dependem disso.
8. **Venda ligada ao cliente sem apagar a origem.** O nome e o e-mail digitados na venda continuam como foram; o cliente da rede fica ao lado. Corrigir o cliente de uma venda exige motivo.

## Decisões técnicas

- Migration `20261111191909_clientes_compartilhados` (aplicada no `ora5g-dev`, md5 conferido; reversão ensaiada).
- `public.clientes`: nome, tipo, finalidades, máscaras, situação, origem, loja de origem e **resumo com segredo** do documento e do telefone (`sha256(segredo da rede | tipo | valor)`), que permite a busca exata e o índice único do documento sem guardar o número na tabela pública. O segredo fica em `privado.crm_segredos` (um por rede, criado com a organização).
- `privado.cliente_dados`: os dados que identificam a pessoa, sem acesso pela API (nem `authenticated`, nem `service_role`). Só as funções `SECURITY DEFINER` leem, e cada leitura registra.
- Leitura direta de `clientes` e `cliente_consentimentos` só para quem tem `cliente.exportar` (dono). Os demais usam `cliente_buscar` (exata) e `cliente_ficha`; o T11 do ADR-002 virou teste.
- Permissão nova `cliente.cadastrar` (dono, gerente, vendedor). `cliente.buscar` já existia (dono, gerente, vendedor; o administrador e o técnico não).
- Funções: `cliente_buscar`, `cliente_ficha`, `cliente_revelar`, `cliente_salvar` (cadastro com chave de idempotência; correção com motivo), `cliente_consentir` e `venda_vincular_cliente`; `concluir_venda` aceita `{"id": ...}` em `p_cliente`. `privado.cliente_pode_contatar` responde às automações.
- A auditoria do cadastro grava só o **nome dos campos** alterados (e as finalidades), nunca o valor; o teste confere que nenhum CPF, telefone ou e-mail aparece na auditoria.
- Concorrência: trava por chave do formulário e por resumo do documento; o índice único garante o resto. Provado com duas conexões no PostgreSQL 17 (o mesmo CPF em duas lojas ao mesmo tempo: um cliente, o outro recebe OR026).
- Códigos: OR026 documento já cadastrado; OR027 telefone de outra pessoa (confirmar); OR028 limite de consultas.

## Provas

`packages/banco/src/clientes.test.ts` (9), `acesso.test.ts` (T11), `autorizacao-funcoes.test.ts` (81 funções; a busca de outra rede não acha nada e fica registrada), `concorrencia.test.ts` (mesmo CPF), ida e volta da reversão. Plataforma: regras do formulário (7), telas e ações (11), menu.

## Fora desta etapa

- Leads, funil, atividades e motivos de perda (L5b); mesclagem de duplicados, contratos e anexos, histórico omnichannel e segmentação (L5c).
- Linhas e chips da Ora Connect ligados ao cliente (L11) e OS (L12) usam este cadastro quando chegarem.
- Política de retenção e anonimização a pedido do titular: dependem da decisão do jurídico/encarregado (ORA-QUAL-011, D-048). O relatório dos dados do titular saiu no lote QUAL-011a (15/11/2026, `public.cliente_dados_do_titular` e a tela `/clientes/<id>/titular`): só o dono, com a senha recente e um motivo, na auditoria; quem mais gera o relatório também fica para o jurídico/encarregado. O banco já guarda o necessário para responder "quem acessou meus dados".

## Perguntas para o proprietário

1. O limite de 30 consultas a cada 10 minutos por pessoa serve para o balcão?
2. Quem mais, além do dono, deve listar os clientes da rede (exportar)? Hoje só o dono.
