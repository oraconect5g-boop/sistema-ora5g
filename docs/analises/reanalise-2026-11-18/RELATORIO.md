# Diagnóstico de retomada — Ora 5G, 18/11/2026

## 1. Conclusão e corte

**O último código integrado e publicado é o lote VEL-b. Não encontrei falha de CI nem diferença entre a `main` e a versão que o domínio informa. O sistema ainda não está concluído e a base operacional continua insuficiente para os testes de loja solicitados.** Dois defeitos novos do importador foram reproduzidos nesta revisão.

- Fonte Git: `oraconect5g-boop/sistema-ora5g`, commit `27b4f6eeb9b4b456b2283d9b365ebecc0901f6ef`.
- Última integração: **18/11/2026, 07:11:19**, Brasília; build público **07:11:40**.
- Banco consultado: `ora5g-dev`, Supabase `qgnbeuugklzzcevdzrvg`, PostgreSQL 17.11, `ACTIVE_HEALTHY`.
- Verificações de domínio e banco: manhã de 18/11, a partir de **09:19**, Brasília. São fotografias do estado observado, não monitoramento contínuo.
- Corte anterior: `03123d042f0d51493a17eec449967a5a48124a59`, auditoria de 17/11. Entre os cortes: **52 commits e 281 arquivos alterados**.
- Foram inventariados **1.336 arquivos Git**; **1.324** estavam disponíveis no snapshot local e tiveram os blobs conferidos. Doze binários visuais históricos não foram baixados. O inventário não significa revisão semântica linha a linha de todos os arquivos.

**Onde parou:** o checkpoint indica VEL-b entregue e aponta VEL-c, a base da loja piloto e as integrações como continuidade. VEL-c inclui reduzir consultas do sino de avisos, Início, Catálogo e Estoque; a mudança da ação do carrinho tem uma decisão específica no ADR-010. O checkpoint ainda diz que VEL-b precisa ser publicado, mas o domínio já serve seu commit. É defasagem documental, não prova de falha de publicação.

**Por que parou:** o GitHub não contém evidência suficiente para afirmar que houve travamento, limite de sessão ou outro encerramento do processo do Claude. Não acessei SSH nem o processo em execução. A documentação registra dependências de contas, arquivo no servidor, dados fiscais e contratos; isso explica bloqueios de entregas específicas, mas **não impede corrigir bugs, atualizar documentação e continuar as partes independentes**. Não há evidência de que “o CI quebrou e por isso tudo parou”.

## 2. O que foi feito desde a análise anterior

| Entrega | O que existe agora | Limite relevante |
|---|---|---|
| MKT-a | Origem e UTM das reservas e relatório de conversão | Não substitui API de anúncios |
| PWA-b e QUAL-a | Inscrição Web Push, fila, worker documentado e alertas de filas/rotinas | Uma inscrição real; aceite registrado do aviso de teste, não de todas as aprovações reais |
| EXT-a | Importação de extratos CSV/XLSX/OFX e conciliação assistida | Nenhum extrato carregado no banco consultado; não é conexão automática com banco/maquininha |
| META-a e AUD-a | Custos de anúncios por arquivo; indicadores com devoluções, moeda BRL e explicação de fuso/atribuição | API de importação de gastos não implementada; conta real não homologada |
| MKTPL-a | Pedidos e resultado dos marketplaces por arquivo, mapeamento de itens | Adaptadores Mercado Livre, Shopee e TikTok continuam desligados; repasses/automação incompletos |
| CANAIS-a | Comparação dos canais em relatórios | Resultado estimado por arquivo não equivale a contabilidade formal ou repasse confirmado |
| ADAPT-a | Interfaces e contratos internos de integrações | Flags `false` e interfaces não são integrações reais |
| AUD-a | Leitura do pacote da PR #104, correção do rodapé, correção de estados e de anúncios | Corrigiu o caso original, mas introduziu heurística ampla de rodapé; ver F18-02 |
| REIN-b | `/estoque/carga`, prévia, classificação, aprovação por outra pessoa, aplicação e reversão | Zero cargas aplicadas; faltam base, reconciliação e identidades distintas; ver F18-01/F18-03 |
| DEMO-a | Nomes das 11 lojas, DEFEITOS e demonstração de canais | Paridade ainda parcial: extratos, origem das reservas e carga de estoque têm pendências documentadas |
| TRF-b | Explica pedido, separação, envio e recebimento; mostra saldos dos dois lados | Pedir continua sem reservar; separar reserva; enviar reduz físico |
| ONLINE-d | Carrinho, pedido persistido, reserva atômica, cancelamento e consulta | Apenas retirada e pagamento na loja; checkout pago, frete e devolução online continuam faltando |
| VEL-b | Reuso de permissões da sessão em 46 páginas, preço em lote no PDV, menos rodadas no caixa | Melhora estrutural comprovável no código; ganho de latência percebida ainda requer medição autenticada no domínio |

Portanto, houve implementação e correção de código existente. O problema não é ausência total de trabalho: **a sequência gerou funcionalidades técnicas sem concluir a preparação operacional e as integrações necessárias ao uso diário**.

## 3. Situação dos 179 requisitos

| Estado declarado | 17/11 | 18/11 | Interpretação |
|---|---:|---:|---|
| Testado | 63 | **69** | Implementação/testes de desenvolvimento declarados; não prova operação real homologada |
| Parcial | 69 | **79** | Há entrega, mas parte do requisito falta |
| Não iniciado | 42 | **16** | Ainda sem implementação suficiente para mudar de estado |
| Bloqueado | 3 | **13** | Dependência externa ou decisão registrada; não conta como concluído |
| Restrição respeitada | 2 | **2** | Restrições, não novas funcionalidades |
| Homologado integralmente | 0 | **0** | Nenhum dos 179 recebeu conclusão integral no checkpoint |
| Total | **179** | **179** | Denominador preservado |

**26 requisitos mudaram de categoria; não foram 26 requisitos concluídos.** Seis passaram a testados, dez a parciais e dez a bloqueados. Há **28 roteiros de lote**, dos quais **um** tem aceite registrado (PWA-b). Aceite de lote e conclusão integral de requisito não são equivalentes.

A [matriz completa](MATRIZ_179.md) preserva o texto integral de cada nota e o critério original. É a declaração atual reconciliada com o backlog, complementada por esta auditoria; não reclassifiquei tudo como validado com base no número de testes. Os acréscimos da conversa continuam obrigatórios, mesmo quando não possuem ID próprio na lista original.

## 4. Estado operacional observado no Supabase

| Item | Observado | Consequência |
|---|---:|---|
| Usuários Auth | **1** | Só há dono ativo; não há as contas separadas de gerente e vendedor solicitadas |
| Unidades | **15** | 11 lojas comerciais + DEFEITOS + 3 unidades de teste |
| Lojas/local confirmados com saldo físico | **0 de 12** | O estoque da planilha ainda não está disponível para operação nessas unidades |
| Produtos / variantes | **6 / 6** | Continua catálogo mínimo, não os 2.271 produtos da planilha |
| Importações de catálogo / cargas iniciais / entradas | **0 / 0 / 0** | A interface existe, mas nenhuma carga real ocorreu |
| Fotos e objetos no Storage | **0 / 0** | Requisito de fotos ainda não demonstrado com os produtos reais |
| Clientes | **0** | Cadastro completo e WhatsApp não foram homologados com uma jornada real nesta revisão |
| Transferências | **2** | Há transferências enviadas da unidade de teste para Muffato Santa; não foram recebidas |
| Habilitações / operações Ora Connect | **0 / 0** | Nogle sem operação real comprovada |
| Pedidos fiscais | **0** | Sem emissão fiscal real comprovada |
| Extratos / importações Meta / importações marketplace | **0 / 0 / 0** | Relatórios novos ainda sem suas bases operacionais |
| Produtos marcados para publicar online / pedidos do site | **0 / 0** | A loja pode abrir, mas não tem catálogo publicado nem compra real registrada |
| Inscrições para avisos no celular | **1** | Evidência de uso do Web Push, sem expor endpoint ou chave |

Os 12 nomes estão no banco: **Santa Felicidade, Água Verde, Colônia, Almirante Tamandaré, Dubai, Colombo, Muffato Santa, Butiatuvinha, Ventania, Balneário, Santa Cândida e DEFEITOS**. Não é mais correto dizer que nenhuma loja foi cadastrada. Porém, as 12 unidades estão sem CNPJ; lojas comerciais sem identificação fiscal são bloqueadas para venda. DEFEITOS permanece local de exceção, sem venda.

Ter o nome no banco não prova que a conta aberta na interface vê a loja: isso depende do vínculo, do turno, do filtro e do contexto da sessão. Não foi feita navegação autenticada como os três perfis nesta auditoria.

**Bloqueio da carga:** `estoque_carga_aplicar` recusa quando quem criou a prévia tenta aprová-la (`OR024`). Com uma única identidade, não existe a separação de funções exigida. A documentação prevê administrador preparando e dono aprovando; apenas criar vendedor e gerente pode não satisfazer essa permissão. Deve-se provisionar as identidades autorizadas e validar o fluxo, sem desativar a regra.

**Planilha:** o arquivo original de 10/11/2026 às 13:20 está disponível no ambiente desta auditoria. A alegação do Claude de não o possuir se refere ao servidor dele, não à ausência de entrega pelo usuário. O teste original agora preserva **2.271 produtos, 83 colunas e partes de 2.000 + 271**, excluindo o rodapé na linha 2.273. A planilha é uma posição histórica: não deve virar “estoque de hoje” sem reconciliação de movimentações posteriores, negativos, itens em trânsito, IMEI/ICCID e diferenças físico/disponível. A cópia original com dados comerciais não foi adicionada ao repositório público.

## 5. Achados novos e riscos de importação

### F18-01 — P1: decimal numérico do Excel pode virar centenas de unidades

**Confirmado por teste independente que falha no commit auditado.** Um XLSX sintético contém a célula numérica `0.625`. O leitor retorna `"0.625"`; `quantidadeDaCelula` reutiliza `numeroDoRodape`, que interpreta ponto seguido de três casas como milhar brasileiro. O resultado preparado para o banco é **625**, sem problema de validação. O banco recebe inteiro válido e já perdeu a informação original.

- Caminhos: `apps/plataforma/src/lib/estoque/carga.ts:101` e `apps/plataforma/src/lib/importacao/catalogo.ts:133`.
- Prova: `evidencias/auditoria-20261118.test.ts`, caso F18-01; log mostra `expected 625 to be null`.
- Impacto: estoque ficticiamente aumentado em futura carga; não há prova de ocorrência no banco atual, que tem zero cargas.
- Correção esperada: preservar tipo/formato de origem ou normalizar numericamente antes do parser textual; números fracionários em estoque unitário devem ir para conferência. Não corrigir globalmente a função de totais sem testar CSV brasileiro, XLSX, sinal e notação científica.

### F18-02 — P2: linha incompleta pode ser descartada como rodapé

**Confirmado por teste independente que falha.** Última linha sem SKU/nome, mas contendo EAN e preço, é identificada como “rodapé de totais”. A função calcula quantas somas conferem, mas **não exige nenhuma soma compatível** para excluir. No teste, nenhum valor corresponde à soma anterior.

- Caminho: `apps/plataforma/src/lib/importacao/catalogo.ts:160`, função `rodapeDaPlanilha`.
- Prova: caso F18-02 no mesmo arquivo de teste.
- Impacto: a linha que deveria aparecer como cadastro incompleto vai para exclusão por total. A tela informa uma linha excluída; o problema é a classificação automática, não ausência absoluta de aviso.
- Correção esperada: distinguir rodapé confirmado de candidato ambíguo e permitir revisão explícita, preservando rastreabilidade. A correção deve manter o teste do arquivo original passando.

### F18-03 — P1 operacional: diferença físico/disponível não bloqueia a carga

**Comportamento confirmado por inspeção e pelos testes existentes; exige reconciliação de negócio antes da carga real.** Na prévia, físico 10 e disponível 8 pode ser classificado como `entrar`. A aplicação lança as **10 unidades físicas** e não cria reserva; a diferença de duas aparece como aviso.

- Caminho: `packages/banco/supabase/migrations/20261118021151_estoque_inicial_por_arquivo.sql`, classificação da prévia e chamada de `privado.lancar_movimento` em `estoque_carga_aplicar`.
- O ADR-021 deliberadamente não inventa reservas com base na diferença. Essa parte é correta: não se sabe se a diferença é reserva, trânsito, erro ou outro motivo.
- Risco residual: sem conferir e tratar a diferença, o sistema novo pode disponibilizar mercadoria que o sistema de origem considera comprometida. “Não inventar reserva” não significa “liberar tudo para venda”.
- Encaminhamento: conferência/quarentena ou pendência impeditiva por linha, com resolução auditável e carga histórica reconciliada. Não marcar o estoque como pronto apenas porque o total físico foi inserido.

### F18-04 — P2 documental: estado publicado e lista de dependências estão defasados

- `execucao-integral-status.json` ainda indica publicação `cc50523` e VEL-b em `falta_publicar`; domínio e `main` já estão em `27b4f6e`.
- `APIS_E_HABILITACOES_NECESSARIAS.md` ainda apresenta Meta/marketplaces como não iniciados e importação de extratos como faltante, embora os módulos por arquivo já existam.
- O mesmo documento mantém trechos de chaves Web Push ausentes apesar do lote já ter uma inscrição e aceite registrado.
- A defasagem de um lote no checkpoint é documentada como escolha do projeto; ainda assim, confunde o proprietário. A UI deve separar versão servida, evidência de publicação e estado de desenvolvimento.
- Não transformar “publicado” em “homologado” para resolver a discrepância. Atualizar fontes e registrar datas de conferência de cada configuração.

### F18-05 — Transferências: intenção solicitada e momento da reserva precisam coincidir

TRF-b melhora a explicação, mas não muda a regra: **pedir não reserva; separar reduz disponível; enviar reduz físico uma vez; receber adiciona ao destino**. A conversa pede redução quando o produto é colocado em transferência. A decisão D-049 não pode apagar esse objetivo nem tratar a solicitação do usuário como inexistente.

É necessário alinhar o estado que a interface apresenta como compromisso efetivo da transferência. Se o pedido ainda não compromete estoque, isso deve ser inequívoco; quando o compromisso ocorre, reservar atomicamente. Testar venda concorrente, quantidade insuficiente, remessa parcial, cancelamento, reenvio e devolução sem dupla baixa. Não reduzir físico e disponível duas vezes.

### F18-06 — Contrato de pagamento ainda divergente, antes de habilitar

`apps/worker/src/cobranca/cobranca.ts` retorna `confirmar` para aviso assinado, conhecido e de mesmo valor, sem exigir reconsulta nesse ramo. A lista de APIs exige reconsulta do provedor antes de marcar pago. **O adaptador está desligado; isso não demonstra pagamento indevido hoje.** Resolver a divergência entre regra interna e contrato do provedor antes de integrar. Testar duplicidade, evento fora de ordem, timeout, alteração de valor, estorno e conciliação posterior.

## 6. Integrações e extras da conversa: o que não está concluído

| Área | Entregue ou preparado | Falta para a solicitação completa |
|---|---|---|
| Ora Connect/Nogle | Adaptador de ativação/recarga/portabilidade, estados e reconsulta em desenvolvimento | Habilitar e homologar operações; carteira, extrato, cobrança/gateway, recorrência e repasses. `ORA-CONNECT-009` segue não iniciado. Documentação informa que comissões não vêm da API: resolver fonte oficial, sem cálculo local apresentado como repasse oficial |
| Vendas/caixa/financeiro | PDV, caixa, contas, DRE/previsão, relatórios e gráficos reais já existem no código | Base e jornada autenticada completas, fiscais por loja, teste dos três perfis, conciliação de operação real e critérios para saída da Rein |
| Gráficos | Código real não desapareceu por completo: `/financeiro`, `/relatorios`, `/resultado`, `/previsao` | Validar permissões, navegação, filtros e dados; tratar vazio e erro separadamente. Mais gráficos com base vazia não resolvem operação |
| Clientes | Regra documentada de e-mail opcional, inclusive PayJoy; cadastro e dados fiscais preparados | Homologar nome/WhatsApp no rápido, endereço completo quando necessário à nota, persistência, permissões e envio oficial de documento por WhatsApp |
| WhatsApp oficial | Fila fiscal, validação de destinatário e executável | Adaptador Meta real, webhook verificado, templates, documentos, caixa de entrada e jornada com consentimento. Flag de adaptador continua falsa |
| Fiscal | Pedidos, aprovação, documentos privados e regras internas | Emissor, contador, dados reais, certificado, autorização/rejeição, cancelamento, contingência e homologação |
| PayJoy/Aiva | Venda financiada e recebíveis manuais | API obrigatória no escopo final pedido pelo usuário; documentos, termos, credenciais, propostas, retornos, taxas, prazo e repasses. Registro manual não encerra o requisito |
| J7/QI Tech | Necessidade futura identificada na conversa | Extensão preparada e documentação/parceria verificadas; não inventar endpoints nem apresentar integração como existente |
| Loja `/loja` | Acesso público, carrinho e pedido para retirada e pagamento no balcão | Produtos/fotos publicados, pagamento online, confirmação oficial, expiração, devolução/reembolso, frete/rastreio e estados de exceção |
| Mercado Livre/TikTok/Shopee | Importação por arquivo e análise de pedidos/margem | OAuth/credenciais, catálogo, preços, estoque, pedidos, cancelamentos, retornos, conciliação de repasses e automação monitorada. Adaptadores continuam `false` |
| Meta | Custo de anúncios por arquivo e atribuição | Marketing API e permissões; conversões oficiais com consentimento/base legal; separar publicidade de catálogo/vendas Commerce |
| Fotos | Envio individual/lote e Storage privado preparados | Fotos reais por produto/variante e validação no catálogo, estoque, PDV e loja |
| Demo e real | Ambas respondem; demo recebeu lojas e canais | Atualizar matriz de paridade dos fluxos novos. Demo não pode escrever nas tabelas reais; real não deve exibir números fictícios |

Não faltam apenas chaves. Em várias áreas faltam **código do adaptador, contratos de dados, fluxos de erro, conciliação e testes completos**. Inserir variáveis em `.env` não implementa esses componentes.

## 7. Banco, segurança e rotinas

- **109 versões de migration no Git e 109 no Supabase**, com conjuntos de versões iguais. A divergência 99 × 98 do relatório anterior foi resolvida. Isso comprova correspondência do histórico de versões, não equivalência byte a byte de todos os objetos implantados.
- As **116 tabelas base** examinadas nos esquemas `public`/`privado` têm RLS ativo; nenhuma concede `SELECT` diretamente a `anon`.
- Advisor de saúde: sem avisos. Advisor de segurança: 18 informações de RLS sem política, 8 avisos de funções `security definer` executáveis por `anon`, 200 por autenticados, proteção de senhas vazadas desabilitada.
- As tabelas sem política conferidas estão fechadas a leitura direta dos papéis públicos; não criar políticas amplas só para limpar o advisor. Revisar autorização e segredo das funções intencionalmente públicas.
- `main` continua `protected=false`; rulesets retornaram lista vazia. CI verde não impede merge que ignore o CI se o repositório não o exigir.
- Três cron jobs ativos. Na janela observada: alertas **86 execuções/0 falhas**, limpeza **1/0**, vencimento de reservas **286/0**. Últimas execuções dos jobs frequentes por volta de 09:30 de Brasília.
- Logs agregados da janela de 24 h mostraram respostas 400/401/404 e recusas SQL, mas nenhuma resposta HTTP 500 na agregação consultada. Não declarar todos os erros bugs: há testes negativos e consultas de auditoria. Houve consulta exploratória deste revisor que referenciou coluna inexistente e foi corrigida; essa falha da auditoria não é defeito do aplicativo.
- Não houve leitura de `.env`, SSH, credenciais nem dados pessoais de clientes. Ausência atual de uma variável no servidor não foi verificada independentemente; datas e afirmações de configuração do Claude são evidência documental, não confirmação de ambiente nesta revisão.

## 8. CI, testes e publicação

CI do commit auditado: [execução 44283001540](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/44283001540), aprovada.

| Verificação | Resultado |
|---|---|
| Suítes unitárias/integradas do CI | **2.952 passaram**, 1 TODO |
| Distribuição | Plataforma 1.710; worker 36; banco 1.031; configuração 60; domínio 115 |
| E2E do CI | **313 passaram**, 13 ignorados |
| Dependências de produção | `npm audit --omit=dev`: zero vulnerabilidades reportadas |
| Desenvolvimento | Permanecem 16 avisos altos na cadeia de desenvolvimento documentada; não ocultar com upgrade não analisado |
| Reexecução dirigida independente | **101 testes de app + 246 de banco = 347 passaram**, 19 arquivos |
| Novas regressões independentes | **2 falharam**, reproduzindo F18-01 e F18-02 |
| Domínio | `/saude/versao`, `/loja`, `/loja/carrinho` e `/demo`: HTTP 200; SHA coincide com `main` |

O teste com a planilha original passou nesta rodada. Os testes dirigidos de banco usaram banco local isolado (PGlite), sem gravar no Supabase. O CI contém outras verificações de concorrência, mas esta rodada não é nova execução integral de todos os testes nem homologação autenticada do domínio.

**CI verde não cobre os dois novos cenários**, porque as provas independentes ainda não fazem parte da suíte da `main`. Elas foram publicadas como evidência de revisão, fora do código executado pelo aplicativo.

O domínio público informa `ambiente: homologacao`. Isso é diferente da demo, mas ainda não significa operação comercial em produção liberada. A integração GitHub–Supabase aplica migrations; **não importa automaticamente a planilha, não cria usuários e não configura APIs externas ou o servidor web**. O domínio e o banco foram verificados separadamente.

## 9. Ordem recomendada para continuar

1. **Corrigir F18-01 e F18-02** com as provas anexas; preservar o caso original e os formatos válidos.
2. Atualizar checkpoint, `/entregas`, lista de dependências e a matriz demo × real com o que está efetivamente publicado.
3. Preparar acesso e base da loja piloto: contas separadas, permissões, dados reais das lojas, catálogo, fotos e carga de estoque reconciliada. O arquivo já foi entregue ao ChatGPT; organizar sua disponibilização privada ao programador.
4. Tratar diferenças físico/disponível, negativos, serializados e movimentações posteriores ao corte; não liberar a carga histórica como saldo atual sem essa etapa.
5. Validar com dono/administrador, gerente e vendedor: entrada, seleção da loja, caixa, PDV, pagamentos, desconto, devolução e transferência de vários produtos, incluindo DEFEITOS.
6. Concluir Ora Connect/Nogle, fiscal, pagamentos e WhatsApp conforme contratos, mantendo o trabalho independente enquanto aguardam credenciais. Para cada integração, separar código pendente, configuração pendente e homologação pendente.
7. Completar checkout da loja pública, financeiras e canais automáticos; importação manual não pode substituir silenciosamente o escopo de APIs.
8. Encerrar os demais parciais/não iniciados da matriz, incluindo inadimplência, atendimento, pós-venda, qualidade e IA somente onde contratada/planejada. J7/QI Tech ficam explicitamente como extensão futura.
9. Publicar cada lote validado no ambiente autorizado, conferir o SHA no domínio, testar as rotas e atualizar a demo correspondente. Repetir até esgotar o trabalho executável; consolidar apenas bloqueios reais para o proprietário.

As otimizações VEL-c podem continuar em lotes delimitados e testados, mas **não substituem a entrega da base e da jornada comercial**. A decisão específica do carrinho no ADR-010 não é bloqueio para todo o sistema.

## 10. Limites e conclusão técnica

Esta reanálise combina comparação de versões, leitura dirigida do código alterado e documentação, reconciliação dos 179 estados, consultas somente leitura ao Supabase, CI remoto, testes independentes e HTTP público. Não inclui acesso ao processo do Claude, `.env`, conversas privadas do link do projeto, homologação autenticada com os três perfis nem chamadas comerciais aos provedores.

**Não há justificativa técnica encontrada para trocar de linguagem. Node.js já é utilizado como runtime; TypeScript, Next.js/React e Supabase/PostgreSQL continuam adequados.** O ganho de prazo vem de fechar jornadas completas, resolver a base operacional, reaproveitar as regras existentes e integrar contratos reais. Uma reescrita adicionaria migração e novos pontos de falha.

O estado verificável é: **código e domínio avançaram; a operação final continua incompleta; há correções concretas e trabalho independente para retomar agora**. A causa exata de encerramento da sessão do Claude permanece desconhecida.
