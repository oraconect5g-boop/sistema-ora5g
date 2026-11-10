# Instalação da habilidade Claude Code — Engenheiro Sênior Ora 5G

## Para que serve

Esta é uma **Claude Code Project Skill** para continuar o desenvolvimento real da plataforma Ora 5G. Ela não altera o código e não executa migrações automaticamente; carrega orientação de engenharia, histórico das conversas, relatório de auditoria do GitHub, critérios de qualidade e prioridades para Claude e Codex.

**Repositório auditado, somente leitura em 09/11/2026:** `oraconect5g-boop/sistema-ora5g` (`main` SHA `0292c69e4b3a5dffca770f9dc2b84f9cd21449e8`). A skill deverá reler o código atual no momento de uso.

## Instalação recomendada (Claude Code)

1. Faça uma cópia/branch de documentação do projeto e abra a pasta local **do repositório que já existe** `sistema-ora5g` no VS Code ou terminal. Não crie um repositório diferente.
2. Descompacte **o conteúdo do ZIP** na **raiz** do repositório. A pasta oculta `.claude/` deve ser mantida; a skill ficará em `.claude/skills/engenheiro-senior-ora5g/SKILL.md`. Arquivos na raiz do ZIP, como `README_INSTALACAO.md`, `AUDITORIA_GITHUB_2026-11-09.md` e `PROMPT_PARA_CLAUDE.md`, são guias adicionais.
3. Antes de copiar, confira se já existe uma skill com o mesmo nome. Se houver, compare versões e não sobrescreva sem revisão. **NÃO altere `CLAUDE.md` nem `AGENTS.md` existentes:** a skill foi projetada para trabalhar junto com eles.
4. No terminal da raiz do repositório, confira `git status` e `git branch --show-current`. Abra Claude Code e execute `/engenheiro-senior-ora5g`. Ou envie o conteúdo de `PROMPT_PARA_CLAUDE.md` ao Claude Code para a primeira avaliação.
5. Peça a **comparação somente leitura** entre a skill, o código do HEAD, o estado do Supabase documentado, os testes, as issues e a PR #33. **Não autorize merge, deploy, alteração do banco ou credenciais apenas para instalar a skill.**
6. Quando os arquivos forem revisados, um commit documental em branch própria com PR revisada por Codex é a forma segura de compartilhar a skill com os colaboradores.

## O que a skill guarda

- `SKILL.md`: regras persistentes e roteiro de comportamento.
- `references/contexto-atual.md`: negócio, decisões e mudanças de 09/11.
- `references/auditoria/github-2026-11-09.md`: auditoria estática baseada no GitHub real, com fontes.
- `references/roteiro-engenharia.md`: fases, critérios de pronto, divisão Claude/Codex e go/no-go.
- `references/fluxos-e-dominio.md`: invariantes transacionais, caixa, estoque, Nogle e fiscal.
- `references/historico/conversas-e-decisoes.md`: reconstrução cronológica e citações literais disponíveis.
- `references/historico/dossie-mestre-legado.md`: dossiê anterior, anterior ao desenvolvimento recente, **histórico**.
- `references/historico/originais/`: conversa histórica inicial e três relatórios de pesquisa originais.

A habilidade **não contém cópia dos 397 arquivos do código**. Ela referencia os arquivos originais para que Claude use o clone atual, evitando ficar preso a versões antigas. O dossiê de conversa também **não é uma exportação literal completa de todas as mensagens do ChatGPT**; preserva o contexto disponível, as fontes previamente produzidas e trechos verbatim recuperados.

## Cuidados de segurança

Não copie `.env.local`, segredos de Supabase/Nogle, certificados, tokens, dados de clientes ou arquivos de produção para a skill. Na implementação, use apenas variáveis configuradas no servidor/gerenciador de segredos; a aplicação web não deve receber chaves privadas. Os arquivos históricos aqui incluídos são documentação de planejamento e devem permanecer no repositório **privado**.

## Condição de instalação concluída

A habilidade está disponível quando `.claude/skills/engenheiro-senior-ora5g/SKILL.md` existir e Claude Code reconhecer `/engenheiro-senior-ora5g`. Após carregá-la, o primeiro resultado esperado é **uma análise de situação somente leitura**, não uma nova arquitetura, migração ou reescrita do sistema.
