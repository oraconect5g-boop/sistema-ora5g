# Roteiro de aceite: lote DEP-a (a lista única do que depende de fora)

- **Quem faz:** o proprietário, lendo. Não há passo no celular.
- **Quanto tempo leva:** uns cinco minutos.
- **O que o lote entrega:** o aceite A19 do adendo do Codex de 16/11, que é uma lista única com tudo o que depende de fora do sistema. Nenhum requisito muda de estado.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que falta ou o que está errado na lista.
- **No ar:** desde 17/11, às 15:20, no commit `569eab8`. O rodapé pode mostrar um commit mais novo, de um lote seguinte.

## O que mudou

1. **Uma tabela só, com cada integração.** Ela fica no começo do documento `docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`. Para cada integração, ela diz:
   - os requisitos que dependem dela;
   - o que já existe no sistema;
   - o que falta programar;
   - o que você entrega;
   - a situação de hoje.
2. **A situação foi conferida no servidor em 17/11.**
   - **Como:** só pelos nomes das chaves, nunca pelos valores.
   - **As chaves de fora:** nenhuma está gravada (a chave secreta do Supabase, o e-mail de envio, os avisos no celular, a Nogle e o fiscal).
   - **As pastas de entrada:** a da Rein, a das lojas e a das fotos estão vazias.
3. **As chaves internas agora pedem a sua autorização antes.** São as chaves que o próprio Claude gera no servidor, como a dos avisos no celular. Antes, a lista dizia que elas não dependiam de você. Como são credenciais, o plano de 16/11 manda perguntar antes.
4. **A lista do que você providencia ganhou dois itens:**
   - a autorização para os avisos no celular;
   - os dados das lojas (o CNPJ da filial, o endereço, o telefone e o horário), sem os quais a loja não vende.

## O que você confere

1. Abra o documento e leia a tabela **"A lista única"**.
2. Veja se falta alguma integração que você usa ou pretende usar, ou se alguma está com a situação errada.
3. Responda **"aceito"** ou **"não aceito"**.

## O que este roteiro não cobre

- **Ligar qualquer integração.** Cada uma só anda com o que está na coluna "O que você entrega".
