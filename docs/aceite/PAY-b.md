# Roteiro de aceite: lote PAY-b (o pagamento online só se confirma pela reconsulta ao provedor)

- **Quem faz:** o proprietário. Este roteiro é só de leitura: o pagamento online continua desligado até você escolher o provedor (PicPay, PagBank ou os dois; pendência E1) e as credenciais existirem.
- **Quanto tempo leva:** uns 2 minutos.
- **O que o lote entrega:** o achado F18-06 da reanálise do Codex de 18/11, nas regras do link de pagamento e do Pix online (ORA-PAY-008 e ORA-PAY-014).
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **Antes:** quando o pagamento online for ligado, um aviso assinado do provedor, de uma cobrança nossa e do mesmo valor, confirmaria o pagamento sozinho.
2. **Agora, o aviso nunca confirma.** Ele só faz o sistema perguntar de novo ao provedor (a reconsulta), e é a resposta da reconsulta que decide. Ela confere quatro coisas:
   - se é a mesma cobrança;
   - o mesmo valor;
   - a mesma moeda;
   - a situação que já estava registrada.
3. **O que não fecha vai para a conciliação,** sem mudar nada sozinho:
   - o pagamento que chega depois de a cobrança ser cancelada;
   - o cancelamento que chega depois do pagamento;
   - o estorno de algo que não foi pago;
   - outro valor ou outra moeda.
4. **Sem cobrar duas vezes:** se a criação da cobrança cair no meio (tempo esgotado), o sistema pergunta ao provedor antes de criar outra.
5. **A página de "obrigado" do navegador não confirma pagamento.**

## O que você não vê (provado pelo Claude Code)

`apps/worker/src/cobranca/cobranca.test.ts`, com avisos e respostas fictícios:

- nenhuma combinação de aviso confirma;
- a reconsulta confirma uma vez só;
- os avisos fora de ordem, o estorno e o tempo esgotado têm, cada um, o seu caso.

## O que falta e depende de você

- **A escolha do provedor (E1)** e as credenciais, gravadas no servidor pelo `definir-chave.sh`, nunca pelo chat.
- **Depois disso, o lote de ligar:** o adaptador oficial, conferido na documentação do provedor escolhido; a rota do aviso; a tabela das cobranças; e a conciliação com o extrato do provedor.
