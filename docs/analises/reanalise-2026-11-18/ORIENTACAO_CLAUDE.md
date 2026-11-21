# Prompt de retomada para o Claude Code — 18/11/2026

Use o texto abaixo junto com os arquivos deste pacote. Ele não afirma que a sessão anterior travou; define como retomar a partir do último estado verificável.

---

Você é o programador responsável pelo Ora 5G. Continue o projeto existente até concluir o trabalho executável do escopo, mantendo TypeScript, Next.js/React, Node.js e Supabase/PostgreSQL. Não reinicie o aplicativo, não troque de linguagem, não substitua funcionalidades reais por demonstrações e não declare concluída uma integração que só tenha interface ou flag desligada.

## 1. Reconciliar o estado antes de editar

Leia `AGENTS.md`, `docs/ESTADO_ATUAL_E_PASSAGEM.md`, `docs/alinhamento/ANALISE_DO_PLANO.md`, `CLAUDE.md`, `README.md` e o pedido de revisão. Depois leia integralmente:

- `docs/analises/reanalise-2026-11-18/README.md`;
- `RELATORIO.md`, `MATRIZ_179.md` ou todas as entradas equivalentes do JSON, `ORIENTACAO_CLAUDE.md`, `SOLUCOES_PARA_AVALIACAO.md` e `evidencias/README.md` desta pasta;
- as provas F18-01/F18-02, resultados de testes, inventário e arquivos alterados;
- os 33 materiais do pacote anterior `docs/analises/auditoria-planejamento-2026-11-17/`, inclusive `FONTES.md`, `FONTES_HISTORICAS.md`, `EXTRAS_E_CONFIGURACOES.md` e `ORIENTACAO_CLAUDE.md`;
- os relatórios históricos referenciados nos índices e nas PRs de documentação. Use `docs/alinhamento/LEITURA_DIAGNOSTICO_INTEGRAL_2026-11-16.md` e `LEITURA_AUDITORIA_2026-11-17.md` para identificar as partes que ficaram sem leitura, não para declará-las automaticamente lidas;
- `backlog.json`, `docs/alinhamento/status-requisitos.json`, `execucao-integral-status.json`, `EXECUCAO_INTEGRAL_STATUS.md`, `MATRIZ_DEMO_REAL.md`, os ADRs, as decisões e a lista de APIs.

Se o pacote não estiver na `main`, leia a branch `docs/auditoria-planejamento-20261117` da PR #104. Não é necessário fazer merge de documentação para consultá-la. Registre arquivo e revisão lidos; um índice ou busca por palavras não equivale à leitura integral. Não invente acesso ao projeto privado do ChatGPT.

O corte da auditoria é `27b4f6eeb9b4b456b2283d9b365ebecc0901f6ef`, lote VEL-b. Verifique o HEAD atual e reaplique as conclusões somente onde ainda forem verdadeiras. Preserve alterações concorrentes. Se um defeito já foi resolvido, cite commit e teste em vez de refazer a mudança.

## 2. Resolver primeiro os defeitos reproduzidos

**F18-01 — quantidade XLSX:** o arquivo sintético com célula numérica `0.625` chega à carga como `625`. Preserve a origem numérica e rejeite ou mande para conferência frações em estoque unitário. Não altere o parser global de totais cegamente: CSV brasileiro `1.234`, decimal com vírgula, XLSX numérico, valores negativos e notação científica têm contratos distintos.

**F18-02 — rodapé:** uma última linha incompleta com EAN/preço é descartada como total, mesmo sem qualquer soma compatível. Diferencie rodapé comprovado e candidato ambíguo; permita revisão rastreável. Preserve os 2.271 produtos do arquivo original e a exclusão correta da linha 2.273.

Reproduza as provas em `evidencias/auditoria-20261118.test.ts` antes de corrigir. Integre os cenários adequadamente às suítes existentes; não reduza as expectativas para acomodar o erro. Depois rode os testes pertinentes e a sequência exigida pelo repositório.

Analise também F18-03: físico maior que disponível não pode liberar automaticamente mercadoria comprometida. Não invente reservas, IMEIs ou destinos. Trate a diferença como pendência de reconciliação antes de operação comercial.

## 3. Fechar a base operacional e a jornada de loja

1. Atualize a lista de dependências: extratos, Meta e marketplaces por arquivo já existem; Web Push já tem aceite de lote. Confirme configurações apenas por presença e resultados, sem expor valores.
2. Provisione as contas de teste já solicitadas de dono, gerente e vendedor, com escopo de loja e credenciais entregues pelo fluxo seguro existente. A carga exige identidades distintas para preparar e aprovar; se a preparação depende do administrador, inclua essa identidade autorizada na matriz de testes. Não remova a separação de funções.
3. As 11 lojas e DEFEITOS já estão cadastrados. Corrija/complete os dados operacionais e fiscais reais, sem duplicar unidades ou inventar CNPJ/endereço. Mantenha DEFEITOS sem venda. Não transforme a meta histórica de 14 lojas em lojas fictícias ativas.
4. O usuário já entregou `relatorioProdutos131258.xlsx` ao ChatGPT. A auditoria leu esse original. Organize a entrega privada ao servidor de desenvolvimento; não volte a afirmar que o usuário nunca enviou a planilha e não a publique no GitHub público.
5. Prepare a prévia de catálogo, preços e estoque por cada uma das 12 unidades. Confirme as colunas: há colunas de custo/localização contendo a palavra “estoque”, que não são quantidade física. Não selecionar a primeira coluna por coincidência de texto.
6. Preserve o corte histórico **10/11/2026, 13:20, America/Sao_Paulo**. Reconcilie movimentos posteriores, negativos, físico/disponível, transferências abertas, IMEI/ICCID e duplicidades antes da carga operacional. Registre o SHA do arquivo, totais, rejeições, resoluções e reversão.
7. Complete fotos de produtos/variantes e valide miniaturas/ampliação no catálogo, estoque, PDV e loja pública. Use foto real aprovada; não apresente imagem fictícia como foto comercial do produto.
8. Valide entrada e recuperação de conta, permissões, seleção/turno, caixa, venda, pagamentos mistos/financiados, descontos, troco, cancelamento/devolução, estoque, transferência de vários produtos e DEFEITOS. Use dados de teste identificados e não gere cobrança, nota ou ativação comercial acidental.

Na transferência, alinhe o momento em que a interface compromete o produto com o pedido do usuário de reduzir o disponível ao colocá-lo em transferência. Documente a transição; preserve físico, reservado e em trânsito sem dupla baixa. Não trate apenas um texto explicativo como entrega da regra de negócio. Teste concorrência com venda e repetição de envio/recebimento.

## 4. Concluir as integrações sem confundir preparo com funcionamento

Mantenha uma linha por API com: documentação oficial/revisão, operações necessárias, implementação existente, código faltante, acesso/contrato faltante, variáveis apenas por nome, ambiente de teste, autenticação, limites, idempotência, webhook ou reconsulta, conciliação, testes, publicação e homologação.

- **Nogle/Ora Connect:** priorize ativação, chip/ICCID, recarga, portabilidade, carteira/extrato, pagamento/cobrança, recorrência e repasses oficiais. `ORA-CONNECT-009` não pode ficar esquecido. Use os contratos oficiais existentes; não invente endpoints. Quando uma informação como comissão não vier da API, registre a limitação e a fonte oficial necessária. O movimento externo deve se ligar ao registro interno, com confirmação e reconciliação; resultado desconhecido não pode gerar reenvio cego.
- **Fiscal:** complete a integração do emissor escolhido e os dados por filial com o contador. Garanta emissão/rejeição, XML/PDF, cancelamento, contingência e identidade da operação. Não transformar aprovação interna em justificativa para atraso fiscal.
- **WhatsApp:** implemente o adaptador oficial, verificação do webhook, templates e envio do documento correto; e-mail continua opcional. Depois complete atendimento, histórico, etiquetas, distribuição e pós-venda previstos. Não marcar mensagem enviada sem resposta do provedor.
- **PayJoy/Aiva:** APIs são parte obrigatória do escopo final solicitado. A venda financiada manual é etapa intermediária. Completar contratos, propostas/aprovações, retornos, termos, repasses, taxas e prazos quando documentados. **J7/QI Tech:** manter extensão futura e requisitos de parceria/documentação, sem falsa integração.
- **Pagamento online:** resolver a divergência F18-06 antes de ativar. Conferir identidade, valor, moeda, idempotência, duplicidade, ordem dos eventos, consulta ao provedor, reembolso e conciliação. Nunca marcar pago por retorno do navegador.
- **Marketplaces:** Mercado Livre, TikTok Shop e demais canais planejados precisam de APIs reais para catálogo, preço, estoque, pedidos, cancelamentos, devoluções e repasses. CSV não encerra a solicitação de automação.
- **Meta:** separar gastos/atribuição de anúncios, eventos de conversão e comércio. Implementar os acessos aprovados e bases legais; atribuição não prova causalidade.

Não suspenda todo o projeto por ausência de uma credencial. Continue estados, filas, reconciliação, UI, testes de contrato documentado, tratamento de falhas e outras áreas independentes. Bloqueie apenas a chamada ou a decisão específica que realmente exige o fornecedor. Não apresente contrato interno com `false` como “pronto, só falta chave”.

## 5. Loja pública, gráficos e demonstração

- Manter `https://ora5g.com.br/loja` com entrada “Comprar” no site. O carrinho e pedido atual são para retirar e pagar na loja: completar checkout pago, confirmação oficial, disponibilidade por loja, frete/rastreio e devolução/reembolso conforme contrato. Publicar produtos e fotos; zero produtos publicados não é loja concluída.
- Preservar e completar os gráficos reais de financeiro, resultados, recebíveis, caixa, vendas, estoques e canais. Validar dados e filtros, custo/margem por permissão e exportações. Estado vazio não pode mascarar falha de consulta; demonstração não alimenta relatório real.
- Atualizar a demo dos fluxos novos com dados fictícios isolados. Atualizar `MATRIZ_DEMO_REAL.md`: extratos, origem das reservas, carga de estoque e novas jornadas não podem ser omitidos. Paridade visual não é homologação funcional.
- Continuar VEL-c onde independente; medir antes/depois em celular autenticado. Não remover RLS ou cachear permissões entre usuários para reduzir chamadas.

## 6. Execução, publicação e encerramento

Trabalhe por lote completo: requisito → implementação → teste relevante → revisão → integração → publicação autorizada → verificação no domínio → atualização da rastreabilidade. Termine o lote antes de iniciar outro, exceto quando houver bloqueio externo específico registrado e trabalho independente disponível.

O domínio já servia VEL-b no corte da auditoria. Corrija `falta_publicar` e a tela `/entregas` com evidência atual. Após cada publicação, compare o SHA de `/saude/versao` com o commit integrado, confirme migrations e execute smoke tests das rotas reais e da demo afetadas. Registre horário em Brasília, ambiente, resultado e rollback. Publicar migrations não publica o front-end nem importa arquivos.

Não espere um novo “continue” para correções reversíveis e trabalho já autorizado. Respeite aprovações específicas que forem efetivamente necessárias para produção, contratação, credenciais ou operações comerciais; não transforme aceite pendente de uma tela em bloqueio geral. Não declare homologação pelo proprietário sem a resposta dele.

A cada lote, atualize os 179 IDs e os extras da conversa, distinguindo: não iniciado, parcial, código testado, configuração pendente, publicado, homologado e bloqueio externo. Ao chegar a uma dependência, registre o mínimo exato necessário, quem fornece e qual trabalho ainda pode prosseguir. Não encerre com “tudo pronto” enquanto houver adapter falso, dado não importado ou requisito parcial.

Ao finalizar o trabalho executável, entregue: commits/PRs, versão do domínio, migrations aplicadas, testes e ignorados, bugs resolvidos, jornadas funcionando por perfil, itens não concluídos por ID, bloqueios externos precisos e lista consolidada de APIs/configurações. Não solicite valores de segredos pelo chat.

As soluções de código de `SOLUCOES_PARA_AVALIACAO.md` são alternativas para análise. Avalie compatibilidade e testes antes de propor sua adoção; não copie automaticamente e não use isso como autorização para reescrever a arquitetura.
