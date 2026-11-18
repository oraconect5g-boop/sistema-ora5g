# ADR-022: A demonstração fica no ar, isolada, com os nomes das lojas de verdade

**Situação:** proposta (18/11/2026), reversível; aplicada no lote DEMO-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário.

**Pedida por:**

- o aceite A16 do adendo do Codex de 16/11 (PR #100): a demonstração atualizada a cada etapa;
- a seção 11 do prompt do Codex de 16/11: a regra antiga, que desliga a demonstração em produção, tem de ser reconciliada com a decisão de mantê-la acessível;
- o achado F06 da auditoria do Codex de 17/11 (PR #104): a demonstração ainda tinha "Loja 02…Loja 11" e a instrução de "13 lojas restantes".

## Contexto

1. **A demonstração (`/demo`)** mostra os fluxos com dados fictícios, por perfil, sem login. O proprietário a usa para mostrar o sistema e acompanhar o que vem.
2. **A regra antiga:** a demonstração devolvia "página não encontrada" quando `APP_ENV=producao` (o "impedir mocks em produção" do `docs/08_DESIGN_E_TELAS.md`). A homologação usa `APP_ENV=homologacao`, então hoje ela está no ar.
3. **O pedido mais recente** é mantê-la acessível e atualizada, com isolamento técnico explícito: a demonstração não pode disparar pagamento, estoque ou API real, nem mostrar credencial ou dado de cliente.

## Decisões

1. **A demonstração fica no ar em todo ambiente.**
   - A regra deixa de olhar o `APP_ENV`. Para tirá-la do ar, basta `ORA_DEMO_DESLIGADA=1`: a variável passa ao serviço web pela lista de permissão (REV-052) e não é segredo.
   - A regra continua num lugar só: `garantirDemonstracaoLigada`, em `src/demo/sessao.ts`, mais as duas rotas de troca de perfil e de loja.
2. **O isolamento é provado por teste** (`src/demo/isolamento.test.ts`), lendo o código:
   - a demonstração não lê o banco nem a sessão de verdade;
   - fora dela, só a moldura e o aviso de permissão da demonstração importam os dados dela, e só a demonstração os usa.
   O "impedir mocks em produção" continua valendo para a aplicação real: nenhuma tela real usa dado da demonstração.
3. **Os nomes das lojas:**
   - As lojas da demonstração têm os nomes das 11 lojas confirmadas pelo proprietário em 09/11.
   - O endereço fica "endereço a confirmar" até o cadastro real (lista B2): nenhum bairro é inventado.
   - Os códigos internos (`loja-02`…`loja-11`) são só da demonstração e não aparecem na tela.
4. **Os canais na demonstração** (`/demo/canais`):
   - o que já entra por arquivo na aplicação real;
   - o que falta para ligar cada canal direto;
   - os canais lado a lado num mês, com números fictícios no mesmo cálculo da tela real (ADR-019): as devoluções saem da conta dos anúncios, e a atribuição não é prova de causa.
5. **A paridade** fica escrita em `docs/alinhamento/MATRIZ_DEMO_REAL.md`, seção 6: para cada lote de 14 a 18/11, se tem par na demonstração, se o par é parcial ou se fica para depois.

## O que fica de fora

1. **A demonstração dos extratos, da origem das reservas e da carga do estoque por loja:** ficam para um lote da demonstração depois, como diz a matriz.
2. **A decisão sobre a produção comercial.** Quando houver produção, o proprietário pode desligar a demonstração lá com uma linha no `.env`, sem mudar código.

## Consequências

1. **O proprietário mostra o sistema com os nomes das lojas dele,** sem misturar com dado real.
2. **Um teste falha** se alguém ligar a demonstração ao banco ou usar dado dela numa tela real.
3. **Reverter:** `ORA_DEMO_DESLIGADA=1` no ambiente desliga a demonstração na hora. A regra antiga, presa ao `APP_ENV`, volta com uma linha em `garantirDemonstracaoLigada`.
