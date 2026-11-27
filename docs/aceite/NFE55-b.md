# Roteiro de aceite: lote NFE55-b (o cliente e a nota no nome dele sem sair da tela da venda)

- **Quem pediu:** o proprietário, em 27/11/2026: a NF-e modelo 55 no fluxo interno. Esta é a segunda parte, depois do NFE55-a ([NFE55-a.md](NFE55-a.md)).
- **Quem faz o aceite:** o proprietário, lendo este roteiro. O passo no celular é opcional e só roda depois de publicado e ligado, com o sim dele, porque grava um cliente e uma venda de teste.
- **O que o lote entrega:** mais uma parte do ORA-FISC-001 (pedir a nota da venda no celular, com os dados preenchidos) e o cadastro rápido do #76 (nome completo + WhatsApp) na própria venda. Nenhum requisito muda de estado.
- **Onde está:** na branch `feat/nfe-55-fluxo-interno`, depois do NFE55-a. Sem PR, sem merge, sem publicação e sem migration.
- **Ligado?** Não. Fica **desligado por padrão** (`ORA_NOTA_NA_VENDA`), e só liga com o seu sim, depois de publicado.
- **Resposta:** "aceito" ou "não aceito".

## O que mudou (com o interruptor ligado)

1. **O cadastro rápido na venda sem cliente.**
   - **Antes:** no comprovante, "Ligar a venda a um cliente da rede" só buscava. Sem achar, "Cadastrar cliente" abria a ficha nova numa aba à parte, e depois era preciso voltar e ligar.
   - **Agora:** o bloco se chama "Ligar ou cadastrar o cliente da venda" e tem "Não achou? Cadastre aqui mesmo". Basta escolher pessoa física ou empresa e informar o nome completo (ou a razão social) e o WhatsApp com DDD. O cliente é cadastrado e já fica ligado à venda, sem CPF: o CPF e o endereço ficam para quando a nota no nome dele pedir.
   - **Sem duplicar:** o mesmo formulário enviado duas vezes não cadastra dois clientes (vale a chave do formulário), e ligar de novo o mesmo cliente não muda nada.
   - **Telefone de outro cadastro:** a tela avisa e mostra a confirmação "o número é de outra pessoa já cadastrada".
2. **Completar o cliente para a nota no nome dele.**
   - **Antes:** quando "Pedir nota fiscal" no nome do cliente era recusado por falta do CPF/CNPJ ou do endereço, o aviso levava à ficha do cliente, que é outra tela.
   - **Agora:** o bloco "Nota fiscal" mostra "Completar o cliente para a nota no nome dele" e pede só o que falta:
     - sem o endereço, só o endereço;
     - sem o CPF, o CPF e também o endereço, se o cadastro não tiver. A ficha diz se há endereço sem mostrá-lo; essa leitura fica na auditoria do cliente e só acontece nesse caso.
   - **Um toque, "Completar e pedir a nota":** os dados entram no MESMO cadastro, com o motivo na auditoria ("Dados para a nota fiscal da venda nº …, pedidos no comprovante"). As finalidades que o cliente já tinha continuam, e a "nota fiscal" é somada: a lista vai inteira a cada gravação, então nenhuma se perde. Em seguida a nota é pedida no nome dele.
   - **Com erro:** a tela volta com o formulário aberto e o motivo do erro. O CPF e o endereço digitados nunca vão no endereço da página, por isso é preciso digitar de novo.
3. **O interruptor.** `ORA_NOTA_NA_VENDA`: vazio, que é o normal, deixa a tela como antes; `1` liga. Ele entrou na lista do que o site pode ler (`deploy/homologacao/ambiente-web.sh`, com o teste dela), no `.env.example` e na tabela de variáveis. Com ele desligado, as duas ações também recusam ("está desligado neste ambiente").

## O que este lote não faz (de propósito)

- **Nada novo no banco:** sem migration e sem função nova. `cliente_ficha`, `cliente_salvar`, `venda_vincular_cliente` e `notas_solicitar` já existiam e decidem tudo de novo: a loja, a permissão, os dados mínimos, a idempotência e a auditoria.
- **Não emite nota, não manda WhatsApp, não usa credencial nem cliente real e não muda preço nem piso.**
- **Não liga sozinho.**

## Como foi conferido (pelo Claude Code)

- **No site:** `apps/plataforma/src/app/vendas/nota-no-nome.test.ts` tem 8 testes novos, com o Supabase simulado. Eles conferem:
  - com o interruptor desligado, tudo como antes, e as ações não gravam;
  - o cadastro rápido: o que a tela mostra, o que vai ao banco, o nome sem sobrenome e o WhatsApp que falta (nem chegam ao banco) e os erros que voltam do banco;
  - o completar: o que pedir em cada caso, a ficha lida só quando precisa e a gravação com as finalidades de antes mais a nota fiscal;
  - os erros voltam sem nenhum dado pessoal na URL.
- **No banco:** `packages/banco/src/nfe-modelo-55-ponta-a-ponta.test.ts` ganhou o 2º teste. Ele manda exatamente o que a tela manda, contra as regras de verdade:
  - o cadastro rápido com a lista vazia não duplica pela mesma chave;
  - ligar de novo devolve "sem mudança";
  - quem vende lê a ficha;
  - numa gravação só, a "assistência" continua e a "nota fiscal" entra;
  - a nota sai no nome do cliente.
- **A suíte inteira do site passa:** 230 arquivos e 2.149 testes; os 2 pulados já eram pulados antes. Ela inclui duas regras que a mudança tocou:
  - o "retorno imediato", em que todo botão de formulário trava e avisa, e por isso as duas ações novas ficam no `acoes.ts` das notas;
  - as rodadas de leitura do comprovante: a leitura nova não acrescenta rodada.
- **A lista do que o site pode ler:** 3 testes.
- **Os tipos e o lint dos arquivos mudados passam.**

## O que você confere

1. Leia "O que mudou", acima.
2. (Opcional, só depois de publicado e ligado, com o seu sim, porque grava um cliente e uma venda de teste.) No celular, na Santa Cândida (teste), com o Vendedor (teste):
   - venda de uma capa em dinheiro, sem cliente;
   - no comprovante, "Ligar ou cadastrar o cliente da venda", depois "Não achou? Cadastre aqui mesmo", com um nome fictício e um WhatsApp de teste: o cliente fica ligado à venda;
   - "Pedir nota fiscal" no nome do cliente: aparece "Completar o cliente para a nota no nome dele". Preencha um CPF fictício válido e um endereço fictício e toque em "Completar e pedir a nota": aparece "Nota pedida";
   - no fim, o Gerente (teste) cancela o pedido. Nada é emitido.
3. Responda **"aceito"** ou **"não aceito"**.

## O que falta

- **Ligar na homologação** (`ORA_NOTA_NA_VENDA=1`): só com o seu sim, depois do merge e da publicação.
- **O que foi digitado volta vazio quando há erro.** É de propósito, para o CPF e o endereço não irem na URL. Guardar o digitado na própria tela fica para depois, se fizer falta.
- **O cadastro rápido que não consegue ligar à venda** (raro: a venda mudou entre a tela e o toque) deixa o cliente cadastrado. A busca pelo telefone acha ele.
- **Como no NFE55-a:** os dados fiscais dos produtos (NCM, CFOP) dependem do contador; o provedor fiscal da REIN ainda não foi identificado; e a Meta não está configurada, então o WhatsApp fica na fila.
