# Roteiro de aceite: lote J1-c (a transferência de ponta a ponta, com duas pessoas, entre as lojas de teste)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** o teste automático da "jornada com pessoas diferentes" (ponto T4 dos pontos em aberto; ORA-INV-007): pedir, separar, enviar e receber, cada passo feito pela pessoa da loja certa. Os seus dois sins de 19/11: "Sim, seguir", para o teste que grava transferências de teste entre as duas lojas de teste, e "Criar Gerente 2 (teste)", para a conta nova.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## A conta nova

- **Gerente 2 (teste):** fictícia (e-mail `@example.com`, sem e-mail de terceiros), com o papel de gerente **só na Loja de teste 2**.
- Criada como as outras contas de teste, com o seu sim de 19/11: a conta no login pela chave secreta, o convite registrado em seu nome com o motivo, e o papel e a loja ligados pelo worker das identidades.
- A senha fica só no arquivo protegido do servidor (`~/homologacao/contas-de-teste.txt`, permissão 600), nunca no chat ou no GitHub.
- O Administrador (teste) não serviria: o papel de administrador não tem a permissão de transferir.

## O que o teste faz

Duas pessoas, cada uma no seu celular simulado de 360 px, no site no ar:

1. **Ida:**
   - o **Gerente (teste)**, na Santa Cândida (teste), pede uma capa de proteção da Loja de teste 2, pelo "na rede" do Estoque, e a capa sai na hora do disponível de lá;
   - o **Gerente 2 (teste)**, na Loja de teste 2, separa e envia;
   - o **Gerente (teste)** recebe e confere, e a capa entra no estoque da Santa Cândida (teste).
2. **Volta:** o contrário, com os papéis trocados (o Gerente 2 (teste) pede, o Gerente (teste) separa e envia, o Gerente 2 (teste) recebe).
3. **A cada passo,** o teste confere o disponível das duas lojas. No fim, é o mesmo do começo.

Leva cerca de 34 segundos. Rodou três vezes em 19/11:

- na primeira, o teste confundiu a linha da própria loja (que tem a lista "Mandar para", com o nome das outras lojas) com a linha da Loja de teste 2 e parou sem pedir nada;
- corrigido o teste (não o sistema), passou duas vezes seguidas.

## O que fica gravado (só nas duas lojas de teste)

- **Duas transferências recebidas por vez** (a ida e a volta), cada uma de uma capa, com o motivo "teste automático da transferência" e a hora. Em 19/11 ficaram 4 (nº 3 a 6).
- **O estoque das duas lojas não muda:** a capa vai e volta (19 na Santa Cândida (teste) e 9 na Loja de teste 2).
- **Uma transferência deste teste deixada pelo caminho** numa vez que falhou é recebida (se já estava em trânsito) ou cancelada (se ainda estava na origem) no começo da vez seguinte.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br** e escolha a **Santa Cândida (teste)**.
2. Abra **Transferências**: devem aparecer as transferências de teste, recebidas, entre a Santa Cândida (teste) e a Loja de teste 2.
3. Se quiser, faça você mesmo uma transferência entre as duas lojas de teste: peça pelo "na rede" do Estoque numa loja, e separe, envie e receba trocando de loja.
4. Responda **"aceito"** ou **"não aceito"**.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/transferencia-real.spec.ts --project=celular-360
```

## O que fica de fora

- **Aparelho com IMEI:** coberto no lote seguinte, o J1-d (`docs/aceite/J1-d.md`).
- **A remessa com vários produtos** e **o recebimento com divergência:** ficam para um próximo teste, se você quiser.
- **No CI:** o teste precisa do arquivo das contas de teste, que só existe no servidor; no CI, ele fica pulado.
