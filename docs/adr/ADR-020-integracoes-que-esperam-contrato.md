# ADR-020 — As integrações que esperam contrato: adaptadores desligados, com o que falta para ligar

**Situação:** proposta (17/11/2026), reversível; aplicada no lote ADAPT-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo pedido do proprietário de 17/11/2026 ("termine de desenvolver todas as 179 funcionalidades; ao final envio o que faltar") e pela regra permanente do projeto: integração sem contrato vira adaptador com interface, fixtures e testes, marcado como bloqueado.

## Contexto

1. **Alguns requisitos dependem de quem está fora do projeto:** um provedor a escolher, um contrato, uma credencial, o contador ou uma decisão do proprietário.
2. **Nada do contrato de um provedor pode ser suposto** (CLAUDE.md): nem o endereço, nem o campo, nem o formato do aviso.

## Decisões

1. **O link de pagamento e o Pix online** (ORA-PAY-014 e a parte do provedor do ORA-PAY-008): no worker, `cobranca/cobranca.ts` tem:
   - a interface do provedor (criar a cobrança e consultar de novo);
   - o formato comum do aviso de pagamento;
   - a regra de cada aviso: só confirma com a assinatura conferida, de uma cobrança nossa, do mesmo valor e uma vez só; valor diferente, cobrança desconhecida ou cancelamento pedem a consulta ao provedor antes de mudar qualquer coisa.

   **Bloqueado** até a escolha do provedor (PicPay, PagBank ou os dois; pendência E1), a credencial e o formato do aviso confirmado.
2. **A maquininha PicPay POS automática** (ORA-PAY-013): sem API por decisão do projeto. A conciliação é pelo comprovante (L7a) e pelo extrato por arquivo (EXT-a). **Bloqueado** até haver uma API contratual confirmada.
3. **Os eventos de conversão para a Meta** (ORA-META-005): no worker, `meta/conversoes.ts` tem a interface, o formato comum do evento e a regra de quais eventos podem sair: só com o consentimento do cliente e sem repetir o identificador. **Bloqueado** até a conta de anúncios, a autorização e a base legal (D-022 e D-048).
4. **A contratação online de planos, chips e eSIM** (ORA-ONLINE-007): **bloqueado** até a Nogle confirmar a operação (pergunta 11) e até a validação de identidade, o antifraude e o contrato digital serem escolhidos.
5. **A expansão para outros estados** (ORA-ONLINE-008): **bloqueado** até o frete (D-025, P10) e as regras fiscais de cada estado com o contador.
6. **Os cenários fiscais** (ORA-FISC-007) e **a preparação para vários estados, vários CNPJs e a reforma tributária** (ORA-FISC-010): **bloqueados** pelo contador (D1). Nada fiscal é decidido sem ele.
7. **Cada adaptador diz o que falta** pelos nomes das variáveis já documentados em `docs/integracoes/VARIAVEIS_DE_AMBIENTE.md`, sem mostrar valor nenhum, e fica desligado (`ADAPTADOR_PRONTO = false`) até o contrato ser verificado.

## Consequências

1. **Os requisitos ficam "bloqueado",** com a dependência escrita em cada um. A lista única do que depende de fora é a do DEP-a (`docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`).
2. **Ligar cada integração é um lote próprio,** quando a dependência chegar: o adaptador oficial, a homologação no ambiente de teste do provedor e o aceite.
3. **Reverter:** tirar os arquivos do worker; nada no banco muda.
