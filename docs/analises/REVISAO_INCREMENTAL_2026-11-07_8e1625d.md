# Revisão minuciosa das alterações recentes do Claude

**Data:** 07/11/2026 (Brasília)
**Código examinado:** 8e1625ddff5d320e26cef44be518884408ef1007
**Base documental anterior:** 503fa54170c9a83c4ae8433e473f4b3362072798
**Programador:** Claude Code · **Analista/revisor:** Codex

## Parecer

Os ajustes recentes melhoram a apresentação e corrigem a abertura da plataforma atrás do Apache/cPanel. A linguagem e a arquitetura foram preservadas: TypeScript, React/Next.js, Tailwind, Node.js e PostgreSQL/Supabase. Não há migrations, dependências, regras de domínio ou integrações novas nesse lote.

O [CI da main examinada passou](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42392229369). Os testes locais dos pontos afetados também passaram. Dois testes adicionais, fora da suíte existente, demonstraram falhas que continuam exigindo correção: desconto inválido derruba o PDV e um parâmetro de erro herdado derruba a página de entrada.

**Prioridade:** corrigir a [#13](https://github.com/oraconect5g-boop/sistema-ora5g/issues/13) antes de uma nova apresentação; corrigir a [#16](https://github.com/oraconect5g-boop/sistema-ora5g/issues/16) na mesma etapa de robustez da entrada. Melhorias visuais e CI verde não encerram essas falhas.

## Recorte e método

Desde 503fa541, já considerado na revisão anterior, são **10 commits e 19 arquivos alterados**. A comparação com a última base de código 00a35f97 inclui mais dois commits documentais conhecidos: **12 commits e 20 arquivos**, incluindo o relato dos testes de publicação. Não foram contabilizados como novidade técnica os dois commits já examinados.

Foram examinadas as linhas adicionadas/removidas de cada arquivo e o código ao redor dos fluxos afetados. Foram relidos estado, análise do plano, instruções dos agentes e pedido de revisão; planejamento e ADRs previamente lidos continuam como referência. O teste do fluxo de entrada exigiu examinar também os arquivos de login que não mudaram nesse lote.

A revisão se limita ao GitHub e à build local da revisão identificada. Alterações ainda não enviadas pelo Claude não estão visíveis. A validação do endereço público foi somente HTTP/GET, sem autenticar, enviar formulário, provocar falhas, acessar SSH ou ler arquivos de ambiente reais.

## Mudanças por commit

| Frente | Commits relevantes | Análise |
|---|---|---|
| Apresentação pelo domínio principal | 6fc3102, bb14add e respectivos merges | Runbook e modelo de .htaccess, com homologação interna preservada. O estado atribui a instalação ao proprietário; não foi refeita pelo Codex |
| Compatibilidade com arquivos de índice do Apache | 0ab7ad7; correção posterior 021bdc7 | A primeira tentativa de reescrita no proxy causava destino HTTPS local incorreto. A versão final usa rewrites no next.config e recebeu teste com os cabeçalhos do Apache |
| Polimento da demonstração | fbabeb9 e merge 0afc87d | Textos sem IDs internos, atalhos com rótulo explícito e resultado da venda trazido ao topo; não implementa persistência nem muda regras financeiras |
| Evidência de publicação, já conhecida | 0bdb47f e merge 503fa54 | Relata montagem separada e retorno à versão anterior. É evidência documentada pelo Claude; não foi repetida remotamente pelo Codex |

## Conferência por arquivo

Caminhos relativos à raiz do repositório. Cada linha abaixo corresponde a um arquivo do delta desde 503fa541.

| Arquivo | O que mudou e conclusão |
|---|---|
| apps/plataforma/next.config.ts | Rewrites antes dos arquivos para nomes de índice do Apache. Passaram as variações previstas, os 404 de nomes não cobertos e os cabeçalhos encaminhados; a regra final não monta URL externa no proxy |
| apps/plataforma/src/proxy.ts | Exportação proxy delega para renovarSessao; corpo de renovação e matcher de /conta preservados. Não é uma nova correção de expiração e não substitui a prova real pendente da #11 |
| apps/plataforma/e2e/saude.spec.ts | Acrescenta duas regressões: aliases de índice e GETs com X-Forwarded-*. São úteis e passaram; não incluem POST de entrada nem validação de parâmetros inválidos |
| deploy/homologacao/htaccess-dominio-principal.txt | Mantém .well-known no Apache, força HTTPS e encaminha para a porta interna; informa o protocolo original. Foi inspecionado, sem alteração de configuração remota |
| deploy/homologacao/LEIA-ME.md | Acrescenta procedimento temporário pelo domínio principal, aplicado pelo proprietário segundo o estado. O trecho “mostra Index of /” descreve a situação anterior; atualizar a redação para não parecer o estado atual |
| docs/ESTADO_ATUAL_E_PASSAGEM.md | Registra a demonstração temporária no domínio principal. Os GETs públicos confirmam a disponibilidade, mas não identificam o SHA implantado. Atualizar também as pendências após as correções confirmadas e os novos achados |
| apps/plataforma/src/demo/perfis.ts | Introduz curto em cada uma das 12 páginas, com Record tipado exigindo cobertura; mantém a matriz de acesso e os perfis |
| apps/plataforma/src/componentes/AppShell.tsx | Usa o rótulo curto em vez da primeira palavra do título; Connect deixa de aparecer apenas como Ora. O teste adicional confirmou o atalho no celular |
| apps/plataforma/src/app/demo/vender/PDV.tsx | Limpa três textos e chama scrollTo no evento de conclusão, dentro de componente cliente. O teste positivo confirmou o resultado visível no topo; o cálculo inválido da #13 permanece |
| apps/plataforma/src/app/demo/assistencia/page.tsx | Retira referência DEC do subtítulo; nenhuma mudança de estado, autorização ou operação de OS |
| apps/plataforma/src/app/demo/clientes/page.tsx | Retira referências ADR/DEC das mensagens; busca e dados de exemplo não se tornam um CRM persistido |
| apps/plataforma/src/app/demo/estoque/page.tsx | Retira o ID de tarefa da explicação da reserva futura; não acrescenta locking, ledger ou operação concorrente |
| apps/plataforma/src/app/demo/financeiro/page.tsx | Retira códigos internos; mantém explícita a dependência de emissor/contador. Não acrescenta emissão fiscal nem conciliação |
| apps/plataforma/src/app/demo/lojas/page.tsx | Limpa textos de empresa, lista e vínculos. Não altera modelo de organização, CNPJ, unidades ou permissões |
| apps/plataforma/src/app/demo/metas/page.tsx | Retira códigos de decisão e mantém ranking/incentivos como pendências; não inventa aprovação da regra de comissão |
| apps/plataforma/src/app/demo/page.tsx | Limpa explicações do administrador; não altera menus, permissões ou ações reais |
| apps/plataforma/src/app/demo/perfil/page.tsx | Troca referência ao ADR por explicação da demonstração. Cookie continua destinado somente a dados fictícios |
| apps/plataforma/src/componentes/SemPermissao.tsx | Substitui código do ADR por “matriz de permissões”; comportamento de retorno preservado |
| apps/plataforma/src/demo/dados.ts | Loja online passa de um emissor provisório afirmado para “CNPJ emissor ainda a definir”; melhora o alinhamento com a decisão pendente P10 |

O vigésimo arquivo da comparação ampliada é docs/alinhamento/RESPOSTAS_A_REVISAO_2026-11-07.md: resultados de publicação já examinados no adendo 503fa541. Nenhum segredo ou configuração real foi copiado para este relatório.

## Defeitos e pendências confirmados

### REV-015 / #13 — P1: desconto acima do preço ainda derruba o PDV

Na build atual: vendedor → Nova venda → Capa de proteção, R$ 79,00 → desconto 100,00. A tela cai e não apresenta a mensagem de validação. O teste independente foi reaplicado e falhou novamente.

PDV.tsx:118 chama totaisDaVenda antes de condicionar o cálculo a temErros, calculado na linha 120. totalDoItem rejeita corretamente desconto maior que o bruto; o consumidor da regra não trata o rascunho inválido.

**Correção:** manter carrinho/campos, apresentar erro, bloquear conclusão e recuperar ao corrigir o valor. Não retirar a validação nem truncar o desconto silenciosamente. Incluir regressão móvel/desktop. Os quatro ajustes recentes do PDV não corrigem esse ponto.

### REV-017 / #16 — P2: parâmetro de erro herdado retorna HTTP 500

Arquivo fora do delta, examinado no teste do fluxo de entrada: apps/plataforma/src/app/entrar/page.tsx:11–15 e 26.

ERROS é um objeto comum e a leitura ERROS[erro] também alcança propriedades herdadas. /entrar?erro=__proto__ tenta renderizar um objeto como conteúdo do Aviso e retorna 500. Um código desconhecido comum retorna 200. A declaração Record<string,string> não garante o tipo do acesso em runtime.

**Correção:** validar tipo e chave própria antes de renderizar. Cobrir __proto__, constructor, toString, códigos desconhecidos, parâmetros repetidos e os três códigos válidos. Preservar mensagens neutras.

Defeito anterior identificado agora: não foi introduzido pelos ajustes do Apache ou pelo polimento. Afeta a requisição correspondente; não é comprovação de queda global ou exposição de dados. A reprodução foi local, sem aplicar esse parâmetro no site público.

### Pendências anteriores que o lote não modifica

| Acompanhamento | Situação nesta revisão |
|---|---|
| #14 / REV-016 | publicar.sh não mudou: reaproveitar BUILD_ID no mesmo SHA pula a cópia do novo ambiente. Continua pendente por inspeção; o HTTP público não testa esse caso |
| #10 / REV-008 | Casos originais corrigidos; resíduo de teto exato em valores muito altos continua em código de domínio inalterado. A prova anterior permanece válida, sem repetir toda a suíte monetária neste lote |
| #11 / REV-009 | Refresh estrutural está implementado; expiração/renovação/revogação com usuário autorizado ainda sem prova do Codex. POST com campos vazios não comprova login ou refresh |
| #12 / CONFIG-001 | Grupos público/servidor já existem. Modelo mínimo e roteiro estão propostos no PR #15; não tratar arquivo ainda fora da main como já adotado no servidor |
| ORA-ORG-005 e ORA-006 | Auditoria automática de mudanças de acesso e jornada completa de sessão continuam no planejamento; não foram implementadas pelo polimento |

O estado ainda diz que os 14 achados aguardam revisão, embora sete issues já tenham sido encerradas com evidência. Atualizar o resumo e a fila do programador para incluir #13/#16; é uma pendência documental, não uma nova falha de RLS. Também reconciliar o trecho antigo de DNS planejado com P12 já registrado como conferido, sem executar mudanças de infraestrutura.

## Testes executados e limites

| Verificação | Resultado |
|---|---|
| CI GitHub da revisão 8e1625d | Sucesso no run 42392229369. Conferidos os passos de scanner/histórico, npm ci, lint, tipos, testes, build, auditoria e E2E |
| Lint, tipos e build locais | Passaram. Avisos conhecidos da regra pages nos pacotes sem Next permanecem sem falha do comando |
| Unidade da aplicação | 18 testes passaram. Banco/domínio/configuração não mudaram e não tiveram toda a suíte local repetida |
| E2E existentes | 39 passaram e 5 foram pulados: dois testes de serviço Auth real sem configuração local e três duplicações dos auxiliares no celular |
| Teste extra de /conta com cabeçalhos Apache | Passou: redirecionou à entrada sem produzir destino HTTPS local inválido; configuração local não contém par Supabase real |
| POST local da ação de entrada, campos vazios | Passou: origem encaminhada correta chegou à validação e retornou 303 para erro=dados; origem diferente foi recusada. Nenhuma requisição de senha ao Supabase |
| Atalho Connect e conclusão no celular | Passou: rótulo explícito e cabeçalho do resultado dentro da área visível após concluir |
| Query herdada na entrada | Falhou como esperado: __proto__ produziu HTTP 500 |
| Desconto acima do preço | Falhou como esperado: tela de erro em vez da validação |
| Rastreabilidade e scanner local | Passaram; consistência gerada não homologa status de negócio |

Os testes extras somam três verificações aprovadas e duas falhas reais reproduzidas. Foram executados fora do conjunto existente e retirados da árvore de produto após registrar os casos; não foram integrados como testes vermelhos.

O helper auxiliar ainda deixa o Next descendente vivo na porta de teste após terminar; o processo conhecido desta execução foi encerrado. Não houve encerramento de serviço remoto ou de homologação.

### Leitura HTTP do endereço público

Sem sessão, apenas consultas normais:

| Endereço | Resposta observada |
|---|---|
| https://ora5g.com.br/ | 200; página inicial |
| https://ora5g.com.br/demo | 200; selo de dados fictícios |
| https://ora5g.com.br/entrar | 200; página de entrada |
| https://ora5g.com.br/conta | 307 para https://ora5g.com.br/entrar |
| /index.php e /index.html no mesmo domínio | 200; página inicial |
| http://ora5g.com.br/ | 301 para HTTPS |

As páginas HTTPS examinadas contêm noindex. Isso descreve o comportamento observado, não identifica o commit em execução, não torna o ambiente privado e não comprova operação de venda, refresh ou rollback. A configuração efetiva do Apache não foi lida; a análise do .htaccess é do modelo versionado.

## Orientação para a próxima entrega

1. Corrigir #13 e #16 com testes que reproduzam e recuperem os erros.
2. Adicionar à suíte regressões do POST com proxy e do comportamento de rolagem; hoje os E2E novos cobrem GETs.
3. Atualizar a fila compartilhada de revisão, resolver a configuração de release da #14 e manter a evidência de implantação por versão.
4. Completar auditoria de acesso e ORA-006, incluindo recuperação, unidade e turno, com usuário autorizado e configuração do Auth correta.
5. Seguir ADR-003 → catálogo → CSV Rein em prévia → estoque/IMEI concorrente → jornada PDV/caixa real e ADR-004, preservando o plano completo.

O lote está alinhado como preparação da apresentação. Não representa entrega dos módulos operacionais. Reaproveitar o visual, tipos e regras testadas, separando a aquisição de dados/ações das telas quando cada módulo real começar. Claude continua implementando; Codex registra e revisa, sem alterar stack ou publicar configuração real.

