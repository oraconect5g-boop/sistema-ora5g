# Publicação no domínio após cada etapa — 15/11/2026

**Verificação independente do Codex:** 15/11/2026, a partir de 19:20 de São Paulo (22:20 UTC).  
**SHA conferido na main:** `5468d9e59d6a68587ba176fff178163eec81ff9c`.  
**Pedido:** verificar se código e atualizações chegam ao servidor e aparecem no domínio ao concluir cada etapa.

## Resultado

**A versão identificada publicamente em ora5g.com.br coincide com a main neste corte.** Não foi encontrado atraso entre a versão integrada e a versão anunciada pelo aplicativo. Isso não comprova a publicação imediatamente após cada etapa histórica, nem conclui a homologação das funções.

O mecanismo continua manual: Claude executa o script de publicação no servidor. Merge não publica. O repositório tem CI e verificação semanal de segurança, sem workflow de implantação. O cron documentado recupera o processo; não busca nem publica commits novos.

## Evidência pública

| Endereço | Resposta observada |
|---|---|
| / | HTTP 200, entrada institucional da plataforma |
| /entrar | HTTP 200; **5468d9e · build 15/11/2026 18:21** |
| /demo | HTTP 200; **mesmo SHA/build**, conteúdo identificado como fictício |
| /saude | HTTP 200; **mesmo SHA/build**; serviço de login conectado |
| /loja | HTTP 200; nova vitrine real, com “Em breve” |
| /inicio, /estoque, /financeiro | HTTP 307 para /entrar, sem sessão |
| /produtos/importar, /estoque/pedidos, /conta/seguranca, /conta/confirmar | HTTP 307 para /entrar, sem sessão |

Foram conferidos **17 recursos estáticos** referenciados nas páginas públicas: todos HTTP 200. As respostas das páginas indicam `private, no-cache, no-store, max-age=0, must-revalidate`. Não se encontrou evidência de cache antigo nesta coleta. Não foi executado teste de navegador autenticado; um redirecionamento para login também não demonstra o funcionamento interno de uma rota.

A vitrine aparece, mas está vazia de produtos publicados. O texto “Em breve” coincide com o estado documentado do ONLINE-a. Publicar o código não publica automaticamente produtos, fotos, saldos nem habilita integrações.

## Código integrado versus branches

Foram enumeradas **169 branches remotas**, em duas páginas, e os **415 commits alcançáveis da main**:

- 156 pontas de branches, incluindo a própria main, pertencem ao histórico integrado.
- As branches de funcionalidades e correções enumeradas estão integradas.
- As 13 restantes são **quatro atualizações do Dependabot** (PRs #91 a #94) e **nove branches de documentação/revisão** (PRs #33, #66, #67, #68, #77, #81, #85, #86 e #97).

Essas 13 não estão integralmente na main e, portanto, não fazem parte da versão atual por mera existência no GitHub. Algumas decisões/documentos podem ter sido incorporados por outro caminho; ausência do commit não prova ausência de todo conteúdo. Não integrar atualizações de dependências sem revisão só para zerar a lista.

O delta desde a revisão de a4cf325 inclui pedidos de compra, leitor XLSX, segundo fator, confirmação recente de senha, carta de correção, relatório do titular e vitrine. Todos os commits desse delta estão na ancestralidade do SHA servido. Não foi feita nesta tarefa uma nova revisão funcional integral desses módulos.

## Banco e configuração

Consulta somente leitura ao histórico do ora5g-dev: **84 migrations**, correspondentes às 84 versões do registro Git. Nenhuma versão faltante ou extra foi encontrada. Em 83, o MD5 é exato; a margem_painel de 13/11 coincide ao acrescentar a quebra final já identificada na revisão anterior. Não há motivo para reaplicar migrations por causa dessa diferença textual.

O site responde com a vitrine habilitada; isso comprova esse efeito público da configuração, sem ler o ambiente. /saude informa apenas disponibilidade do aplicativo/Auth e declara que não lê dados do banco. Não comprova worker, RPCs de negócio, filas, credenciais de parceiros nem jornadas autenticadas.

## CI do SHA publicado: reprovado

[Run 43763184979](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43763184979), job 132962320582, **5468d9e**:

- Lint e typecheck passaram.
- **2.279 testes aprovados, um reprovado e um TODO.**
- Mesmo defeito #95: “aplicação de outras 2.000 a criar” levou **8.518 ms**, acima de 8.000 ms, em concorrencia.test.ts:977.
- Build, orçamento de desempenho, auditoria e E2E foram pulados nesta execução.

O commit/documentos afirmam execução completa verde no servidor sobre o commit de trabalho 7883ac9. Isso é registro do programador e não substitui o resultado independente do GitHub no SHA publicado. O site está no ar, mas não se pode marcar o CI dele como aprovado. Não foi executado rollback ou novo deploy pelo Codex.

Vários CIs intermediários foram cancelados; o workflow tem `cancel-in-progress: true` por referência e limite de 15 minutos. Não atribuir todos os cancelamentos à mesma causa sem seus logs.

## Falha no verificador: issue #99

[Issue #99](https://github.com/oraconect5g-boop/sistema-ora5g/issues/99): conferir-publicacao.sh lê a versão do serviço, mas decide sucesso somente pelo diretório ativo e pela ausência de commits pendentes.

Prova isolada com Git/curl simulados:

| Pasta / main | Resposta simulada do serviço | Resultado incorreto |
|---|---|---|
| 123abcd / 123abcd | v0.1.0 · deadbee | “Tudo publicado”, exit 0 |
| 123abcd / 123abcd | curl falha | “Tudo publicado”, exit 0 |

O script consulta apenas a origem local, não o domínio HTTPS. A prova confirma uma falha do controle, **não um incidente atual de versão antiga no domínio**. Corrigir no script existente e cobrir SHA ausente/divergente, serviço indisponível, origem correta/domínio antigo e branch não integrada. Não basta HTTP 200; comparar a identidade esperada.

## Encerramento obrigatório de cada etapa

A decisão do proprietário de publicar no domínio ao fim dos lotes já consta do estado desde 13/11 e foi reiterada em 15/11. O LEIA-ME da homologação ainda exigia autorização nova “a cada vez”; esta revisão alinha esse texto à autorização vigente para o fluxo habitual, preservando as decisões separadas de produção/ações críticas.

Claude deve encerrar cada etapa somente após:

1. Registrar requisito, escopo e SHA final integrado, sem encerrar como entregue o que só está em branch.
2. Concluir as verificações requeridas nesse SHA e resolver falhas; registrar o CI real. Execução local e GitHub são evidências distintas.
3. Conferir migrations, configuração e dados necessários no ambiente autorizado, sem exibir segredos e sem reaplicar versões existentes.
4. Executar a publicação de homologação já autorizada pelo procedimento existente, preservando retorno à versão anterior.
5. Comparar **SHA esperado, serviço local e domínio público**; verificar login, recursos estáticos e caminhos reais alterados.
6. Testar a função alterada com perfil autorizado na aplicação real. Alteração de backend exige evidência do efeito esperado, não necessariamente um componente visual novo.
7. Registrar horário, endereço, versão, resultado funcional, migrations e pendências. Se qualquer passo falhar, manter a etapa como pendente de publicação/validação e registrar o motivo.

Não basta “feito”, “mergeado”, processo reiniciado, pasta atualizada, CI de outro commit ou demo funcionando. O proprietário deve encontrar a mudança na rota real correspondente. Etapas de teste/documentação podem não ter mudança visual; registrar essa natureza explicitamente.

## Registro documental atrasado

O checkpoint de 5468d9e ainda diz main/publicado=db1b8a0 e “falta publicar registro da migration do ONLINE-a”. A observação pública já mostra 5468d9e. Isso é **atraso do registro**, não atraso atual do site. Guardar a evidência pós-deploy em registro operacional/issue associado ao SHA evita depender de editar o próprio commit para registrar sua futura implantação.

## Limites

Sem SSH, leitura de .env, deploy, merge, modificação de banco, login com credenciais reais ou chamada comercial externa. Não é possível atestar arquivos não enviados do workspace do programador, todos os processos do servidor, funcionamento dos workers nem cada publicação histórica. O domínio ainda atende a homologação documentada; publicação não equivale a liberação comercial.

A stack foi preservada. Relatório e provas complementam a PR #97; os cortes anteriores permanecem históricos.
