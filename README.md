# ORA 5G — PACOTE DE TRANSFERÊNCIA PARA CLAUDE CODE E CODEX

> **Estado atual (07/11/2026):** o projeto já tem código. Comece por `docs/ESTADO_ATUAL_E_PASSAGEM.md` e `docs/alinhamento/ANALISE_DO_PLANO.md`. Este README descreve o pacote de planejamento original.

**Versão documental:** 2026-11-05 — baseline de planejamento, **não** evidência de software implementado.
**Propósito:** permitir que Claude Code/Claude e OpenAI Codex continuem o desenvolvimento com o mesmo contexto, prioridades, limites de segurança e critérios de qualidade discutidos com o proprietário.

## Como importar

### Claude (interface de conversa)
1. Anexe os arquivos de `docs/` (o antigo `ORA5G_DOSSIE_MESTRE_UNIFICADO.md` era só a concatenação deles e não está no repositório) e, se for útil, `referencias_visuais/ora5g_visao_geral_telas.png`.
2. Cole o texto de `PARA_COLAR_NO_CLAUDE.md` na primeira mensagem.
3. Peça uma leitura crítica e validação do entendimento ANTES de iniciar qualquer código.
4. Os três relatórios detalhados em `originais/research/` podem ser anexados adicionalmente caso Claude precise consultar uma pesquisa específica.

### Claude Code (terminal / projeto Git)
1. Extraia **todo o conteúdo** deste ZIP dentro da raiz do repositório privado Ora 5G ou em uma pasta temporária que será incorporada ao repositório. Se já houver um repositório, **não sobrescreva arquivos existentes sem revisão**; compare primeiro.
2. Garanta que `CLAUDE.md` esteja na raiz do repositório e que `AGENTS.md` esteja disponível ao Codex.
3. Peça ao Claude Code para ler `README.md`, `CLAUDE.md`, `docs/00_CONTEXTO_E_DECISOES.md`, `docs/01_REQUISITOS.md`, `docs/02_ARQUITETURA.md`, `docs/03_DADOS.md`, `docs/07_ROADMAP.md`, `docs/10_DECISOES_PENDENTES.md` e os demais documentos conforme a tarefa.
4. Abra uma branch para documentação/planejamento e faça revisão antes de merge. **Não executar migrations nem tocar no banco de produção na importação.**
5. Cada etapa deve virar issues pequenas, com critérios de aceitação; o backlog inicial está em `backlog.json`.

## Arquivos importantes

| Caminho | Conteúdo |
|---|---|
| `PARA_COLAR_NO_CLAUDE.md` | Prompt pronto para iniciar a conversa |
| `CLAUDE.md` | Regras obrigatórias para Claude Code |
| `AGENTS.md` | Regras compartilhadas para Codex e agentes |
| `docs/00_CONTEXTO_E_DECISOES.md` | Negócio, objetivos, decisões, hierarquia de fontes |
| `docs/01_REQUISITOS.md` | Requisitos rastreáveis por módulo |
| `docs/02_ARQUITETURA.md` | Arquitetura, módulos, eventos, consistência e segurança |
| `docs/03_DADOS.md` | Modelo de dados conceitual e restrições |
| `docs/04_FLUXOS.md` | Jornadas transacionais e exceções |
| `docs/05_PERMISSOES.md` | Perfis, lojas e aprovações |
| `docs/06_INTEGRACOES.md` | APIs, canais e riscos de integração |
| `docs/07_ROADMAP.md` | Etapas, dependências, marcos e prazos indicativos |
| `docs/08_DESIGN_E_TELAS.md` | Mapa de telas, componentes e padrões visuais |
| `docs/09_TESTES_E_ACEITE.md` | Estratégia de qualidade e casos E2E |
| `docs/10_DECISOES_PENDENTES.md` | Perguntas de negócio/técnicas que exigem confirmação |
| `docs/11_OPERACAO_DOS_AGENTES.md` | Claude Code + Codex, branches, PRs, DoD |
| `docs/12_HISTORICO_E_PROVENIENCIA.md` | Trechos verbatim, evolução das decisões e lacunas |
| `backlog.json` | Backlog inicial legível por máquina, não tickets executados |
| `originais/research/*.md` | **Três relatórios completos** da Pesquisa Aprofundada |
| `originais/historico/*.md` | Texto inicial de conversa fornecido anteriormente |
| `referencias_visuais/` | Protótipo HTML, guia de estilo, 10 PNGs e vídeo MP4 |

## Regras de interpretação

**P0 — Decisão explícita do usuário:** deve ser preservada até mudança explícita.
**P1 — Proposta técnica recomendada:** adequada como base, mas depende de ADR e validação humana.
**P2 — Hipótese/integração não verificada:** NÃO codificar como se fosse contrato confirmado.
**P3 — Proposta antiga superada:** guardar como histórico, NÃO seguir por padrão.

**Exemplos importantes:**
- Rein = **apenas importação inicial por arquivos** de produtos/preços; não projetar API Rein em operações diárias (P0).
- 14 lojas existentes, validar uma loja piloto antes de expandir (P0).
- UX vendedor mobile-first; algumas lojas não têm notebook nem scanner (P0).
- PicPay POS é usado; **não** pressupor API específica do terminal (P0 sobre uso, P2 sobre API).
- Nogle documentação: `https://docs.nogle.tech/`; credenciais privadas NÃO estão neste pacote; endpoints exigem validação (P0 sobre intenção, P2 sobre contratos).
- WordPress/WooCommerce, GHL, Bling etc. apareceram nas **primeiras sugestões exploratórias**, posteriormente superadas como arquitetura central pela intenção de plataforma própria. Podem servir de benchmark, não dependências obrigatórias (P3).
- Evitar reescritas destrutivas, mas **não prometer zero migrations**: banco evolui com migrations versionadas (P1 corrigida).
- Dados ilustrativos do protótipo **não são dados reais**.

## Limites deste pacote

Este pacote consolida o contexto atual disponível, o texto de conversa inicial e os três relatórios de pesquisa localizados na Biblioteca. **Não há confirmação de que um repositório executável já exista, nem de que endpoints Nogle/PicPay/marketplaces tenham sido homologados, nem de que requisitos fiscais estejam validados por contador.** Falhas, dados faltantes e decisões pendentes são explicitados, em vez de inventados.

**Próxima ação:** Claude Code deve realizar a *Etapa 0: descoberta/validação dos requisitos e do ambiente existente*, produzir um relatório de divergências e abrir o backlog antes de criar schemas/migrations ou funcionalidades operacionais.
