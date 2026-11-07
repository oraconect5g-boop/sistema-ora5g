# Conferência das correções do Claude e orientação para a próxima implementação

**Data:** 07/11/2026 · **Base do código:** 00a35f970d977e3766571de4f3ac67978e7a2ef1 · **Adendo documental:** 503fa54170c9a83c4ae8433e473f4b3362072798
**Revisor:** Codex · **Programador:** Claude Code
**Stack mantida:** TypeScript, React/Next.js, Tailwind, Node.js e SQL PostgreSQL/Supabase.

## Conclusão

O Claude incorporou melhorias concretas a partir da revisão registrada no GitHub: isolamento de perfis/auditoria, validação de configuração pública, regras monetárias, proteção do perfil demonstrativo, estados da rastreabilidade e montagem de releases separadas. A integração preservou a linguagem e a arquitetura escolhidas.

O [CI dessa base passou](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42386097423). A conferência local também passou nos checks existentes. Isso ainda não libera operação real: há uma regressão de interface reproduzida na venda demonstrativa, uma pendência no reaproveitamento do ambiente de publicação e testes reais de sessão por concluir.

**Prioridade antes da apresentação:** corrigir [REV-015 / #13](https://github.com/oraconect5g-boop/sistema-ora5g/issues/13). Desconto de R$ 100,00 em item de R$ 79,00 derruba a tela.

O modelo mínimo e o roteiro por fase estão em [CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md](CONFIGURACAO_E_TRANSICAO_DO_MOCKUP.md). Não é necessário configurar 60 variáveis para apresentar as telas.

## Base e comparação

O PR #8, com a análise inicial, foi integrado pelo responsável enquanto esta leitura prosseguia. O Claude respondeu em [RESPOSTAS_A_REVISAO_2026-11-07.md](RESPOSTAS_A_REVISAO_2026-11-07.md), na branch de correções integrada em 00a35f97. A diferença desde b5164468 contém 34 arquivos; inclui os dois relatórios do próprio PR #8.

Esta conferência preserva os achados históricos em [REVISOES_CODEX.md](REVISOES_CODEX.md); não os apaga nem os trata como ainda ausentes quando uma correção já existe. Confirmação de uma regressão específica não equivale a homologação de todo um requisito.

As decisões verificáveis são as desta conversa e as preservadas no planejamento do repositório. O link do projeto privado ChatGPT enviado e reenviado pelo proprietário abriu somente a página de entrada, sem mensagens. Assim, a relação entre estas melhorias e aquela conversa específica continua sem evidência. A relação com os achados do Codex está explicitada nos commits e na resposta do Claude.

## Conferência dos 14 achados anteriores

| Achado | Mudança observada | Resultado da conferência |
|---|---|---|
| REV-001 / #2 | Nova política usa perfis com vínculo na organização que o gestor pode gerir | Correção confirmada no banco local: perfil exclusivo de outra organização e perfil sem vínculo não aparecem; próprio perfil continua acessível conforme regra |
| REV-002 / #3 | Auditoria ganha organizacao_id, preenchimento pela unidade e política que isola eventos sem unidade | Regressões passaram; evento sem organização fica oculto ao usuário. Não inferir proprietário de eventos antigos sem evidência nem alterar auditoria histórica por conveniência |
| REV-003 / #4 | Workflow examina histórico também no push, com intervalo antes..HEAD e fallback completo | Código e teste com adição/remoção de valor fictício conferidos. O job de histórico do push passou no GitHub |
| REV-004 / #5 | Validador aceita publishable/anon, recusa chave privilegiada; helper e boot usam a mesma regra | Testes de configuração e E2E de recusa no boot passaram. Login público não exige chave administrativa/SQL; isso valida formato, não autenticidade da credencial no serviço remoto |
| REV-005 / #6 | Encerrar vínculo sem mudar seu conteúdo não depende de papel ativo | Regressões passaram; reabrir/criar com papel inativo e trocar conteúdo pelo atalho continuam recusados |
| REV-006 / #7 | Índice único passa a incluir organização | Mesmo usuário pode ser dono em duas organizações, sem duplicar vínculo aberto na mesma; teste passou. Isso era expansão futura, não bloqueio das 14 lojas na mesma organização |
| REV-007 / #9 | Parser trata milhares sem centavos e limites seguros | Casos 1.000 e 1.000.000 agora produzem 100.000 e 100.000.000 centavos; testes originais independentes passaram |
| REV-008 / #10 | Rejeição em runtime de NaN, fração, negativos, valores inseguros e tipos desconhecidos | Casos originais foram corrigidos no domínio. A integração da UI com a exceção ainda falha no REV-015; não remover a validação para esconder esse problema |
| REV-009 / #11 | Proxy do Next.js 16 chama getClaims e propaga cookies e cabeçalhos antes de /conta | Implementação presente e build válida. Expiração/renovação com usuário real ainda pendente; manter issue aberta até comprovar |
| REV-010 | ehPerfil passa a usar Object.hasOwn | Nove casos independentes de dinheiro/perfil e regressões do projeto passaram; E2E com cookies herdados passou no celular e desktop |
| REV-011 | Status testado/homologado separados; segurança e login parciais; gerador atualizado | Conferência do arquivo gerado passou. Isso prova consistência do relatório; não certifica todos os status de negócio nem homologa requisitos |
| REV-012 | Build fora da versão ativa, troca de link e tentativa de retorno à anterior | Melhoria confirmada por inspeção e sintaxe Bash. Codex não executou o script na VPS. Ainda há REV-016; o relato operacional foi acrescentado depois, conforme seção abaixo |
| REV-013 | Vendedor deixa de ver margem/limite numérico; busca usa telefone completo | E2E passou nos dois tamanhos. Fixtures ainda contêm custo fictício no cliente; na implementação real, filtrar o payload no servidor, além de ocultar a exibição |
| REV-014 | /conta distingue erro do serviço de ausência de perfil/unidade; log só com códigos | Correção confirmada por inspeção. Falta teste automatizado que force erro de consulta; pode ser feito com serviço simulado, sem credencial real |

O fechamento de issues deve citar a base e o teste correspondente. Manter em aberto o que depende de prova de sessão/serviço, a integração do erro de dinheiro com a UI e as pendências novas. Não promover QUAL-002/QUAL-004 a aceite integral só por corrigir estes casos.

## Pendências novas ou residuais

### REV-015 — P1: entrada inválida interrompe a apresentação

**Issue:** [#13](https://github.com/oraconect5g-boop/sistema-ora5g/issues/13).

Reprodução independente na build de 00a35f97: vendedor → Nova venda → buscar capa → adicionar Capa de proteção (R$ 79,00) → digitar desconto 100,00. O navegador exibe “This page couldn’t load”, sem a mensagem de validação e sem permitir recuperar o carrinho pela correção do campo.

A UI coleta os erros de validarItem, mas chama totaisDaVenda antes de condicionar o cálculo ao estado válido. totalDoItem agora lança RangeError para desconto maior que o bruto. A correção forte do domínio revelou um consumidor que não trata o rascunho inválido.

**Aceite:** manter o carrinho, mostrar erro no campo, bloquear conclusão e recuperar o fluxo ao corrigir o desconto. Cobrir no E2E móvel/desktop; incluir formatos intermediários/malformados. Não truncar o desconto nem flexibilizar o domínio silenciosamente.

### REV-016 — P2: republicação pode conservar configuração antiga

**Issue:** [#14](https://github.com/oraconect5g-boop/sistema-ora5g/issues/14).

Por inspeção de publicar.sh: quando encontra BUILD_ID e o mesmo SHA, reaproveita a versão sem passar pelo install do arquivo externo de ambiente. Atualizar a origem e republicar o mesmo commit não atualiza a cópia consumida pelo app.

**Aceite:** considerar a configuração relevante na identidade do artefato; configuração de runtime e artefato devem corresponder. Testar duas configurações fictícias no mesmo SHA e retorno em falha, preservando a combinação anterior. Não imprimir valores nem alterar a versão ativa antecipadamente. Rebuild continua necessário quando um valor público é incorporado à build.

### CONFIG-001 — grupos implementados; guia e compatibilidade por concluir

**Issue:** [#12](https://github.com/oraconect5g-boop/sistema-ora5g/issues/12).

supabase_publico e supabase_servidor já existem. O par público vazio deixa a demonstração subir; parcial/invalidamente preenchido exige correção. O guia novo usa os nomes atuais. Guias antigos ainda citam supabase, removido da CLI; alinhar referências e consumidores/compatibilidade. SQL e API administrativa continuam juntos no grupo servidor, mas não devem se tornar obrigação do login público.

Este PR propõe apps/plataforma/.env.example, com quatro variáveis da aplicação e duas públicas opcionais vazias. O catálogo da raiz continua com 60 nomes. Arquivo .env.local real fica fora do Git; sua ausência no GitHub é esperada.

### Evidência de publicação e isolamento dos testes

Na base 00a35f97, a resposta ainda deixava o resultado dos testes de publicação por preencher. O adendo 503fa541, que altera somente essa documentação, registrou os três cenários: publicação normal, falha de compilação sem interromper a versão ativa e falha de inicialização com retorno à anterior em cerca de 50 segundos. O Claude informa que /saude e /demo responderam HTTP 200 ao final, com 00a35f9 ativo, e que as travas ficaram livres. Essa é uma melhoria da evidência registrada, não uma execução remota repetida pelo Codex. O teste de mudança de ambiente no mesmo SHA da REV-016 continua sem cobertura.

Uma primeira execução E2E local encontrou EADDRINUSE na porta auxiliar 3199 deixada por execução anterior. Depois de encerrar o servidor de teste conhecido e liberar a porta, a suíte inteira passou. O helper servidor-auxiliar.ts termina o npx, mas pode deixar o Next descendente vivo; isso foi observado novamente após a suíte. Ajustar o encerramento/espera da árvore de processos e a escolha/verificação da porta antes de repetir testes em ambiente compartilhado. Não encerrar processos de homologação para resolver colisão de teste.

## Evidência local e no GitHub

| Check em 00a35f97 | Resultado |
|---|---|
| CI GitHub, evento push | Sucesso no run 42386097423; passos de histórico, instalação, lint, tipos, testes, build, auditoria e E2E passaram |
| Testes existentes locais | 172 passaram: 18 aplicação, 44 banco, 42 configuração, 68 domínio; 4 todo no banco |
| Provas independentes originais reaplicadas | 14 passaram: cinco do banco e nove de leitura/validação/perfis. Os mesmos casos haviam falhado na base anterior |
| E2E existentes locais, com porta auxiliar livre | 35 passaram; 5 pulados: dois casos de login com serviço real sem configuração local e três duplicações intencionais dos testes auxiliares no celular |
| Novo E2E adversarial de desconto acima do preço | Uma falha reproduziu REV-015; não pertence à suíte existente nem foi integrado como teste vermelho |
| Lint, tipos e build | Passaram; avisos da regra de diretório pages dos pacotes sem Next continuam sem falha do comando |
| Rastreabilidade e scripts | --conferir e bash -n passaram; não houve execução de deploy |
| Modelo mínimo | Grupo aplicacao passou. Configuração pública fictícia passou sem SQL/credencial administrativa; não houve login real |
| Caminho/segredos | App .env.local ignorado, modelo permitido e scanner local passou; nenhum valor real consultado ou publicado |

As dependências não mudaram nesse delta; foi reutilizada a instalação local que já tinha sido validada. O GitHub executou npm ci do zero. Os testes auxiliares temporários foram removidos do produto após registrar os resultados.

Não houve acesso à VPS, diagnóstico dos valores reais do .env, execução de migration no Supabase real, criação de usuário, implantação ou teste de expiração contra serviço real por esta revisão.

## Próxima sequência alinhada ao planejamento

1. Concluir o mockup para apresentação com REV-015 corrigido e estado fictício sempre visível.
2. Adotar o modelo mínimo/guia; completar a compatibilidade CONFIG-001 e resolver REV-016 antes de depender de republicação para mudar ambiente.
3. Concluir ORA-006: usuário de teste autorizado, unidade permitida, sessão por turno, renovação, revogação e recuperação. SMTP do Auth/URLs no Supabase têm configuração própria.
4. Aceitar ADR-003 e implementar catálogo; depois CSV Rein em prévia, confirmação e idempotência; sem API Rein.
5. Implementar ledger/reserva/IMEI concorrente e primeira jornada PDV/caixa persistida, com autoridade no servidor, auditoria e ADR-004.
6. Homologar o piloto e seguir as ondas/integrações do plano completo. Acionar definições externas com prazo longo em paralelo; não exigir todas as chaves para o mockup.

Reaproveitar componentes visuais, tipos e regras testadas. Separar dados/ações da tela na primeira funcionalidade real, sem criar uma segunda plataforma nem antecipar camadas genéricas. Contratos e migrations incrementais reduzem retrabalho; não existe garantia de não alterar nenhuma linha no futuro.
