# Revisão do front-end e novo visual da demonstração

**Data:** 07/11/2026 · **Programador:** Claude Code · **Revisor:** Codex · **Branch:** `feature/ORA-008-frontend-moderno`
**Pedido do proprietário:** melhorar o layout (mais completo, robusto e bonito, com gráficos), revisar todas as funcionalidades do front-end e desenvolver na demonstração as funções planejadas. Gerente, gestor e diretor veem todos os vendedores; o vendedor vê só os próprios números e pode trabalhar em mais de uma loja.
**Stack mantida:** TypeScript, React/Next.js, Tailwind, Node.js. Nenhuma dependência nova (os gráficos são HTML + SVG próprios).

Tudo continua sendo **demonstração com dados fictícios**: nada é gravado, nenhum pagamento é cobrado, e o selo "Demonstração · dados fictícios · nada é gravado" fica fixo no topo de todas as telas. Em produção (`APP_ENV=producao`) a demonstração não existe (teste E2E).

## 1. O que mudou para quem usa

| Área | Antes | Agora |
|---|---|---|
| Estrutura | Menu lateral simples e faixa laranja grande | Menu por grupos (Operação, Gestão, Clientes e catálogo, Administração); barra superior com **loja da sessão**, **sino de avisos** e **menu do perfil**; selo de demonstração fino e fixo |
| Celular | Barra inferior; o "Mais" ficava aberto por cima da tela nova | Barra inferior com até 4 atalhos e um painel "Mais" que fecha ao trocar de tela, com Esc ou tocando fora |
| Gráficos | Nenhum (só barras de progresso) | Colunas, linhas com meta, ranking com marca de meta, partes de um todo, medidor de meta e minitendência nos indicadores. Cada gráfico tem dica ao passar o dedo ou mouse e "Ver dados em tabela" |
| Telas | 12 | 17 telas + escolha de perfil: entram **Vendas**, **Produtos e preços**, **Relatórios** e **Auditoria**, e o perfil **Técnico** |
| Entrada | Cartão simples | Tela dividida, com botão de ver a senha e explicação de "Esqueci minha senha" |
| Robustez | Sem 404, sem tela de erro, sem carregamento | Página 404 em português, tela de erro com "Tentar de novo" (o menu continua), esqueleto de carregamento e ícone do site |

## 2. Quem vê o quê (decidido no servidor, num lugar só)

As regras ficam em `apps/plataforma/src/demo/consultas.ts`, com testes em `consultas.test.ts`. A tela recebe do servidor só o que o perfil pode ver.

| Perfil | Loja da sessão | Vendas | Vendedores e metas | Custo e margem |
|---|---|---|---|---|
| Vendedor | Escolhe entre as lojas em que tem vínculo (na demonstração: Santa Cândida e Loja 03). Se o turno de uma acabou e o da outra começou, o início sugere a troca | Só as próprias, na loja da sessão, mais o **total** da loja | Só os próprios números (ranking aguarda P3) e a produção somada das duas lojas, separada por loja | Não vê; só "dentro do limite" ou "precisa de aprovação" |
| Gerente | A loja dele | Todos os vendedores da loja | Todos os vendedores da loja | Vê |
| Dono / diretoria | Rede inteira ou qualquer loja | Todas (ou da loja escolhida) | Todos | Vê |
| Administrador | Rede inteira ou qualquer loja | Leitura | Não acessa metas | Vê; não vende nem aprova |
| Técnico | Assistência | Não vê | Não vê | Não vê. Só as OS dele (login próprio depende da decisão **P5**) |

A loja da sessão é validada contra os vínculos do perfil: cookie forjado ou endereço digitado com loja sem vínculo volta para a loja padrão. O retorno da troca de loja só aceita caminhos da própria demonstração (teste contra redirecionamento aberto).

## 3. Funções planejadas que agora aparecem na demonstração

- **Venda (PDV):** busca por nome, marca, SKU, código de barras ou final do IMEI; escolha do IMEI ou digitação com conferência do dígito verificador; chip + ativação, portabilidade e recarga com valor; desconto com regra de margem; pedido de aprovação com motivo, resposta simulada e cancelamento automático se o carrinho mudar; pagamento misto com troco e financeira; confirmação antes de concluir; comprovante com impressão; produção do vendedor; pedido de nota. Dono olhando a rede escolhe a loja antes de vender.
- **Vendas do dia:** filtros por situação, vendedor (gestão) e busca; detalhes de itens, pagamento, pedido pendente e margem (gestão); exportar CSV.
- **Estoque:** abas Aparelhos (IMEI com histórico de movimentos), Acessórios e chips (estoque mínimo), Transferências e Conferência; vendedor consulta outras lojas só pela quantidade.
- **Produtos e preços:** catálogo com estoque, custo e margem (gestão), histórico de preço; só o dono altera preço, com motivo.
- **Aprovações:** fila com filtro; aprovar ou negar com confirmação; negar exige justificativa; contadores atualizam.
- **Clientes:** busca exata por telefone ou CPF (CPF com dígito verificador), ficha 360 (compras, OS, consentimento), conversas com sugestão de IA supervisionada e resposta que fica só na tela, funil de oportunidades.
- **Ora Connect, Assistência, Metas, Caixa e financeiro, Relatórios (7, 14 e 30 dias), Canais, Lojas e usuários (com a matriz de permissões do ADR-002 e bloquear/desbloquear), Importação da Rein (envio ao dono e aprovação) e Auditoria (linha do tempo filtrável).**

## 4. Defeitos encontrados na revisão e corrigidos

| # | Defeito | Correção e prova |
|---|---|---|
| FE-01 / **REV-015** | Desconto maior que o item (ex.: R$ 100,00 numa capa de R$ 79,00) derrubava a tela; o mesmo acontecia ao diminuir a quantidade de um item com desconto | Itens inválidos não entram no total; o erro aparece no campo; o carrinho é mantido; concluir fica bloqueado; a venda se recupera ao corrigir. O domínio continua rejeitando (sem truncar o desconto). E2E com formatos intermediários (`1,`, `abc`, `-5`, `10,999`, `1.0.0`, `R$`) no celular e no computador |
| FE-02 | O "Mais" do celular continuava aberto por cima da tela nova depois de navegar | Painel fecha ao trocar de tela (E2E) |
| FE-03 | Margem com ponto decimal ("18.5%") na venda do gerente e nas aprovações | Formatação brasileira centralizada em `src/lib/formato.ts` (testes) |
| FE-04 | Depois de "Pedir aprovação", a venda ficava presa sem volta | Resposta simulada, cancelamento do pedido e invalidação quando o carrinho ou o meio de pagamento mudam (E2E) |
| FE-05 | A fila tinha um desconto (Moto G85, R$ 120 no Pix) que estava **dentro** do limite e não precisava de aprovação | Dado corrigido; teste garante que todo desconto da fila passa mesmo do limite e que as vendas fictícias obedecem às regras do domínio |
| FE-06 | Textos de atenção em laranja `#ED9B37` sobre branco (contraste 2,3:1) | Âmbar escuro `#B45309` (cerca de 5:1). Paleta dos gráficos validada para daltonismo |
| FE-07 | "Vendas por canal" pintava uma fatia normal com a cor de alerta | Gráficos usam cor de identidade; cor de alerta só para situação, sempre com texto |
| FE-08 | No celular, a lista de lojas abria para fora da tela, e o conteúdo cobria os menus do topo (loja, avisos e perfil não recebiam o toque) | Menus suspensos ocupam a largura da tela no celular e ficam acima do conteúdo (E2E) |
| FE-09 | Todas as telas tinham o mesmo título na aba do navegador | Título por tela |
| FE-10 | Tabelas largas obrigavam rolagem lateral no celular | Listas responsivas; teste confere "sem rolagem lateral" em todas as telas de todos os perfis |
| FE-11 | Início do vendedor dizia sempre "Bom dia" | Saudação pelo horário de São Paulo |
| FE-12 | Página inicial mostrava o ambiente sem acento ("homologacao") | "homologação" |
| FE-13 | Texto fixo "33 testes de permissão" desatualizado | Texto sem número que envelhece |
| FE-14 | Servidor auxiliar dos testes deixava o Next vivo na porta 3199 (achado do Codex) | Encerra o grupo de processos e espera a porta liberar |

## 5. Limites que continuam (não são produto real)

- Tudo é estado do navegador: aprovar, negar, alterar preço, bloquear usuário, cadastrar cliente e abrir OS não gravam nada.
- A aprovação do desconto é **simulada** na própria venda. No sistema real o gerente decide no celular dele, autenticado.
- A avaliação do desconto ainda roda no navegador com o custo dos dados fictícios (já registrado no REV-013). No sistema real o servidor avalia e devolve ao vendedor só a situação.
- Os números são gerados com semente fixa: os mesmos em todas as telas e testes. Os rótulos de data usam o dia real.
- O perfil Técnico é uma opção para a decisão P5; ranking para vendedor continua bloqueado pela P3.

## 6. Testes desta entrega

- Unidade (aplicação): 52 testes. Visibilidade por perfil, coerência dos dados fictícios com o domínio, formatação brasileira e eixos dos gráficos.
- Domínio: `cpfValido` e `normalizarTelefone` novos, com testes (busca exata de cliente).
- E2E: 66 passaram e 6 pulados de propósito (casos que rodam só no celular ou só no computador). Celular de 360 px e computador; todas as telas dos 5 perfis, sem erro de JavaScript e sem rolagem lateral; REV-015; venda completa; IMEI digitado; aprovação; pagamento misto; atalhos; busca exata e cadastro; vendedor × gerente; troca de loja e cookie forjado; menu "Mais"; aprovar e negar; dono escolhendo a loja; orçamento do técnico; exportação CSV; senha visível; 404.
