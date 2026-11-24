# Teste das telas no site no ar (24/11/2026, só leitura)

> **Origem:** relatório enviado pelo proprietário em 24/11/2026, à noite, para entrar no repositório. O teste foi feito no
> domínio de homologação (`ora5g.com.br`), com a conta Dono de teste na loja Santa Cândida (teste), por volta das 18:39 às
> 18:58. O texto abaixo é o do relatório, com as tabelas refeitas em Markdown (o texto chegou sem a formatação). A triagem de
> cada ponto (o que é defeito de código, o que é dado ou decisão, e em que lote entra) fica na fila integral
> (`docs/alinhamento/FILA_INTEGRAL_2026-11-23.md`); a coluna **Situação** continua sendo a do relatório.
>
> **Nota do Claude Code (24/11, 20:00):** os 31 erros 500 e os 57014 (tempo esgotado) do banco registrados entre 18:46 e
> 18:50 coincidem com a rajada deste teste (cerca de 40 telas pedidas juntas); uma a uma, as mesmas leituras levam de 9 a
> 460 ms no banco (medido depois, numa sessão de teste desfeita).

As 34 telas do menu, mais de 30 subtelas, a vitrine e o login abrem sem erro, sem imagem quebrada e sem estourar a largura no celular. Os problemas estão no desempenho sob carga, na vitrine pública e em detalhes de formulário e acabamento.

São 18 pontos a corrigir (2 de gravidade alta, 9 média, 7 baixa) e 5 a verificar. Os cinco mais urgentes:

1. A1 e A2: o servidor dá erro e leva de 5 a 25 s por tela quando várias telas são pedidas juntas.
2. M5: a vitrine mostra as lojas de teste como lojas de retirada.
3. M4: faltam cabeçalhos de segurança no site inteiro.
4. M3: Clientes › Novo exige telefone, mas o texto promete CPF/CNPJ ou telefone.
5. M1: Cadastro de produtos pesa 2,35 MB por tela e Catálogo 1,1 MB.

## Como testei

Usei o seu login (Dono de teste, loja Santa Cândida (teste)) e só leitura: nenhum formulário foi enviado e nenhum dado foi criado, alterado ou apagado.

Em cada tela conferi se carrega sem erro, se há texto quebrado ("undefined", "NaN"), imagem quebrada, tempo de resposta, estouro de largura em 390 px (celular) e rótulos de campos e botões. Passei por 34 telas do menu e da conta, mais de 30 subtelas, abas e filtros, 145 links internos, 16 exportações (só o status e o nome do arquivo, sem salvar nada), a vitrine /loja, o login e a página 404. Usei também a busca (Vender, Estoque e vitrine), a troca de loja, o sino, o menu da conta, o menu lateral e a ampliação de foto.

Efeito colateral: a tela Saúde da operação mostra um alerta de erro enviado às 18:48, no mesmo horário da rajada de testes. Se chegou um aviso de "Erro no servidor do site" no celular, foi desse teste.

## Problemas encontrados

Em ordem de gravidade. Troque a coluna Situação conforme for corrigindo.

### Alta

| # | Tela | O que acontece e como reproduzir | Correção sugerida | Situação |
|---|---|---|---|---|
| A1 | Várias (vistas: Financeiro, Funil › oportunidade, Relatórios › Anúncios) | Pedindo cerca de 40 telas ao mesmo tempo e depois 6 por vez, a tela Saúde da operação registrou 6 erros do servidor (Financeiro 3, oportunidade do Funil 2, Anúncios 1) e uma oportunidade respondeu HTTP 500. As mesmas telas abrem normalmente uma a uma. Houve uma publicação (build das 18:57) durante o teste, então vale repetir. | Ler o erro de cada ocorrência na própria tela Saúde da operação; conferir o limite de conexões do banco e de processos do servidor; repetir com teste de carga de uns 10 usuários juntos. | A corrigir |
| A2 | Início, Produtos, Relatórios, Financeiro | Com 6 pedidos ao mesmo tempo as telas levaram de 5 a 25 s (Início de 7 dias 25 s, Produtos 20 s, Financeiro e Relatórios 18 s). Uma a uma levam de 0,8 a 2,5 s. | Guardar em cache as consultas pesadas de Início, Relatórios e Financeiro; revisar consultas e índices; está ligado ao A1. | A corrigir |

### Média

| # | Tela | O que acontece e como reproduzir | Correção sugerida | Situação |
|---|---|---|---|---|
| M1 | Cadastro de produtos, Catálogo e fotos, Relatórios | /produtos entrega 2,35 MB de HTML com 1.340 campos de formulário; /catalogo entrega 1,1 MB, com um campo de arquivo por produto; /relatorios entrega 470 KB. | Paginar a lista; montar o formulário de edição só ao abrir Editar; criar o campo de foto sob demanda. | A corrigir |
| M2 | Catálogo e fotos | Mostra só os 200 primeiros produtos ("use a busca"), sem página seguinte, num catálogo com mais de 2.000 itens. | Paginação ou botão Carregar mais. | A corrigir |
| M3 | Clientes › Novo cliente | O texto diz "nome e CPF/CNPJ ou telefone", mas o campo telefone é obrigatório e o CPF/CNPJ é opcional: quem só tem CPF não consegue cadastrar. Visto no formulário, sem enviar. | Exigir um dos dois (telefone ou documento) e ajustar a mensagem de erro. | A corrigir |
| M4 | Site inteiro | As respostas não trazem cabeçalhos de segurança (Strict-Transport-Security, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) e o servidor se identifica como Apache. Conferido em /entrar e /loja. | Incluir os cabeçalhos no Apache ou no Next, começando pelo HSTS. | A corrigir |
| M5 | Loja online | Na página do produto, as lojas de retirada mostradas ao cliente são "Santa Cândida (teste)" e "Loja de teste 2". | Esconder lojas de teste da vitrine (ou marcar como não pública). | A corrigir |
| M6 | Loja online | Todas as páginas têm noindex e nofollow e a descrição "Plataforma de gestão integrada da Ora 5G"; todo produto tem o mesmo título ("Produto · Loja online Ora 5G"); não há og:title nem canonical; /robots.txt e /sitemap.xml dão 404. | Antes de abrir ao público: liberar a indexação, descrição e título por produto, og:image, robots.txt e sitemap. | A corrigir |
| M7 | Loja online | Dos 60 produtos da primeira página, os 60 estão "Sem estoque" (634 no total). O Galaxy A15 128 GB (2 unidades em Estoque) não aparece na busca da vitrine. | Mostrar primeiro o que tem estoque; conferir se "publicar online" está ligado nesse produto. | A corrigir |
| M8 | Auditoria | Exportar o registro leva de 12 a 16 s para começar (CSV 16,5 s, Excel 12 s); os outros exportes respondem em menos de 3 s. | Exportar em segundo plano ou por período; índice por data. | A corrigir |
| M9 | Lojas da rede | 14 das 15 lojas têm cadastro incompleto e aparecem como "não vende: falta o CNPJ" (na Água Verde, por exemplo, telefone, endereço e horário também estão em branco). Não é erro de código, mas impede a venda. | Preencher CNPJ e dados das lojas reais. | A corrigir |

### Baixa

| # | Tela | O que acontece e como reproduzir | Correção sugerida | Situação |
|---|---|---|---|---|
| B1 | Menu lateral aberto | Em tela de 721 px de altura aparecem cerca de 8 dos 35 itens; a barra de rolagem é oculta e o bloco do usuário cobre o último item visível. | Mostrar a barra ou um degradê de rolagem; recolher por grupos. | A corrigir |
| B2 | Filtros de loja | Relatórios, Financeiro e Início listam 13 lojas; Previsão e Contas a pagar listam 15 (com "Assistência (teste)" e "DEFEITOS"). "Rede inteira" é o primeiro botão em umas telas e o último no Financeiro. | Usar a mesma lista e a mesma ordem em todas. | A corrigir |
| B3 | Trocar de loja, Minha conta, Avisos, Senha, Funil | Sem título principal (h1) nas quatro primeiras; a aba do Funil se chama "Funil" e o menu diz "Funil de oportunidades". | Um h1 por tela; título da aba igual ao do menu. | A corrigir |
| B4 | Lojas da rede | 15 campos "vigência" (data e hora) sem rótulo para leitor de tela. | Colocar rótulo ou aria-label. | A corrigir |
| B5 | Celular (390 px) | Alvos de toque menores que 32 px: Relatórios 43, Lojas 16, Conciliação 12, Recebíveis 12. | Aumentar a área de toque para pelo menos 40 px. | A corrigir |
| B6 | Login | A tela pública mostra versão, commit e hora da publicação ("v0.1.0 · 5fc91b6 · build 24/11/2026 18:57"). | Mostrar só dentro do sistema. | A corrigir |
| B7 | Catálogo e fotos | Cada linha repete o nome do produto (título e "SKU · nome"). | Deixar só o SKU abaixo do título. | A corrigir |

### Para verificar

Não consegui confirmar sem gravar dados ou sem acesso.

| # | Tela | O que verificar |
|---|---|---|
| V1 | Vender | O botão Adicionar aparece mesmo com "0 livre(s) aqui". Confirmar se a venda bloqueia item sem estoque. |
| V2 | Metas | O campo "motivo" não é obrigatório no formulário de metas, ao contrário dos outros. Confirmar se o servidor exige. |
| V3 | Entregas do projeto | 84 links de roteiro de aceite apontam para o repositório no GitHub; não consegui abrir um deles daqui. Se o repositório for privado, só quem tem acesso lê. |
| V4 | Vendas › Pendências | A venda nº 4 está aberta desde 17/11 às 12:41 (sete dias). Confirmar se é teste esquecido. |
| V5 | Início | O primeiro clique no seletor "Loja do turno", logo após a tela carregar, não abriu a troca de loja; o segundo funcionou. Não consegui repetir. |

## O que o Claude Code já tinha feito

Comparei o relatório com o repositório (oraconect5g-boop/sistema-ora5g, público), os commits de hoje até o 5fc91b6 (18:57), a lista de pendências do proprietário e o documento de desempenho. O ora5g.com.br é a homologação: o .htaccess diz que ele mostra a plataforma "temporariamente" e a produção ainda não existe. Por isso vários pontos abaixo são itens conhecidos ou de "ir para a produção", não defeitos novos.

| # | O que o repositório mostra | Classificação agora |
|---|---|---|
| A1 | Já registrado no J2-b (19/11): quatro pessoas abrindo umas 20 telas em um minuto levaram o banco de teste (plano Micro, processador compartilhado) a erro 500 em 6 leituras. O aviso "Erro no servidor do site" no celular é o QUAL-006a, no ar desde a manhã de hoje. O último commit (PAY-014b) foi publicado às 18:57, então erros depois dessa hora podem ser a reinicialização. | Conhecido. Depende da decisão H da lista do proprietário (banco com processador próprio na produção). |
| A2 | O documento de desempenho (VEL-a a VEL-i) mediu uma tela por vez: de 0,4 a 0,9 s. A frente de velocidade parou em 20/11 a pedido do proprietário ("funcionalidades antes da velocidade"). Os meus 5 a 25 s foram só com pedidos juntos. | Conhecido e adiado por decisão do proprietário. |
| M1, M2 | Nada no repositório sobre o tamanho do HTML de Produtos, Catálogo e Relatórios (o orçamento mede só o JavaScript, até 200 KB) nem sobre o limite de 200 produtos do Catálogo. | Novos. Entram na frente de velocidade quando ela for retomada. |
| M3 | Decisão de 12/11: cadastro rápido do cliente com nome e WhatsApp, e-mail opcional. O telefone obrigatório é a regra; só o texto "ou CPF/CNPJ" está errado. | Baixa: trocar o texto da tela. |
| M4 | O .htaccess só redireciona para HTTPS e repassa para a plataforma; não há cabeçalho de segurança nem lote para isso nos documentos que li. | Novo, para fazer antes da produção. |
| M5, M7 | As duas lojas de teste têm CNPJ de mentira e por isso são as únicas que "vendem"; as lojas de verdade não têm CNPJ e por isso os 634 acessórios do site aparecem "Sem estoque" (B1 e B2 da lista). O lote ONLINE-f já põe os disponíveis primeiro e pagina de 60 em 60. Aparelhos só entram com o IMEI, por isso o Galaxy A15 não está na vitrine. | Não é defeito. Some quando as lojas de verdade tiverem CNPJ; nessa hora, tirar as lojas de teste da vitrine. |
| M6, B6 | Plataforma em homologação no domínio principal: noindex e a versão na tela de entrada são esperados agora. | Esperado. Vai para a lista de produção (indexação, título por produto, robots.txt, sitemap, esconder a versão). |
| M8, B1 a B5, B7 | Nenhum lote ou nota trata desses pontos. | Continuam como estão. |
| M9 | É o B2 da lista do proprietário. A Butiatuvinha ganhou o endereço hoje, às 17:41, mas o CNPJ dela esperava o estoque novo (decisão D-054). As outras 10 lojas de verdade seguem sem CNPJ, endereço, telefone e horário. | Em andamento. Gravados em 24/11, 19:19: endereço e horário (9h às 21h, todos os dias) da Butiatuvinha, Água Verde e Almirante Tamandaré. O CNPJ não grava (ver o achado abaixo). Faltam o telefone e os endereços de Santa Felicidade, São Braz e Campo Comprido, que não batem com os nomes das lojas do sistema. |
| V3 | O repositório é público e os roteiros de aceite abrem sem login. | Fechado. |

O Claude Code também publicou hoje o que o meu teste não cobriu: a tela Depósitos das maquininhas (FIN-006a; abre sem erro, em /pagamentos/depositos), a taxa das financeiras no resultado do mês (FIN-002a), o Pix pelo site pela Asaas, desligado até a chave de teste (PAY-014a e PAY-014b), a vitrine nova com o catálogo inteiro (ONLINE-f e ONLINE-g) e o endereço da loja na página do produto (ONLINE-h).

**Achado novo ao gravar as lojas:** em Lojas da rede, o sistema recusa o CNPJ da Butiatuvinha com "Este CNPJ não é da empresa escolhida", porque a empresa Ora 5G está cadastrada com raiz de teste (11.222.333) e só aceita filiais dessa raiz. A mensagem aparece no topo da página, fora da vista de quem salva num cartão mais abaixo, e o formulário se esvazia, então parece que salvou e não salvou. Para usar um CNPJ real, o Claude Code precisa trocar a raiz da empresa e decidir se o mesmo CNPJ completo pode repetir em várias lojas.

## Resultado por tela

Todas as telas abrem com o login, sem imagem quebrada, sem "undefined" ou "NaN" no texto e sem estourar a largura em 390 px. Sem login, o acesso vai para a tela de entrada. A coluna Ver aponta para os problemas da tabela acima.

| Área | Testado | Resultado | Ver |
|---|---|---|---|
| Início | Início (Hoje, 7 e 30 dias, 13 lojas), sino, menu da conta, menu lateral, troca de loja | OK | A2, B1, B2, V5 |
| Vender | Vender e busca (a lista traz as fotos) | OK | V1 |
| Vendas | Vendas (5 filtros), Reservas do site, Caixa | OK | V4 |
| Ora Connect | Ora Connect, Conciliação | OK | |
| Assistência | Assistência, 4 abas, Relatórios | OK | |
| Clientes | Clientes, Novo, Duplicados, Segmentos | OK | M3 |
| Funil | Funil, Minhas, Agenda, oportunidade | OK (500 uma vez sob carga) | A1, B3 |
| Estoque | Saldo e busca, Painel, Conferência, Entrada, Pedidos, Inventário | OK | |
| Transferências | Transferências, Nova remessa | OK | |
| Catálogo | Catálogo e fotos, Fotos em lote, ampliar foto | OK | M1, M2, B7 |
| Cadastro | Produtos, Importar planilha | OK | M1 |
| Financeiro | Financeiro (4 visões), Resultado do mês, Previsão de caixa, Contas a pagar | OK | A2, B2 |
| Relatórios | Relatórios, Canais, Marketplaces, Anúncios | OK | A1, M1 |
| Metas | Metas, Bônus, Fechamento | OK | V2 |
| Pagamentos | Conciliação, Recebíveis, Financeiras, Maquininhas, Extratos | OK | B5 |
| Notas | Notas fiscais, Conciliação das notas | OK | |
| Gestão | Aprovações, Saúde da operação, Entregas, Auditoria, Equipe, Lojas | OK | M8, M9, B4, V3 |
| Conta | Trocar de loja, Minha conta, Avisos, Trocar senha | OK | B3 |
| Público | Loja online (busca, categoria, produto, carrinho, pedido), Entrar, página 404 | OK | M4, M5, M6, M7, B6 |
| Exportações | 16 links de CSV e Excel | OK, com nome de arquivo | M8 |

## Não testado e próximos passos

Não executei nenhuma função que grava dados, porque a auditoria não pode ser apagada e há lojas reais cadastradas. Ficaram de fora:

- Criar cliente, produto e venda; lançar suprimento, sangria e saída de caixa; fechar caixa.
- Lançar, pagar ou desativar conta a pagar; entrada de mercadoria, inventário, pedidos de compra e transferências.
- Salvar metas, regras de bônus e fechamento; convidar pessoa e incluir ou encerrar acesso; salvar ou inativar loja; cadastrar maquininha.
- Conciliar, corrigir ou desfazer pagamentos; aprovar descontos; emitir nota fiscal; importar planilha; reservar na vitrine.
- Trocar senha, avisos no celular e Sair.

Também não baixei os arquivos das exportações, não abri a impressão em PDF e não testei em celular físico nem em outros navegadores (o celular foi simulado com 390 px de largura).

Próximos passos: repetir A1 e A2 com um teste de carga depois da correção, e rodar os testes que gravam dados só nas lojas de teste, com a sua autorização.
