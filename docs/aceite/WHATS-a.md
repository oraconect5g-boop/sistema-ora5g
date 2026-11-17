# Roteiro de aceite: lote WHATS-a (o programa que manda a nota pelo WhatsApp)

- **Quem faz:** o proprietário, lendo este roteiro. Não há passo no celular.
- **Quanto tempo leva:** uns dois minutos.
- **O que o lote entrega:** o item 4 da onda 0 do plano de 16/11, que é o programa que manda a nota ao cliente pelo WhatsApp oficial. Os requisitos ligados são o ORA-WHATS-001 e o ORA-WHATS-006. Nenhum deles muda de estado: o envio depende da Meta.
- **Resposta:** "aceito" ou "não aceito".
- **No ar:** desde 17/11, às 12:03, no commit `69bfab6`. O rodapé pode mostrar um commit mais novo, de um lote seguinte.

## O que mudou

1. **O programa existe.**
   - **Antes:** existiam a fila de envio, no banco, e as regras do envio. Faltava o programa que lê a fila.
   - **Agora:** esse programa pega cada nota da fila, prepara o link do PDF da nota, que vale por pouco tempo, e anota no banco o que aconteceu.
   - **Nos registros:** só ficam números, como "2 enviadas, 0 com falha". Telefone, nome, link e senha não aparecem.
2. **Ele fica desligado até a Meta.**
   - Para ligar, faltam o número oficial liberado pela Meta, a chave de acesso e o modelo de mensagem aprovado.
   - Falta também a ligação com a Meta, que o Claude Code só escreve com a documentação oficial e uma conta para testar.
   - Até lá, o programa diz o que falta e para. Nada sai da fila, e nenhuma nota aparece como enviada.
3. **Ele não roda sozinho.** O arquivo que o faria rodar a cada minuto no servidor está pronto, mas não está agendado. Ele só entra com a liberação da Meta e com a sua autorização.

## Como foi conferido (pelo Claude Code)

- **Testes automáticos novos:**
  - sem cada uma das configurações, o programa aponta a que falta;
  - com tudo configurado, ele usa as funções certas do banco e o link do PDF;
  - rodado de verdade, sem nenhuma configuração, ele diz o que falta e termina sem erro.
- **Os testes de antes continuam passando:** o envio, a recusa, o reenvio e a conferência do destinatário.

## O que você confere

1. Leia "O que mudou", acima.
2. Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **Uma nota chegando no WhatsApp de um cliente.** Isso depende da Meta (a pendência F1 da sua lista) e é da Onda 3.
