# Pontos em aberto para um sistema funcional (18/11/2026, depois do VEL-c)

**Pedido do proprietário (18/11):** "reanalise toda a documentação que o Codex preparou, reveja todos os pontos que estão em aberto e vamos fazendo um a um, principalmente com a parte de transferências, com o Ora Connect, com a parte de lançamento de vendas e estoque, para que a gente tenha um sistema funcional."

**Onde:** tudo no servidor principal, `ora5g.com.br` (D-051). A demonstração está desligada desde 18/11 (lote DEMO-c, `324d7b8`, build 14:51).

**Primeira passagem (18/11, à tarde):** o CNPJ das lojas pode ser cadastrado pelo próprio proprietário na tela Lojas; a Nogle ficou com as configurações públicas prontas no servidor; as transferências já têm teste para os seis casos que o Codex pediu. O que segue em aberto depende dos itens 1 a 4 da seção 2.

**Segunda passagem (18/11, fim da tarde):** os outros setores, a pedido do proprietário ("feche todas as outras pendências dos outros setores"), na seção 5.

**Terceira passagem (19/11, de manhã):** com as contas de teste, a prova #11 (o login de verdade no site no ar) e a medida com login antes e depois da leitura única do Catálogo e do Estoque (J1-a e VEL-d), na seção 5.

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
| 1 | **As contas da equipe.** Até 18/11 só existia 1 usuário (o dono). Sem conta, vendedor, gerente e administrador não entram. E a carga do estoque exige duas pessoas: uma prepara, outra aprova (OR024) | Desde 19/11, 5 usuários: o dono, o Gerente 2 (teste) na Loja de teste 2 (criado em 19/11 com o sim do proprietário, para o teste da transferência) e, desde 18/11 à noite, as três contas de teste fictícias (e-mails `@example.com`, sem e-mail de terceiros): Gerente (teste) e Vendedor (teste) na Santa Cândida (teste) e Administrador (teste) na rede inteira | O proprietário | **A chave secreta do Supabase chegou em 18/11** e está gravada no servidor, só no ambiente dos workers (o site não a recebe); conferida com uma leitura das contas do login. **A rotina que envia os convites foi ligada em 18/11, com o sim do proprietário** (a cada minuto; conferida: roda e não achou convite parado). O endereço do site no servidor foi corrigido para ora5g.com.br (estava o antigo, hml-app, que não responde mais: o link do convite e o da recuperação de senha iam para uma página morta). Para o e-mail de convite chegar à equipe, faltam o SMTP próprio e a Site URL no Supabase (itens 5.1 a 5.3 de `docs/PENDENCIAS_DO_PROPRIETARIO.md`); depois, cada pessoa é convidada na tela **Equipe**. **As contas de teste foram criadas em 18/11 com o sim do proprietário:** o login de cada uma conferido; as senhas ficam só num arquivo protegido do servidor (`~/homologacao/contas-de-teste.txt`, permissão 600), nunca no chat ou no GitHub. **A prova #11 passou em 19/11** contra o site no ar, com a conta do vendedor de teste: entrar, a sessão renovada sozinha, sair, a sessão cortada de verdade e a segunda visita (J1-a) |
| 2 | **O CNPJ das lojas.** Loja sem CNPJ recusa a venda (OR038) | 11 lojas de verdade sem CNPJ; só as 2 lojas de teste têm | O proprietário, na tela **Lojas** (editar a loja: CNPJ da filial, UF e cidade, com o motivo; o banco confere o CNPJ), ou manda os dados para o Claude Code cadastrar, sem inventar nada | Começar pela Santa Cândida. Se alguma loja for de outra empresa (outro CNPJ raiz), a empresa entra antes |
| 3 | **A planilha da Rein no servidor.** Sem ela não há catálogo nem estoque de verdade | 6 produtos de teste; nenhuma carga | O proprietário | Copiar `relatorioProdutos131258.xlsx` para `~/entrada/rein/` (nunca para o GitHub) |
| 4 | **As chaves da Nogle.** Sem elas, a Ora Connect não fala com a operadora | 0 operações | O proprietário | As configurações públicas já estão no servidor desde 18/11: o endereço oficial (`NOGLE_API_BASE_URL`), o GET com corpo (`NOGLE_GET_COM_CORPO=documentado`) e o id da organização (`ORA_ORGANIZACAO_ID`). A chave de acesso (`NOGLE_ACCESS_KEY`) chegou em 18/11 e está gravada no servidor, só no ambiente do worker (o site não a recebe). A chave secreta do Supabase, que o worker usa para gravar as operações, também chegou em 18/11. Faltam: o tipo da chave (franquia, marca ou ponto de venda, P9) e `NOGLE_SECONDARY_KEY` (se o tipo não for marca), pelo mesmo `definir-chave.sh`, direto no servidor. Com elas, o primeiro passo é só leitura (`executar-connect.ts --listas`: os planos, os DDDs, as operadoras e as cidades). As operações reais ficam desligadas até o proprietário dizer quais ligar (`NOGLE_OPERACOES_HABILITADAS`) |

## 3. Por área, um a um

### Transferências

| # | Ponto | Situação | Próximo passo |
|---|---|---|---|
| T1 | Duas transferências de teste (uma capa e um Galaxy A15) saíram da Santa Cândida (teste) para a **Muffato Santa** em 17/11 e não foram recebidas | Dado de teste numa loja de verdade. Depois de enviada, a transferência não se cancela (a regra: "depois, receba com divergência") | **Do proprietário, pela tela:** escolher a loja Muffato Santa, receber as duas em **Transferências** e mandar as duas de volta para a Santa Cândida (teste). Assim a Muffato começa limpa antes da carga da Rein |
| T2 | A regra pedida ("ao colocar em transferência, sai do disponível") | **Feito** (TRF-c, D-049): o pedido já reserva na origem | Conferir no aceite do TRF-c |
| T3 | Vários produtos na mesma operação e as 11 lojas e DEFEITOS (issue #60) | **Feito** (TRF-a e ORG-a) | Fechar a issue #60 com o seu sim |
| T4 | A jornada com pessoas diferentes (pedir, separar, enviar e receber em lojas diferentes) | **Provada de ponta a ponta** em 19/11 (J1-c): o Gerente (teste) na Santa Cândida (teste) e o Gerente 2 (teste) na Loja de teste 2, ida e volta de uma capa, com o estoque das duas lojas igual no fim | O seu teste, se quiser, pelo roteiro `docs/aceite/J1-c.md` |
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
| V3 | Vendedor e gerente vendendo, cada um com o seu caixa | Pronto no sistema; desde 19/11, a venda do vendedor de teste é provada de ponta a ponta no celular, na loja de teste (J1-b) | Item 1 |
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

## 5. Os outros setores (o pedido de 18/11, no fim da tarde)

**Pedido do proprietário:** "Agora feche todas as outras pendências dos outros setores, por favor", "completando os códigos que faltam e configurações".

Os lotes que não dependem de ninguém, um por vez. Cada um tem teste, publicação em ora5g.com.br e roteiro de aceite.

| Lote | O que fecha | Situação |
|---|---|---|
| PERF-a | Os chips como medida própria nas metas e no bônus (ORA-PERF-001). O seu pedido de 18/11: "o chip é vendido separado do celular. Eles têm que contar como separado" | **No ar** desde 16:39 de 18/11 (roteiro `docs/aceite/PERF-a.md`) |
| QUAL-001 | A nota do CI: as runs do GitHub na `main` terminam verdes desde 17/11 (ORA-QUAL-001) | **Feito** junto com o PERF-a, só a nota; a proteção da `main` continua sendo sua (pendência 5.5) |
| CD-a | O depósito não vende (D-043, ORA-INV-012), como padrão que se muda fácil: o banco recusa a venda e a reserva de venda no depósito (OR043); a transferência que sai dele segue igual | **No ar** desde 16:54 de 18/11 (roteiro `docs/aceite/CD-a.md`); a decisão continua sua: se o depósito vender, diga |
| OBS-a | Os erros do servidor na tela Saúde da operação (ORA-QUAL-006 e ORA-QUAL-013): quantos, em que tela, quando e o código que a página de erro mostra à loja, com o aviso no topo quando houve erro na última hora | **No ar** desde 17:14 de 18/11 (roteiro `docs/aceite/OBS-a.md`); o tempo de resposta depende de um serviço de monitoramento, a escolher |
| CONTAS-a | As contas bancárias de cada empresa, com o saldo pelo extrato (ORA-FIN-006): o saldo inicial num dia mais as linhas dos extratos do banco ligados à conta | **No ar** desde 17:37 de 18/11 (roteiro `docs/aceite/CONTAS-a.md`) |
| REPASSE-a | O repasse do marketplace casado com a linha do extrato do banco (ORA-MKTPL-005 e ORA-MKTPL-008), com a diferença e o motivo registrados | **No ar** desde 17:37 de 18/11 (roteiro `docs/aceite/REPASSE-a.md`) |
| J1-a | A prova #11 (ORA-ORG-006): o login de verdade no site no ar, com a conta de teste do vendedor: entrar, a sessão renovada sozinha, sair, a sessão cortada de verdade e a segunda visita | **Feito** em 19/11: passou contra ora5g.com.br (roteiro `docs/aceite/J1-a.md`); na `main` em `5d3a8ce` |
| VEL-d | A leitura única do Catálogo e da lista do Estoque (ORA-QUAL-010), medida antes e depois com a conta de teste, como pede a orientação de 18/11 | **No ar** desde 10:38 de 19/11 (roteiro `docs/aceite/VEL-d.md`): o Catálogo de 9 idas em 8 rodadas (1,52 s no banco) para 2 em 2 (0,56 s), com a tela carregada em 0,56 s (antes 1,55 s); a lista do Estoque de 4 em 4 (1,20 s) para 2 em 2 (0,55 s), com a tela em 0,54 s (antes 1,20 s) (seção 4.9 de `docs/operacao/DESEMPENHO_NO_CELULAR.md`) |
| VEL-e | As permissões da sessão numa conta só (ORA-QUAL-010): a medida do VEL-d mostrou que o molde da sessão, lido em toda tela com login, era o maior atraso, por fazer 45 perguntas de permissão uma a uma | **No ar** desde 10:48 de 19/11 (o banco) e na `main` em `92fe105` (roteiro `docs/aceite/VEL-e.md`): o molde da sessão de 0,19 s para 0,023 s no banco e de 0,54 s para 0,18 s por ida no site (mediana); o sino de 0,052 s para 0,016 s no banco (seção 4.10) |
| VEL-f | As conexões com o banco aquecidas (ORA-QUAL-010): a medida do VEL-e mostrou que, nas telas com várias idas ao mesmo tempo, a ida que abria conexão nova levava de 0,50 a 0,60 s, e a tela esperava por ela | **No ar** desde 12:15 de 19/11 (roteiro `docs/aceite/VEL-f.md`): um conjunto de 20 conexões com o banco fica aberto e é usado de novo a cada 120 s, com um pedido leve à saúde do serviço de login (a chave pública, sem dado de ninguém): as telas com várias idas ao mesmo tempo deixam de abrir conexão no meio, o que custava cerca de 0,26 s na ida mais lenta. Medido (seção 4.11 de `docs/operacao/DESEMPENHO_NO_CELULAR.md`): depois de 200 s parado, as idas em rajada acima de 0,4 s caíram de 74% para 38%, o Início do gerente de 1,29 para 0,86 s e a Saúde da operação de 1,42 para 0,93 s; os Relatórios, de 1,61 para 1,47 s; em uso contínuo, nada muda |
| J1-b | A venda de ponta a ponta no celular (ORA-POS-002 e ORA-QUAL-010), com o sim do proprietário de 19/11 ("Sim, seguir", para o teste que grava vendas de teste na Santa Cândida (teste)) | **Feito** (roteiro `docs/aceite/J1-b.md`): a venda de verdade, de ponta a ponta, num celular de 360 px, com a conta de teste do vendedor na loja de teste Santa Cândida (teste), no site no ar: abre o caixa se precisar, cancela a venda que ficou aberta numa vez que falhou, abre uma venda nova, acha a capa de proteção (ACE-0001) pelo SKU, põe no carrinho, tira, põe de novo, paga em dinheiro (R$ 79,00) e conclui; confere o comprovante e o estoque (uma capa a menos). O teste rodou quatro vezes em 19/11: a primeira olhou o caixa antes de a tela chegar e parou sem concluir (a venda aberta foi cancelada pela vez seguinte, como previsto); a segunda concluiu, mas a conta do estoque comparou com a medida de antes desse cancelamento; corrigidos os dois pontos do teste, passou duas vezes seguidas (cerca de 18 s cada). Ficaram na loja de teste 3 vendas concluídas (R$ 237,00 em dinheiro), 1 cancelada, a capa de 22 para 19, o caixa do Vendedor (teste) aberto e nenhum pedido de nota |
| J1-c | A transferência de ponta a ponta com duas pessoas (ORA-INV-007 e o ponto T4), com os sins do proprietário de 19/11 | **Feito** (roteiro `docs/aceite/J1-c.md`): a transferência de verdade entre as duas lojas de teste, com duas pessoas, cada uma num celular de 360 px, no site no ar: na ida, o Gerente (teste) pede na Santa Cândida (teste) uma capa de proteção da Loja de teste 2 pelo "na rede" do Estoque, o Gerente 2 (teste) separa e envia, e o Gerente (teste) recebe e confere; na volta, o contrário; a cada passo, o disponível das duas lojas é conferido e, no fim, é o de antes. Com a conta de teste fictícia Gerente 2 (teste) (e-mail @example.com), com o papel de gerente só na Loja de teste 2, criada em 19/11 com o sim do proprietário ("Criar Gerente 2 (teste)") pelo mesmo caminho das outras: a conta no login pela chave secreta, o convite registrado em nome do dono com o motivo e o papel ligado pelo worker das identidades (convite vinculado); a senha só em ~/homologacao/contas-de-teste.txt (600). O Administrador (teste) não serviria: o papel de administrador não tem estoque.transferir. O teste rodou três vezes em 19/11: a primeira confundiu a linha da própria loja (que tem a lista "Mandar para", com o nome das outras) com a da Loja de teste 2 e parou sem pedir nada; corrigido o teste, passou duas vezes seguidas (cerca de 34 s cada). Ficaram 4 transferências recebidas (nº 3 a 6) e o estoque das duas lojas igual (19 e 9) |
| J1-d | A transferência de um aparelho pelo IMEI, com duas pessoas (ORA-INV-007), com o sim do proprietário de 19/11 | **Feito** (roteiro `docs/aceite/J1-d.md`): a transferência de um aparelho entre as duas lojas de teste, com duas pessoas, no site no ar: na ida, o Gerente (teste) pede um Moto G24 da Loja de teste 2, o Gerente 2 (teste) separa escolhendo o aparelho pelo IMEI e envia, e o Gerente (teste) recebe lendo o IMEI; na volta, o Gerente (teste) separa o MESMO aparelho; a busca pelo IMEI no Estoque confere onde ele está a cada perna, e no fim ele está na loja de onde saiu, disponível e no estoque, com o disponível das duas lojas igual ao do começo. O teste: em 19/11, a primeira rodada passou; na seguinte, um pico de lentidão do banco (idas de 0,2 s levando de 3 a 4,5 s) fez o teste parar depois da ida, e o aparelho ficou na Santa Cândida (teste) (nº 9), devolvido depois pelas telas com as duas contas de teste (nº 10). Mudanças no teste (não no sistema): contra o site no ar, cada conferência espera até 15 s; se o teste parar no meio, o fim dele cancela a ida que não saiu da origem ou termina a volta. Depois disso, a capa e o aparelho passaram juntos duas vezes seguidas (cerca de 1 min 20 s); ficaram 18 transferências de teste, todas recebidas, e o estoque das duas lojas igual (a capa 19 e 9; o Moto G24 2 e 1) |
| VEL-g | A tela de Transferências numa ida só ao banco (ORA-QUAL-010 e ORA-INV-007), com o sim do proprietário de 19/11 para medir e acelerar a tela | **No ar** desde 16:04 de 19/11 (roteiro `docs/aceite/VEL-g.md`): o antes, em uso contínuo, com os gerentes de teste (5 aberturas), 6 a 7 idas ao banco em 3 rodadas, de 0,57 a 0,66 s no banco, e a tela carregada em 0,60 a 0,69 s (no nível das outras telas: Vendas, 0,78 s); com aparelho a separar, uma quarta rodada; public.transferencias_tela traz numa resposta a lista da loja do turno, os produtos (com o tipo), as lojas, os aparelhos separados, as remessas, o saldo de agora de cada lado e os aparelhos livres para separar, com o RLS de quem pede (SECURITY INVOKER); a tela passa a 2 rodadas (a sessão e a leitura única). Medido (seção 4.12 de `docs/operacao/DESEMPENHO_NO_CELULAR.md`): 2 idas ao banco em 2 rodadas (eram 6 a 7 em 3); na mesma medida do antes (1,5 s entre as aberturas), a tela carregada caiu de 0,69 para 0,63 s (Gerente (teste)) e de 0,60 para 0,44 s (Gerente 2 (teste)), e o tempo no banco, de 0,66 para 0,61 s e de 0,57 para 0,42 s; numa segunda medida (6 s entre as aberturas), sem variação do lado do Supabase, a tela carregou em 0,43 e 0,41 s; a função leva 0,045 s no banco, e metade das leituras da primeira medida demorou de 0,26 a 0,47 s dentro do Supabase (contra 0,07 a 0,14 s nas outras), sem outro pedido nosso ao mesmo tempo |

**Configurações:** só as públicas, documentadas no `.env.example`. Nenhum segredo entra pelo chat nem no Git. As que faltam são do proprietário (seção 2).
