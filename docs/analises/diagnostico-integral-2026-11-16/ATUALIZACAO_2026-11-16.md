# Revalidação — código, Supabase, publicação e escopo comercial

Este documento atualiza o diagnóstico histórico de `5468d9e`. Corte final de código: **`89927dc2a82f07cfd5a04fcee503d307ac1037f6`**, main de 16/11/2026. Testes dirigidos locais executados no ancestral `4e1a5d1c592c3884312d37f34faafd25fa49e9e6`; o delta final de 14 arquivos foi inspecionado e tem CI completo aprovado. Datas/horários abaixo em UTC, salvo indicação.

## 1. Conclusão atual

As correções anteriores avançaram, o CI ficou verde e o domínio recebeu a nova versão. **A aplicação ainda não está completa nem homologada para todas as operações.** O principal atraso operacional continua na base de lojas/estoque/usuários e nas integrações externas. Há também dois novos defeitos reproduzidos (#101 e #102).

Não procede dizer que só a demo recebe código: há telas, RPCs e transações reais. Também não procede considerar tudo funcional porque o menu, o build e o CI existem. A base consultada ainda tem 3 unidades, 6 produtos, 6 variantes, 2 vendas, nenhum cliente e apenas 1 usuário Auth. A vitrine pública não equivale a checkout.

O pedido mais recente do proprietário torna explícitos: compra completa em `https://ora5g.com.br/loja`, acesso à loja no topo do site, sincronização/importação automática e conciliação dos marketplaces, custos e atribuição da Meta e publicação verificável da aplicação real e da demo após cada etapa. Ver [adendo de aceites](ADENDO_LOJA_CANAIS_E_PUBLICACAO.md). A grafia `hora5G.com.br` da fala não foi tratada como autorização para criar outro domínio; usa-se o endereço confirmado e observado, `ora5g.com.br`.

## 2. O que mudou desde a primeira revisão

Entre `5468d9e` e `4e1a5d1`: 12 commits, 78 arquivos alterados; árvore de 1.068 arquivos, sendo 1.056 textos conferidos pelo hash Git e 12 binários apenas inventariados. Entre `4e1a5d1` e `89927dc`: mais 4 commits e 14 arquivos alterados. Não somar os dois números de arquivos como se fossem caminhos únicos.

| Achado/entrega | Resultado observado | Limite restante |
|---|---|---|
| #87 — correção perde destinatário fiscal | Novos escritores preservam/validam o destinatário; testes dirigidos passaram | Revisão do legado da migration é outro problema, #101 |
| #88 — troca de cliente envia nota ao outro | Enfileiramento e worker conferem identidade para os novos registros; regressões passaram | Backfill de notas antigas continua vulnerável, #101 |
| E-mail PayJoy obrigatório | SQL, domínio, PDV e demo foram ajustados; teste dirigido passou | Contrato externo deve ser confirmado, sem inventar e-mail |
| #98 — limpeza concorrente de fotos | Protocolo separar → excluir no Storage → confirmar; registro e limpeza usam trava comum e marca de exclusão; testes passaram | Ainda falta operação com fotos reais; Storage observado vazio |
| #95 — importação acima de 8 s | Migration de estatísticas aplicada e teste de 2.000 linhas passou localmente e no CI | Isso não resolve a planilha original com 2.271 produtos nem o saldo por loja |
| #96 — cache do sino | Chave por usuário/loja, limpeza no login; delta final remove lista em acesso negado e limita retenção após falha | Não equivale a jornada autenticada dos três perfis; testar troca/revogação e respostas atrasadas |
| #99 — verificador aceita versão errada | Script compara SHA completo/ambiente via HTTP e cobre reversão | Publicação de cada lote precisa continuar comprovada no domínio |
| ONLINE-b | Reserva pública de 24 h e retirada, vinculada à reserva de estoque; testes de disputa com PDV | Não é compra/pagamento online; concorrência da cota tem #102 |
| CI cancelado no commit intermediário | Limite do job aumentou de 15 para 30 minutos; orçamento de importação de 8 s foi preservado | Otimizar execução sem apagar testes; última execução passou |
| Registro Supabase | `aplicadas-dev.json` agora inclui a 89ª migration | Não repetir pedido de autorização para algo já aplicado |

A otimização de importação executa ANALYZE em tabelas relevantes e define `enable_seqscan=off` apenas no escopo da função `importacao_aplicar`. A opção desencoraja varreduras sequenciais; não garante uso exclusivo de índices. Medir planos/latência com volume representativo antes de generalizar essa estratégia para outras funções.

## 3. Defeitos novos comprovados

### P1 — #101: backfill pode associar nota antiga ao cliente errado

[Issue #101](https://github.com/oraconect5g-boop/sistema-ora5g/issues/101). Em `packages/banco/supabase/migrations/20261116095825_destinatario_fiscal_integro.sql`, trecho inicial de atualização, o vínculo usa o destinatário preservado ou, na ausência dele, o cliente **atual** da venda.

Reprodução em banco descartável: emitir nota para Alfa no schema anterior; a emissão remove o snapshot antigo; vincular a venda a Beta; aplicar a migration; pedir envio. A nota continua com destinatário Alfa, mas o envio é aceito para Beta. O novo bloqueio de troca posterior não detecta esse vínculo errado criado pelo próprio backfill.

Correção esperada: tratar identidade fiscal legada como evidência histórica, sem inferi-la apenas do cliente comercial atual; migration corretiva e conciliação auditável; bloquear envio de documento com identidade não comprovada. Cobrir também fila já existente. Não editar/apagar migration aplicada. Na consulta real havia **0 notas e 0 clientes**: o risco foi reproduzido com dados fictícios, sem evidência de envio indevido a pessoa real.

### P2 — #102: cota de reservas por loja sofre corrida

[Issue #102](https://github.com/oraconect5g-boop/sistema-ora5g/issues/102). `loja_reservar`, definida em `20261116093359_loja_online_reserva.sql`, verifica 20 reservas/hora antes de obter uma trava que serialize a cota da loja. Travas por telefone/chave não protegem o conjunto.

Reprodução em PostgreSQL 17, duas conexões: existem 19 reservas; A cria a vigésima sem confirmar; B, com outro telefone/chave, também vê 19 e depois espera o estoque; A confirma; B prossegue e confirma. Resultado: **21 reservas** na hora. Não foi demonstrada venda duplicada de um mesmo aparelho nessa prova; a violação é do limite de admissão/abuso. O limite de IP no processo Next.js não substitui a invariável do RPC público.

Correção esperada: serializar/contabilizar a admissão por organização/loja/janela com transação curta, definir retries e testar várias conexões, sem afetar idempotência, estoque e escopo. A implementação deve ser escolhida pelo Claude a partir do código e dos testes, sem copiar automaticamente propostas ilustrativas.

## 4. Supabase e ambiente

- O proprietário corrigiu Working directory para **`packages/banco`**. A captura atual está alinhada com a estrutura do monorepo.
- **89 migrations** observadas, incluindo `20261116130100_importacao_estatisticas`. O registro versionado também foi corrigido em `89927dc`.
- A integração gravou essa migration em quatro instruções sem os delimitadores finais. Comparar MD5 de concatenação ingênua dá diferença artificial. As **quatro instruções coincidem exatamente** após normalizar somente os delimitadores. A evidência não indica drift nessa migration.
- Corpos de **11 funções alteradas** conferidos com as definições efetivas do código; todos coincidiram. A configuração local da função de importação também foi confirmada. Catálogo observado: **350 funções e 98 relações** nos schemas inspecionados.
- A revisão anterior inspecionou o catálogo completo, políticas, triggers, advisors e metadados de Storage. Esta continuação compara o delta; não afirma nova homologação individual de 350 funções. Supabase não armazena uma cópia de todo o frontend. Não há arquivos de clientes nos buckets observados; não se acessou filesystem do servidor.
- A árvore até `89927dc` ainda não contém `supabase/config.toml`. Documentar configuração mínima/fluxo reproduzível continua pendente, mas sua ausência não impediu a migration já observada. Não resetar banco nem duplicar a árvore de migrations.
- GitHub → Supabase publica recursos do Supabase. A aplicação Next.js/worker tem publicação própria; não há workflow de deploy web no recorte, apenas scripts existentes. Uma ligação não substitui a outra.

| Dado observado | Quantidade |
|---|---:|
| Unidades / produtos / variantes | 3 / 6 / 6 |
| Vendas / clientes | 2 / 0 |
| Usuários Auth | 1 |
| Notas / objetos Storage | 0 / 0 |
| Importações / entradas / transferências (consulta anterior desta continuação) | 0 / 0 / 0 |
| Habilitações / referências / operações Ora Connect (consulta desta continuação) | 0 / 0 / 0 |

Esses números são evidência de ausência de preparação operacional, não autorização para inventar cadastros fiscais. Não foram lidos valores de segredos, nem efetuadas mutações remotas nesta auditoria.

## 5. CI, testes e domínio

[CI do commit final: run 43854750798](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43854750798), job 133256011463: **success**. Lint, typecheck, scanner, rastreabilidade, catálogo Nogle, testes, build, orçamento de bundle, audit de produção e Playwright passaram.

- Testes: plataforma 1.279; worker 15; banco 869; configuração 60; domínio 112 = **2.335 aprovados**, **1 TODO** no banco.
- Navegador: **281 aprovados, 11 ignorados**. Não declarar que os ignorados passaram.
- `npm audit --omit=dev`: zero vulnerabilidades reportadas nessa execução. A instalação reportou 8 moderadas no conjunto que inclui desenvolvimento; não confundir com “todas as dependências livres de vulnerabilidades”. Triagem de ferramentas de desenvolvimento continua pertinente.
- Check Supabase Preview: success. É evidência separada do CI e não valida todas as jornadas.
- O run intermediário de `4e1a5d1` foi cancelado próximo do teto de 15 minutos. Está superado pelo run final; não manter “CI vermelho/cancelado” como estado atual.

Revisão independente local no ancestral `4e1a5d1`, Node 22.23.4: **83 testes dirigidos aprovados**, mais **2 provas positivas de defeito** (#101/#102), build aprovado e **154 E2E aprovados/4 ignorados**. Os testes dirigidos cobrem UI/serviço de loja, publicação, e-mail, fiscal, fotos, reservas, orçamento de importação e migrations novas/reversões. Uma tentativa ampla de reversões foi interrompida pelo revisor por custo de execução; foi substituída pelo recorte das cinco migrations novas. Não é falha atribuída ao aplicativo nem execução completa aprovada.

`https://ora5g.com.br/saude/versao` retornou:

```json
{"commit":"89927dc2a82f07cfd5a04fcee503d307ac1037f6","versao":"0.1.0","build":"2026-11-16T11:06:24.744Z","ambiente":"homologacao"}
```

`/loja` e `/demo` responderam HTTP 200. O domínio serve aplicação conectada em **homologação**; chamar a tela de “real” a distingue da demo, mas não transforma o ambiente em produção comercial homologada. Não houve login com três perfis nem compra externa nesta auditoria.

## 6. Requisitos e motivos da percepção de atraso

No checkpoint final: **62 testados em desenvolvimento, 70 parciais, 42 não iniciados, 3 bloqueados, 2 restrições respeitadas; total 179; 0 homologados.** Os 62 representam 34,6% declarados testados, não percentual operacional concluído. A reserva fez ONLINE-004/006 passarem a parciais; não completou e-commerce.

Ainda constam como não iniciados: ONLINE-002 (checkout), os **8 MKTPL** e os **6 META**. Código de mapeamento de SKU externo é preparação de catálogo, não importação automática de pedidos nem conciliação do canal.

O cabeçalho da página inicial tem Entrar → `/entrar`, mas não atalho Comprar → `/loja`. O cabeçalho da loja tem marca/texto e não carrinho/conta do cliente. O rodapé declara pagamento na loja. Isso segue o ADR-009 anterior, mas **o novo pedido exige ampliar esse escopo para compra online**. Atualizar ADR, requisitos e navegação, preservando retirada como opção.

Há gráficos reais (43 usos estáticos fora da demo no inventário anterior, mais um wrapper; 25 na demo), mas contagem de componentes não substitui dados/filtros/testes com permissão. Vitrine sem produtos, base quase vazia, funcionalidades externas sem habilitação e documentação desatualizada explicam a percepção de telas sem função. Nenhuma troca de linguagem preenche essas lacunas automaticamente.

O próprio registro `LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16.md` informa que Claude conferiu existência/hashes de 88 versões, mas não leu integralmente 72 versões diferentes nem toda a matriz/inventário. O próximo prompt exige leitura rastreável por domínio antes da implementação e revisão de todos os IDs antes do fechamento. Arquivo encontrado não conta como conteúdo lido.

## 7. Ordem de implementação e aceite

1. Corrigir #101/#102, manter as regressões já aprovadas e revalidar CI no SHA a publicar.
2. Fechar preparação de 11 lojas + DEFEITOS, três perfis de teste e importação integral da planilha recebida, com saldo inicial por local e conciliação desde 10/11/2026 13:20. Não pedir novamente o arquivo por alegar que nunca foi entregue; se falta no servidor do Claude, registrar a transferência segura pendente.
3. Transferência de vários produtos, disponibilidade por loja, fotos e jornada autenticada de venda/caixa/estorno/financeiro/gráficos.
4. Nogle, PayJoy/Aiva e fiscal/WhatsApp oficiais: completar tudo que depende apenas de código e habilitar operações quando contratos/credenciais verificadas permitirem.
5. Loja completa em `/loja`, compra/pagamento/pedido/retirada ou entrega/pós-venda. Seu novo aceite substitui o limite “somente reserva” do ADR-009, sem supor que a Nogle oferece checkout genérico de aparelhos.
6. Mercado Livre/TikTok Shop, demais canais planejados e Meta: importação, sincronização, conciliação e métricas reais; fechar os demais IDs de CRM, assistência, bônus, relatórios/IA e operação.
7. Por etapa: código e migrations compatíveis, testes, CI, publicação web/worker e atualização da demo, verificação por SHA no domínio e roteiro para o dono testar. Uma dependência externa não paralisa áreas independentes; não simular sucesso no real.
8. Antes de declarar conclusão: revisão dos 179 IDs e aceites adicionais, três perfis, concorrência, backup/restauração, contingência, reconciliação e aceite do piloto.

Detalhes de cada ID: [matriz atual](MATRIZ_179_ATUALIZADA.md). Prompt de execução: [PROMPT_CLAUDE.md](PROMPT_CLAUDE.md). Propostas de aceleração, exclusivamente para avaliação do proprietário: [NODE_E_ACELERACAO.md](NODE_E_ACELERACAO.md).
