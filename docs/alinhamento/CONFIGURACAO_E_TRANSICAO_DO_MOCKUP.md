# Configuração por fase e transição do mockup para o sistema real

**Data:** 07/11/2026 · **Base atual:** main em 00a35f970d977e3766571de4f3ac67978e7a2ef1 (inclui correções posteriores à primeira leitura em b5164468)
**Programador:** Claude Code · **Analista/revisor:** Codex
**Stack preservada:** TypeScript, React/Next.js, Tailwind, Node.js, SQL PostgreSQL/Supabase.

## 1. Conclusão e objetivo imediato

O Claude está preparando uma demonstração interativa em /demo, coerente com a ordem de UI do docs/08: mocks tipados e identificados, validação visual, depois conexão aos contratos reais. Há também login parcial real em /entrar e /conta. Venda, estoque, caixa, nota e Nogle continuam simulados nas telas; as tabelas operacionais ainda não foram implementadas.

O .env.example principal já existe e tem **60 nomes de variáveis**. Não faltam todas essas credenciais para apresentar o front-end. Faltava um modelo mínimo no contexto do aplicativo e uma orientação que separasse apresentação, login público, banco SQL, serviços administrativos e integrações futuras. Este PR acrescenta [apps/plataforma/.env.example](../../apps/plataforma/.env.example).

Os arquivos .env preenchidos devem permanecer fora do Git. A ausência deles no repositório é correta e não comprova ausência no servidor. Codex não acessou o .env da VPS nem o banco real. O proprietário/Claude confere nomes e resultados dos verificadores no ambiente autorizado, sem publicar valores.

Planejar contratos e separar responsabilidades reduz reescrita estrutural; não permite garantir zero alterações de código ou zero migrations futuras. As correções devem continuar incrementais, testadas e na stack atual.

## 2. Documentação examinada e precedência

Esta análise complementa a revisão anterior com leitura do pacote de planejamento: README e prompt de passagem, docs/00 a docs/13, três documentos da Etapa 0, plano da Etapa 1, ADR-001/002, variáveis de ambiente, operação/SSH, estado atual, análise/rastreabilidade/pedido do Claude, guia visual e os três relatórios históricos de pesquisa e a conversa inicial preservada. O backlog contém 172 requisitos; nenhum requisito foi removido para acomodar a demonstração.

A ordem vigente é: decisão recente explícita do proprietário → ADR/decisão aceita → requisito e plano → pesquisa histórica → referência visual. Isso mantém:

- Claude implementa; Codex analisa e revisa.
- Monólito modular Next.js/TypeScript e PostgreSQL/Supabase; não voltar a WordPress/GHL/ERP de terceiros como núcleo por orientação de um texto antigo.
- Rein só por arquivo, incluindo estoque conforme DEC-U24; sem API.
- Infraestrutura conforme ADR-001 atualizado; não reinstalar ou reconfigurar serviços por seguir comandos antigos.
- Piloto Santa Cândida, operação paralela com Rein e expansão por ondas; fiscal e integrações dependem de homologação própria.

O commit b5164468 altera apenas três documentos desde a152516d, registrando que o reinício automático de homologação foi autorizado, ligado e testado pelo Claude. Isso é relato documentado; não foi repetido pelo Codex. Não reinstalar a tarefa persistente nem pedir novamente uma autorização já registrada.

## 3. Arquivos de ambiente: o que existe, o que falta e o que não deve existir no Git

| Arquivo | Situação e finalidade | Ação correta |
|---|---|---|
| .env.example na raiz | Existe; catálogo geral com 60 variáveis do ecossistema | Manter como inventário do projeto inteiro; não tratar tudo como obrigatório para o mockup |
| apps/plataforma/.env.example | Acrescentado neste PR; mínimo para desenvolvimento/apresentação, com Auth público opcional | Usar como modelo da plataforma; não contém credenciais |
| apps/plataforma/.env.local | Arquivo real do aplicativo, ignorado pelo Git | Criar/preencher apenas no ambiente autorizado; não enviar ao GitHub |
| .env.local na raiz do monorepo | Não é o caminho utilizado pelo Next quando o workspace plataforma é o projeto | Não presumir que preencher esse arquivo configure o app |
| .env.homologacao da instrução antiga de SSH | Caminho histórico, sem carregamento automático no código atual | Não usar como nova fonte sem ajustar explicitamente o mecanismo de publicação |
| Arquivo externo de homologação | publicar.sh usa uma origem fora do repositório e copia para apps/plataforma/.env.local com permissão 600 | Preservar a fonte já utilizada; detalhes no runbook existente, sem copiar valores para este relatório |
| Ambiente do CI | Workflow define variáveis do processo; não depende de arquivo real com segredo no repositório | Valores públicos/fictícios e testes controlados; não usar dados reais para apresentação |
| Modelos da futura loja/worker | Ainda não existem aplicações operacionais desses módulos | Criar quando a primeira tarefa precisar; não criar diretórios vazios nem exigir chaves de módulos futuros |
| Configuração de produção | Fora do escopo de ativação deste PR | Ambiente isolado e release aprovado, com /demo desativado |

**Teste do caminho:** usando somente um marcador fictício em diretório descartável, o carregador @next/env não encontrou arquivo colocado apenas na raiz do monorepo; encontrou .env.local dentro do projeto apps/plataforma.

## 4. Mínimo por capacidade

| Capacidade | O que precisa agora | O que não é dependência dessa capacidade |
|---|---|---|
| Demonstração visual | APP_ENV=development ou homologacao; NEXT_PUBLIC_APP_URL coerente com o acesso; defaults BRL/São Paulo | Supabase, DATABASE_URL, chave administrativa, SMTP, fiscal, Nogle, pagamentos e WhatsApp |
| Login por e-mail/senha já implementado | NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY do mesmo projeto, usuário de teste autorizado | DATABASE_URL e SUPABASE_SECRET_KEY não são necessários para signInWithPassword |
| Permissões reais de usuário | Usuário Auth, perfil/vínculos válidos e RLS correta; completar unidade da sessão | Cookie de perfil demonstrativo não serve como autenticação ou autorização |
| Migrations/acesso SQL | Conexão autorizada à base, por exemplo DATABASE_URL pelo modo aprovado no ADR, ou configuração própria da CLI | Chave pública não dá acesso SQL; chave secreta da API não é requisito automático de toda migration SQL |
| Worker/API administrativa | Credencial privilegiada somente se o serviço realmente utilizar operação administrativa | Nenhuma chave privilegiada deve ser exigida ou enviada para o navegador |
| Recuperação/convites por e-mail | Implementação do fluxo, SMTP configurado no Supabase Auth gerenciado e URLs/templates corretos | Preencher SMTP_* na aplicação não configura automaticamente o Auth remoto |
| Envio de notas/OS pelo aplicativo | Futuro módulo de envio, EMAIL_FROM e SMTP_* ou provedor contratado | Não existe envio real por causa de um botão ou de uma variável preenchida |
| Integrações externas | Só as credenciais do adaptador que estiver sendo implementado e homologado | Credenciais de todos os fornecedores não são pré-requisito do mockup |

### Verificação disponível na base atual

O Claude separou os grupos na revisão 87324e0/f152d9e, já integrada em 00a35f97:

- `aplicacao`: APP_ENV, NEXT_PUBLIC_APP_URL, APP_TIMEZONE e APP_DEFAULT_CURRENCY.
- `supabase_publico`: somente NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
- `supabase_servidor`: SUPABASE_SECRET_KEY e DATABASE_URL, ainda juntos.
- Na inicialização, o par público inteiro vazio deixa o mockup funcionar. Se qualquer uma das duas variáveis for preenchida, o app passa a exigir e validar o par completo.
- O helper do login agora compartilha a validação; rejeita chave secreta nova e JWT legado com role=service_role. O teste de formato não autentica a chave no serviço remoto.

Comandos existentes, a partir da raiz:

```sh
# Apresentação, sem configurar Auth:
npm run verificar-env -- apps/plataforma/.env.local aplicacao

# Login por e-mail/senha, depois de preencher o par público:
npm run verificar-env -- apps/plataforma/.env.local aplicacao,supabase_publico

# Somente para serviço que precise das duas credenciais administrativas:
npm run verificar-env -- caminho-do-arquivo-administrativo supabase_servidor
```

**Pendência de compatibilidade:** o grupo antigo `supabase` foi removido, mas orientações antigas ainda o citam. A [CONFIG-001 / #12](https://github.com/oraconect5g-boop/sistema-ora5g/issues/12) fica parcialmente atendida: atualizar todas as instruções e oferecer alias temporário, ou registrar a mudança e migrar os consumidores; separar SQL/API administrativa quando a primeira tarefa usar só uma delas. Não exigir o grupo servidor para login público ou apresentação.

> **Atualização do Claude (07/11/2026, branch `fix/residuos-codex-2026-11-07`):** instruções alinhadas aos grupos atuais (`apps/plataforma/README.md` era a única que ainda citava `aplicacao,supabase`). Sem apelido para o nome antigo, de propósito: ele juntava chave secreta e banco ao par público e voltaria a exigir o grupo servidor para conferir o login. O `verificar-env` recusa `supabase` com a orientação acima (código de saída 2). Testes: `packages/config/src/verificar-env.test.ts` e bloco CONFIG-001 de `ambiente.test.ts`. Registro: `RESPOSTAS_A_REVISAO_2026-11-07.md`.

## 5. Inventário das 60 variáveis, sem valores

| Grupo | Nomes existentes no modelo principal | Quando configurar |
|---|---|---|
| Aplicação/runtime | APP_ENV, NEXT_PUBLIC_APP_URL, NODE_OPTIONS, APP_TIMEZONE, APP_DEFAULT_CURRENCY | Apresentação; NODE_OPTIONS no ambiente de inicialização do processo |
| Auth público | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Ao testar o login real |
| SQL/admin/Storage | DATABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_STORAGE_BUCKET_DOCUMENTOS | Conforme uso SQL, API administrativa e anexos; são finalidades distintas |
| Loja/portas | NEXT_PUBLIC_LOJA_URL, PORT_PLATAFORMA, PORT_LOJA, PORT_WORKER_SAUDE | Ao implantar os processos correspondentes; os comandos atuais fixam a porta e não usam esses PORT_* |
| Criptografia/rotinas | APP_ENCRYPTION_KEY, CRON_SECRET | Antes de persistir tokens criptografados ou expor rotinas HTTP; não são exigidos pelo vigia local atual |
| E-mail | EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD | Serviço de envio da aplicação; configurar SMTP do Auth separadamente no Supabase |
| Push | NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT | Módulo real de notificação; não para mostrar a fila simulada |
| Nogle | NOGLE_API_BASE_URL, NOGLE_AUTH_KEY_TYPE, NOGLE_ACCESS_KEY | Após confirmar tipo da chave/contrato e as operações autorizadas |
| Fiscal | FISCAL_PROVIDER, FISCAL_API_BASE_URL, FISCAL_API_TOKEN, FISCAL_ENVIRONMENT | Após provedor e matriz fiscal homologados |
| PicPay/PagBank | PICPAY_CLIENT_ID, PICPAY_CLIENT_SECRET, PICPAY_WEBHOOK_SECRET, PAGBANK_ENVIRONMENT, PAGBANK_API_TOKEN | Link/checkout contratado; não presumir API das maquininhas |
| WhatsApp | WHATSAPP_GRAPH_API_VERSION, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN | API oficial, conta/escopo/templates e assinatura de avisos verificados |
| Meta | META_APP_ID, META_APP_SECRET, META_SYSTEM_USER_TOKEN, META_AD_ACCOUNT_IDS, META_PIXEL_ID | Etapa de marketing/atribuição |
| Mercado Livre | MERCADOLIVRE_APP_ID, MERCADOLIVRE_CLIENT_SECRET, MERCADOLIVRE_REDIRECT_URI, MERCADOLIVRE_WEBHOOK_PATH | Aplicativo e integração homologados |
| Shopee | SHOPEE_ENVIRONMENT, SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_REDIRECT_URI | Fase posterior prevista, sem antecipar requisito da apresentação |
| TikTok Shop | TIKTOKSHOP_APP_KEY, TIKTOKSHOP_APP_SECRET, TIKTOKSHOP_SERVICE_ID, TIKTOKSHOP_REDIRECT_URI | Após elegibilidade/contrato e integração homologados |
| Monitoramento | SENTRY_DSN | Se o serviço for adotado; não confundir campo previsto com observabilidade implementada |

As 60 variáveis foram classificadas sem omissões ou duplicações. Nome no catálogo não significa leitor implementado no runtime. Valores de chaves, SMTP, certificados e conexões não foram consultados.

Token de conta/loja com renovação automática deve seguir o planejamento: armazenamento protegido no banco, não cópia manual de cada token para um .env. Só criar essa estrutura ao implementar a integração e sua gestão de segredos.

## 6. Configuração da apresentação: passo a passo para o programador

Estes comandos são para um checkout de desenvolvimento autorizado, a partir da raiz do monorepo, com Node 22.23.4. Não são execução nem autorização de alteração na VPS. Se já houver arquivo configurado, preservá-lo; não copiar um modelo vazio sobre ele.

1. Em checkout novo, copiar sem sobrescrever e conferir o mínimo:

   ```sh
   cp -n apps/plataforma/.env.example apps/plataforma/.env.local
   chmod 600 apps/plataforma/.env.local
   npm ci
   npm run verificar-env -- apps/plataforma/.env.local aplicacao
   ```

2. Conferir os resultados por nome de variável. Para login real, preencher o par público e usar o comando com aplicacao,supabase_publico da seção 4.
3. Para apresentação sem login real, deixar o par Supabase vazio no ambiente de teste. O mockup não precisa da rede dos provedores para simular estoque, PDV ou Nogle.
4. Iniciar o desenvolvimento. O script atual usa 127.0.0.1:3100; não executar outro processo nessa mesma porta:

   ```sh
   NODE_OPTIONS=--dns-result-order=ipv4first npm run dev -w @ora5g/plataforma
   ```
5. Para testar a build de apresentação: configurar antes da build, rodar npm run build e npm run start -w @ora5g/plataforma. Isso gera uma build otimizada, mas APP_ENV deve continuar development/homologacao para a demonstração existir.
6. Apresentar /demo em celular e desktop, com selo de dados fictícios; não apresentar /demo como fluxo real, mesmo que o endereço use HTTPS.
7. Rodar os checks da tarefa, registrar feedback de navegação e não fechar um requisito operacional por sua representação visual.

Portas atuais: plataforma local/homologação 3100; E2E principal 3180; servidor auxiliar de teste 3199. O endereço público de acesso é outra configuração: ao publicar o domínio, NEXT_PUBLIC_APP_URL deve representar a URL de acesso aprovada. Não trocar a porta do processo apenas alterando PORT_PLATAFORMA no .env, pois os scripts atuais usam -p explícito.

APP_ENV e NODE_ENV são conceitos diferentes. APP_ENV controla o ambiente de negócio/demonstração. Não usar NODE_ENV=development para tentar habilitar a demonstração de uma build otimizada.

Variáveis NEXT_PUBLIC_* podem ser incorporadas à build do Next.js. Configurar antes de gerar o artefato e reconstruir ao trocar valores públicos; não assumir que somente reiniciar sempre aplica a mudança. NODE_OPTIONS deve estar no ambiente de inicialização do Node; colocá-lo somente num arquivo lido depois do início não garante reconfigurar o processo pai.

## 7. Do login parcial ao acesso real

1. Preservar e conferir a validação pública/grupos separados já integrados; concluir a compatibilidade das instruções da CONFIG-001.
2. Usar URL e chave pública do projeto de desenvolvimento; não substituir a sessão do usuário por chave privilegiada.
3. Criar usuário de teste no processo autorizado e associar perfil/vínculos no banco; não colocar pessoas reais ou credenciais no Git.
4. Validar com usuário de teste o refresh SSR da [issue #11](https://github.com/oraconect5g-boop/sistema-ora5g/issues/11): o novo src/proxy.ts chama getClaims e propaga cookies/cabeçalhos em /conta, mas expiração real ainda não foi comprovada. Completar seleção de unidade pelo servidor, bloqueio/revogação e sessão por turno.
5. Definir e implementar recuperação/retorno de autenticação. Configurar Site URL, URLs permitidas e templates correspondentes no Auth. NEXT_PUBLIC_APP_URL não muda sozinho essas opções no serviço gerenciado.
6. Configurar SMTP no Supabase Auth para envio de recuperação/convites aos usuários autorizados. As variáveis SMTP_* previstas na aplicação atendem outro leitor futuro; não são aplicadas automaticamente no Auth.
7. Testar entrada válida, senha errada com mensagem neutra, acesso sem login, perfil bloqueado, vínculo encerrado, troca de unidade, expiração/renovação e recuperação de senha.

Não inventar uma rota de retorno que ainda não exista nem adicionar autenticação social por causa de um exemplo de documentação. O plano vigente é e-mail e senha.

Fontes oficiais consultadas: [Supabase SSR no Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs), [SMTP do Auth](https://supabase.com/docs/guides/auth/auth-smtp), [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

## 8. Como aproveitar o mockup sem levar suas simulações para produção

| Parte atual | Reaproveitar | Limite a corrigir antes da operação real |
|---|---|---|
| src/componentes e tokens CSS/Tailwind | Visual, cartões, botões, estados, tabelas, navegação e acessibilidade | Navegação real deve receber permissões do servidor; revisar estados de carregamento/erro/conflito |
| packages/dominio | Tipos e funções puras compartilhadas pela UI/servidor/worker | Preservar as regressões monetárias recém-adicionadas, completar os limites remanescentes descritos abaixo; cálculo na UI é prévia |
| src/demo/dados.ts | Fixtures tipadas para apresentação e testes | Não importar esses dados em serviço/rota real nem fazer seed de cliente/estoque de produção a partir deles |
| src/demo/perfis.ts e cookie de perfil | Alternância visual da demonstração | Não são RBAC; usar identidade e permissões do servidor no produto real |
| /demo/vender/PDV.tsx | Componentes e interações de carrinho, seletor de serial, pagamentos e apresentação dos resultados | Separar a obtenção de dados/ações do componente visual; não transportar preço, custo, aprovação ou confirmação do cliente como verdade |
| /conta e cliente SSR | Padrão de consulta com sessão do usuário e RLS | Validar expiração real; tratamento de erros de consulta foi acrescentado; fluxo completo de acesso ainda pendente |
| Funções SQL de acesso | Contexto, vínculos e verificação de permissões | Revisar a nova migration corretiva, preservar isolamento de perfis/auditoria e completar auditoria de mudanças antes de dados reais |
| Demonstração de aprovações/notas/Nogle | Linguagem da tela e estados esperados | Substituir estado local por resposta real; um clique não confirma provedor ou aprovação |

### Contratos mínimos antes de conectar a primeira tela real

- Entrada de uma ação deve conter intenção e identificadores, não preço/custo/permissão confiáveis fornecidos pelo navegador.
- Identidade e unidade vêm da sessão autorizada. O servidor lê preço vigente, custo quando permitido e disponibilidade, valida regras e executa a operação.
- Saída deve usar um modelo tipado de visualização, com somente dados que o perfil pode conhecer. Vendedor recebe limite/necessidade de aprovação, não custo nem margem.
- Estados devem separar rascunho, aguardando aprovação, pagamento pendente, confirmado, falhou e cancelado conforme o ADR do módulo. Não impor já os nomes finais de todos os enums.
- Efeito crítico e auditoria ficam na transação SQL; integrações externas usam estado, idempotência e reconsulta/reprocessamento, sem prometer transação distribuída.
- Implementação de demonstração e implementação real usam o mesmo contrato de visualização quando isso for útil, mas somente a real tem serviço autorizado e persistência.
- Cada tela migrada ganha testes de permissão, erro e sucesso real; retirar imports de fixtures é parte do aceite.

Não criar uma segunda plataforma para trocar os mocks. Na primeira funcionalidade real, extrair componentes/contratos necessários e manter /demo como apresentação isolada. Também não antecipar dezenas de camadas genéricas ou tabelas vazias para satisfazer uma ideia de zero retrabalho.

## 9. Próximas entregas e critérios para avançar

| Ordem | Entrega do Claude | Aceite verificável do Codex/proprietário |
|---|---|---|
| A — apresentação | Modelo mínimo; ajustar navegação, textos e estados do mockup | Selo fixo, nenhuma cobrança/gravação real, 360 px e desktop, dados fictícios e guard em produção |
| B — validar fundação corrigida | Conferir respostas do Claude aos 14 achados, completar resíduos de configuração/sessão/dinheiro | Regressões cobrindo o defeito; valores com milhares corretos; sem acesso cruzado; CI e resultados locais documentados |
| C — ORA-006 | Login completo, recuperação, usuário/unidade e sessão por turno | Pessoa de teste entra, escolhe só unidade permitida, expira/recupera sessão e perde acesso ao bloqueio |
| D — ADR-003 e catálogo | Modelo de operação/tipos/estoque aprovado; produto, variante, custo e preço histórico | SKU consistente; não alterar venda antiga; consulta autorizada e sem custo no perfil vendedor |
| E — Rein em prévia | Parser de CSV anonimizado com relatório e confirmação explícita | Reimportar sem duplicar; erros não geram gravação parcial; nenhum uso de API Rein |
| F — estoque/IMEI | Ledger e reserva transacionais, importação aprovada e conferência | Duas tentativas concorrentes não consomem o mesmo IMEI; vendedor consulta pelo celular |
| G — primeira jornada real | PDV/caixa e pagamentos conforme ADR-004; fiscal conforme operação e fase | Revalidação server-side, registro persistente, auditoria, estados reais e idempotência |
| H — piloto e integrações | Seguir marcos posteriores e dependências de Nogle/fiscal/canais | Fechamentos reconciliados, go/no-go e ondas previstas; não substituir Rein antes do aceite |

A apresentação visual pode evoluir em paralelo às definições e correções, mas não dá aceite de dinheiro, permissão ou operação real. O parser de reais já recebeu a correção dos milhares e testes; conservar esses casos. **Antes de apresentar, corrigir a [issue #13](https://github.com/oraconect5g-boop/sistema-ora5g/issues/13): desconto acima do preço derruba a tela porque a UI chama o cálculo de totais com item inválido.**

Não antecipar a ativação de todos os fornecedores para liberar o mockup. Iniciar as definições externas que têm prazo longo, sem inventar contratos.

## 10. Acertos e melhorias observadas no trabalho do Claude

Estas são melhorias verificadas em código/commits e coerentes com decisões disponíveis. Não há evidência de que tenham sido causadas pela conversa privada indicada por link.

| Planejamento/decisão disponível | Incorporação observada | Limite ainda aberto |
|---|---|---|
| docs/08: mock tipado e mobile-first antes de backend | Demonstração interativa, selo, quatro perfis, Tailwind e E2E móvel | Dados/tarefas simulados; aceites operacionais pendentes |
| Regras reutilizáveis em TypeScript | packages/dominio separado de banco, rede e tela | Milhares e entradas inválidas corrigidos; revalidar limites e arredondamento antes da operação |
| Uso da chave pública + sessão/RLS | Cliente Supabase SSR e página de conta | Validação pública/refresh acrescentados; sessão real, unidade e recuperação pendentes |
| Evitar colisão entre teste e homologação | E2E na 3180, serviço na 3100, ADR atualizado | Usar URL/porta corretas ao configurar futuras rotas de retorno |
| Plano e rastreabilidade compartilhados | docs/alinhamento e gerador dos 172 requisitos com check | Status feito dividido em testado/homologado; segurança parcial e login parcial explicitados |
| Infraestrutura escolhida e correção operacional | Scripts de homologação e fechamento dos descritores de trava; atualização do relato do reinício automático | Publicação agora monta em versão separada e tem retorno à anterior; configuração no mesmo SHA ainda pode ficar antiga ([#14](https://github.com/oraconect5g-boop/sistema-ora5g/issues/14)); Claude acrescentou relato dos três cenários no adendo documental 503fa541, sem repetição remota pelo Codex |
| Evolução recente da Rein | Instruções passam a incluir estoque por CSV, mantendo API vedada | Importador e catálogo persistentes ainda não existem |

Os commits c1167fd, 1b7eb81, d0616c8, 7430b7a e 3c950ed documentam essas frentes. Comparar decisão → commit → teste permite reconhecer avanço sem confundir presença de uma tela com requisito entregue.

A conferência independente das correções do Claude, testes atuais e pendências está em [CONFERENCIA_DAS_CORRECOES_2026-11-07.md](CONFERENCIA_DAS_CORRECOES_2026-11-07.md).

## 11. Conversa do projeto ChatGPT: comparação pendente

O proprietário enviou um link do projeto privado Ora Connect. A tentativa de acesso retornou a página genérica de entrada do ChatGPT, sem o conteúdo do projeto. As ferramentas de controle do Chrome compartilhado não estavam disponíveis nesta sessão. Não houve leitura das mensagens privadas, acesso a cookies de autenticação ou tentativa de contornar a entrada.

Até receber o texto, resumo das decisões ou compartilhamento da conversa específica, não é possível atribuir uma melhoria do Claude a esse conteúdo. Os materiais históricos preservados no GitHub e esta conversa atual foram considerados, mas não substituem a fonte indisponível.

Quando disponibilizada, completar a matriz:

1. Decisão literal/contexto e data.
2. Status: vigente, proposta, superada ou pendente.
3. Documento/ADR correspondente e eventual divergência.
4. Commit/arquivo que incorpora a melhoria, ou tarefa que ainda falta.
5. Teste que comprova o comportamento e aceite necessário.

Não importar automaticamente a conversa inteira para o GitHub: registrar decisões e evidências pertinentes, preservando dados pessoais e credenciais.

## 12. Verificação e limites

- Revisão do planejamento completo disponível e do inventário de 60 nomes; classificação sem omissões/duplicações.
- Modelo mínimo aprovado pelo verificador aplicacao do código atual.
- .env.local do app continua ignorado; .env.example do app é permitido pelo Git e pelo detector.
- Teste local com marcador fictício confirmou a diferença entre raiz do monorepo e raiz do projeto Next.
- Na base anterior, teste local confirmou o acoplamento no grupo supabase. Na base atual, grupos público/servidor foram separados; a orientação acima usa os novos nomes.
- Aplicação/runtime não mudaram entre a152516d e b5164468; mudaram depois em 00a35f97. Os números anteriores de 110 testes/28 E2E são históricos, não prova automática da versão atual. A conferência da nova base está registrada em CONFERENCIA_DAS_CORRECOES_2026-11-07.md.
- O roteiro de SMTP/retornos foi confrontado com documentação oficial; nenhuma configuração do serviço foi alterada.
- Não há diagnóstico dos valores reais ausentes na VPS, nem aceite de publicação. Reinício automático está documentado como já ligado pelo programador/proprietário.
- Nenhum segredo foi criado, lido do servidor ou publicado. A chave pública opcional do modelo está vazia.
- Não há garantia de zero mudanças futuras: o plano reduz acoplamento e retrabalho, mantendo testes, contratos e migrations compatíveis.

A implementação das correções segue com o Claude, com análise/revisão do Codex. Atualizar o estado e a rastreabilidade após cada módulo real, na mesma linguagem e no mesmo escopo de negócio.
