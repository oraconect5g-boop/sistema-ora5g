# Pontos em aberto para um sistema funcional (18/11/2026, depois do VEL-c)

**Pedido do proprietário (18/11):** "reanalise toda a documentação que o Codex preparou, reveja todos os pontos que estão em aberto e vamos fazendo um a um, principalmente com a parte de transferências, com o Ora Connect, com a parte de lançamento de vendas e estoque, para que a gente tenha um sistema funcional."

**Onde:** tudo no servidor principal, `ora5g.com.br` (D-051). A demonstração está desligada desde 18/11 (lote DEMO-c, `324d7b8`, build 14:51).

**Primeira passagem (18/11, à tarde):** o CNPJ das lojas pode ser cadastrado pelo próprio proprietário na tela Lojas; a Nogle ficou com as configurações públicas prontas no servidor; as transferências já têm teste para os seis casos que o Codex pediu. O que segue em aberto depende dos itens 1 a 4 da seção 2.

## 1. O que foi relido e como

| Fonte | Como |
|---|---|
| O pacote da reanálise do Codex de 18/11 (PR #104): `ORIENTACAO_CLAUDE.md` (seções 1 a 4) e `RELATORIO.md` | De novo, nas partes de transferências, estoque, vendas, caixa e Ora Connect (a leitura inteira de 18/11 está em `LEITURA_REANALISE_2026-11-18.md`) |
| As issues abertas no GitHub (60) | Uma a uma, contra o mapa de `ISSUES_E_PRS_2026-11-17.md`: 47 já corrigidas e comprovadas esperam só o seu sim para fechar |
| As PRs de documentação do Codex abertas (#33, #66, #67, #68, #77, #81, #85, #86, #97, #100 e #104) | As de 16 a 18/11 (#97, #100 e #104) foram lidas por inteiro nos lotes INTEG-d e AUD-a. As de 8 a 14/11 o próprio Codex consolidou nas seguintes; não foram relidas nesta passagem |
| O banco do servidor principal (`ora5g-dev`), às 14:30 de 18/11 | Só contagens, sem dado pessoal: usuários, papéis, lojas com CNPJ, transferências, caixas, vendas, operações da Ora Connect e cargas de estoque |

## 2. O caminho crítico: sem estes quatro itens, o sistema não roda numa loja

| # | O que trava | O que o banco mostra hoje | Quem resolve | Como |
|---|---|---|---|---|
| 1 | **As contas da equipe.** Só existe 1 usuário (o dono). Sem a chave secreta do Supabase no servidor, a tela **Equipe** não cria ninguém. Sem conta, vendedor, gerente e administrador não entram. E a carga do estoque exige duas pessoas: uma prepara, outra aprova (OR024) | 1 usuário, 1 papel (dono) | O proprietário (5 minutos) | `docs/PENDENCIAS_DO_PROPRIETARIO.md`, item 1.2: `bash ~/homologacao/plataforma/deploy/homologacao/definir-chave.sh SUPABASE_SECRET_KEY`. Nunca colar a chave no chat |
| 2 | **O CNPJ das lojas.** Loja sem CNPJ recusa a venda (OR038) | 11 lojas de verdade sem CNPJ; só as 2 lojas de teste têm | O proprietário, na tela **Lojas** (editar a loja: CNPJ da filial, UF e cidade, com o motivo; o banco confere o CNPJ), ou manda os dados para o Claude Code cadastrar, sem inventar nada | Começar pela Santa Cândida. Se alguma loja for de outra empresa (outro CNPJ raiz), a empresa entra antes |
| 3 | **A planilha da Rein no servidor.** Sem ela não há catálogo nem estoque de verdade | 6 produtos de teste; nenhuma carga | O proprietário | Copiar `relatorioProdutos131258.xlsx` para `~/entrada/rein/` (nunca para o GitHub) |
| 4 | **As chaves da Nogle.** Sem elas, a Ora Connect não fala com a operadora | 0 operações | O proprietário | As configurações públicas já estão no servidor desde 18/11: o endereço oficial (`NOGLE_API_BASE_URL`), o GET com corpo (`NOGLE_GET_COM_CORPO=documentado`) e o id da organização (`ORA_ORGANIZACAO_ID`). Faltam: a chave secreta do Supabase (o worker grava as operações no banco), `NOGLE_ACCESS_KEY`, `NOGLE_SECONDARY_KEY` e o tipo da chave (franquia, marca ou ponto de venda, P9), pelo mesmo `definir-chave.sh`. Com elas, o primeiro passo é só leitura (`executar-connect.ts --listas`: os planos, os DDDs, as operadoras e as cidades). As operações reais ficam desligadas até o proprietário dizer quais ligar (`NOGLE_OPERACOES_HABILITADAS`) |

## 3. Por área, um a um

### Transferências

| # | Ponto | Situação | Próximo passo |
|---|---|---|---|
| T1 | Duas transferências de teste (uma capa e um Galaxy A15) saíram da Santa Cândida (teste) para a **Muffato Santa** em 17/11 e não foram recebidas | Dado de teste numa loja de verdade. Depois de enviada, a transferência não se cancela (a regra: "depois, receba com divergência") | **Do proprietário, pela tela:** escolher a loja Muffato Santa, receber as duas em **Transferências** e mandar as duas de volta para a Santa Cândida (teste). Assim a Muffato começa limpa antes da carga da Rein |
| T2 | A regra pedida ("ao colocar em transferência, sai do disponível") | **Feito** (TRF-c, D-049): o pedido já reserva na origem | Conferir no aceite do TRF-c |
| T3 | Vários produtos na mesma operação e as 11 lojas e DEFEITOS (issue #60) | **Feito** (TRF-a e ORG-a) | Fechar a issue #60 com o seu sim |
| T4 | A jornada com pessoas diferentes (pedir, separar, enviar e receber em lojas diferentes) | Pronta no sistema; falta gente para testar | Depende do item 1 (as contas) |
| T5 | Os seis casos que o Codex pediu testar (F18-05) | **Todos cobertos** por testes do banco: a venda concorrente, nas duas ordens; o pedido além do disponível (OR001, nada gravado); a remessa que envia só as separadas; o cancelamento antes do envio; o mesmo envio duas vezes (uma saída só no livro); a ida e a volta pelo depósito | — |

### Estoque

| # | Ponto | Situação | Próximo passo |
|---|---|---|---|
| E1 | A carga do estoque de cada loja pelo relatório da Rein, com a data de corte de 10/11 às 13:20 | Pronta (REIN-a, REIN-b, REIN-c e AUD-b), com as linhas a decidir quando o físico passa do disponível | Depende dos itens 1 (duas pessoas) e 3 (o arquivo) |
| E2 | As fotos reais dos produtos (issue #26) | Envio individual e em lote prontos | Fotos de verdade aprovadas pelo proprietário |
| E3 | A conferência diária e o inventário | Prontos (as issues #78, #79 e #80 corrigidas) | Fechar as issues com o seu sim |

### Lançamento de vendas

| # | Ponto | Situação | Próximo passo |
|---|---|---|---|
| V1 | As formas de pagamento como pedido em 18/11 (PayJoy e Aiva, entrada, parcelas, chip à parte, sem link na loja) | **No ar** (PDV-c) | O seu teste pelo roteiro `docs/aceite/PDV-c.md`, na loja Santa Cândida (teste) |
| V2 | Vender nas lojas de verdade | Recusado sem CNPJ | Item 2 |
| V3 | Vendedor e gerente vendendo, cada um com o seu caixa | Pronto no sistema | Item 1 |
| V4 | A ação do carrinho mais rápida (ainda lê a sessão duas vezes) | Espera a decisão (ADR-010): muda a camada de segurança das ações do PDV | **Decisão do proprietário**, depois da revisão do Codex |
| V5 | A nota fiscal | Pedido, aprovação e documentos prontos | O emissor fiscal e o contador |
| V6 | A PayJoy e a Aiva pela API | O registro manual funciona | Os contratos e as credenciais das financeiras (issue #90) |

### Ora Connect

| # | Ponto | Situação | Próximo passo |
|---|---|---|---|
| C1 | Ativação, recarga, portabilidade, consulta da linha e do chip | O adaptador e os estados prontos, sem reenvio cego | Item 4 (as chaves e o tipo da chave, P9) |
| C2 | A conciliação com os relatórios oficiais (ORA-CONNECT-009) | **No ar** (CONNECT-c) | Roda quando a Nogle estiver ligada |
| C3 | As comissões e os repasses | A Nogle respondeu que não há na API | A fonte oficial (relatório ou extrato) indicada pela Nogle |
| C4 | O extrato do saldo | O exemplo oficial não traz os campos | A primeira resposta real |
| C5 | O link de pagamento só na compra online | **No ar** (PDV-c) | — |
| C6 | As correções REV-052 a REV-056 (issues #55 a #59) | **Feitas** | Fechar as issues com o seu sim |

## 4. O que o Claude Code faz agora, sem esperar ninguém

1. ~~Termina o desligamento da demonstração (DEMO-c) e publica.~~ **Feito:** no ar desde 14:51 de 18/11 (`324d7b8`). `/demo` e as trocas de perfil e de loja respondem 404, e a tela inicial e a de entrada não mostram o link.
2. Prepara o caminho de cada item do caminho crítico, para valer no mesmo dia em que o proprietário entregar:
   - as contas da equipe: o roteiro da tela Equipe e os papéis de cada pessoa;
   - a carga da Rein, com a conferência do arquivo;
   - o cadastro dos CNPJs;
   - a Nogle ligada, com a primeira consulta segura (só leitura).
3. Fecha as issues já corrigidas no GitHub, quando o proprietário disser sim (o conector pede a confirmação dele em cada uma).
