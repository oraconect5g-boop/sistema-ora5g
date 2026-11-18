# Leitura da auditoria do Codex de 17/11/2026 (PR #104)

- **O pacote:** o PR #104 (branch `docs/auditoria-planejamento-20261117`, commit `49349d8`, aberto em 17/11 às 22:21 de Brasília), pasta `docs/analises/auditoria-planejamento-2026-11-17/`, com 33 arquivos.
- **O corte auditado:** `03123d0`, o merge do REIN-a (17/11, 14:40).
- **Comparado com:**
  - a `main` em `7c7bdf1` (no ar desde as 22:19 de 17/11);
  - o banco `ora5g-dev`;
  - o domínio `ora5g.com.br`, consultado entre 22:25 e 22:45 de 17/11.
- **Quem leu:** Claude Code, a pedido do proprietário em 17/11 ("Leia integralmente os 33 arquivos do PR #104 [...] Compare cada achado com a main atual e o Supabase").
- **O que este registro faz:** o pacote não vem para a `main` por merge. Aqui fica o que foi lido, o que já estava corrigido, o que o lote AUD-a corrige e o que segue aberto, com a prova de cada um.

## 1. O que foi lido e como

| Arquivo | Como | O que se conferiu |
|---|---|---|
| `README.md` e `LEIA-ME.md` | por inteiro | A ordem de leitura: relatório, matriz, extras, orientação, evidências, fontes, soluções e índice. |
| `RELATORIO.md` (261 linhas) | por inteiro | Os achados F01 a F10, o que existe e o que falta por setor e a ordem recomendada. |
| `MATRIZ_179.md`, `.csv` e `.json` | por inteiro, com conferência por programa | Os três formatos são iguais: nenhuma diferença entre o JSON e o CSV, e todo texto do JSON está no MD. O estado e a nota de cada ID são cópia exata de `status-requisitos.json` em `03123d0` (nenhuma diferença). Foram lidas as 179 linhas: o requisito, o aceite e a observação da auditoria. |
| `EXTRAS_E_CONFIGURACOES.md` | por inteiro | Os aceites A01 a A20 no corte, os outros pedidos da conversa e a configuração presente, ausente e não verificada. |
| `ORIENTACAO_CLAUDE.md` | por inteiro | A ordem de trabalho seguida a partir do lote AUD-a (seção 4). |
| `SOLUCOES_VIAVEIS.md` e `VERSAO_PUBLICA_PROPOSTA.md` | por inteiro | São propostas para o proprietário avaliar. Nenhum código foi copiado. |
| `evidencias/README.md`, as 2 provas (`.test.ts`), os 6 registros (`.log`) e os 9 JSON pequenos | por inteiro | A falha do rodapé (`totalDetectado: null`, última linha 2.273, as 12 primeiras células vazias), a medição da remessa, as contagens, as rotinas, os perfis, o audit e os registros. |
| `evidencias/migrations_hashes.json` (99 versões) e `evidencias/seguranca_estrutura.json` (101 relações) | por programa | Conferidos contra o banco de hoje (seção 2). |
| `FONTES.md` | por inteiro e por programa | Os 120 blobs citados conferem com `03123d0`. Os 10 PRs históricos citados: #33, #66, #67, #68, #77, #81, #85, #86, #97 e #100. |
| `FONTES_HISTORICAS_16_11.md` | por programa | É idêntico, byte a byte, ao `FONTES_COMPLETAS.md` do PR #100, já registrado em [`LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16.md`](LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16.md). |
| `INVENTARIO_ARQUIVOS.csv` (1.203 linhas) | por programa | Os 1.203 blobs conferem com `03123d0`, e nenhum arquivo da árvore ficou de fora. |
| `SHA256SUMS.txt` | por programa | 32 de 32 certos. |
| A descrição do PR #104 | por inteiro | Bate com o README. O PR não tem comentários. |

**Os relatórios históricos referenciados:** nenhum dos 10 PRs mudou depois da leitura registrada em 16 e 17/11 (o mais novo, o #100, é de 16/11 às 19:26). O que de cada um ainda falta ler por inteiro continua listado em `LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16.md`, seção 3.

## 2. Os achados do corte comparados com hoje

| Achado | No corte (`03123d0`) | Hoje (`7c7bdf1` e o lote AUD-a) | Prova |
|---|---|---|---|
| **F01:** o rodapé da planilha da Rein | `linhaDeTotal` exigia uma célula começando por "Total". A linha 2.273 do arquivo, só com números, entrava como produto: 2.272 linhas em vez de 2.271. | **Corrigido no AUD-a.** O rodapé de totais sem rótulo fica de fora: é a última linha, sem código e sem nome, com números em duas colunas ou mais. A prévia mostra o motivo e em quantas colunas o número é a soma das linhas de cima. A linha do meio sem código e a última com algum texto continuam indo à prévia, à vista. | `apps/plataforma/src/lib/importacao/catalogo.ts` (`rodapeDaPlanilha`) e os testes F01 em `catalogo.test.ts`. **Falta:** a prova com o arquivo original, que não está neste servidor (`~/entrada/rein/` vazia). |
| **F02:** uma migration além do Git | 99 no banco e 98 no Git | **Corrigido antes deste lote.** A `20261117174218_origem_das_reservas_do_site` está versionada desde o MKT-a (merge `2e3fa24`). Hoje são 105 no banco e 105 arquivos, com a do AUD-a. | `list_migrations` do conector e `packages/banco/supabase/aplicadas-dev.json` |
| **F03:** a base operacional | lojas sem estoque nem CNPJ; 1 usuário | **Segue aberto e depende do proprietário.** São 15 unidades: as 12 confirmadas, sem CNPJ, e as 3 de teste (só duas destas têm CNPJ). Há 6 produtos, nenhum publicado na loja, 0 fotos, 0 clientes, 1 usuário e 1 vínculo (o dono), 0 importações e 0 entradas. Há 2 transferências da Santa Cândida (teste) para a Muffato Santa, com 3 unidades a caminho, ainda não recebidas. | consulta ao `ora5g-dev`, sem dado pessoal |
| **F04:** as integrações | WhatsApp sem adaptador; Nogle sem operação | **Segue bloqueado por contrato.** `ADAPTADOR_DA_META_PRONTO = false` e 0 operações Ora Connect. O que falta está escrito por API no DEP-a e no ADAPT-a (ADR-020). | `apps/worker/src/whatsapp/configuracao.ts:7`; a lista única em [`docs/integracoes/APIS_E_HABILITACOES_NECESSARIAS.md`](../integracoes/APIS_E_HABILITACOES_NECESSARIAS.md) |
| **F05:** o checkout completo | não entregue | **Segue aberto.** ORA-ONLINE-002 e ORA-ONLINE-005 não iniciados. O pagamento online depende do provedor (E1). | status |
| **F06:** os nomes da demonstração | "Loja 02…11" e "13 lojas restantes" | **Segue aberto** (lote DEMO-a). | `apps/plataforma/src/demo/dados/organizacao.ts:15`; `apps/plataforma/src/app/demo/_paineis/OutrosPaineis.tsx:51` |
| **F07:** a proteção da `main` | `protected=false`, sem rulesets | **Segue aberto: é configuração do proprietário.** Consultado em 17/11, 22:3x: `protected: false` e rulesets `[]`. | API pública do GitHub. [`PENDENCIAS_DO_PROPRIETARIO.md`](../PENDENCIAS_DO_PROPRIETARIO.md), 5.5 |
| **F08:** o picomatch | 17 avisos altos, só de desenvolvimento | **Sem correção publicada.** São 16 avisos altos, todos da cadeia de desenvolvimento: eslint, typescript-eslint, fast-glob e tinyglobby, todos levando ao picomatch ≤ 4.0.7. A produção (`--omit=dev`) tem 0. O npm não tem versão do picomatch acima de 4.0.7, nem 2.x acima de 2.3.2. | `npm audit`, `npm audit --omit=dev` e `npm view picomatch versions` em 17/11 |
| **F09:** a proteção de senha vazada | desligada | **Segue: é configuração do proprietário.** O advisor de segurança ainda acusa. | `get_advisors` (security). [`PENDENCIAS_DO_PROPRIETARIO.md`](../PENDENCIAS_DO_PROPRIETARIO.md), 5.8 |
| **F10:** pedir a transferência não reserva | pedir não reserva; separar reserva; enviar baixa | **Decisão do proprietário: [D-049](../10_DECISOES_PENDENTES.md).** O padrão do TRF-a segue até a resposta. | `packages/banco/src/transferencia-remessa.test.ts` |

**O que mais o pacote apontou e como está:**

1. **A13, a contabilidade dos canais (ORA-MKTPL-005 e ORA-MKTPL-008):**
   - No corte, os oito requisitos de marketplace estavam não iniciados. O MKTPL-a (17/11, depois do corte) trouxe os pedidos por arquivo, com o lucro de cada pedido.
   - O A13 pede o líquido previsto e o recebido, o repasse e as divergências, reconciliados com o extrato. O A10 pede a importação automática.
   - **No AUD-a, os dois voltam a parcial**, com o que falta escrito.
2. **A14, os anúncios:**
   - No corte, os seis requisitos META estavam não iniciados. O META-a (17/11, depois do corte) trouxe o custo por arquivo.
   - O A14 pede o CPA, o ROAS e o CAC com as devoluções e o custo, a moeda e o fuso, e o aviso de que atribuição não é prova de causa.
   - **No AUD-a:** o painel desconta as devoluções (migration `20261118014003_anuncios_com_devolucoes`). A importação aceita só real (BRL). A tela explica o fuso e a causa.
   - A importação automática é o ORA-META-001, que continua parcial e depende da conta de anúncios (D-022).
3. **A16, a demonstração:** os fluxos novos (extratos, anúncios, marketplaces e canais) ainda não estão na demonstração. Vai no lote DEMO-a, com a regra que hoje esconde a demonstração em produção (`apps/plataforma/src/demo/sessao.ts:9`).
4. **A18, a tela de entregas:** `/entregas` e `/saude/versao` existem. A tela lê o checkpoint do Git, que fica um lote atrás do site de propósito: cada lote registra a publicação do anterior só depois de conferir o domínio.
5. **Os IDs sem entrada no arquivo de status:** eram 41 no corte e 16 em `7c7bdf1`. **No AUD-a, os 16 ganham entrada própria** (não iniciado, com o que falta), e nenhum ID fica mais no padrão calado.
6. **O `.env.example` da raiz:** o comentário dos endereços de produção (`app.` e `loja.`) era histórico. **Corrigido no AUD-a:** o domínio é `ora5g.com.br`, com a loja em `/loja`.
7. **Os advisors de segurança hoje (17/11, 22:3x):**
   - 17 tabelas com RLS e sem política, todas fechadas (as do esquema `privado` e as duas do pedido de compra);
   - 6 funções que o visitante executa, todas de propósito:
     - as 3 da loja;
     - a `saude_do_banco`;
     - a `avisos_a_enviar` e a `avisos_resultado`, que só respondem com o segredo do worker;
   - 192 funções do usuário logado, o mesmo número do inventário de autorização;
   - a senha vazada (F09).

## 3. Decisões válidas e conflitos

**Decisões do pacote que valem e foram seguidas:**

1. Nenhuma tela, variável de ambiente ou teste com simulação conta como integração pronta. "Pronto no código", "configuração pendente", "publicado" e "homologado" têm significados diferentes.
2. Cada achado foi comparado com o código de hoje antes de ser tratado como aberto: o F02 já estava corrigido.
3. Nada de `SOLUCOES_VIAVEIS.md` foi copiado. O F01 seguiu a ideia de mostrar o rodapé como candidato, com o motivo à vista, mas escrita no código que já existia.
4. A pilha continua TypeScript, Next.js, Node.js e Supabase/PostgreSQL.

**Conflitos e como ficaram:**

1. **A ordem dos lotes:**
   - O plano do proprietário de 16/11 levou os lotes de 17/11 à Onda 3 (os canais). A orientação do pacote põe a base primeiro: o F01, o estoque por loja e as contas.
   - **Como ficou:** a parte da base que não depende do proprietário vem agora (o F01 no AUD-a; a prévia do estoque por loja no REIN-b, com planilha fictícia no desenho do relatório).
   - O resto da base depende dele: o arquivo no servidor e as contas de teste, que esperam a chave do servidor (J1).
2. **ORA-MKTPL-005 e ORA-MKTPL-008:** estavam "testado" pelo MKTPL-a, o que não bate com o A13. **Passam a parcial.**
3. **ORA-META-003, ORA-META-004 e ORA-META-006:** ficam testados, por arquivo, depois da correção das devoluções. A importação automática é o META-001.

## 4. O que segue, na ordem da orientação

1. **AUD-a (este lote):**
   - o F01;
   - os anúncios com as devoluções, a moeda e o fuso;
   - os estados honestos e as 16 entradas que faltavam;
   - o `.env.example`;
   - as pendências novas: D-049, a proteção da `main` e a senha vazada.
2. **REIN-b, o estoque inicial por loja** (feito em 18/11; ADR-021):
   - a prévia por local, com o físico e o disponível;
   - os negativos e os aparelhos com IMEI apontados, sem inventar número de série;
   - a aplicação pelo livro de movimentos, idempotente e aprovada pelo dono.
   - Testado com planilha fictícia no desenho do relatório. A prova com o arquivo original espera a transferência dele para o servidor.
3. **DEMO-a** (feito em 18/11; ADR-022):
   - os nomes das 11 lojas e do DEFEITOS na demonstração;
   - a regra da demonstração em produção;
   - os fluxos novos com dados fictícios (A16);
   - a matriz demonstração × real.
4. **TRF-b** (feito em 18/11, junto com o DEMO-a): o físico, o reservado, o disponível e o em trânsito à vista na origem e no destino, até a resposta da D-049.
5. **ONLINE-d:** o carrinho e o pedido do site com estados (A03). O pagamento online espera o provedor (E1).
6. **O resto da matriz**, na ordem do relatório: a operação central com os três perfis (depende das contas), a Nogle e o fiscal oficiais (dependem de contrato), o WhatsApp e as financeiras (idem), os canais com API e as demais áreas.
