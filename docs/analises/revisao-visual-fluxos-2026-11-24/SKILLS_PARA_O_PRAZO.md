# As skills do artigo e o prazo do Ora

Artigo analisado: https://www.welcomedeveloper.com/posts/the-10-claude-code-skills/ (08/04/2026; consultado em 24/11/2026). A lista é uma seleção pessoal, não um teste de produtividade no Ora. As recomendações abaixo vêm da comparação com nosso repositório e dos arquivos atuais dos fornecedores. Não há evidência para prometer uma redução percentual ou garantia de entrega em cinco dias.

## Avaliação individual

| Item do artigo | Decisão para estes cinco dias | Aplicação concreta no Ora |
|---|---|---|
| `superpowers` | Usar seletivamente debugging e verificação | Investigar F24-01 pela UI/RPC/SQL, transformar reprodução em regressão e só declarar corrigido depois do teste; evitar reabrir todo o planejamento |
| `vercel-react-best-practices` | Alta utilidade | Revisar consultas e componentes nas áreas agrupadas; medir carregamento antes/depois; não trocar Server Actions por outra API nem cachear dados entre lojas/usuários sem isolamento |
| `frontend-design` | Uso delimitado | Hierarquia de estoque/PDV/financeiro mantendo azul, componentes e vocabulário atuais. Evitar nova identidade, animações e biblioteca de UI nesta entrega |
| `spartan-ai-toolkit` | Não instalar o pacote inteiro durante a estabilização | O CI já executa segredos, rastreabilidade, lint, tipos, testes, build, orçamento e E2E. Adotar outro fluxo inteiro agora duplicaria configuração; aproveitar apenas lacuna comprovada |
| `mattpocock/skills` | Opcional por tarefa | Útil para um refactor delimitado e testes de contrato. Evitar sobrepor dois processos de TDD/planejamento e ciclos de confirmação a cada arquivo |
| `planetscale` | Não priorizar | O serviço usado é Supabase/PostgreSQL. O pacote atual é centrado no operador/CLI da PlanetScale; sua adoção não corrige RLS, migrations ou saldo no ambiente usado |
| `web-design-guidelines` | Alta utilidade | Revisar foco, formulários, rótulos, navegação, estados vazios, gráficos e tamanho de ações; gerar arquivo/linha e prova visual |
| `doc-coauthoring` | Só para consolidar o necessário | Atualizar roteiro de jornada e dependências sem criar outro conjunto concorrente de relatórios; corrigir F24-05 |
| `code-simplifier` | Após teste verde, em trechos alterados | Reduzir duplicação de apresentação/parsificação com comportamento preservado e diff pequeno; evitar reescrever cálculos financeiros ou autorização |
| `TerraShark` | Não priorizar | Não há arquivos Terraform no snapshot; introduzir infraestrutura como código agora não resolve os bloqueios operacionais encontrados |

**Complemento mais adequado ao banco:** `supabase-postgres-best-practices`, mantida pelo Supabase, para paginação, índices, concorrência e RLS. Reutilizar as skills oficiais Supabase já disponíveis e o fluxo de migrations do repositório.

## O projeto já tem a skill mais específica

`.claude/skills/engenheiro-senior-ora5g/SKILL.md` cobre nossa arquitetura e regras. Ela deve ser reconciliada com a main atual: ainda cita um corte de 09/11 e um prazo histórico de seis meses. A própria skill determina consultar o estado atualizado. A instrução recente de estabilização em cinco dias prevalece; não apagar o escopo por causa do prazo.

A habilidade de fechar a tarefa depende do conjunto: critério de aceite claro, dado real, teste, revisão, domínio atualizado e aceite de negócio. Instalar uma skill não cria credencial, contrato, CNPJ, foto correta nem aprovação do proprietário. Skill é orientação de trabalho; a imposição automática de checks depende do CI/hooks efetivamente configurados.

## Configuração recomendada para Claude, como proposta

Manter um único processo principal: skill Ora + AGENTS/CLAUDE + critérios desta revisão. Acrescentar referências especializadas somente quando o lote tocar a área: debugging para defeitos; React para páginas; guidelines para UI; Supabase para SQL. Reservar no máximo um curto bloco inicial de preparação e não transformar a instalação em outra frente de desenvolvimento.

Antes de instalar qualquer referência: verificar origem oficial, conteúdo e versão, escopo de ativação e scripts/hooks incluídos; preferir configuração no repositório a alterações globais em todos os projetos. Congelar a versão utilizada durante a estabilização e registrar sua origem. Não copiar comandos antigos do artigo sem conferir o README atual.

Observações verificadas sobre o artigo:

- O endereço de Spartan redireciona para `c0x12c/ai-toolkit`; consultar o mantenedor atual.
- O pacote oficial de React consultado está em `vercel-labs/agent-skills`, pasta `skills/react-best-practices`. Um diretório de terceiros não substitui a fonte do fornecedor.
- A skill atual `web-design-guidelines` usa referência empacotada com hash; não presumir o comportamento de download descrito meses antes.
- `frontend-design` existir no repositório Anthropic não comprova que está instalado na máquina do Claude.
- A skill TDD de Matt consultada pede acordo sobre limites de teste. Neste projeto, definir as jornadas/contratos de teste uma vez evita criar uma nova fila de decisões por arquivo; não misturar essa exigência com aprovação de negócio já registrada.

## Como demonstrar que ajudou

Escolher F24-01 e uma melhoria de navegação. Medir tempo até reproduzir/corrigir, quantidade de tentativas, testes relevantes, regressões, passos do usuário e conclusão no domínio. Manter a skill se reduzir retrabalho com a mesma qualidade. Número de skills, estrelas e quantidade de código gerado não são métricas de entrega.

## Fontes primárias consultadas

- https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md
- https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md
- https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md
- https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- https://github.com/c0x12c/ai-toolkit/blob/master/README.md
- https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md
- https://github.com/planetscale/skills/blob/main/README.md
- https://github.com/anthropics/skills/blob/main/skills/doc-coauthoring/SKILL.md
- https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-simplifier/agents/code-simplifier.md
- https://github.com/LukasNiessen/terrashark/blob/main/SKILL.md
- https://github.com/supabase/agent-skills
- https://code.claude.com/docs/en/skills

Nenhuma destas skills foi instalada ou autorizada a executar comandos nesta auditoria. Os exemplos de soluções permanecem propostas para avaliação.
