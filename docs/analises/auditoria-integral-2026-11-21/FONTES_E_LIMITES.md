# Fontes, relatórios anteriores e limites

## Corte e precedência

- GitHub: `oraconect5g-boop/sistema-ora5g`, main `c1b8e6086d509f388e6080eb829af7a8b6ac316b`; comparação desde `27b4f6e`.
- Supabase: `qgnbeuugklzzcevdzrvg`, consultas somente de leitura, sem dados pessoais de clientes nem valores de segredos.
- Domínio: `https://ora5g.com.br`; HTTP, build/SHA, navegação pública desktop e móvel.
- Conversa visível do proprietário e anexos já disponíveis, incluindo o XLSX original. O link privado do projeto ChatGPT não disponibiliza as outras conversas; não se declara leitura de conteúdo inacessível.
- Hierarquia: decisão explícita recente > ADR/regra validada > planejamento > pesquisa/protótipo > inferência. D-049/050/051 constam como decisões posteriores no Git. A desativação da demo é registrada dessa forma, sem fingir que a fala original consta integralmente desta sessão.

## Relatórios que continuam acessíveis

- [PR #104](https://github.com/oraconect5g-boop/sistema-ora5g/pull/104): auditoria de 17/11 e reanálise de 18/11 completas, 52 arquivos, branch `docs/auditoria-planejamento-20261117`. [Entrada de 18/11](https://github.com/oraconect5g-boop/sistema-ora5g/blob/docs/auditoria-planejamento-20261117/docs/analises/reanalise-2026-11-18/README.md). O pacote atual complementa, não apaga esse histórico. A PR estava aberta e com conflito de merge na consulta; seus arquivos podem ser lidos sem merge.
- Pacotes anteriores: PRs #33, #66, #67, #68, #77, #81, #85, #86, #97 e #100, localizados pelo índice `docs/alinhamento/ISSUES_E_PRS_2026-11-17.md` e pelos checkpoints. Não supor que todos os arquivos dessas branches estão na main.
- Relatórios incorporados à main: `docs/analises/`, `docs/alinhamento/INDICE_RELATORIOS_CODEX_2026-11-09.md`, `REVISOES_CODEX.md`, `RECONCILIACAO_CODEX_2026-11-09.md`, `LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16.md`, `LEITURA_AUDITORIA_2026-11-17.md`, `LEITURA_REANALISE_2026-11-18.md`.
- Planejamento: `docs/00` a `docs/13`, 23 ADRs, `backlog.json`, `status-requisitos.json`, checkpoint, fila e 64 roteiros em `docs/aceite`.
- Referência histórica inicial: `originais/`, cópias da skill interna, protótipos e relatório web em `REVISAO_CLAUDE_E_RELATORIO_WEB_2026-11-08.md` / `ADENDO_PROMPT_REVISAO_WEB_E_NOGLE.md`.

O inventário `FONTES_DOCUMENTAIS.csv` enumera os documentos do corte. A leitura histórica desta auditoria aproveita as consolidações e revalida os achados relevantes ao código atual; não afirma ter repetido todos os testes de cada PR antiga ou lido linha por linha todos os 1,6 MB de documentos históricos não incorporados. O Claude deve registrar essa cobertura por tema ao executar cada lote, como exige o próprio índice.

## Cobertura e o que não foi feito

- Inventário completo de caminhos/blobs; textos com SHA verificado; inspeção dirigida dos módulos alterados, riscos financeiros, importação e integração; comparação integral dos 179 registros e notas.
- Reexecução de testes selecionados, prova original privada, três regressões sintéticas novas; banco remoto sem mutações.
- Sem SSH, leitura de `.env` real, alterações de chaves, emissão fiscal, cobranças, disparo WhatsApp ou ativação de chip.
- Sem login autenticado próprio no site: os testes J1–J3 são evidência do Claude, com os limites identificados. Página protegida que redireciona não prova o conteúdo autenticado.
- 16 binários visuais inventariados, não obtidos pelo conector. Não há erro de código atribuído a essa limitação.
- Igualdade das versões de migrations não certifica o corpo de todas as funções/tabelas. RLS habilitada não certifica sozinho que toda policy é correta.
- 179 requisitos possuem tamanhos e complexidades diferentes; porcentagem de estados não é estimativa de prazo.

## Qualificação das evidências

**Reproduzido:** F21-01/F21-02. **Observado ao vivo:** counts, versões SQL, RLS/grants/buckets, cron/logs, build/SHA e vitrine vazia. **Reexecutado localmente:** 240 casos existentes verdes, 1 falha do arquivo original. **Documental:** homologações do Claude com login, presença de chaves no servidor e decisões posteriores. **Pendente:** aceite do proprietário e contratos externos.
