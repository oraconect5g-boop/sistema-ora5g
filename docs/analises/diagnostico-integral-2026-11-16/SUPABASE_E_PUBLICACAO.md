> **Documento histórico de 5468d9e.** Correções, CI, migrations, contagens e pedidos posteriores estão em [ATUALIZACAO_2026-11-16.md](ATUALIZACAO_2026-11-16.md). Não tratar achados já corrigidos como pendências atuais.

# Supabase, arquivos, configurações e publicação

## Escopo efetivamente inspecionado

O Supabase não contém uma cópia de todo o repositório como um diretório comum. Foram verificados os artefatos que ele expõe: histórico de migrations, funções SQL e suas definições, tabelas/relações, políticas, triggers, buckets/objetos, lista de Edge Functions, advisors e logs. Não houve acesso ao filesystem interno do servidor.

| Objeto | Resultado |
|---|---|
| Migrations aplicadas | 84 |
| Relações em public/privado | 95 |
| Funções SQL | 339 |
| Funções SECURITY DEFINER | 265; todas com search_path explícito |
| Políticas coletadas | 98, incluindo Storage |
| Triggers de aplicação não internos | 153 |
| Índices inválidos | 0 |
| Edge Functions publicadas | 0 |
| Buckets | 5 privados; todos sem objetos |
| Advisor de saúde | Sem avisos retornados no corte |

Todas as 339 funções têm declaração por nome nas migrations versionadas. Isso não é prova de equivalência semântica de cada overload. O histórico remoto tem as mesmas 84 versões do registro `aplicadas-dev.json`: 83 hashes de statements coincidem diretamente; `20261113065706_margem_painel` coincide ao normalizar uma quebra de linha final. **Não há motivo demonstrado para reset, repair ou reaplicação das migrations antigas.**

Não haver Edge Functions não é, isoladamente, defeito: o projeto usa Next.js e workers Node. Não mover os workers para Edge apenas para preencher a lista.

## Erros nas funções que já estão aplicadas

Os contratos remotos incluem as funções associadas a #87, #88 e #98; as provas foram repetidas no snapshot atual com banco descartável. As migrations estarem aplicadas não elimina esses defeitos.

- `notas_corrigir`: escritor desatualizado para o snapshot fiscal completo.
- `nota_enviar_whatsapp` + alteração do cliente da venda: destinatário incompatível com o documento.
- `fotos_sem_registro_limpar` + `registrar_foto` + política de Storage: protocolo de exclusão concorrente incompleto.
- Importação: o orçamento de desempenho continua falhando; os índices sugeridos pelo advisor não devem ser apresentados como correção comprovada sem medição.

A única ocorrência de SQL dinâmico encontrada nas definições de aplicação foi em `importacao_desfazer`. A mera presença de EXECUTE não comprova injeção; revisar whitelist/identificadores e parâmetros, preservando os testes existentes. Não foi demonstrada vulnerabilidade de injeção nesta auditoria.

## Storage: todos os arquivos acessíveis ao inventário

| Bucket | Público | Limite | Tipos permitidos | Objetos |
|---|---|---:|---|---:|
| anexos | Não | 5 MiB | PDF, JPEG, PNG, WEBP | 0 |
| contas | Não | 5 MiB | PDF, JPEG, PNG, WEBP | 0 |
| notas | Não | 5 MiB | PDF, XML | 0 |
| os | Não | 5 MiB | JPEG, PNG, WEBP | 0 |
| produtos | Não | 5 MiB | JPEG, PNG, WEBP | 0 |

Portanto, não havia foto, XML, PDF ou anexo armazenado para abrir e validar o conteúdo. Isso é evidência de ausência da carga, não validação dos fluxos de upload/download. Os buckets de nota e produtos existem, mas a presença do bucket não comprova emissão fiscal nem catálogo com fotos.

Na homologação: upload permitido e negado por perfil/loja; MIME real e tamanho; URI assinada/expiração; troca de foto; concorrência com limpeza; documento sem exposição a outro cliente/organização. Fotos da vitrine publicadas são leitura pública intencional por política, embora o bucket permaneça privado.

## Advisors: classificação sem falsos alarmes

| Aviso oficial | Quantidade | Interpretação/ação |
|---|---:|---|
| RLS enabled no policy | 8 | Seis tabelas privadas e duas de compras acessadas por RPC; SELECT anon/authenticated negado nas oito. Não adicionar política permissiva automaticamente |
| SECURITY DEFINER executável por anon | 2 | public.loja_vitrine e public.loja_produto; entrada pública intencional da vitrine. Conferir o DTO para não expor custos/identificadores pessoais |
| SECURITY DEFINER executável por authenticated | 164 | RPCs de negócio; exigir testes de negação e escopo. Grant EXECUTE não significa acesso irrestrito |
| Proteção contra senhas vazadas | 1 | Recurso desativado segundo advisor; validar disponibilidade/configuração do plano e política de autenticação |
| FKs sem índice de cobertura | 10 | Avaliar consultas/plano/locks e índices compostos existentes antes de criar índices |
| Índices sem uso observado | 229 | Base quase vazia; estatística insuficiente para eliminar índices. Não apagar índices de integridade ou desempenho apenas por esse aviso |

As tabelas RLS sem policy são `privado.cliente_dados`, `connect_dados_envio`, `connect_segredos`, `crm_segredos`, `notas_destinatarios`, `whatsapp_destinos`, e `public.pedidos_compra`/`pedido_compra_itens`. A tabela privada `identificadores_itens` não tem RLS, mas também não concede SELECT a anon/authenticated; avaliar junto do schema/grants e da função que a acessa, sem classificá-la automaticamente como vazamento.

FKs indicadas: caixa_saidas, conta_pagar_anexos, contas_a_pagar, entradas_estoque (duas), fotos_produto, inventarios, metas, pedidos_compra e unidade_configuracoes. O inventário de advisors em evidências preserva os nomes exatos das constraints.

Referências de correção:
- [RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [SECURITY DEFINER para anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [SECURITY DEFINER para authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- [FK sem índice](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
- [Índice sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)

## Logs

A consulta agregada das últimas 24 horas retornou um HTTP 500 de `/rest/v1/rpc/loja_produto`, associado a SQLSTATE P0002, “produto não encontrado”. A página `app/loja/[produto]/page.tsx` trata P0002 com `notFound()`. É resposta de ausência prevista no código; não demonstra indisponibilidade geral. Há oportunidade de melhorar a semântica HTTP/monitoramento da RPC.

Não foram lidos tokens, IPs, telefones ou consultas com dados pessoais para publicar o diagnóstico. Ausência de outros erros nos logs consultados não prova que todas as jornadas funcionam: o volume operacional é mínimo.

## Integração GitHub → Supabase: parâmetros comparados

| Parâmetro | Observado | Necessário/verificação |
|---|---|---|
| Repositório | oraconect5g-boop/sistema-ora5g | Correto |
| Branch principal | main | Compatível com o fluxo atual |
| Deploy to production | Ligado na captura | Dispara implantação de recursos Supabase; não publica Next.js |
| Working directory | `.` na captura | **Corrigir para `packages/banco`**, pai de supabase/ |
| Pasta de migrations | packages/banco/supabase/migrations | Preservar; não criar segunda cópia na raiz |
| config.toml | Ausente no Git | Preparar/conferir configuração mínima compatível; não enviar defaults que alterem Auth/URLs inadvertidamente |
| Histórico existente | 84 migrations | Validar sem reset/reaplicação |
| Branch remota listada | main, ACTIVE_HEALTHY/FUNCTIONS_DEPLOYED | Status genérico do pipeline; não comprova alteração nova aplicada nem existência de Edge Functions |
| Preview por PR | Desligado na captura Free | Deploy direto pode existir no plano Free; preview branching exige plano/condições indicadas pela interface |
| Aplicativo em ora5g.com.br | Publicação separada | Validar serviço/build/domínio após cada lote de aplicação |
| Seed/carga de estoque | Nenhuma carga observada | Conexão GitHub não importa a planilha nem cadastra lojas automaticamente |

A [documentação oficial](https://supabase.com/docs/guides/deployment/branching/github-integration) é explícita: “The working directory is the path from your repository root to the directory that contains the supabase/ folder.” Para `apps/web/supabase/`, o exemplo manda usar `apps/web`; aplicado à árvore Ora, o valor é `packages/banco`.

O rótulo PRODUCTION do painel identifica a branch principal do projeto Supabase. O projeto continua chamado ora5g-dev; isso não converte homologação em operação comercial aprovada.

Após corrigir: comprovar clone/configure/migrate/deploy no check da integração, versão aplicada no histórico, hashes e ausência de drift. Uma PR somente de documentos pode não produzir nova migration; não usar ausência de mudança no schema como prova de falha.

## Configuração de ambiente e integrações

Existem `.env.example` na raiz e `apps/plataforma/.env.example`. O segundo é deliberadamente menor para o app web; não copiar todas as chaves do worker para o navegador. Ausência de .env no Git é correta. Valores reais não foram lidos.

| Área | Conferência pendente | Limite de conclusão |
|---|---|---|
| App/Supabase | APP_ENV, URL, URL/chave pública; Auth site URL e redirects | Login real e RPCs, não só build |
| Worker identidade | SUPABASE_SECRET_KEY em ambiente servidor; SMTP/templates | Convite entregue, conta vinculada, recuperação testada |
| Banco/infra | DATABASE_URL pelo acesso compatível com IPv4; backup/restore | Teste de conectividade/recuperação, sem publicar URI |
| Vitrine | LOJA_ONLINE_ORGANIZACAO e produtos publicados | Produtos com foto/preço/estoque correto; variável apenas não basta |
| Nogle | Base/tipo de chave/chaves, escopos, flags e vínculo de organização/PDV | Credencial presente não significa operação autorizada/homologada |
| WhatsApp | WABA, phone ID, token, app secret, versão API, webhook e templates | Adapter, serviço executável e callback de entrega |
| Fiscal | Provedor, ambiente, credencial, certificado/modelos e regras do contador | Documento autorizado em homologação e trilha |
| PayJoy/Aiva | Documentação, parceria, credenciais, callbacks e contrato de repasse | Ainda faltam adapter e fluxo; nomes de env não substituem implementação |
| J7/QI Tech | Identificação oficial e condições de parceria/API | Espaço de extensão documentado, sem simular aprovação |
| Outros canais | OAuth/escopos, contas, redirects e rotação | Habilitar apenas o canal cujo contrato foi confirmado |

A documentação antiga dá como pendentes algumas chaves; sem ler os ambientes não podemos afirmar se foram configuradas depois. Claude deve comprovar **presença/ausência e teste de conectividade redigido**, nunca copiar valores para relatório.

## Publicação e CI

Na verificação anterior do mesmo SHA, /entrar, /demo e /saude expunham `5468d9e`, build de 15/11 às 18:21 em São Paulo. Rotas privadas redirecionaram ao login; /loja respondeu 200 com vitrine sem produtos. Dezessete assets responderam 200. Isso comprova distribuição pública daquela build, não a execução autenticada de todas as funções.

Os workflows atuais são ci.yml e seguranca-semanal.yml; não há workflow de deploy web. A publicação existente usa os scripts de homologação. O vínculo novo do Supabase cuida de recursos do banco, não da VPS/Next.js.

O [run 43763184979](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/43763184979) está reprovado. Statuses vazios na API de commit não significam CI aprovado: é preciso consultar check-runs. Build/E2E daquele run foram pulados após a falha dos testes.

Conclusão de lote requer SHA de origem, check, migrations, configuração, build, serviço e domínio com a mesma identidade, seguido da jornada real. A autorização existente para atualizar homologação a cada lote não deve ser solicitada novamente; ações críticas de produção seguem as regras aplicáveis e o aceite concreto.

