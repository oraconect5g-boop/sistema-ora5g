> **Documento histórico de 5468d9e.** Correções, CI, migrations, contagens e pedidos posteriores estão em [ATUALIZACAO_2026-11-16.md](ATUALIZACAO_2026-11-16.md). Não tratar achados já corrigidos como pendências atuais.

# Relatório integral — planejamento, código e operação

## 1. Diagnóstico

O problema atual combina três situações: funcionalidades reais já implementadas, dados/configurações ainda ausentes e defeitos concretos que permaneceram após novas entregas. Atualizar a interface ou conectar GitHub ao Supabase não resolve automaticamente as três.

O código da main e o domínio conferido apontam para `5468d9e`. As alterações não estão restritas à demo: existem telas reais de vendas, estoque, financeiro, CRM, metas, assistência, fiscal, equipe e vitrine. Entretanto, a base Supabase consultada contém **3 unidades, 6 produtos, 6 variantes, 1 venda, 0 clientes, 0 importações, 0 entradas e 0 transferências**. Existe **1 usuário Auth**. Ora Connect tem **0 habilitações, 0 referências e 0 operações**. Nenhum arquivo está armazenado nos cinco buckets.

Isso explica boa parte da diferença entre o que aparece nos relatórios de desenvolvimento e o que o proprietário consegue testar. O sistema ainda não está pronto para substituir integralmente a Rein.

## 2. Método e limites

- Snapshot de 1.033 arquivos no SHA informado; 1.021 textos conferidos pelo hash Git, 12 binários inventariados. Histórico e relatórios de 9 PRs documentais recuperados, com 88 versões Markdown verificadas; os 116 Markdown da main estão no índice.
- Leitura de código e contratos, inventário por diretório, busca de conflitos/duplicidades e execução da suíte, além de reproduções dirigidas dos defeitos.
- Conector Supabase: 84 migrations, definições de 339 funções, 95 relações, 98 políticas incluindo Storage, 153 triggers não internos de public/privado, buckets, advisors e logs agregados.
- Não acessamos SSH, arquivos do servidor ou valores de .env. Não criamos contas nem movimentamos estoque/dinheiro/telecom neste trabalho.
- Não é possível observar os passos privados, raciocínio ou alterações ainda não enviadas do Claude. A comparação cobre o histórico versionado e evidências publicadas.
- O link privado do projeto ChatGPT não disponibiliza as outras conversas. A matriz usa esta conversa visível e as fontes do GitHub, sem afirmar leitura de conteúdo inacessível.
- Inventário não equivale a homologação linha a linha. Cobertura automatizada, autorização simulada e E2E sem credenciais não substituem o aceite funcional com usuários reais.

## 3. Quantos requisitos foram atendidos

| Estado declarado | Quantidade |
|---|---:|
| Testado em desenvolvimento | 62 |
| Parcial | 68 |
| Não iniciado | 44 |
| Bloqueado | 3 |
| Restrição respeitada | 2 |
| Homologado | 0 |
| Total | 179 |

62/179 = **34,6% declarados testados**, não 34,6% do aplicativo pronto para operar. Existem **115 requisitos parciais, não iniciados ou bloqueados**. Mesmo os 62 precisam de revisão dos defeitos associados, configuração e aceite quando aplicável.

O catálogo original tem 18 domínios, incluindo 10 requisitos CRM. A [matriz completa](MATRIZ_179.md) preserva cada ID; pedidos novos desta conversa não desaparecem por não terem um ID próprio. Não ampliamos o denominador para esconder pendências nem contamos a mesma entrega como requisitos novos.

## 4. Defeitos reproduzidos e conflitos de regra

### P1 — destinatário fiscal perdido ao corrigir nota (#87)

A função `notas_corrigir` recria `privado.notas_destinatarios` usando o contrato anterior. Após a inclusão de `cliente_id`, `endereco` e `dados_de`, a correção pode perder o snapshot completo. É exemplo concreto de evolução de schema sem atualização de todos os escritores.

**Efeito:** correção de um campo pode deixar a emissão/revisão sem o destinatário histórico completo. **Correção esperada:** migration nova com preservação e validação do snapshot; não editar migrations já aplicadas. Testar corrigir documento/nome e consultar novamente, inclusive após mudança do cadastro.

### P1 — documento de um cliente enfileirado para outro (#88)

Depois de registrar nota para Alfa, a venda pode ser vinculada a Beta; `nota_enviar_whatsapp` usa o vínculo/telefone atual da venda sem garantir identidade com o destinatário da nota. Reprodução permaneceu positiva no SHA atual.

**Efeito:** risco de encaminhar documento fiscal ao destinatário errado. A prova apenas criou fila em banco descartável; não enviou mensagem. **Aceite:** identidade do destinatário congelada/validada, troca posterior tratada explicitamente, fila e tentativas sem reutilização indevida de documento.

### P1 — limpeza concorrente de fotos (#98)

`fotos_sem_registro_limpar` e a política de remoção do Storage não se coordenam com toda a vida da gravação de `registrar_foto`. Em duas conexões, uma transação registra a foto ainda não confirmada; outra autoriza/remove o objeto; ambas confirmam e fica foto ativa sem objeto.

**Efeito:** produto com imagem quebrada após limpeza. A prova removeu a linha simulada do Storage em PostgreSQL descartável; não fez DELETE HTTP no serviço real. **Aceite:** protocolo que cubra reserva do objeto, confirmação e exclusão externa, incluindo retentativa após falha. Um lock liberado antes da chamada HTTP não resolve sozinho. O registro de auditoria deve distinguir limpeza solicitada de objeto efetivamente removido.

### P1 — orçamento de desempenho da importação reprovado (#95)

CI do SHA `5468d9e`: aplicação de outras 2.000 linhas novas levou **8.518 ms**, contra limite de **8.000 ms**, em `packages/banco/src/concorrencia.test.ts:977`. Na reprodução local, **13.712 ms**.

**Efeito:** CI vermelho e requisito de desempenho não cumprido no ambiente medido. Investigar consultas repetidas, auditoria, validação, locks, índices e processamento em lote com plano de execução. Não “corrigir” apenas aumentando o limite ou removendo a prova.

### P2 — notificações de outro acesso na mesma aba (#96)

O cache de `SinoDePendencias` usa loja/tempo, sem identidade completa da sessão. Trocar o usuário na mesma aba pode conservar notificações do acesso anterior.

**Efeito:** conteúdo desatualizado e possível exposição do resumo do outro perfil. Não foi demonstrado bypass de RLS. **Aceite:** identidade de usuário/organização/sessão/loja no ciclo de cache e limpeza no logout/revogação, ou remoção do cache persistente.

### P2 — verificador pode aprovar publicação errada (#99)

`deploy/homologacao/conferir-publicacao.sh` compara pasta/ancestralidade e exibe a versão HTTP, mas não usa corretamente a identidade HTTP para reprovar a publicação. A checagem local também não comprova o domínio externo.

**Efeito:** checklist pode dizer publicado enquanto o serviço atende outra build. **Aceite:** comparar SHA esperado, processo ativo, resposta HTTP e domínio; falhar em ausência, diferença ou incompatibilidade de ambiente. Reversão válida deve declarar o SHA de retorno.

### Lacuna P0 operacional — planilha original e estoque das lojas (#89)

O arquivo já foi fornecido: `relatorioProdutos131258.xlsx`, posição de **10/11/2026 às 13:20**, SHA-256 `76f9cf33198de7205c01dc8ec78dea70fcf86c17847f9faea6356f0c8e612c06`. A inspeção identificou **83 colunas, 2.271 produtos, 12 locais**, além da linha final de total.

A leitura do cabeçalho funciona. A leitura completa falha na **linha 955**, célula **K955**, “Observação” com **3.220 caracteres**: o parser limita a 500 caracteres inclusive células que não participam do mapeamento. Também existe outra observação longa e o teto de 2.000 linhas é inferior ao arquivo. Há células numéricas com notação que merece normalização explícita; não é correto atribuir a elas a primeira falha observada.

O importador atual trata catálogo/preço. Isso não carrega automaticamente o saldo inicial por loja, nem reconstrói transferências pendentes. **Aceite:** relatório de prévia do arquivo inteiro, mapeamento, lotes idempotentes, contagens/valores conciliáveis, saldo por local, classificação de avarias/trânsito e aprovação. Não eliminar silenciosamente linhas, truncar observações ou importar o total como produto. Não chamar a posição de 10/11 de estoque atual sem conciliar os movimentos posteriores.

### Conflito funcional — e-mail obrigatório PayJoy

O pedido mais recente determina e-mail sempre opcional no cadastro. Ainda há exigência PayJoy em `packages/dominio/src/pagamento.ts`, `apps/plataforma/src/lib/vendas/regras.ts` e no contrato SQL de vendas. A reprodução confirma a mensagem “PayJoy exige o e-mail do cliente”.

A decisão antiga DEC-U30 e os testes correspondentes precisam ser reconciliados com a orientação posterior. Não inventar endereço de e-mail. Se o contrato oficial do parceiro realmente exigir o campo para uma operação, apresentar a incompatibilidade específica para decisão; não tornar o cadastro inteiro obrigatório.

### Configuração incorreta — novo vínculo GitHub/Supabase

A captura mostra Working directory `.`, mas as migrations estão em `packages/banco/supabase/migrations`. A documentação oficial determina informar o pai de `supabase/`: neste projeto, **`packages/banco`**. Não há `config.toml` versionado; é necessário preparar/conferir a configuração compatível com o projeto existente antes de depender desse fluxo. Detalhes no [relatório Supabase](SUPABASE_E_PUBLICACAO.md).

## 5. O que existe e o que falta por setor

| Setor | Implementação atual | Falta para operação completa |
|---|---|---|
| Organização/acesso | Auth, vínculos, loja da sessão, revogação, MFA/confirmação recente, equipe e regiões | Três usuários de teste com papéis corretos; 11 lojas + DEFEITOS; SMTP/convites e jornadas; dados fiscais |
| Catálogo | Categorias, marcas, variantes, preços, campanhas, códigos externos, fotos e importador | Arquivo real integral; saldo por loja separado do catálogo; fotos de todos os produtos; corrigir limpeza concorrente |
| Estoque | Livro, saldos, reservas, IMEI/ICCID, entrada, inventário, compras e transferências | Carga inicial conciliada; transferências de X e Y em lote; jornada entre lojas; política de confirmação/trânsito |
| Clientes/CRM | Cadastro, busca, histórico, funil, agenda, duplicados, segmentos e relatório do titular | Base real; e-mail opcional em todos os fluxos; WhatsApp oficial/omnichannel; assinatura e retenção |
| Vendas | PDV real, itens mistos, reserva, preço servidor, aprovação, pagamentos, troca e devolução | Jornada autenticada mobile completa; financiamento integrado; opções ainda previstas nos IDs parciais |
| Pagamentos | Caixa, maquininha, conciliação e recebíveis manuais, estornos compensatórios | APIs/arquivo de extrato, links, confirmação externa, chargeback/antecipação; PayJoy/Aiva obrigatórias |
| Financeiro | Recebimentos, contas a pagar, DRE gerencial, previsão, margem, exportações e gráficos | Conciliação externa, taxas/prazos homologados, contas reais e fechamento diário |
| Ora Connect | Adapter Nogle, worker, ativação/recarga/portabilidade, consultas e produção local | Credenciais/escopos habilitados, teste oficial, gateway, recorrência e repasses, conciliação e estados completos |
| Fiscal | Fila, dados do destinatário, registro/anexos, cancelamento/correção, conciliação | Corrigir #87/#88; emissão via provedor e contador; documento correto por operação/UF; entrega oficial |
| Metas/bônus | Metas mensais, regras versionadas, extrato, contestação e fechamento | Homologar cálculos; pagamento efetivo do bônus e ranking conforme decisões; não reintroduzir comissão por venda |
| Assistência | OS, custódia, orçamento, resposta, peças, cobrança e relatórios | Exercício real da jornada, avisos automáticos e políticas de garantia/retorno |
| WhatsApp | Fila da nota e núcleo de processamento | Adapter Meta, executável/scheduler, webhook/status e caixa multiatendente; fila não equivale a entrega |
| Loja online | Vitrine pública ONLINE-a em /loja | Produtos publicados/fotos, carrinho, checkout, entrega, reserva compartilhada e pós-venda; telecom online conforme Nogle |
| Marketplaces | Planejamento/mapeamentos preparatórios | 8 requisitos ainda não iniciados e contratos por canal |
| Meta Ads | Planejamento | 6 requisitos não iniciados; contas, escopos, atribuição e dedupe |
| IA | Painéis e alertas determinísticos | Assistência supervisionada, orçamento, avaliação e base de conhecimento; sem autonomia financeira |
| Qualidade/operação | Muitos testes, scanner, scripts e monitoramento inicial | CI consistente, domínio validado por SHA, jornadas reais, restauração de backup, incidente/contingência e go/no-go |

## 6. Gráficos e paridade com a demonstração

A afirmação histórica de que a versão real tinha apenas três gráficos já não descreve o SHA atual. A busca pelos mesmos sete componentes encontra **25 usos na demo e 43 usos fora da demo em telas/painéis**, além de **1 wrapper compartilhado**. É contagem estática de usos JSX, não 43 indicadores únicos ou 43 jornadas validadas.

Há componentes reais em início, financeiro, relatórios, metas, estoque, contas a pagar, resultado, previsão, recebíveis, assistência, notas, operação e equipe. Muitos usam consultas agregadas e permissões no banco. A matriz antiga que registra 26 usos e “OS não iniciado” está defasada.

O próximo passo não é redesenhar tudo: validar cada indicador com dados conhecidos e os perfis dono/gerente/vendedor; conferir período, loja, devolução, troco, repasse e margem. Preservar estados de vazio, erro, indisponível e sem permissão. Nunca preencher falta de dados com valores da demo.

## 7. Duplicidades, merges e documentação

- Na inspeção anterior do mesmo SHA, 156 de 169 cabeças de branch estavam alcançáveis pela main; as 13 restantes eram 4 PRs de dependências e 9 de documentação. Não apareceu branch funcional conhecida aguardando merge nesse recorte. Isso não cobre trabalho não enviado.
- Não foram encontrados marcadores de conflito nos arquivos de código/configuração inspecionados.
- Demo e real deliberadamente separados não são duplicação a apagar. `AppShell` e `SemPermissao` importam dados de demo, mas seus consumidores observados estão na demo; a simples busca textual fora de `app/demo` seria um falso positivo.
- Migrations que redefinem funções são histórico intencional. O erro está em manter escritor antigo incompatível com o novo schema, como #87; remover migrations antigas destruiria a rastreabilidade.
- Há decisões históricas conflitantes: “arquivo da Rein não recebido”, “aguardar autorização de três contas”, “26 gráficos”, “OS não iniciado”, comissão por venda e e-mail PayJoy. Atualizar o checkpoint e a fonte canônica, mantendo o histórico datado.
- Não fazer merge dos 9 PRs documentais completos sem revisão: vários contêm versões antigas de arquivos vivos. Ler todas as fontes e incorporar apenas as decisões atuais/evidências pertinentes.
- O registro de publicação ainda aponta db1b8a0 e uma pendência documental já superada pelo SHA 5468d9e. Corrigir o checkpoint para evitar repetição ou conclusão falsa.

## 8. Testes desta auditoria

Node **22.23.4**, conforme a faixa do projeto. As tentativas iniciais com Node 24 foram descartadas; não são falhas atribuídas ao produto.

| Verificação | Resultado |
|---|---|
| Lint e typecheck completos | Concluídos sem erro; aviso de configuração de pages do ESLint em workspaces sem Next |
| Suíte completa local | 2.278 passaram, 2 falharam, 1 TODO |
| Falha local 1 | Relatório de >20 mil itens excedeu timeout de 5 s sob a execução inicial; reteste isolado passou sem mudar teste/código |
| Falha local 2 | Importação de 2.000 novos registros: 13.712 ms para limite de 8.000 ms |
| GitHub Actions do SHA auditado | 2.279 passaram, 1 falhou, 1 TODO; falha da importação em 8.518 ms |
| Reproduções #87/#88/#96 | 3 testes de reprodução passaram: os defeitos continuam presentes |
| Reprodução #98 | 1 teste com duas conexões passou: a corrida continua presente |
| Planilha original + regra PayJoy | 2 provas passaram: incompatibilidades confirmadas |
| Build | Passou |
| Orçamento de bundle | Passou; JS comum 128,3 KB comprimido; maior tela 183,7 KB frente a limite de 200 KB |
| Rastreabilidade/catálogo Nogle | Em dia; catálogo de referência com 62 funções, não 62 implementações operacionais |
| Playwright | Resultado final detalhado em evidencias/RESUMO.md |

“Reprodução passou” significa que o teste observou o erro esperado, não que o defeito foi corrigido. O reteste isolado do relatório não torna a execução completa verde. Nenhuma operação financeira ou Nogle real foi executada.

## 9. Ordem de conclusão

1. Corrigir #87/#88/#98 e isolar #96; fazer CI e desempenho passarem; reparar a verificação da publicação.
2. Ajustar GitHub/Supabase ao monorepo, validar configuração/history/segredos por presença e fechar comprovação de deploy.
3. Preparar 11 lojas + DEFEITOS e os três perfis; separar cadastro operacional de liberação fiscal, sem inventar CNPJ/endereço.
4. Corrigir importador para o arquivo já recebido, preparar prévia completa e carga de estoque por local; reconciliar a data de corte.
5. Concluir transferência de vários produtos e validar reservas, envio, recebimento, divergência, cancelamento e DEFEITOS.
6. Exercitar venda → pagamentos → caixa → estorno/devolução → financeiro e gráficos com os três perfis.
7. Completar Nogle oficial e PayJoy/Aiva; preparar extensão J7/QI Tech sem endpoints presumidos.
8. Concluir fiscal e entrega de nota via WhatsApp oficial; depois assistência/CRM/bônus e demais aceites parciais.
9. Completar online, marketplaces, Meta/WhatsApp/IA conforme todos os IDs remanescentes e contratos.
10. Provar backup/restauração, contingência, observabilidade, permissões e piloto; registrar aceite de saída da Rein.

Uma dependência externa bloqueia apenas a operação dependente. As outras entregas continuam, mas nenhum stub, chave presente ou tela vazia deve ser chamado de funcionalidade concluída.

## 10. Requisitos complementares que não podem desaparecer

11 lojas comerciais (Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneário e Santa Cândida), mais DEFEITOS sem venda. Transferência para DEFEITOS não é sinônimo de assistência técnica. A meta futura de 14 não autoriza inventar lojas atuais.

Fotos obrigatórias por produto/variante visual; pesquisa com disponibilidade por loja e trânsito; transferência de vários produtos; estoque histórico do arquivo já recebido. Nome completo e WhatsApp no cadastro rápido, e-mail opcional sempre; endereço completo na finalidade fiscal e documento entregue por WhatsApp oficial.

Nogle é sistema externo oficial, não servidor ou aplicativo a reconstruir. Vendas de chip, ativação, recorrência, pagamentos e repasses da Ora Connect devem reconciliar com a plataforma da parceira. PayJoy/Aiva por API são obrigatórias; J7 e QI Tech são planejamento extensível dependente de documentação/parceria.

Preservar TypeScript, Next.js/React, Node e Supabase/PostgreSQL. Não introduzir Firebase nem reescrever a arquitetura. Cada lote deve aparecer na aplicação real com evidência; o refinamento visual não substitui os testes e a operação.

