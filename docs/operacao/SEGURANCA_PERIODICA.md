# Revisão periódica de segurança e das dependências (proposta)

**Data:** 14/11/2026 · **Autor:** Claude Code · **Revisor:** Codex · **Decide:** proprietário
**Requisito:** ORA-QUAL-014 (análise de segurança periódica e monitoramento de dependências; aceite: atualizações e vulnerabilidades triadas). **Liga com:** ORA-QUAL-001 (CI), ORA-QUAL-004 (segredos), ORA-QUAL-002 (RLS) e o [plano de contingência e incidentes](CONTINGENCIA_E_INCIDENTES.md).

> **Situação:** o que é automático já está no repositório (lote Q3). O que depende do proprietário está marcado como **pendente**.

## 1. O que roda sozinho

| Quando | O quê | Onde | Se achar problema |
|---|---|---|---|
| A cada PR e a cada envio à `main` | Segredos nos arquivos e nos commits, lint, tipos, testes, build, `npm audit --omit=dev` e E2E | `.github/workflows/ci.yml` (e a mesma sequência no servidor antes de cada merge) | O CI falha e nada entra na `main` |
| Toda segunda-feira, 8h (Brasília) | Segredos em todo o histórico; vulnerabilidade alta ou crítica nas dependências da produção; crítica em qualquer dependência; relatório completo do `npm audit` e do `npm outdated` | `.github/workflows/seguranca-semanal.yml` (também pode ser disparada à mão, na aba Actions) | A verificação falha e o GitHub avisa por e-mail |
| Toda segunda-feira, 8h | PR de atualização das dependências (correções e versões menores juntas; versão maior sozinha) | `.github/dependabot.yml` | A PR passa pelo CI e pela revisão como qualquer mudança; nada entra sozinho |
| Todo mês | PR de atualização das ações do GitHub (fixadas pelo código do commit) | `.github/dependabot.yml` | Idem |

## 2. Triagem: o que fazer com cada achado

| Gravidade | Onde está | Prazo para decidir | O que fazer |
|---|---|---|---|
| **Crítica ou alta** | Dependência da produção (vai para o servidor) | Em até 2 dias úteis | Corrigir (atualizar a dependência ou trocar), com o CI limpo; se não houver correção, avaliar se o caminho vulnerável é usado e registrar a decisão abaixo |
| **Crítica** | Só de desenvolvimento (lint, testes, build) | Em até 7 dias | Atualizar; se só houver correção com quebra, registrar o risco e a data de rever |
| **Moderada ou baixa** | Qualquer uma | Na revisão mensal | Atualizar quando a correção não quebrar; senão, registrar o risco aceito |
| **Segredo num commit** | Qualquer arquivo ou commit | Na hora | Trocar a credencial (quem tem acesso a ela: o proprietário), e só então limpar o histórico; nunca colar o segredo no chat |

Quem faz: o Claude Code propõe a correção numa branch; o Codex revisa; o proprietário aprova o que muda acesso, dados ou produção.

## 3. Revisão mensal (lista para conferir)

- [ ] Ler o relatório da última verificação semanal e as PRs abertas do Dependabot.
- [ ] Conferir os avisos de segurança e de desempenho do Supabase (advisors) no banco de desenvolvimento e registrar os novos.
- [ ] Conferir que o inventário de autorização (`packages/banco/src/autorizacao-funcoes.test.ts`) cobre todas as funções expostas (o próprio teste falha se faltar uma).
- [ ] Rever quem tem acesso: pessoas com papel de dono e administrador, convites abertos, contas bloqueadas (tela Equipe).
- [ ] Confirmar com o proprietário a troca periódica das credenciais (chaves do Supabase, Nogle, fiscal), sem que elas apareçam no chat.
- [ ] Registrar abaixo o que foi decidido.

## 4. Linha de base (14/11/2026)

- **Produção** (`npm audit --omit=dev`): **0 vulnerabilidades**.
- **Desenvolvimento** (`npm audit`): **8 moderadas, todas da mesma cadeia**: `minimatch` 7.0.0 a 11.0.0 (risco de negação de serviço com padrões de arquivo montados de propósito), usado pelo `typescript-eslint` dentro do `eslint-config-next`. A única correção oferecida pelo `npm` é voltar o `eslint-config-next` para a versão 15 (quebra o lint do Next 16). **Decisão proposta:** risco aceito até a correção chegar por cima: é ferramenta de lint, que só roda no desenvolvimento e no CI, com padrões escritos pela própria equipe; nada disso roda no site no ar. Rever na próxima revisão mensal.
- **Segredos:** nenhum nos arquivos nem em todo o histórico (`npm run segredos -- --historico HEAD`).
- **Desatualizadas com versão maior nova:** TypeScript 7, ESLint 10, `@types/node` 26 e `embedded-postgres` 18 (plano à parte; versão maior pede ajuste de código e é decidida lote a lote).

## 5. Registro das decisões

| Data | Achado | Decisão | Rever em |
|---|---|---|---|
| 14/11/2026 | 8 moderadas em dependências só de desenvolvimento (`minimatch` via `eslint-config-next`) | Risco aceito (proposta; o Codex confere): sem correção sem quebra; nada roda no site no ar | Revisão mensal de dezembro |

## 6. Pendências do proprietário

- **Ligar os alertas do Dependabot** no GitHub (Settings → Code security: "Dependabot alerts" e "Dependabot security updates"). O arquivo `.github/dependabot.yml` já faz as atualizações semanais; os alertas e as atualizações de segurança imediatas dependem dessa chave, que só o dono do repositório liga.
- **Quem recebe o e-mail** da verificação semanal: hoje, quem fez o último commit do arquivo do agendamento. Se for outra pessoa, dizer quem (ligar com a decisão D-042, atendimento de incidentes).
- **O servidor** (sistema operacional, Node e o painel de hospedagem) fica fora deste roteiro: é do proprietário e da hospedagem.
