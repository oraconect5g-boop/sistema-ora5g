# NFE55-b: o cliente e a nota no nome dele sem sair da tela da venda (EM ESPERA)

- **Situação:** **em espera. Não ligar.** A revisão do PR #116, em 27/11/2026, sobre o commit `10ac0fc`, achou problemas nas duas ações. Elas ficam no código, desligadas e sem jeito de ligar no servidor. A etapa **B2**, abaixo, troca as duas por uma transação só no banco, numa entrega separada.
- **Quem pediu:** o proprietário, em 27/11/2026: a NF-e modelo 55 no fluxo interno. A primeira parte, NFE55-a, está em [NFE55-a.md](NFE55-a.md).
- **Onde está:** na branch `feat/nfe-55-fluxo-interno`, no PR #116, que está em rascunho. Sem merge, sem publicação e sem migration.

## O que a revisão achou (no 10ac0fc)

1. **"Completar e pedir a nota" grava o cliente antes de conferir tudo.** A ação gravava o CPF e o endereço no cadastro antes de o banco conferir a autorização, o vínculo do cliente com a venda e o estado da venda e da nota. Se o pedido da nota fosse recusado depois (outra pessoa, venda que mudou, nota já pedida), o cadastro já estava alterado. A ação também recebia o cliente e o número da venda do formulário, quando eles deviam sair do servidor.
2. **O cadastro rápido podia deixar cliente órfão ou trocar o vínculo numa corrida.** Ele fazia duas idas ao banco (cadastrar e depois ligar). Se a segunda falhasse, o cliente ficava cadastrado sem a venda; e, entre a tela e o toque, outra pessoa podia ter ligado outro cliente.

## O que protege agora

- **Desligado e sem jeito de ligar no servidor.** O interruptor `ORA_NOTA_NA_VENDA` ficou fora da lista do que o site pode ler (`deploy/homologacao/ambiente-web.sh` está igual ao da `main`). Um teste confere que ele não chega ao site: `packages/config/src/ambiente-web.test.ts`, "o interruptor do NFE55-b (ORA_NOTA_NA_VENDA) não chega ao web até a etapa B2". Na homologação, definir a variável não muda nada.
- **Com ele desligado, a tela fica como antes**, levando à ficha do cliente, e as duas ações recusam antes de qualquer leitura ou gravação. Os testes de "desligado" de `apps/plataforma/src/app/vendas/nota-no-nome.test.ts` conferem isso.

## Proposta da etapa B2 (entrega separada, depois do merge do NFE55-a)

**Uma função do banco por ação, cada uma numa transação só.** Ou grava tudo, ou não grava nada. Elas são `security definer`, com `search_path` vazio, e ficam fora do acesso público. As regras que já existem continuam valendo, porque as funções chamam por dentro `cliente_salvar` e `notas_solicitar`, que conferem tudo de novo.

1. `public.venda_cadastrar_cliente(p_venda uuid, p_dados jsonb, p_chave text)`, para o cadastro rápido:
   1. **Chave do formulário obrigatória.** Uma trava pela chave (`privado.trava_da_chave`) faz a mesma chave devolver o mesmo resultado.
   2. **Trava da venda:** `select … from public.vendas where id = p_venda for update`. Duas pessoas na mesma venda esperam uma pela outra.
   3. **Autorização antes de gravar:** a venda é da loja do turno; a pessoa tem `cliente.cadastrar` e é quem vendeu (com `venda.registrar`) ou vê as vendas da loja (`venda.ver_unidade`/`venda.ver_todas`), a mesma regra de `venda_vincular_cliente`. A venda está concluída e, **depois da trava**, continua sem cliente. Se outra pessoa ligou alguém antes, é recusa, sem trocar o vínculo.
   4. **Só os campos necessários (lista fechada):** `tipo`, `nome`, `telefone`, `telefone_compartilhado`. Qualquer outro campo é recusado, então não entram documento, endereço, e-mail nem finalidade por aqui.
   5. **Grava e liga na mesma transação**, com o motivo montado no servidor a partir do número da venda que está no banco. Se algo falha, nada fica: nem cliente órfão, nem vínculo pela metade.
2. `public.nota_no_nome_completar(p_venda uuid, p_dados jsonb, p_chave text)`, para completar e pedir a nota:
   1. **Chave obrigatória:** o pedido já feito com a mesma chave é devolvido.
   2. **Trava da venda;** o cliente e o número saem da venda travada, nunca do formulário.
   3. **Autorização e estado antes de gravar:** a regra de `notas_solicitar` (a loja do turno, `nota.solicitar`, quem vendeu ou quem aprova nota) mais `cliente.cadastrar`. A venda está concluída, com cliente e **sem pedido de nota vivo**; se já houver um, é recusa (OR014) **sem tocar no cadastro**.
   4. **Só os campos necessários:** `documento` e `endereco` (CEP, rua, número, complemento, bairro, cidade e UF). Nada mais.
   5. **As finalidades ficam preservadas dentro do banco:** com o cadastro travado (`for no key update`), a lista vira a de agora mais `nota_fiscal`. A tela não lê nem manda a lista, então nada se perde entre a leitura e a gravação.
   6. **Pede a nota na mesma transação** (`notas_solicitar` com o cliente da venda). Se for recusada, o cadastro volta como estava.
3. **Opcional:** uma leitura `public.nota_no_nome_o_que_falta(p_venda)` que diga só se faltam o documento e o endereço do cliente da venda, sem os valores. Ela substitui a leitura da ficha (`cliente_ficha`) que a tela faria hoje para isso.
4. **No site:** cada ação vira uma ida só ao banco. O formulário manda só a venda, o que foi digitado e a chave, sem o cliente e sem o número. O erro volta como código, e o CPF e o endereço nunca vão na URL.
5. **Migration e reversão:** a migration nova vem com o arquivo de reversão e **não é aplicada**. O merge da B2 a aplica pela integração, por isso pede o sim do proprietário. É preciso combinar o contador fixo de `autorizacao-funcoes.test.ts` (mais 2 funções) com o PR #113, que também mexe nele.
6. **Ligar:** só no fim da B2, com o sim do proprietário. Isso inclui pôr `ORA_NOTA_NA_VENDA` de volta na lista do web, com o teste invertido.

### Os testes da B2

- **Caminho feliz das duas funções,** incluindo as finalidades preservadas: um cliente com "assistência" fica com "assistência" e "nota fiscal".
- **Repetição:** a mesma chave devolve o mesmo cliente e o mesmo pedido, sem duplicar nada.
- **Recusa sem mudança nenhuma.** Para cada caso, confere-se antes e depois que não mudaram os clientes, `cliente_dados`, o `cliente_id` da venda, `notas_pedidos` e a auditoria do cliente. Os casos são:
  - outra loja;
  - outro vendedor sem permissão;
  - quem não tem `cliente.cadastrar`;
  - venda não concluída;
  - venda que já tem cliente (no cadastro rápido);
  - venda com nota já pedida (no completar);
  - campo fora da lista;
  - CPF inválido;
  - endereço incompleto.
- **Corrida:**
  - o cliente da venda muda entre a tela e o toque: o cadastro rápido é recusado sem cadastrar ninguém, e o completar usa o cliente de agora da venda;
  - com duas conexões de verdade, a segunda espera a trava e é recusada. O banco de teste em memória tem uma conexão só, então esse teste roda onde houver Postgres de verdade. Se não houver, fica registrado como limite, e valem a trava e a conferência depois dela.
- **No site:**
  - cada ação manda só os campos da lista;
  - o erro volta como código, sem dado pessoal na URL;
  - com o interruptor desligado, a ação recusa sem chamar o banco.

## O que já estava no código (B1, desligado), para a B2 aproveitar

Isto é só referência; com o interruptor fora da lista do web, nada disto funciona no servidor.

- **A tela da venda:**
  - o bloco "Ligar ou cadastrar o cliente da venda", com "Não achou? Cadastre aqui mesmo";
  - o "Completar o cliente para a nota no nome dele", no bloco "Nota fiscal".
- **As ações** `cadastrarClienteNaVenda` e `completarClienteEPedirNota` (`apps/plataforma/src/app/notas/acoes.ts`). Na B2, elas viram uma chamada só, cada uma.
- **As regras puras** (`apps/plataforma/src/lib/notas/nota-na-venda.ts`) e os testes da tela (`apps/plataforma/src/app/vendas/nota-no-nome.test.ts`).
- **No banco,** o 2º teste de `packages/banco/src/nfe-modelo-55-ponta-a-ponta.test.ts` mostra que as regras de hoje aceitam o que a tela mandaria. A B2 junta tudo numa transação.
