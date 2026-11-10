# Auditoria técnica do GitHub — Sistema Ora 5G

**Data da análise:** 09/11/2026  
**Repositório privado:** https://github.com/oraconect5g-boop/sistema-ora5g  
**Base de código analisada:** `main` em `0292c69e4b3a5dffca770f9dc2b84f9cd21449e8`  
**PR examinada separadamente:** [#33](https://github.com/oraconect5g-boop/sistema-ora5g/pull/33), não integrada quando consultada, head `290f1111f964710d744c4ded40df48fed6762b1b`.

## Escopo, método e limitações

Foi realizada inspeção **somente leitura via conector GitHub**: metadados do repositório, árvore recursiva completa da branch main, classificação de todos os caminhos, documentação central, ADRs, arquivos críticos reais de Next.js, regras de domínio, worker Nogle, SQLs centrais e SQLs corretivos, CI, processos de deploy, GitHub issues, histórico de commits e PR #33, além da documentação de rastreabilidade. A árvore não estava truncada: **496 entradas (397 arquivos regulares)**. Inspeção detalhada não equivale a leitura linha a linha de todos os 397 arquivos; foram priorizados componentes de maior risco e pontos de integração.

**Não houve clone privado local, execução independente da suíte, acesso ao Supabase real, autenticação Nogle ou deploy.** As contagens de testes e estado de homologação reportadas por documentos/commits são declarações do próprio repositório, não provas executadas nesta sessão. Não foram alterados dados, código, issues, PRs nem recursos de produção.

## 1. Estrutura do software já existente

| Área | Arquivos/caminhos verificados | Conclusão sustentada |
|---|---|---|
| Infraestrutura | `package.json`, `.nvmrc`, `.github/workflows/ci.yml`, `deploy/homologacao/*` | Monorepo npm workspaces, Node 22, build/testes/CI e publicação de homologação com rollback planejado |
| Aplicação | `apps/plataforma/src/app/*`, `apps/plataforma/src/lib/*`, `apps/plataforma/src/componentes/*` | Next.js/React/TypeScript: há rotas operacionais reais e rotas distintas de `demo/` |
| Domínio | `packages/dominio/src/{venda,pagamento,desconto,identificadores,nogle,fiscal}.ts` | Regras transacionais e de integração separadas do front-end, com testes correspondentes |
| Banco | `packages/banco/supabase/migrations/`, `packages/banco/src/*.test.ts` | 21 migrations SQL de aplicação, reversões, RLS, RPCs e testes em banco local descritos pelo projeto |
| Telecom | `apps/worker/src/connect/*`, `apps/plataforma/src/integracoes/nogle/*`, `docs/integracoes/*` | Adaptador e worker Nogle, contrato documentado; operação real externa não homologada |
| Segurança | `apps/plataforma/src/lib/acesso/*`, `packages/config/*`, `deploy/homologacao/ambiente-web.sh` | Autenticação Supabase por sessão do usuário, autorização no banco, separação de segredos do web e scanner |
| Testes | `apps/plataforma/e2e/*`, `packages/banco/src/*.test.ts`, `packages/dominio/src/*.test.ts` | Vitest, testes SQL/concorrência e Playwright presentes; precisam ser reexecutados para validar o HEAD do dia |
| Documentação | `docs/`, `CLAUDE.md`, `AGENTS.md`, `backlog.json`, `originais/` | Planos, ADRs, passagem, análise e rastreabilidade existentes; parte das fontes tem informações históricas desatualizadas |

Contagem adicional dos arquivos da árvore: 150 `.ts`, 78 `.tsx`, 70 `.md`, 45 `.sql` (incluindo migrations e reversões), 17 `.json`, 11 `.png`, além dos arquivos de teste, shell e referências visuais. A documentação e as integrações já se apoiam em várias centenas de milhares de caracteres de requisitos.

## 2. O que é real no código e o que ainda não é produção

| Módulo | Evidência específica | Estado auditável e lacuna |
|---|---|---|
| Login, vínculo e turno | `apps/plataforma/src/lib/acesso/sessao.ts`, `/entrar`, `/escolher-loja`, `packages/banco/supabase/migrations/20261108202654_acesso_sessao_e_equipe.sql` | Fluxo real de sessão, escolha de loja e vínculo. E2E com usuário de teste real ainda bloqueado na issue #11; não homologado |
| Equipe/permissões | `/equipe`, `packages/banco/supabase/migrations/20261109150526_correcoes_acesso_lote1.sql` | Cadastro/invites e RLS com correções documentadas; perfis existentes: dono, administrador, gerente, vendedor, técnico |
| Catálogo/fotos | `/catalogo`, `EnviarFoto.tsx`, migration `20261108204536_fotos_dos_produtos.sql` e `20261109191416_fotos_idempotentes_lote3.sql` | Fotos e busca reais, mas garantia de foto por produto do piloto exige conferência de conteúdo (#26) |
| Estoque/IMEI/ICCID | `/estoque`, livro de estoque, migration `20261108195850_integridade_estoque.sql` | Controles de serial, saldos, reservas e restrições no banco; necessário conciliar inventário físico e arquivo Rein |
| Transferências/DEFEITOS | `/transferencias`, migration `20261109193043_transferencias_e_defeitos.sql`, ADR-007 | Pedido, separar, enviar e receber identificados no código atual; revalidar #60 e inventário; não marcar concluído somente por ter tela/migration |
| PDV real | `/vender`, `/vendas/[id]`, `apps/plataforma/src/app/vender/acoes.ts` | Venda persistida, carrinho, desconto, pagamento, financiamento, trocas e devoluções com RPCs; necessita E2E operacional com dinheiro real e aceite |
| Pagamentos e caixa | `/caixa`, migrations `20261108233546...` e `20261109190240...` | Pagamento misto, caixa individual, comprovantes, estornos externos pendentes, dinheiro/troco; **Pix POS e cartão são confirmação manual**, não integração oficial de máquina |
| Fiscal | `/notas`, ADR-006 e migration `20261109123757_fila_fiscal.sql` | Pedido/aprovação e registro de chave de NF emitida fora; **emissão automática e validação fiscal real bloqueadas** por contador/emissor |
| Ora Connect | `/connect`, `apps/worker/src/connect/cliente-nogle.ts`, `processar.ts` e migrations Connect | Envio/consulta de ativação, recarga, portabilidade por adaptador; **sem homologação real Nogle**; gateway, recorrência, carteira/repasse incompletos (#54) |
| Painéis/BI/CRM/OS/canais | `apps/plataforma/src/app/demo/*`, `apps/plataforma/src/demo/dados/*`, backlog e documentação | Grande demonstração navegável e alguns recursos reais isolados; **não inferir CRM/WhatsApp/marketplaces/BI/OS operacionais só pela demo** |

### Observação crítica sobre Nogle

A documentação principal do projeto afirma ter copiado em 07/11/2026 a coleção Postman da documentação oficial [docs.nogle.tech](https://docs.nogle.tech/) com **62 funções em 16 grupos**, e gerado `apps/plataforma/src/integracoes/nogle/catalogo.ts`. O cliente `apps/worker/src/connect/cliente-nogle.ts` usa `/auth/token` e as chaves configuradas exclusivamente no worker. `ADR-005` exige confirmação por evidência, gestão de timeout ambíguo e distinção de LINK/SALDO. A interface e o catálogo **não comprovam licença de uso, escopos, disponibilidade da API de repasses nem testes na operadora**. Evitar expor chaves ou tentar ativar linhas reais sem conta autorizada.

## 3. Histórico Git, PRs e issues

- `main` HEAD: [`0292c69e`](https://github.com/oraconect5g-boop/sistema-ora5g/commit/0292c69e4b3a5dffca770f9dc2b84f9cd21449e8), merge `fix/ORA-nome-nogle`; mensagem registra, **sem execução independente nesta auditoria**, aprovação da sequência local de CI e testes.
- PR [#33](https://github.com/oraconect5g-boop/sistema-ora5g/pull/33) **aberta, não mesclada**; 69 arquivos alterados na PR, principalmente documentação/evidências e um protótipo. A comparação observada é **divergente**: `main` tem 24 commits exclusivos em relação ao head da PR e a PR tem 6 commits exclusivos em relação à `main` (comparação na direção head PR → main). **Não aplicar merge cego.** Primeiro rebase/reconciliação e conferência de novos testes/contratos.
- A busca retornou **35 issues abertas**. Entre elas #54 (Nogle completo), #60 (transferências/DEFEITOS), #26 (fotos), #11 (teste real de autenticação), #44 (alerta transitivo de desenvolvimento) e #55–#59 (achados em revisão). Algumas issues de bugs ainda estão abertas embora migrations e testes corretivos estejam na `main`. **Estado de issue ≠ estado do defeito**; reproduzir com HEAD antes de reabrir trabalho.
- `main` foi retornada por GitHub como **`protected: false`**. Isso indica ausência de proteção nativa da branch naquele momento, apesar de existir CI. Risco de commit direto sem revisão. Recomenda-se configurar proteção de branch com checks obrigatórios e revisão humana; **não modificar a configuração sem autorização**.
- A PR #33 indicava `mergeable: false`, mas o valor por si só não demonstra a causa (conflito, checks, regras etc.). Diagnosticar antes de concluir.

## 4. Conciliação documental (riscos de drift)

**Número de lojas:** fontes antigas `README.md`, raiz de `CLAUDE.md`, `backlog.json` e textos de 07/11 falam em 14 lojas existentes. `docs/ESTADO_ATUAL_E_PASSAGEM.md`, issue #60 e PR #33 registram decisão **09/11: 11 lojas comerciais + DEFEITOS** (não comercial); 14 é meta futura. Atualizar a documentação de modo controlado, sem apagar memória histórica ou mudar dados de lojas por conta própria.

**Backlog versus entrega:** `backlog.json` tem **179 requisitos** (P0 78, P1 74, P2 27; domínios ORG, CAT, INV, CRM, POS, PAY, FIN, PERF, FISC, CONNECT, ONLINE, MKTPL, WHATS, META, AI, REPORT, QUAL, OS). Muitos itens mantêm campos genéricos `status: planned-not-implemented` e `implementation_files: []`: **não** são retrato da implantação. `docs/alinhamento/status-requisitos.json` rastreia 73 itens movimentados: **19 testados, 40 parciais, 11 demonstração, 2 bloqueados e 1 respeitado**, nenhum homologado. Para não omitir, a skill exige comparar backlog, status, implementação, testes e aceite humano.

**Rein:** documentos novos permitem importação por arquivos de **produtos, preços e estoque**, não só produtos/preços. Durante o piloto em paralelo, o sistema atual permanece fonte oficial até aceite de migração, conforme `docs/operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md`. Nunca integrar API Rein nem duplicar receita oficial no período paralelo.

**Nogle/Contel:** é um único sistema de integração chamado **Nogle** na UI/documentação; “Contel” aparece no endereço técnico/documentação da própria operadora. Não criar um segundo provedor por confusão de nomes.

**Assistência técnica:** o backlog passou de 172 para 179 itens, incluindo seis requisitos de OS. Eles não equivalem a um módulo de assistência já entregue.

## 5. Riscos classificados

| Prioridade | Risco concreto | Verificação e ação |
|---|---|---|
| P0 | Acesso entre lojas, SQL `SECURITY DEFINER`, atualizações de papel e convites | Reexecutar cenários RLS/concorrência e verificar as funções atuais após migrations corretivas |
| P0 | Vendas/financiamento e estornos duplos, estoque reposto sem conferência | Reexecutar fluxo venda–caixa–devolução–troca–estorno contra banco atualizado, com identidades reais de teste |
| P0 | Ativação/recarga enviada duas vezes; serviço pago por LINK e SALDO ao mesmo tempo | Validar último código Connect (#57–#59), idempotência, transições, fonte externa e teste autorizado da Nogle |
| P0 | Segredos Nogle/Supabase no processo web | Verificar allowlist de `deploy/homologacao/ambiente-web.sh` e testes do deploy; scanner e revisão de ambiente, sem imprimir os valores |
| P0 | Inventário piloto e diferenças de disponibilidade por loja | Conferir exportação da Rein, saldo físico assinado, números IMEI/ICCID e estado dos locais DEFEITOS |
| P0 | Fiscal sem emissor homologado | Confirmar com contador CNPJ, UF, tipo de documento, prazo, autorização e contingência; não declarar emissão automática |
| P1 | PR #33 divergente da main e branch sem proteção | Reconciliar PR, revisar mudanças, habilitar políticas de branch após aprovação |
| P1 | Diferentes documentos afirmando status contraditório | Tornar status-requisitos.json + aceites/evidências fonte operativa, mantendo histórico imutável |
| P1 | Dependências externas e prazos de 6 meses | Manter tabela de bloqueios por fornecedor, repriorizar sem esconder escopo |

## 6. O que o CI realmente permite afirmar

O arquivo `.github/workflows/ci.yml` executa scanner de segredos no conteúdo e no histórico, checagem de rastreabilidade, catálogo Nogle, instalação limpa via npm, lint, TypeScript, testes, build, `npm audit --omit=dev` e Playwright Chromium. Há testes automatizados no repositório. O commit HEAD registra resultados locais; a PR #33 descreve execuções anteriores de Actions. **Sem executar a suíte nesta sessão, não é correto afirmar que o HEAD atual está integralmente verde ou que os processos de negócio estão homologados**. CI aprovado não cobre automaticamente precisão de estoque físico, segurança do ambiente, contrato de terceiro ou emissão fiscal real.

## 7. Sequência recomendada para o próximo ciclo de engenharia

1. **Congelar inventário de estado (somente leitura):** SHA, branch, status de PR #33, lista das 35 issues e requisitos em mudança. Identificar quais issues #55–#59 já foram corrigidas na main por regressão. Não fechar sem evidência.
2. **Reconciliar documentação e decisões de negócio:** 11 lojas comerciais + DEFEITOS, Santa Cândida, projeto de 14 futuras lojas, importação Rein por arquivo, Nogle única, fiscal. Remover ambiguidade de fontes, preservar links históricos.
3. **Provar núcleo da loja piloto:** usuário de teste (#11), catálogo com fotos (#26), inventário do piloto, PDV mobile, caixa PagSeguro/PicPay, PayJoy/Aiva, descontos, devoluções, transferências e fiscal manual sem dupla contagem.
4. **Homologar dependências externas:** Nogle #54 (credenciais só no servidor, ICCID/linha de teste, perguntas documentadas, repasses/gateway quando oficialmente suportados), emissor fiscal/contador, financeiro e integradores de pagamento.
5. **Executar piloto Santa Cândida** com go/no-go por escrito, conciliação diária Rein × Ora, planos de contingência e treinamento. Uma única fonte oficial por assunto em cada fase.
6. **Escalar gradualmente** para as demais unidades e para os canais online. O objetivo de seis meses exige escopo priorizado; não deve justificar pular controle financeiro/fiscal ou revisão.

## 8. Fontes para o Claude conferir no próprio clone

- `docs/ESTADO_ATUAL_E_PASSAGEM.md`
- `docs/PENDENCIAS_DO_PROPRIETARIO.md`
- `docs/alinhamento/RECONCILIACAO_CODEX_2026-11-09.md`
- `docs/operacao/GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md`
- `docs/adr/ADR-001...ADR-007`
- `docs/integracoes/NOGLE_API_REFERENCIA.md`
- `packages/banco/supabase/migrations/20261109190240_integridade_vendas_lote2.sql`
- `packages/banco/supabase/migrations/20261109190400_connect_evidencia_lote2.sql`
- `packages/banco/supabase/migrations/20261109193043_transferencias_e_defeitos.sql`
- `packages/banco/supabase/migrations/20261109201940_mensagens_nogle.sql`
- `.github/workflows/ci.yml`, `deploy/homologacao/ambiente-web.sh`
- [PR #33](https://github.com/oraconect5g-boop/sistema-ora5g/pull/33), [issue #54](https://github.com/oraconect5g-boop/sistema-ora5g/issues/54), [issue #60](https://github.com/oraconect5g-boop/sistema-ora5g/issues/60), [issue #26](https://github.com/oraconect5g-boop/sistema-ora5g/issues/26), [issue #11](https://github.com/oraconect5g-boop/sistema-ora5g/issues/11).

**Conclusão:** o projeto já tem fundação séria e camadas transacionais reais, mas ainda requer validação E2E operacional, homologações de integração e fiscal, conciliação de documentação/PRs e gestão de escopo. A skill não deve comandar uma reescrita geral, e sim ser o guardião de execução segura e rastreável do código existente.
