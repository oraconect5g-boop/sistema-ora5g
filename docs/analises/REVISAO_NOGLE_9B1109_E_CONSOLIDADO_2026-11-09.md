# Revisão consolidada — Nogle, merges, estoque e escopo atual

**Data:** 09/11/2026, São Paulo. **Base mais recente examinada:** main `9b1109e49d9304651d20224563f8e5bdaf950894`. O Claude integrou **19 commits e 66 caminhos** desde 371cef0 durante esta revisão. **Stack preservada:** TypeScript, React, Next.js, Tailwind, Node.js, PostgreSQL e Supabase.

## 1. Decisões atuais do proprietário

- **11 lojas comerciais**, com os nomes da imagem: Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneario e Santa Candida. **DEFEITOS** é local de exceção para transferências por erro/problema. Substitui a premissa anterior de 14 lojas nos documentos de trabalho; os cortes históricos permanecem datados.
- Ao buscar um produto, a foto e a variante identificam o item. Tocar nele deve mostrar em quais lojas há saldo e pendências e permitir pedido interno de transferência. [Especificação e referência da imagem](../alinhamento/BUSCA_ESTOQUE_E_TRANSFERENCIAS_2026-11-09.md), [#60](https://github.com/oraconect5g-boop/sistema-ora5g/issues/60).
- A Ora Connect deve operar integrada ao sistema externo **Nogle/Contel**, incluindo operações telecom, cobrança/gateway e repasse oficiais, com produção ligada à loja/vendedor. [Escopo/aceite #54](https://github.com/oraconect5g-boop/sistema-ora5g/issues/54). Fornecedor, webhook, taxa, prazo ou evidência não serão inventados.
- Prioridade: integridade de acesso/estoque/dinheiro → núcleo real de venda/caixa/Ora Connect → homologação da loja piloto e saída reconciliada da Rein → expansão às **11 lojas**. Rein segue como importação por arquivo e paralelo durante transição.

## 2. O que o Claude entregou no lote novo

| Área | Código real novo | Limite da conclusão |
|---|---|---|
| Ora Connect | `/connect`, operações/estados/eventos/produção, habilitação, referências, worker e cliente HTTP | Três tipos: ativação, recarga e portabilidade; testes locais não homologam a Contel |
| Transporte | node:http/https, corpo em GET, token por tipo de chave, renovação e tratamento de conexão | GET com corpo e operações ficam condicionados à configuração/habilitação; contrato e credenciais reais não foram inspecionados |
| Consistência | Outbox, lease, skip locked, resultado desconhecido, reconsulta e produção única por operação | Cinco novos bloqueantes reproduzidos; unicidade por operação não impede duas operações usando uma evidência |
| Estoque | `/estoque`, foto, saldo, reserva, IMEI/ICCID, histórico, conferência e disponibilidade da rede | Ainda falta pedido interno de transferência e apresentação das pendências como na solicitação do proprietário |
| Fiscal | Fila interna, pedido/aprovação e registro manual da chave emitida no portal, guards de cancelamento | Não é emissão fiscal por API. A revisão detalhada deste lote se concentrou na Nogle, integração de rotas/guards e estoque; não certifica toda tributação ou o módulo fiscal |
| Planejamento | Go/no-go e seis requisitos de assistência ORA-OS, sem classificá-los como entregues | Inventário passou de 173 para **179 requisitos**; a abrangência homologada não aumentou por esse cadastro |

Acertos a preservar: intenção persistente antes do envio, proibição de reenvio cego de resultado desconhecido, identificação do método LINK/SALDO, separação de pedido e confirmação, lease de processamento, produção única por operação e privacidade do payload estruturado temporário. No controle adicional, confirmar duas vezes a **mesma operação** gerou apenas uma produção.

As regras Nogle antes presentes na aplicação agora são implementadas em `packages/dominio/src/nogle.ts`; o arquivo antigo `apps/plataforma/src/integracoes/nogle/regras.ts` é um **reexport**, sem segunda implementação. Manter a compatibilidade dos imports não significa manter duas regras executando.

## 3. Cinco bloqueantes novos comprovados

| ID / issue | Fonte em 9b1109e | Prova local e correção necessária |
|---|---|---|
| REV-052 / [#55](https://github.com/oraconect5g-boop/sistema-ora5g/issues/55) | `deploy/homologacao/publicar.sh:52` | O filtro antigo remove só segredos Supabase/banco; **NOGLE_ACCESS_KEY e NOGLE_SECONDARY_KEY continuam na cópia web**. Corrigir contrato/allowlist web versus worker e testar publicação/rollback. Não foi demonstrada exposição direta ao navegador |
| REV-053 / [#56](https://github.com/oraconect5g-boop/sistema-ora5g/issues/56) | migration Connect:245–265; `connect/page.tsx:54` e :199 | Vendedor sem `custo.ver` lê débito de carteira R$35,92 numa recarga de R$44,90 e pode inferir margem; a tela também exibe. Proteger tabela/DTO/eventos e UI, como no custo do PDV |
| REV-054 / [#57](https://github.com/oraconect5g-boop/sistema-ora5g/issues/57) | `connect_registrar`, validação de método/serviço | Serviço recebido em dinheiro no caixa aceita vínculo com **LINK**, criando pedido de nova cobrança externa. Impedir esse fluxo incoerente ou formalizar compensação aprovada; no teste não houve cobrança externa |
| REV-055 / [#58](https://github.com/oraconect5g-boop/sistema-ora5g/issues/58) | `connect_registrar`, digest de `p_pedido - 'cliente'` | Mesma chave com outro nome de cliente retorna operação antiga sem OR004. Vincular idempotência ao conteúdo relevante do titular com proteção adequada de PII, inclusive após descarte do payload |
| REV-056 / [#59](https://github.com/oraconect5g-boop/sistema-ora5g/issues/59) | `packages/dominio/src/nogle.ts`, interpretação do histórico | Duas operações com IDs distintos e mesma data usam **uma recarga do histórico** e geram duas produções. Exigir correlação inequívoca e impedir reuso da evidência; timestamp sozinho não tem unicidade garantida na documentação |

Migration Connect = `packages/banco/supabase/migrations/20261109123402_ora_connect_operacoes.sql`. As issues incluem cenário, requisito e critérios de aceite.

**Provas adicionais:** seis casos: um controle passou, cinco falharam por cinco causas. Banco e funções reais com clientes fictícios; filtro real de publicação sobre arquivo temporário; parser e histórico sintético. Fontes/resultados em [evidências](evidencias/2026-11-09-nogle-9b1109/LEIA-ME.md). Os casos vermelhos ficam fora do CI normal até as correções. Não houve chave real, API Contel, cobrança, ativação, transferência real, deploy ou acesso ao servidor/.env.

O cenário de datas coincidentes não afirma que isso já ocorreu na Contel: demonstra a falta de segurança **caso** duas operações tenham a mesma data, possibilidade não excluída pelo contrato publicado. Esse ponto deve ser respondido pelo fornecedor antes da confirmação automática.

## 4. Gateway/repasse ainda não concluídos

O cliente agora cobre autenticação, quatro famílias de listas e envio/evidência dos três tipos — onze rotas/templates no fluxo inicial. Isso não corresponde a 62 funções operacionais nem a toda a Ora Connect.

Não há implementação completa de cobrança/pagamento via `/pagamento`, carteira/extrato/repasse, renovação por competência, compra/recebimento/entrega, transferência oficial entre PDVs, consulta ampla de linha/consumo e atendimento. O próprio ADR-005 deixa esses itens fora da etapa inicial.

LINK recuperado na resposta não comprova pagamento. SALDO consome carteira, não cria dinheiro novo na gaveta. Repasse previsto, apurado e recebido exigem contrato e evidência oficial. A coleção pública não explicita liquidação de repasse bancário, webhook, idempotência ou unicidade do timestamp da recarga. [51 perguntas ao responsável pela API](../integracoes/PERGUNTAS_PARA_NOGLE_2026-11-09.md), prontas para encaminhamento pelo proprietário.

## 5. Verificação executada

- Suíte local da composição com a revisão anterior: **486 testes passaram, dois TODO** (plataforma128, worker11, banco191, configuração53, domínio103). A main sem o teste de propriedade acrescentado pelo Codex tem um teste a menos. Nenhuma prova vermelha nova foi incluída nessa contagem.
- Inventário SQL reconstruído: **14 migrations, 111 funções, 189 índices, 41 triggers e 40 policies** nos schemas examinados; nenhuma sobrecarga de função. O inventário é diagnóstico de estrutura, não certificação de cada guarda.
- Grafo de **127 fontes da aplicação e 20 entradas reais**: nenhum caminho de import literal aos dados demo. Corpos de função idênticos acima do limiar analisado não foram encontrados. Imports calculados e equivalência semântica ficam fora desse método.
- Supabase apenas leitura: **38 tabelas públicas com RLS**, 14 migrations; zero usuários Auth, sessões e operações Connect. Os três novos MD5 conferidos com arquivos locais: `34fa7602285abc5aafaed8a34c5733b5`, `81f5a9a345580fedb43ed7c5951e3d79`, `43a75da04d3228214e260201a2ea36af`.
- CI anterior da PR #33, head2bd58249, continuava aprovado para o corte anterior: 429 testes +4TODO e176E2E +10pulados. A integração do lote novo à branch de revisão exige CI próprio e registro do checkout efetivo; o resultado é atualizado na descrição/comentários da PR.
- Protótipo visual de estoque/pedido interno conferido em desktop1360px e celular360px: 11 lojas, detalhes de pendência, quantidade zero recusada, criação simulada e saldo preservado, sem erro de JavaScript ou excesso de largura. Isso não testa o backend de transferência, que ainda precisa ser implementado.

## 6. Complemento da revisão de merges

Com o lote novo, o histórico analisado soma **149 commits, 43 merges e 81 árvores Git**. Os oito novos merges têm base única; nenhum manteve caminho removido pelo outro lado. O corte anterior tinha um merge documental com duas bases, tratado separadamente.

Agora houve resolução combinando arquivos operacionais em `8253c65` e `454736a`: navegação, matcher SSR e E2E de acesso. O resultado final preserva **`/estoque`, `/connect` e `/notas`** nos três pontos, sem rota anterior esquecida nesses arquivos. Os demais caminhos novos dessas resoluções são fila/rastreabilidade/status.

Não foi demonstrada restauração indevida por resolução textual do Git. **#55 é uma falha concreta de integração do componente novo com um caminho anterior:** o worker Nogle foi acrescentado, mas o filtro de publicação web permaneceu limitado às chaves antigas. Esse tipo de erro não exige conflito textual para acontecer. O caso #48 continua exemplo de regra duplicada entre SQL e TypeScript que necessita paridade.

[Análise histórica e protocolo de remoção/merge](REVISAO_MERGES_E_DUPLICIDADES_2026-11-09.md). Não apagar migrations, wrappers necessários ou rollback referenciado para eliminar duplicidade aparente. Identificar canônicos, atualizar consumidores/contratos e então remover obsoletos. Crontab e processos da VPS permanecem a conferir pelo Claude no ambiente autorizado.

## 7. Estoque e imagem do proprietário

A foto do produto precisa acompanhar catálogo, busca, PDV e estoque. A nova tela real já acrescentou fotos no estoque, mas as correções #40–#43 e homologação continuam pendentes. O padrão de limitar antes de filtrar aparece também no novo estoque (500 saldos); não presumir que todos os produtos da rede estão acessíveis por essa listagem.

Na imagem, físico6755 confere com a soma das linhas; disponível6688 difere da soma6725 em37; pendências31 diferem do físico menos disponível das linhas30. Almirante Tamandaré tem diferença3 e pendência4. Não corrigir os números por suposição. Conciliar a exportação e a regra de reserva/trânsito/exceção antes de importar.

O proprietário confirmou que são somente as **11 lojas** da imagem. “DEFEITOS” recebe transferências por erro/problema e precisa de tipo/regra próprios. A lista oficial substitui os 13 nomes fictícios adicionais da demo, sem confundir semente fictícia com cadastro real. O novo fluxo #60 inclui pedido, separação, envio, recebimento e divergência com livro/idempotência/identidade preservados.

Contagem atual da rastreabilidade: **179 requisitos** — 9 testados em desenvolvimento, 48 parciais, 11 em demonstração, 108 não iniciados, 2 bloqueados e 1 restrição respeitada. **Nenhum homologado**. O recorte piloto continua 71 requisitos. Esses números não são contagem de funções disponíveis em produção.

## 8. Ordem concreta para o Claude

1. Corrigir acesso/autoridade de #27–#30 e os bloqueantes financeiros #45–#51; tratar validação/concorrência #52/#53. A nova proteção de chip com operação viva é avanço, mas não resolve o retorno físico automático de todos os demais itens de #51.
2. Corrigir #55–#59, manter o controle positivo de produção única e transformar provas resolvidas em regressões. Conferir contrato entre publicação, worker, domínio, SQL, DTO e UI após cada merge.
3. Validar com a Contel as perguntas bloqueantes e concluir #54 por fluxo vertical: operação + cobrança/pagamento + confirmação + produção + carteira/repasse. Desenvolver contratos/testes sem credenciais; homologar com acesso autorizado e evidência oficial.
4. Cadastrar as 11 lojas e DEFEITOS conforme referência confirmada, conciliar importação e implementar #60 usando a proposta visual como referência. Capinhas/aparelhos usam estoque interno; chips também se correlacionam à Nogle quando o contrato exigir.
5. Manter fotos obrigatórias, histórico e recuperação; ampliar os testes de filtro/paginação, concorrência, duplicidade, transferência e permissões. Não marcar entrega pelo mockup.
6. Homologar uma loja piloto com operações/extratos/estoque/fiscal reconciliados e plano de retorno; expandir às11 lojas após aceite. Comissão/repasse, fiscal automático e demais módulos só ficam concluídos com seus próprios critérios e contratos.

**Limite das fontes:** análise baseada nas mensagens e imagem fornecidas nesta conversa, arquivos/commits acessíveis do repositório e documentação oficial. O link privado de projeto ChatGPT citado anteriormente não forneceu as outras conversas completas neste ambiente; não se afirma leitura de conteúdo inacessível. Planejamento histórico preservado; decisões recentes acima têm precedência.
