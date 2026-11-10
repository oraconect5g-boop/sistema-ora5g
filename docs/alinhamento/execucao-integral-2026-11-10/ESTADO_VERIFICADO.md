# Estado verificado e limites do pacote integral

**Data:** 10/11/2026, São Paulo. **Main analisada:** `0b6b45ebb3387862c3e8eeb61cdd86afa79a9d82`.

## 1. O que mudou em relação ao prompt anterior

O merge `feature/ORA-65-financeiro-real` já implementa o lote 1 da #65: /financeiro, resumo no início, filtros de período/loja/rede, agregação do período inteiro com RLS/SECURITY INVOKER, detalhamento paginado e exportação CSV. Há 23 migrations. A matriz demo × real foi adicionada. Margem, contas completas, conciliação, DRE, previsão e repasses permanecem ausentes/indisponíveis na primeira fatia.

O prompt anterior e o relatório da PR #66 descreviam o financeiro antes desse merge. Devem ser lidos e preservados como fonte histórica; a instrução de criar o lote 1 não deve ser repetida. Este pedido recente amplia a continuidade a todas as áreas até o escopo completo.

## 2. Verificação executada nesta preparação

- Árvores da main e dos oito heads de PRs consultadas sem truncamento.
- Todos os 507 blobs inventariados; 495 arquivos textuais materializados e conferidos pelo Git blob SHA.
- 108 Markdown atuais indexados, incluindo documentação 00–13, ADRs, análises/revisões/respostas, integrações, pesquisas, skill e guias.
- 138 referências a variantes documentais nas PRs; 93 conteúdos distintos fora da main recuperados. Os 41 links Markdown explícitos acrescentaram cinco conteúdos históricos.
- 66 issues/PRs e 70 comentários recuperados. As contagens das coleções não alcançaram a página de 100; as contagens de comentários foram cruzadas. Não havia comentários inline ou reviews formais nas coleções consultadas; revisões em Conversation/documentos foram incluídas.
- O arquivo original “Texto colado.txt”, relatório do Claude Web, foi recuperado e incluído com contexto de precedência.
- Código novo do financeiro examinado: rota, leitura, escopo, contrato, registros/exportação, testes e migration.
- [CI 42918930266](https://github.com/oraconect5g-boop/sistema-ora5g/actions/runs/42918930266): `success` para a main analisada.
- Testes independentes locais sobre o snapshot atual: **10 testes de banco financeiro**, **19 testes de resumo/janelas/telas/exportação**, todos aprovados. Foram reutilizadas dependências locais existentes, com os módulos Ora apontando para este snapshot; não foi uma reinstalação limpa nem repetição local de todo o CI.
- Os documentos novos são verificados quanto à presença/uniquidade dos 179 IDs, integridade do índice e padrões de segredos; isso não é novo aceite das funcionalidades.

## 3. Código versus publicação

Consulta pública sem sessão em 10/11, aproximadamente 20:10 de São Paulo:
- /saude respondeu 200 e identificou a versão **84ecefe**, build 18:24;
- /financeiro respondeu **404**;
- o código da main analisada é **0b6b45e**, que contém a rota.

Portanto, no instante dessa consulta o lote financeiro estava integrado no GitHub, mas ainda não aparecia no artefato atendido pelo domínio. Essa informação é datada: revalidar antes de agir. Não recriar um módulo por atraso de publicação nem tratar CI verde como deploy. Preparar a publicação pelo procedimento e autorização vigentes, conferir SHA/migrations/rotas e preservar retorno.

## 4. Inventário de produto

Os 179 requisitos se distribuem pelos 18 domínios da matriz. Estados declarados na base:
- 19 testados em desenvolvimento;
- 47 parciais;
- 6 só demonstração;
- 2 bloqueados;
- 104 não iniciados;
- 1 restrição respeitada;
- nenhum homologado no registro.

Não há percentual confiável de plataforma pronta derivado dessa soma. Alguns critérios se sobrepõem, como solicitação fiscal em POS-011/FISC-001; reconciliar evidências sem criar domínio duplicado.

Já há módulos reais de acesso/equipe, catálogo/fotos, estoque/serial, PDV/vendas, caixa, transferências/DEFEITOS, Connect parcial, fila fiscal, auditoria e financeiro inicial. CRM completo, importador real, compras/inventário completos, metas/comissões, assistência persistente, contas/conciliador/DRE, fiscal automático, canais, WhatsApp/Meta/IA e expansão precisam de entregas conforme a matriz. Não confundir essa descrição com ausência de toda fundação: reutilizar tabelas/RPCs/regras atuais.

## 5. PRs e histórico

PRs abertas na coleta: #33, #64 e #66.
- #33: grande parte útil já foi trazida por outra branch; sua abertura não significa ausência dos relatórios ou autorização para um merge inteiro.
- #64: inclui gerente de teste e teste de escopo; ainda não incorporada na main consultada.
- #66: prompt anterior e relatório amplo; cópias/fonte estão no manifesto e no arquivo GitHub.

Há questões abertas cujas correções já entraram nos lotes 1–5. O programador deve reconciliar por achado, SHA, prova e implementação atual, não voltar a corrigir tudo pelo estado da issue.

## 6. Contradições históricas que precisam permanecer resolvidas

- 14 lojas existentes → 11 comerciais + DEFEITOS; expansão não cria loja fictícia.
- OS fora do escopo → seis requisitos aprovados, ORA-OS-001 a 006.
- Rein só produtos/preços → estoque inicial também aprovado, sempre por arquivos.
- Cancelamento restaurando estoque → retorno físico e identidade conferidos, separado de estorno/fiscal.
- Recarga como faturamento integral ou receita presumida → fatos e contratos separados; produção/repasse exigem evidência.
- Remover todos os serviços do catálogo → classificar serviço comercial/operação e vincular corretamente, conforme ADRs.
- Cinco papéis versus papéis futuros → respeitar a matriz atual e a realidade das pessoas; não inventar empregados.
- Chave secreta no web → allowlist atual, administrativo/Nogle no worker.
- Mockup navegável → não prova operação real; a matriz deve ligar cada função à persistência/regra/teste.
- Conta Auth confirmada sem perfil/vínculo → não permite acesso; o primeiro dono de teste foi vinculado com autorização em #63. Não recriar ou resetar esse acesso por suposição.
- Nogle e Contel → um provedor/integrador oficial, com nomenclatura técnica da documentação preservada quando necessária.

## 7. Limites honestos desta leitura

O levantamento cobre os textos/relatórios recuperados no corte e a revisão dirigida dos contratos, fontes e do novo financeiro. **Não é certificação linha a linha de todas as funções nem afirma ausência de bugs em todo o sistema.** Os arquivos de código foram inventariados; testes e revisão detalhada devem acompanhar cada domínio na implementação.

Os 12 ativos visuais PNG/vídeo foram inventariados como referências; não se inspecionaram todos os quadros. Não foi obtido conteúdo de conversas privadas ChatGPT não exportadas. Não houve acesso à VPS, .env, produção, dados pessoais/comerciais reais ou operações financeiras/telecom nesta preparação. Os 29 testes rodaram com fixtures locais, não contra fornecedores.

O arquivo GitHub do pacote conserva as fontes com supressões de informação potencialmente sensível; URLs e hashes remetem ao original. Comandos históricos com marcações são documentação, não scripts a executar literalmente.

## 8. Próxima execução indicada

Revalidar versão ativa, preservar o financeiro lote 1, reconciliar fontes/PRs/pendências e escolher a próxima fatia funcional independente. O objetivo atual não se limita à #65. O PROMPT_MESTRE e a matriz exigem continuidade pelos 18 domínios até não haver implementação local pendente, com as integrações/homologações externas explicitamente tratadas.

