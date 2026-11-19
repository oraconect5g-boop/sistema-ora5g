# Roteiro de aceite: lote J1-a (a prova #11: o login de verdade, no site no ar)

- **Quem faz:** o proprietário.
- **Quando:** quando quiser, com a sua conta de dono em `ora5g.com.br`, de preferência pelo celular.
- **Quanto tempo leva:** uns 3 minutos.
- **O que o lote entrega:** a prova que esperava o usuário de teste (#11, item A1 de `docs/PENDENCIAS_DO_PROPRIETARIO.md`): entrar, a sessão renovada sozinha, sair, a sessão cortada de verdade depois da saída e a segunda visita.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que aconteceu.

## O que foi provado

Em 19/11, contra o site no ar (`ora5g.com.br`), com a conta de teste do vendedor, num celular simulado de 360 px:

1. **Entrar:** o vendedor, com uma loja só, vai direto ao Início.
2. **A sessão renovada sozinha:** o acesso guardado no navegador foi dado como vencido; ao abrir o PDV, o sistema trocou por um novo, sem pedir a senha de novo.
3. **Sair:** o botão Sair leva à tela de entrada.
4. **A sessão cortada de verdade:** depois de sair, o navegador com os dados antigos não consegue voltar a entrar sem a senha.
5. **A segunda visita:** entra e sai de novo, normalmente.

Resultado: passou (7,2 s). As senhas das contas de teste ficam só num arquivo protegido do servidor; a prova não mostra e-mail nem senha.

## Os passos (com a sua conta)

1. Entre como dono em **ora5g.com.br**.
2. Toque em **Sair**: deve aparecer a tela de entrada.
3. Digite de novo o endereço **ora5g.com.br/inicio**: o sistema deve pedir a entrada, sem mostrar o Início.
4. Entre de novo: deve funcionar normalmente.
5. Responda **"aceito"** ou **"não aceito"**.

## O que fica de fora

- **O e-mail de convite e o de recuperação de senha** dependem do SMTP próprio e da Site URL no Supabase (itens 5.1 a 5.3 de `docs/PENDENCIAS_DO_PROPRIETARIO.md`).
- **A prova roda só no servidor:** ela precisa do arquivo das contas de teste, que nunca vai para o GitHub. No CI, ela fica pulada.

## Como rodar de novo (no servidor)

```bash
cd apps/plataforma && ORA_E2E_URL=https://ora5g.com.br ORA_E2E_CONTAS=$HOME/homologacao/contas-de-teste.txt npx playwright test e2e/login-real.spec.ts --project=celular-360
```
