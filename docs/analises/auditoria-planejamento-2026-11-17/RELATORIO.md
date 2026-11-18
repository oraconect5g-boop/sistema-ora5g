# Ora 5G — auditoria do planejamento, código, publicação e Supabase

> **Publicação integral solicitada pelo proprietário após a entrega da auditoria.** Este documento preserva o corte de 17/11/2026, commit `03123d0`; não representa uma nova auditoria dos commits posteriores. O bloqueio inicial de divulgação foi seguido de autorização expressa para adicionar os materiais completos ao GitHub. Planilha original e credenciais continuam fora do pacote.

**Data:** 17/11/2026. Horários de apresentação: Brasília. **Revisão somente leitura da aplicação e do banco.** Relatório entregue ao proprietário e preparado para publicação integral por solicitação expressa posterior. A tentativa inicial foi bloqueada pela revisão automática por conter informações operacionais em repositório público.

## Resultado

O sistema avançou em código real, correções e publicação, mas **não está completo nem operacionalmente homologado**. Não é correto dizer que tudo continua apenas na demonstração. Também não é correto considerar uma tela, um teste unitário ou uma variável no `.env.example` como integração funcionando.

O corte final é [03123d0 — REIN-a](https://github.com/oraconect5g-boop/sistema-ora5g/commit/03123d042f0d51493a17eec449967a5a48124a59), presente na `main` e confirmado no domínio em `/saude/versao`. O build informado é **17/11 às 14:40:45**, ambiente **homologacao**. A primeira bateria local foi executada sobre `e603531` (TRF-a); depois foram incorporados e examinados os 18 arquivos do lote REIN-a. Não foram considerados concluídos trabalhos locais do Claude que ainda não chegaram ao GitHub.

Os 179 requisitos foram cruzados individualmente com `backlog.json`, `status-requisitos.json`, checkpoint, fontes e resultados. A classificação declarada pelo projeto é:

| Estado | Quantidade | Interpretação correta |
|---|---:|---|
| Testado | 63 | Implementação com testes registrados; vários ainda têm condições de configuração, revisão ou aceite em aberto |
| Parcial | 69 | Parte do requisito implementada |
| Não iniciado | 42 | Sem implementação registrada para o requisito integral |
| Bloqueado | 3 | Dependências explicitamente registradas |
| Respeitado | 2 | Regras de arquitetura/segurança cumpridas; não são duas funcionalidades comerciais |
| Homologado | 0 | Nenhum requisito marcado como homologado no checkpoint |
| **Total** | **179** | **Não equivale a 63 funções prontas para operar** |

Há **138 entradas explícitas** no arquivo de status. Outros **41 IDs ausentes** recebem o padrão `nao_iniciado`, e um ID está explicitamente nesse estado. A matriz desta auditoria inclui os 179, sem deixar essas ausências desaparecerem da contagem. Os pedidos adicionais da conversa são critérios complementares; não foram artificialmente somados como requisitos já entregues.

## 1. Escopo e limites da verificação

- GitHub: inventário de 1.202 arquivos no primeiro corte, mais o documento novo REIN-a no segundo, totalizando **1.203 arquivos versionados**. Foram disponibilizados localmente e verificados por SHA de blob **1.191 arquivos**; 12 binários visuais históricos ficaram inventariados, sem nova inspeção visual. O primeiro corte contém 195 diretórios com arquivos. Foram examinados os deltas de 57 commits desde `89927dc` e mais três commits do REIN-a, além dos fluxos críticos e dos relatórios anteriores.
- Planejamento: backlog completo, documentos centrais, ADRs, pedidos/reconciliações de revisão, status, roteiros de aceite, integrações, configuração, operação e adendo A01–A20 do PR #100. A matriz preserva o texto de cada requisito, aceite e evidência declarada para permitir conferência independente.
- Supabase: projeto conectado, migrations, catálogo de **365 funções** e **101 relações**, RLS/permissões, contagens sem ler cadastros pessoais, lojas, saldo agregado, Storage, rotinas agendadas, advisors e logs agregados. Nenhuma carga, migração ou alteração de conta foi executada nesta auditoria.
- Publicação: consultas HTTP ao domínio; código de publicação e CI; sem SSH e sem ler `.env`, conforme AGENTS.md. Não é possível afirmar a presença de todas as credenciais da VPS por meio do GitHub ou do catálogo do banco.
- Testes: CI da versão exata, bateria local de unidades/integração e provas adicionais com o arquivo original e com transferência. Não houve sessão autenticada no navegador como vendedor/gerente/dono nem ativação/pagamento real em fornecedor externo.
- O link privado do projeto ChatGPT não fornece o histórico completo ao ambiente. As decisões usadas são as mensagens disponíveis nesta conversa, os anexos locais e a documentação versionada; não foi inventado conteúdo de conversas inacessíveis.

Este é um cruzamento de escopo com evidências, leitura dirigida dos fluxos e testes. Não é certificação de ausência de bugs nem alegação de leitura humana linha a linha de todos os binários e de toda a história Git.

## 2. O que foi feito hoje

| Lote | Avanço verificado | O que não comprova sozinho |
|---|---|---|
| VEL-a | Sessão com `getClaims` e RPC que reúne contexto; leitura do PDV reduzida; estados de carregamento e envio | Latência aceitável no celular/rede da loja e aceite do fluxo completo |
| ONLINE-c | Tratamento da loja pública sem retornar 500 para produto/loja indisponível | Checkout, pagamento online ou produtos publicados |
| ROT-a | Expiração de reservas e limpeza agendadas no banco | Todas as rotinas externas de marketplaces/WhatsApp funcionando |
| INTEG-c | Correções de identidade fiscal legada (#101) e cota concorrente de reserva (#102) | Emissão fiscal oficial e homologação externa |
| BANCO-a | Ajustes de índices e fechamento de tabelas privadas | Ausência absoluta de risco ou necessidade de apagar índices pouco usados |
| ENTREGAS-a | Link Comprar no site e tela autenticada `/entregas` | Um monitor independente de cada fornecedor; a lista de entregas vem do checkpoint versionado |
| WHATS-a | Executável, regras e configuração do worker | Envio oficial: o adaptador Meta permanece ausente e o worker permanece desabilitado |
| SAUDE-a | Saúde consulta banco; venda sem pedido fiscal vira pendência; estoque mínimo vira aviso | Monitoramento externo, alerta automático e recuperação de desastre |
| GIT-a | Atualizações de dependências e classificação de issues | Todos os alertas de dependências resolvidos ou todos os requisitos entregues |
| ORG-a | Cadastro operacional sem CNPJ e inclusão das 11 lojas + DEFEITOS | Autorização para vender sem dados fiscais; a trava de venda permanece |
| PWA-a | Manifesto, ícones, instalação e página sem conexão | Venda offline, sincronização de operações e push real |
| TRF-a | Remessa com vários produtos, envio agrupado e idempotência | Estoque real carregado ou reserva no instante da solicitação |
| REIN-a | XLSX maior e células extensas; prévias divididas em partes | Importação integral validada: foi reproduzido um defeito no rodapé do arquivo original |

Portanto, o Claude está **corrigindo código existente e acrescentando funções reais**. O principal problema é a distância entre esses lotes técnicos e as jornadas com dados, contas, contratos externos e validação no domínio.

## 3. Lojas: agora existem, mas falta a base operacional

As 12 unidades confirmadas foram criadas no Supabase em **17/11 às 13:02:43**:

| Local | Cadastro atual | Estoque carregado |
|---|---|---|
| Santa Felicidade | Ativo | Não |
| Água Verde | Ativo | Não |
| Colônia | Ativo | Não |
| Almirante Tamandaré | Ativo | Não |
| Dubai | Ativo | Não |
| Colombo | Ativo | Não |
| Muffato Santa | Ativo | Não |
| Butiatuvinha | Ativo | Não |
| Ventania | Ativo | Não |
| Balneário | Ativo | Não |
| Santa Cândida | Ativo | Não |
| DEFEITOS | Ativo, local de exceção que não vende | Não |

Todos esses locais ainda estão sem CNPJ/endereço/UF cadastrados. DEFEITOS não deve ser transformado em loja de venda. As lojas físicas sem CNPJ são protegidas por validação no banco antes da venda/reserva de venda. O cadastro operacional permite preparar estoque e transferência sem fabricar dados fiscais.

O banco tem **15 unidades**, porque permanecem também Santa Cândida (teste), Loja de teste 2 e Assistência (teste). São registros distintos, com códigos distintos; isso não prova duplicação por merge. Porém, Santa Cândida e Santa Cândida (teste) podem confundir seleção, filtros e leitura de indicadores. Tratar os dados de teste com identificação e política explícita, preservando o histórico transacional; não apagar tabelas para resolver a confusão.

Há apenas um usuário/perfil/vínculo ativo, de dono com escopo da organização. As contas de vendedor e gerente solicitadas não estão provisionadas. O acesso de dono, em princípio, alcança as unidades pela política e pelas telas `/lojas` e `/escolher-loja`; a efetiva exibição na sessão do proprietário não foi testada nesta auditoria.

Na demonstração, `src/demo/dados/organizacao.ts` ainda gera **Loja 02…Loja 11**. `app/demo/_paineis/OutrosPaineis.tsx:51` ainda orienta cadastrar “13 lojas restantes” e diz que a lista está pendente. Isso é divergência concreta da decisão atual de 11 lojas comerciais + DEFEITOS.

## 4. Planilha e estoque: causa confirmada da ausência

O arquivo `relatorioProdutos131258.xlsx` já foi entregue pelo proprietário. As três cópias locais são idênticas: 688.738 bytes, SHA-256 `76f9cf33198de7205c01dc8ec78dea70fcf86c17847f9faea6356f0c8e612c06`. Há **2.271 produtos, 83 colunas, 12 locais**, com físico e disponível em colunas separadas. A posição é **10/11/2026 às 13:20**, não o saldo atual em 17/11 sem conciliação.

No Supabase foram encontrados **zero registros de importação, zero entradas e zero transferências**. Os seis produtos/seis variantes existentes e os saldos de teste não correspondem à carga do arquivo. Somente duas lojas de teste têm saldo, somando 67 unidades físicas; os 12 locais confirmados têm zero linhas de saldo.

### Defeito F01 — o rodapé continua entrando como produto

**Prioridade alta; reproduzido no corte 03123d0.** O REIN-a corrigiu os limites de 500 caracteres/célula e 2.000 linhas por leitura. Entretanto, `apps/plataforma/src/lib/importacao/catalogo.ts:133`, função `linhaDeTotal`, só reconhece o rodapé quando alguma célula começa por `Total`.

Na planilha original, a linha **2273** tem código e nome vazios e agregados numéricos, sem essa palavra. O leitor abre o arquivo, mas `linhaDeTotal(...)` devolve `null`. A montagem produz **2.272 linhas**, partes de **2.000 + 272**, em vez de **2.000 + 271 produtos**. A segunda prévia contém uma linha sem SKU/nome e fica sujeita à recusa por erro de cadastro. A primeira parte pode ser processada separadamente; não há evidência de importação completa.

O teste adicional com o original falhou exatamente em `expected length 2271, received 2272`; os 59 testes existentes do recorte de importação passaram. A alegação do roteiro REIN-a de que o total desse arquivo fica de fora não está comprovada.

**Correção recomendada:** reconhecer o layout real e apresentar uma exclusão explícita de rodapé na prévia, preservando linha original e justificativa. Não descartar genericamente toda linha sem código: isso esconderia defeitos de produtos. Acrescentar teste com fixture sintética fiel ao rodapé numérico e validar de novo o original fora do GitHub.

### O que ainda falta além do defeito

1. Acesso seguro do ambiente do Claude ao arquivo já fornecido. A existência no chat não implica que esteja no diretório `~/entrada/rein/` de outra máquina. Não transferir custos/estoque para o repositório público.
2. Mapeamento dos 12 locais, com normalização explícita de acentos e códigos; distinguir `Qtd.` de `Qtd. Disponivel`.
3. Prévia de estoque inicial por loja, com data de corte, reconciliação dos movimentos posteriores, chaves idempotentes por arquivo/linha/local e relatório antes/depois.
4. Tratamento de **56 células negativas** encontradas nas 24 colunas de físico/disponível. Não são necessariamente 56 produtos. Não zerar, arredondar ou importar silenciosamente como saldo positivo. Não foram encontrados códigos de produto duplicados/vazios ou nomes vazios entre os 2.271 registros de produto.
5. IMEI/ICCID individual para aparelhos/chips quando exigido. O total por produto não permite inventar os identificadores individuais.
6. Perfis para executar e aprovar a importação. O fluxo atual separa administrador que envia e dono que aprova; só o dono existe. Isso é pendência de provisionamento, não motivo para remover autorização/separação de funções sem decisão.
7. Carga final e teste na aplicação real. A capacidade de ler XLSX não executa automaticamente a entrada de estoque.

## 5. Transferências: comportamento medido

Prova local independente com a RPC de remessa, banco isolado e todas as migrations versionadas. Quantidade fictícia inicial de 10 unidades; solicitação de 2:

| Etapa | Físico na origem | Reservado | Disponível |
|---|---:|---:|---:|
| Antes | 10 | 0 | 10 |
| Solicitar remessa | 10 | 0 | 10 |
| Separar | 10 | 2 | 8 |
| Enviar | 8 | 0 | 8 |
| Repetir envio | 8 | 0 | 8 |

Os testes existentes também verificam crédito no destino ao receber. Não se reproduziu dupla baixa nesse ciclo. A solicitação ainda é um pedido; a reserva acontece ao separar. Se a intenção de “colocar em transferência” for já retirar do disponível ao confirmar a solicitação, o aceite precisa ser reconciliado com esse contrato de estados. A solução não pode diminuir o físico duas vezes nem disponibilizar o produto no destino antes do recebimento.

Remessa suporta até 30 produtos por solicitação e agrupa transferências individuais. O envio agrupado manda apenas as já separadas; as demais ficam aguardando. É necessário mostrar claramente físico, reservado, disponível e trânsito na origem/destino, inclusive cancelamento, divergência e recepção parcial.

## 6. Gráficos e funcionalidades reais por setor

Os gráficos não estão restritos à demo. O código real tem colunas de vendas/devoluções, recebimentos por meio, conciliação, caixa, margem, séries de vendas, desconto e metas. Exemplos: `app/financeiro/ConteudoFinanceiro.tsx`, `app/relatorios/ConteudoRelatorios.tsx` e componentes compartilhados em `componentes/graficos`.

O financeiro mostra um estado vazio quando não há fatos no período, em vez de desenhar dados fictícios. Filtro de data, loja de teste versus loja operacional e permissões influenciam o que aparece. Com poucos dados de teste e nenhuma carga nas lojas confirmadas, não há base para esperar gráficos equivalentes aos exemplos da demo. Isso explica um painel vazio; não comprova que toda reclamação visual esteja resolvida, pois falta teste autenticado no navegador.

| Setor | Implementado ou estruturado | Pendências decisivas |
|---|---|---|
| Organização/acesso | Lojas, vínculos, autorização no servidor/banco, auditoria, sessão e MFA parcial | Dados reais; vendedor/gerente; recuperação de senha/SMTP validada; MFA obrigatório para privilegiados; jornadas por perfil |
| Catálogo/fotos | Produtos, variantes, busca, preço/custo, campanhas, mapeamento de códigos, upload/importação assistida de fotos | Carga do catálogo real; zero fotos no banco; validação das variantes visuais e do fluxo completo |
| Estoque | Livro, saldos, reservas, IMEI/ICCID, inventário, entrada e transferências | Carga histórica conciliada; negativos; seriais; filtros e provas nas 12 unidades |
| Clientes/CRM | Nome/WhatsApp, e-mail opcional, dados fiscais, busca protegida, leads, atividades, mesclagem/segmentos | Zero clientes cadastrados; comunicação oficial, histórico omnichannel, retenção e contratos |
| PDV | Itens mistos, preço/desconto no servidor, aprovação, múltiplos pagamentos, devolução/troca | Jornada móvel real; ligações telecom; pagamentos externos; leitor/câmera e combos pendentes |
| Pagamentos/caixa | Abertura, movimentos, fechamento, maquininhas, comprovantes e conciliação manual | Checkout/gateway; extratos; taxas e prazos; estornos/chargebacks e liquidação externa |
| Financeiro | Painéis, contas a pagar, recebíveis, margem/DRE gerencial parcial, previsão, exportações | Conciliação bancária, inadimplência, taxas/impostos contratuais, origem real dos números e aceite |
| Metas/desempenho | Produção/eventos, metas e bônus mensais, fechamento e reversões | Dados operacionais; ranking/políticas pendentes; telecom confirmado; não converter em comissão por venda sem decisão |
| Fiscal | Solicitação, aprovação, destinatário preservado, armazenamento e eventos | Provedor/contador/certificado/perfis fiscais; emissão, contingência e cancelamento homologados |
| Ora Connect | Adaptador e contratos internos, fila/estados, evidência de confirmação, reconsulta/idempotência | Zero habilitações/operações; Nogle externa e repasses/recorrência/gateway completos; homologação autorizada |
| Loja online | `/loja`, Comprar, vitrine, detalhe e reserva/retirada parcial | Zero produtos publicados; carrinho, compra paga, gateway, frete/rastreio, devolução e contratação telecom |
| Marketplaces | Mapeamento de SKU pode ser reutilizado | 8 requisitos não iniciados: Mercado Livre/TikTok/Shopee, OAuth, estoque/preço, pedidos, logística e repasses |
| WhatsApp | Fila e programa de processamento preparados | Adaptador oficial ausente; worker desabilitado; templates/conta/token/webhooks e atendimento multiagente |
| Meta | Planejamento e nomes de configuração | 6 requisitos não iniciados: insights/custos, leads/UTM, conversões deduplicadas, métricas de atribuição |
| IA | Alertas básicos e regra de aprovação humana | Atendimento/qualificação, sugestões, resumos, custo/retencão e avaliação |
| Relatórios | Painéis reais por escopo, estoque/financeiro/produção e exportações | Paridade funcional/visual, dados reais, integração dos canais e jornadas por perfil |
| Qualidade/operação | CI, testes, migrations, auditoria, healthcheck, agendamento e PWA inicial | Proteção de main, observabilidade externa, restauração ensaiada, carga, piloto e operação comercial |
| Assistência | OS, custódia, orçamento/aprovação, peças e cobrança vinculada ao PDV | Conta/fluxo do técnico, avisos oficiais, prazos e homologação |

Consulte `MATRIZ_179.md` para os IDs, aceites, notas e evidências completas de cada linha.

## 7. APIs e pedidos acrescentados no caminho

**Nogle:** é sistema externo integrado via API. Código de adaptador e testes com respostas controladas não equivalem a ativação, recorrência, gateway e repasse funcionando. O banco não tem habilitações nem operações Connect. Ainda é necessário contrato verificável de cada operação, tipo de conta/escopos, credenciais no servidor, confirmação de pagamento/estado, reconciliação e teste autorizado. Nunca confirmar a venda/ativação externa apenas por clique ou retorno do navegador.

**PayJoy e Aiva:** continuam representadas pelo registro operacional/manual de financiamento. A exigência mais recente é integração por API obrigatória no resultado final. A documentação que ainda chama isso somente de evolução condicional precisa ser reconciliada. Ausência do contrato deve bloquear a chamada externa específica, sem apagar o requisito nem impedir o trabalho independente.

**J7 e QI Tech:** manter previsão explícita de extensão, com análise de parceria/API, sem inventar endpoints ou aprovação de crédito. Não há prova de integração operacional nesta revisão.

**WhatsApp:** `apps/worker/src/whatsapp/configuracao.ts:7` fixa `ADAPTADOR_DA_META_PRONTO = false`; `executar-whatsapp.ts` mantém `canal = null`. Cadastrar credenciais, sozinho, não faz o envio funcionar. O roteiro WHATS-a reconhece essa pendência. Nota por link/conversa manual não substitui envio oficial automatizado com retorno de entrega.

**Loja online:** o pedido recente de compra completa supera o limite histórico “reservar e pagar na loja” do ADR-009. A rota e o botão existem; carrinho e pagamento não. Nenhum dos seis produtos está marcado para publicar online. Mesmo ativar essa marca não basta sem preço/foto/disponibilidade e loja elegível.

**Mercado Livre, TikTok Shop e Shopee:** integração exige importação/sincronização real, IDs externos, cursor, webhook, reconciliação, taxas/repasse e controle do estoque compartilhado. Os oito requisitos MKTPL continuam não iniciados.

**Meta:** gastos/insights, leads, atribuição e Conversions API são trabalhos próprios. Não tratar Meta Ads como se fosse extrato de repasse de marketplace.

**Real e demo:** o mesmo build pode atualizar ambos, mas os fluxos e dados da demo são separados. A paridade dos nomes/novas funções não acontece automaticamente. Além disso, o código ainda devolve 404 para demo em `APP_ENV=producao`; a exigência recente de mantê-la acessível precisa de política explícita de isolamento na futura produção comercial.

## 8. Supabase: configuração, integridade e divergência com Git

- Projeto ativo e saudável, PostgreSQL 17.11. Foram encontradas **99 migrations aplicadas**, enquanto o corte Git `03123d0` contém **98**.
- A migration extra é `20261117174218_origem_das_reservas_do_site`. As funções `privado.campo_de_campanha`, `public.reservas_do_site_painel` e a alteração de `loja_reservar` correspondem a uma evolução posterior ao corte versionado. É evidência de trabalho preparado/aplicado no banco; não prova entrega integral nem publicação correspondente na aplicação.
- Comparação de corpos: **361 das 365 funções** coincidem exatamente com a última definição encontrada nas migrations; `importacao_comparar` difere apenas em espaços/quebras periféricos; as outras três correspondem ao avanço adicional acima. O método é comparação do corpo, não certificação de grants/constraints por checksum.
- Das 98 versões comuns de migration, 96 textos coincidem por MD5 bruto; `margem_painel` coincide ao aparar espaços externos; `importacao_estatisticas` foi armazenada em quatro statements, razão para não comparar a concatenação como se fosse o arquivo original. As funções afetadas foram cruzadas separadamente.
- Todas as tabelas inspecionadas em public/privado têm RLS. Nenhuma das 101 relações inspecionadas concede SELECT a anon. As 13 tabelas privadas sem policy também não concedem SELECT direto a authenticated; não são 13 vazamentos automaticamente.
- Há funções SECURITY DEFINER acessíveis para papéis do app. As cinco acessíveis a anon no catálogo consultado são as três operações públicas da loja, o helper privado de foto e `saude_do_banco`. Permissão EXECUTE não equivale a acesso irrestrito aos dados; manter revisão de escopo/validação de cada RPC. Todas as SECURITY DEFINER catalogadas têm search_path configurado.
- Proteção de senhas vazadas desativada segundo advisor. Verificar disponibilidade no plano/configuração do Auth. Não foram consultadas senhas nem dados pessoais de usuários.
- Cinco buckets privados, limite de 5 MB e tipos permitidos; zero objetos. A existência do bucket não comprova upload/entrega de foto/documento. Não foram encontradas Edge Functions; a arquitetura usa aplicação/worker, portanto zero Edge Functions não é, sozinho, defeito.
- `ora5g-reservas-vencidas` roda a cada cinco minutos; foram observadas 60 execuções bem-sucedidas até 14:40 de Brasília, sem reservas vencidas processadas. Limpeza diária está ativa às 03:30 de Brasília; ausência de primeira execução antes desse horário no ciclo seguinte não prova falha.
- Advisors de performance: um aviso de FK nas fotos e 240 índices sem uso observado. O FK das fotos compara organização e produto; já existe índice `(organizacao_id, produto_id)`, útil para igualdade nas duas colunas. Não criar/remover índices cegamente pelo linter; a base pequena explica muitos avisos de pouco uso.

**Divergência F02:** o banco de homologação avançou uma migration além da main no momento da consulta. Versionar/reconciliar essa entrega, conferir aplicação e atualizar o registro do SHA efetivamente servido. Não executar rollback destrutivo só para igualar números. A integração GitHub → Supabase não prova que toda mudança aplicada manualmente esteja versionada.

## 9. Publicação, merges e duplicidades

O domínio servia `e603531` às 14:26 e depois `03123d0` no build de 14:40. `/saude`, `/loja` e `/demo` responderam HTTP 200. Isso confirma atualização real da aplicação pública durante a auditoria. Não comprova que **cada** etapa histórica tenha sido publicada e aceita; para isso seria necessário o histórico de deploys/jornadas por lote.

A integração do Supabase aplica banco/recursos suportados. Não publica automaticamente o Next.js na VPS. O repositório tem scripts de homologação com conferência de versão e dois workflows visíveis, CI e segurança semanal; não foi identificado workflow de deploy comercial completo. O site chamado de “real” usa banco real de desenvolvimento e declara **homologacao**.

O metadado da branch informa `protected=false`; a consulta de rulesets retornou lista vazia. Assim, o CI atual passou, mas não há bloqueio técnico de branch identificado que garanta esse gate em todo merge futuro. Concluir a proteção da main conforme política combinada.

Não foi reproduzido defeito de duplicação transacional causado por merge nos fluxos testados. Pontos concretos que ainda causam duplicidade/confusão:

1. Unidades de teste coexistem com unidades operacionais, especialmente duas Santa Cândida com códigos distintos.
2. Demo e real mantêm conjuntos separados de nomes/dados; a demo ficou desatualizada.
3. Relatórios e prompts históricos estão em PRs abertos; estar aberto não significa que o Claude não leu ou não corrigiu o achado. O checkpoint registra leitura de revisões, inclusive #100. Cruzar cada achado com código, não contar issues abertas como bugs ativos.
4. Documentos e `.env.example` ainda misturam domínio/subdomínio históricos, desligamento da demo em produção e escopo antigo de checkout/financeiras.
5. `/entregas` é gerada a partir do checkpoint; o checkpoint do REIN-a ainda aponta o deploy anterior TRF-a, enquanto o endpoint da versão já mostra REIN-a. Há atraso documental de um lote, não prova de falha de deploy.
6. Migrations sucessivas redefinem funções intencionalmente. Não apagar migrations antigas por achar que são duplicadas; o catálogo final e replay de toda a sequência precisam permanecer coerentes.

## 10. Testes, bugs e riscos confirmados

[CI da versão 03123d0](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/44139567980): lint, typecheck, build, orçamento de desempenho e testes concluíram com sucesso.

| Evidência | Resultado |
|---|---|
| Testes no CI | 2.720 passaram; 1 TODO |
| E2E no CI | 293 passaram; 13 pulados |
| Bateria local em e603531 | 1.575 plataforma + 20 worker + 60 configuração + 112 domínio + 242 banco selecionados = 2.009 passaram |
| Recorte local REIN-a | 59 testes existentes passaram |
| Prova adicional: arquivo original | **1 falhou**, rodapé numérico tratado como produto |
| Prova adicional: remessa/saldos | 1 passou; solicitação não reserva, separação reserva, envio baixa uma vez |
| Audit de dependências de produção no CI | Zero vulnerabilidades reportadas |
| Audit incluindo desenvolvimento | 16 dependências vulneráveis no log CI; 17 no audit local posterior; uma advisory raiz de picomatch |

O audit local apontou [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), ReDoS em picomatch, severidade alta, propagada por dependências de desenvolvimento. Não são 17 vulnerabilidades distintas nem prova de exploração no site. A declaração “audit sem vulnerabilidades” precisa explicitar `--omit=dev`. Atualizar a cadeia de ferramentas com versões compatíveis e validar o CI, sem trocar a stack.

Nos logs agregados das 24 horas encerradas às 14:40 de Brasília, houve nove HTTP 500, em `loja_produto`/`loja_reservar`, associados temporalmente ao problema antigo P0002 e anteriores à correção ONLINE-c. O último ocorreu às 03:50:03 de Brasília; depois aparece OR036, código de tratamento esperado. Não atribuir esses eventos históricos ao código recém-publicado. Também houve recusas de permissão e uma relação inexistente; sem contexto de cada chamada não é correto classificá-las todas como falha de usuário final. Nenhum token, telefone, endereço ou conteúdo de cadastro foi coletado para essa leitura.

### Classificação dos achados atuais

| ID | Tipo/prioridade | Situação |
|---|---|---|
| F01 | Bug de importação / alta | Reproduzido com original; rodapé mantém linha inválida |
| F02 | Consistência de entrega / alta | Uma migration aplicada além do corte Git |
| F03 | Base operacional / alta | Estoque real, fotos, clientes e perfis de teste ainda ausentes |
| F04 | Integração incompleta / alta | WhatsApp permanece sem adaptador; Nogle sem operação/configuração comprovada; fiscal/gateways/canais pendentes |
| F05 | Divergência de escopo / alta | Checkout completo e APIs financeiras exigidos, mas escopo histórico ainda limita implementação |
| F06 | Divergência de UI/dados / média | Demo usa nomes genéricos e orientação de 14 lojas |
| F07 | Configuração de entrega / média | Main sem proteção/rulesets identificados; checkpoint não é prova independente de publicação |
| F08 | Dependência de desenvolvimento / média operacional | Advisory alta em picomatch; produção sem aviso no audit executado |
| F09 | Segurança/configuração / média | Proteção de senha vazada desligada; MFA privilegiado e recuperação ainda dependem de validação |
| F10 | Contrato de estoque / média | Solicitar não reduz disponível; alinhar expectativa sem quebrar contabilidade |

As correções #101 e #102 foram incorporadas e passaram nos testes locais selecionados. Não devem continuar descritas como defeitos abertos de código só porque as issues aguardam aceite/fechamento.

## 11. Ordem recomendada de conclusão

1. **Fechar base e acesso:** corrigir F01, fornecer ao ambiente executor o anexo já entregue, preparar prévia auditável da carga, resolver saldos/seriais, cadastrar dados reais das lojas e provisionar vendedor/gerente/administrador conforme papéis necessários. Concluir uma carga e jornada piloto antes de declarar o estoque resolvido.
2. **Reconciliar código/banco/domínio:** versionar a migration adicional, rodar checks da versão final, publicar etapa concluída e provar SHA + migrações + tela + efeito no banco. Corrigir nomes/avisos da demo e atualizar `/entregas` sem usá-la como atestado automático.
3. **Homologar operação central:** venda com acessórios e aparelho, pagamento misto, caixa, desconto/aprovação, transferência, cancelamento/devolução e gráficos batendo com fatos. Usar dono/gerente/vendedor e duas lojas operacionais, não somente fixtures.
4. **Concluir Nogle e fiscal prioritários:** configurações/contratos por nome, adapter, idempotência/reconsulta, confirmação oficial, repasse e recorrência; emissão/retorno/cancelamento conforme provedor fiscal. Exigir prova externa autorizada para considerar operacional.
5. **Concluir WhatsApp e financeiras:** adapter oficial Meta, templates, eventos/entrega; PayJoy/Aiva via contrato API; previsões J7/QI Tech claramente separadas. Não dizer que só faltam chaves quando falta código.
6. **Checkout e logística reais:** carrinho, pedido, gateway verificado, estoque concorrente, frete/retirada/rastreio e pós-venda. Preservar o pedido recente de compra completa.
7. **Marketplaces e Meta:** contratos/OAuth, importação, estoque/preço, pedidos, conciliação e campanhas, com a mesma fonte de estoque e sem duplicar receita.
8. **Finalizar todos os demais IDs:** assistência, CRM/omnichannel, metas/ranking, relatórios, IA supervisionada e itens de qualidade conforme matriz. Backup/restauração, segurança, carga e piloto entram nos critérios de conclusão, não apenas em documentação futura.

Cada etapa deve terminar com código + teste + configuração aplicável + publicação no domínio + prova da jornada. Dependência externa deve bloquear só o trecho que exige a API/contrato. Não encerrar o desenvolvimento por falta de uma credencial quando existem tarefas independentes executáveis.

## 12. Stack e materiais entregues

Manter **TypeScript, React/Next.js, Node.js e Supabase/PostgreSQL**. Node já é o runtime, usado inclusive pelo worker; não é linguagem nova a adicionar. Nenhuma evidência desta revisão indica que reescrever em outra linguagem resolveria as causas encontradas. O ganho vem de fechar os fluxos existentes, carregar dados corretamente, integrar contratos e automatizar provas de entrega.

Arquivos deste pacote: `MATRIZ_179.md`, `MATRIZ_179.csv`, `EXTRAS_E_CONFIGURACOES.md`, `ORIENTACAO_CLAUDE.md`, `SOLUCOES_VIAVEIS.md`, inventário de fontes e evidências selecionadas. Exemplos de solução são propostas para avaliação do proprietário, não patches aplicados à aplicação.

**Histórico da publicação inicial:** a tentativa de documentar a atualização na issue #89 foi rejeitada pela revisão automática por divulgar detalhes operacionais em repositório público. Não foi publicado novo comentário nem alterado o PR #100 nesta etapa. O relatório completo está disponível neste pacote para revisão antes de qualquer divulgação.
