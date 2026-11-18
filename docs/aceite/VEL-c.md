# Roteiro de aceite: lote VEL-c (o sino de avisos e o Início numa ida só ao banco)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação, com a sua conta de dono em `ora5g.com.br`.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** a primeira parte do VEL-c, a que a orientação de 18/11 libera ("continuar VEL-c onde independente; medir antes/depois em celular autenticado; não remover RLS ou cachear permissões entre usuários").
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **O sino do topo e o Início leem as pendências da loja numa ida só ao banco.** Antes, eram de 17 a 29 pedidos a cada abertura, medidos no log da homologação em 18/11. O sino aparece em todas as telas com login, então o ganho vale para o sistema inteiro.
2. **Nada muda no que você vê.** As mesmas pendências aparecem, na mesma ordem, com os mesmos números:
   - descontos;
   - notas;
   - caixas;
   - saídas do caixa;
   - contas a pagar;
   - bônus;
   - transferências;
   - Ora Connect;
   - estornos;
   - retornos;
   - ordens de serviço;
   - os alertas.
3. **A segurança é a mesma.** O banco confere a permissão de cada fila com a mesma regra das telas, e as regras de leitura (RLS) continuam valendo para cada pessoa. Nada fica guardado entre uma pessoa e outra.

## Antes e depois

| Tela | Antes (log da homologação, 18/11) | Depois (pela conta do código) |
|---|---|---|
| O sino (em toda tela) | 17 pedidos ao banco, 0,72 s (5 aberturas) | 2 pedidos ao mesmo tempo: as contagens e as divergências das notas |
| O Início | de 18 a 29 pedidos, de 0,93 a 1,47 s (9 aberturas) | 15 pedidos a menos: as 16 contagens viram 1 |

O "depois" se mede pelo log de tempos quando você usar o sistema. O comando e a linha de partida ficam em `docs/operacao/DESEMPENHO_NO_CELULAR.md`, na seção 4.8.

## Os passos

1. Entre como dono em **ora5g.com.br**, de preferência pelo celular.
2. Abra o **Início** e toque no **sino** do topo:
   - as pendências devem ser as mesmas de antes;
   - o sino deve abrir mais rápido.
3. Abra mais duas ou três telas (Vendas, Estoque, Caixa). Cada uma abre o sino junto.
4. Responda **"aceito"** ou **"não aceito"**. Se algo parecer mais lento, diga qual tela.

## O que fica de fora (o resto do VEL-c)

- **A ação do carrinho** ainda lê a sessão duas vezes. Mudar isso mexe na camada de segurança das ações do PDV, por isso espera a revisão do Codex e o seu sim.
- **A leitura única do Catálogo e do Estoque** (de 3 a 5 rodadas): é o próximo pedaço.
- **A medida no celular da loja piloto, com o vendedor,** espera as contas de teste (J1).

## O que você não vê (provado pelo Claude Code)

- **No banco** (`packages/banco/src/pendencias-numa-ida.test.ts`):
  - para o dono, o gerente, o vendedor e o técnico, a função devolve exatamente as filas que cada um pode ver e as mesmas contagens das consultas separadas;
  - quem não escolheu a loja não recebe nada;
  - quem não entrou não executa.
- **Na plataforma** (`apps/plataforma/src/lib/inicio/pendencias.test.ts`):
  - uma ida para as contagens, nenhuma consulta separada;
  - a resposta estranha vira falha, nunca zero;
  - o banco sem a função usa o caminho antigo.
- **O sino e o Início** continuam com os testes de antes (`app/api/pendencias/route.test.ts` e `app/inicio/inicio.test.ts`).
