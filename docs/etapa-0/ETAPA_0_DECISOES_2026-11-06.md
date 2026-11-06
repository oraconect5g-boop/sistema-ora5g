# Etapa 0 — Decisões do proprietário (06/11/2026), contrato Nogle parcial e plano de 6 meses

**Projeto:** Ora 5G Platform · **Autor:** Claude Code · **Revisor esperado:** Codex + proprietário
**Complementa:** `ETAPA_0_ENTENDIMENTO_E_PROPOSTA.md` e `ETAPA_0_BASE_CONSOLIDADA.md`.
**Status:** decisões registradas a partir da resposta do proprietário; itens marcados "a confirmar" seguem abertos.

---

## 1. Decisões registradas

| ID | Decisão do proprietário | Consequência no sistema |
|---|---|---|
| DEC-U18 | **Loja piloto: Santa Cândida.** Vende celulares, cabos, carregadores, acessórios e outros itens | Catálogo precisa de itens com IMEI e itens por quantidade desde o primeiro dia |
| DEC-U19 | **CNPJ raiz + CNPJ próprio por loja (filiais)** | Modelo: empresa (raiz) → lojas, cada uma com CNPJ, endereço e configuração fiscal próprios. Notas saem pelo CNPJ da loja |
| DEC-U20 | **Todas as notas passam por aprovação de quem emite.** Hoje **quem emite é o dono**, manualmente: acessa o portal, emite a nota assinada, anexa na Rein e envia ao cliente. **Quer automatizar tudo isso** e ser avisado por notificação no painel *(revisado na 2ª resposta de 06/11)* | Fila "Notas a emitir" com aviso no celular do dono/gerente; aprovação em 1 toque dispara emissão automática e envio (seção 2A) |
| DEC-U21 | Fluxo atual da nota é confuso: cadastrar cliente → vincular à venda já feita → passar ao gerente → emitir → enviar | No Ora: o cliente pode ser vinculado **depois** da venda, em 1 tela; a solicitação já chega pronta ao gerente |
| DEC-U22 | **As lojas não têm impressora.** A nota vai para o e-mail do cliente; **sem e-mail válido, vai por WhatsApp** *(confirmado na 2ª resposta)* | Comprovante e nota são digitais; e-mail ou WhatsApp obrigatório ao solicitar nota |
| DEC-U23 | **A Rein continua funcionando durante o desenvolvimento e o piloto.** A Ora roda em paralelo para teste; depois a Rein é cancelada e a Ora vai para as outras lojas | Piloto em **operação paralela**: a Rein segue como sistema oficial (inclusive fiscal) até o desligamento. Resolve C-09 |
| DEC-U24 | **A Rein exporta um CSV com todo o estoque**, que será importado na Ora | Amplia DEC-U04: a importação por arquivo inclui **estoque** (não só produtos e preços). Continua sem API da Rein |
| DEC-U25 | **A única API externa no núcleo agora é a Nogle** (documentação online pública) | Rein: só arquivo. Nogle: adaptador real a partir do contrato oficial (seção 3) |
| DEC-U26 | **Hoje não há regra de desconto:** o vendedor muda o preço livremente, o que gera diferenças de caixa | O vendedor **não edita preço**; ele aplica desconto, e o sistema registra e limita |
| DEC-U27 | **Desconto à vista: até 10%.** Acima de 10%, só o gerente ou o dono. Limites de 5% ou 10% conforme o produto, **a validar antes de implantar** *(refinado por DEC-U41: o limite passa a considerar a margem)* | Teto por categoria + margem mínima; acima do limite, pedido de aprovação ao gerente/dono |
| DEC-U28 | **Maquininhas: PicPay e PagSeguro.** Haverá pagamento online por **link de pagamento** | Pagamento registra provedor (PicPay, PagSeguro, link online) + meio (Pix, débito, crédito) |
| DEC-U29 | **Financeiras: PayJoy e Aiva (Flexphone, pagamento mensal)** | Venda financiada lançada e contabilizada no sistema, para aparelho e chip; financeira é um tipo de pagamento com repasse posterior |
| DEC-U30 | **E-mail do cliente obrigatório só na venda PayJoy** | Validação condicional por meio de pagamento |
| DEC-U31 | **Código de barras preparado desde já** para leitores futuros | Campo EAN/código de barras em produtos e busca já aceita código; leitor entra depois sem mudar a regra |
| DEC-U32 | **A base de clientes começa vazia** | Sem migração de clientes |
| DEC-U33 | **Vendedores têm e-mail próprio**; usam celular pessoal, celular da loja e às vezes notebook | Login por e-mail; sessão curta e nada sensível salvo no aparelho; revogação imediata |
| DEC-U34 | **Um vendedor pode trabalhar em várias lojas**, inclusive alternando na mesma loja | Vínculo vendedor ↔ várias lojas; a venda conta para a loja onde foi feita e para o vendedor |
| DEC-U35 | **Integrações online: Mercado Livre, TikTok Shop e demais plataformas** fazem parte do escopo | Mantidas no plano (seção 4) |
| DEC-U36 | **Prazo desejado: desenvolvimento completo em 6 meses** | Plano da seção 4 com recortes explícitos |
| DEC-U37 | Repositório GitHub privado já existe; instalação de pacotes liberada | Ver pendências técnicas (seção 5) |
| DEC-U38 | **Venda financiada (PayJoy/Aiva):** o cliente paga a entrada na loja e o restante fica com a financeira. Lança-se o **valor do aparelho** e o **valor da entrada**. **Os juros da financeira não entram** no sistema | Total da venda = preço do aparelho; pagamentos = entrada (meio usado) + "a receber da financeira" (preço − entrada). Juros nunca entram em receita, meta ou comissão |
| DEC-U39 | **Quem emite a nota é o dono, não um contador** | Ainda assim, a regra fiscal (tipo de nota e tributos) deve ser validada por um contador antes de automatizar |
| DEC-U40 | **Não existe relatório de presença e desempenho do vendedor**: quantos dias esteve em cada loja, quanto vendeu, se bateu a meta. Hoje é tudo manual. Um Excel de referência virá depois | Registro de turno por loja + painel de desempenho por vendedor/loja/dia (seção 2D) |
| DEC-U41 | **Limite de desconto deve depender da margem do produto** (e dos custos, como taxas de recebimento), não de um percentual fixo | Motor de desconto por margem mínima (seção 2B); exige custo de cada produto |
| DEC-U42 | **Quem aprova desconto e nota: o gerente ou o dono** | Perfis aprovadores: Dono e Gerente |
| DEC-U43 | **Perfis hoje:** dois donos (Camille e André); **não há gerente oficial**; o proprietário atual atua como desenvolvedor/administrador; **os vendedores fazem tudo** (vendem, lançam, recebem). Não há caixa nem estoquista | Perfis iniciais: Dono, Administrador do sistema, Gerente (previsto, sem titular), Vendedor (venda + caixa + consulta de estoque) |
| DEC-U44 | **Assistência/manutenção pode ser feita sem lançamento** (ex.: limpeza), causando perda de receita. Quer que as assistências sejam centralizadas e registradas por loja, e um sistema que **evite esse desvio** | Módulo de Ordem de Serviço com controles anti-desvio (seção 2C) |
| DEC-U45 | **Quer benefícios e incentivos para os vendedores** dentro do sistema (ideia inicial, sem proposta definida) | Proposta de incentivos para validar (seção 2D) |
| DEC-U46 | **Nogle é completa para chips:** venda, cadastro, transferência, ativação, consulta de saldo e portabilidade. Chips, ativações e portabilidades **devem contar no caixa/produção do vendedor**, o que hoje não acontece | Ora Connect com eventos de produção por vendedor: chip vendido, ativação, portabilidade e recarga |
| DEC-U47 | **Assistência é feita por um técnico central**, que recebe os aparelhos das lojas e devolve conforme o orçamento. Hoje os orçamentos ficam num **grupo de WhatsApp** e o cadastro do aparelho é feito numa **folha de papel**, com uma via para o cliente. Quer modernizar: cadastro enviado direto ao WhatsApp do **cliente e do técnico**, e aviso a ambos quando o aparelho voltar à loja e for entregue | Ordem de Serviço digital com etapas e avisos automáticos (seção 2C) |
| DEC-U48 | **Conexão com a Nogle será pela API**, usando a chave de API da Ora | Adaptador Nogle via API; o tipo da chave (franquia, marca/MVNO ou PDV, conforme a documentação) ainda precisa ser identificado |
| DEC-U49 | **Repositório conectado:** `oraconect5g-boop/sistema-ora5g` (privado). Verificado em 06/11: estava **vazio**, sem código anterior | Projeto começa do zero; documentação do pacote e da Etapa 0 é o primeiro conteúdo versionado |

**Ainda aberto:** configuração da VPS (migração em andamento) e o cadastro/organização das lojas.

---

## 2. Pontos de atenção gerados pelas decisões

1. **Nota fiscal com aprovação do dono/gerente em todas as vendas.** Enquanto o processo atual seguir no piloto, nada muda legalmente. Quando a Ora assumir a emissão, o **contador precisa confirmar o prazo** entre a venda e a emissão (nota de consumidor normalmente é emitida no ato da venda). O sistema vai mostrar, para cada nota pendente, há quanto tempo a venda foi feita, e alertar atrasos.
2. **E-mail do cliente × nota por e-mail.** O e-mail só é obrigatório na PayJoy, mas a nota é enviada por e-mail. Decidido: ao solicitar a nota, o sistema pede e-mail **ou** WhatsApp do cliente.
3. **Operação paralela no piloto exige lançamento duplo.** Durante o piloto, cada venda da Santa Cândida será lançada na Rein (oficial) e na Ora (teste). Para não sobrecarregar a equipe, proponho períodos curtos e um **relatório diário de comparação Rein × Ora** (vendas, estoque, caixa).
4. **Estoque inicial por CSV + conferência.** O arquivo da Rein vira o ponto de partida, mas os IMEIs precisam ser **conferidos fisicamente** na Santa Cândida antes de a Ora assumir.
5. **Desconto sem regra hoje = maior ganho rápido.** Só o fim da edição livre de preço já reduz as diferenças de caixa. Os parâmetros de margem (seção 2B) precisam ser aprovados antes do piloto.
6. **Separação de funções com vendedor fazendo tudo.** Como o vendedor vende, recebe e lança, o controle passa a ser feito pelo sistema e pelo dono: o vendedor nunca aprova o próprio desconto, o fechamento de caixa é conferido pelo dono, e todo ajuste fica registrado.

---

## 2A. Nota fiscal automatizada (proposta)

**Hoje:** venda → cadastro do cliente → vínculo à venda → dono entra no portal → emite e assina → anexa na Rein → envia ao cliente. Vários sistemas e telas.

**Proposto:**
1. O vendedor conclui a venda e toca em **Solicitar nota**. O cliente pode ser vinculado nessa hora ou depois; o sistema pede e-mail **ou** WhatsApp.
2. O dono (ou gerente) recebe **aviso no celular**; abre a solicitação já pronta e toca em **Aprovar e emitir**.
3. A Ora envia a nota a um **emissor fiscal por API** (empresa homologada que transmite à SEFAZ, assinando com o certificado digital da empresa guardado com segurança).
4. Autorizada a nota, o sistema **envia automaticamente** o PDF/XML ao e-mail do cliente, ou ao WhatsApp se não houver e-mail válido, e guarda tudo vinculado à venda.
5. Rejeição ou falha aparece na fila com o motivo e a opção de corrigir e reenviar, **sem gerar nota duplicada**.

**O que é preciso para ligar isso:** contratar um emissor fiscal por API (há várias empresas no mercado; a escolha e o custo vêm com orçamento para sua aprovação); certificado digital A1 da empresa; e **um contador validando** o tipo de nota e a tributação de cada tipo de produto (aparelho, acessório, chip, serviço de assistência). O dono continua aprovando cada nota, mas sem portal, sem anexar na Rein e sem envio manual.

**Possível antecipação:** como hoje a nota já é emitida fora da Rein, a emissão pela Ora pode começar na Santa Cândida **ainda durante a operação paralela** (mês 3), assim que emissor, certificado e contador estiverem prontos. É um ganho rápido para o dono.

## 2B. Desconto por margem (proposta)

O limite deixa de ser um percentual fixo e passa a respeitar a margem de cada produto:

- Cada produto tem **custo** (vindo do CSV da Rein e das entradas).
- O sistema calcula a **margem depois do desconto e das taxas do meio de pagamento** (ex.: taxa da maquininha no crédito parcelado), porque essas taxas também consomem margem.
- **Regra do vendedor:** pode dar desconto até o **menor** de dois limites: (a) o teto da categoria (ex.: 10% à vista) e (b) o desconto que mantém a **margem mínima** definida para aquela categoria.
- Acima disso: **pedido de aprovação** ao gerente ou dono, que vê na tela a margem que sobraria.
- Exemplo: num cabo barato, 10% pode nem fazer diferença para o cliente, e a regra permite isso; num aparelho caro, 10% é relevante, e a margem mínima impede que o desconto coma o lucro.

**Parâmetros a definir com você:** margem mínima por categoria e teto por categoria. Vou propor valores iniciais assim que o CSV com custos chegar.

## 2C. Assistência e manutenção sem desvio (proposta)

Não existe sistema que impeça 100% um serviço feito "por fora" e pago em dinheiro. O que funciona é tornar o registro **mais vantajoso que o desvio** e tornar o desvio **visível**:

1. **Ordem de Serviço (OS) obrigatória** para qualquer aparelho de cliente que entra para assistência, até limpeza: cliente, aparelho (IMEI), problema, foto e serviço do catálogo com preço.
2. **O cliente recebe a OS por WhatsApp** com número e valor. O cliente passa a ser o fiscal ("exija seu comprovante"), divulgado na loja.
3. **Peças e insumos só saem do estoque vinculados a uma OS.** Na contagem de estoque, peça faltando sem OS aparece como divergência do responsável.
4. **Assistência conta para a meta e a comissão do vendedor** quando registrada e paga. Registrar passa a dar dinheiro a ele.
5. **Relatórios para o dono:** OS abertas sem venda, OS por vendedor, tempo de conserto, serviços por loja e peças consumidas × serviços vendidos.
6. **Assistência centralizada (confirmado: há um técnico central).** O aparelho do cliente sai da loja para o técnico e volta por **transferência de custódia** registrada, sem se confundir com o estoque de venda.

**Fluxo digital proposto da OS (substitui a folha de papel e o grupo de WhatsApp):**

| Etapa | Quem faz | O que o sistema faz |
|---|---|---|
| 1. Recebimento | Vendedor, no celular | Cadastra cliente, aparelho (IMEI), defeito relatado, estado do aparelho, fotos e acessórios deixados. Gera número da OS |
| 2. Comprovante | Automático | Envia a OS ao **WhatsApp do cliente** (substitui a via em papel) e ao **técnico** |
| 3. Envio ao técnico | Vendedor | Registra a saída da loja para o técnico |
| 4. Orçamento | Técnico, no próprio painel | Informa diagnóstico, peças e valor. **O orçamento sai do grupo de WhatsApp e fica dentro da OS**, com histórico |
| 5. Aprovação | Cliente | Recebe o orçamento no WhatsApp e aprova ou recusa; a resposta fica registrada |
| 6. Conserto e devolução | Técnico | Marca como pronto e registra o retorno à loja |
| 7. Aviso de chegada | Automático | Avisa o cliente que o aparelho está na loja |
| 8. Entrega e pagamento | Vendedor | Cobra pelo PDV (conta na produção do vendedor), registra a entrega e **avisa cliente e técnico** |

Aparelho parado em qualquer etapa além do prazo combinado aparece em alerta para o dono.

**Dependência:** os envios automáticos por WhatsApp exigem a **API oficial do WhatsApp** (Meta ou parceiro autorizado). Até ela estar ativa, a OS digital já funciona com um botão "enviar pelo WhatsApp" que abre a conversa com a mensagem pronta, sem automação não oficial.

## 2D. Desempenho e incentivos do vendedor (proposta inicial)

**Relatório que hoje é manual:**
- **Turno por loja:** ao começar o dia, o vendedor toca em "Iniciar turno" na loja onde está. Isso registra quantos dias e em quais lojas ele trabalhou, inclusive quem roda entre lojas.
- **Painel por vendedor, loja e dia:** dias trabalhados, vendas por categoria (aparelhos, acessórios, chips, ativações, portabilidades, recargas, assistências), valor, descontos concedidos e **meta atingida ou não**.
- Formato final a ser ajustado com o Excel que você vai enviar.

**Incentivos (ideias para escolher):**
- **Extrato em tempo real** no celular: "hoje você fez X e já ganhou R$ Y de comissão".
- **Chip, ativação, portabilidade e assistência contam** na produção e na comissão (hoje não contam).
- **Metas diárias e mensais visíveis**, com barra de progresso.
- **Ranking da loja e da rede**, com campanhas temporárias (ex.: bônus por portabilidade na semana).
- **Bônus por venda com margem saudável:** quem vende sem estourar desconto ganha mais, alinhando o interesse do vendedor ao da empresa.
- **Conquistas** (ex.: 10 portabilidades no mês) que podem virar prêmio definido pelos donos.

Todas as regras de comissão e bônus serão **configuráveis pelos donos**, com histórico, sem mudar código.

---

## 3. Contrato Nogle — descoberta parcial (fonte oficial)

**Fonte:** documentação pública em `https://docs.nogle.tech/` (coleção Postman publicada pela Contel Telecom). Lida em 06/11/2026. **Leitura incompleta:** a ferramenta só exibiu a primeira parte da coleção; as rotas de **ativação, recarga, portabilidade e chip/eSIM não apareceram ainda** e não serão presumidas.

| Item | O que a documentação mostra |
|---|---|
| Fornecedor | API NOGLE da **Contel Telecom** |
| Endereço base | `https://api.conteltelecom.com.br` (HTTPS obrigatório) |
| Estilo | REST com JSON; o resultado deve ser lido pelo código de status HTTP |
| Autenticação | `POST /auth/token` com chave de acesso no corpo, de um destes tipos: **franquia**, **marca/MVNO** ou **PDV**. Devolve token temporário do tipo *Bearer*; quando expira, pede-se outro |
| Suporte técnico | `ti@conteltelecom.com.br`, atendimento em até 12 horas úteis |
| Ambiente de testes (sandbox) | **não mencionado** |
| Proteção contra duplicidade | **não mencionada** |
| Avisos automáticos (webhooks) | **não mencionados** |
| Limites de uso | **não mencionados** |

**Rotas visíveis até agora:**

| Grupo | Operação | Método e caminho |
|---|---|---|
| Token | Autenticação | `POST /auth/token` |
| Geral | DDDs, planos, planos de campanha, estados, cidades, logística | `GET /ddds`, `/planos`, `/planosCampanhas`, `/estados`, `/cidades/{UF}`, `/logistica` |
| Cliente | Criar, atualizar, consultar, linhas do cliente, listar | `POST /cliente/criar`, `PUT /cliente/atualizar`, `GET /cliente/buscar`, `/cliente/linhas`, `/cliente/listar` |
| Linha | Detalhes, saldo, histórico de recargas, existência, número pelo ICCID, titularidade | `GET /linhas/detalhes`, `/linhas/saldo`, `/linhas/historico`, `/linhas/verificaExistencia`, `/linhas/numeroPeloIccid`, `/linhas/validaTitularidade` |

**Formatos de erro observados nos exemplos:** `200` com `{"retorno": false, "mensagem": ...}` (falha de negócio com status de sucesso), `404` com `{"erro": ...}`, `422` com `{"message", "errors": {campo: [...]}}`. Alguns retornos vêm dentro de `data` e outros não → o adaptador precisa normalizar.

**Consequências de projeto:**
- Como não há proteção contra duplicidade documentada, toda ativação/recarga com tempo esgotado será **consultada antes de reenviar** (ex.: histórico de recargas, detalhes da linha).
- Sem sandbox documentado, os testes usarão simulador próprio com estes formatos; o teste real exigirá combinar com o suporte da Contel uma linha/ambiente de teste.
- **Precisamos saber qual tipo de chave a Ora tem (franquia, marca/MVNO ou PDV)** — define o que a API permite. As chaves ficam no gerenciador de segredos, nunca no chat.

---

## 4. Plano de 6 meses (06/11/2026 → início de maio/2027)

**Avaliação honesta:** 6 meses é possível para **o núcleo operacional rodando nas 14 lojas, Ora Connect via Nogle, link de pagamento e as primeiras integrações online** — desde que as dependências externas andem no prazo. Não é realista em 6 meses entregar com qualidade **todos** os canais, IA e BI avançado. Proposta:

| Mês | Período | Entregas | Portão de saída |
|---|---|---|---|
| **1** | nov–dez | Fundação (login por e-mail, lojas com CNPJ, vendedor em várias lojas, perfis, permissões testadas), catálogo com código de barras, **importador do CSV de estoque da Rein**, estoque/IMEI | Estoque da Santa Cândida importado e conferido em homologação |
| **2** | dez–jan | PDV no celular, cliente vinculável depois, pagamento misto (dinheiro, Pix, PicPay, PagSeguro, PayJoy, Aiva, link), caixa, **descontos com limite e aprovação**, **fila de notas do gerente com notificação** | Venda completa no celular em homologação |
| **3** | jan–fev | **Piloto paralelo na Santa Cândida** (Rein oficial), relatório diário Rein × Ora, turno e desempenho por vendedor, metas, painéis, Ordem de Serviço; adaptador Nogle (consultas e cadastro); **nota automática antecipada** se emissor, certificado e contador estiverem prontos (seção 2A) | 2–4 semanas de fechamentos batendo com a Rein |
| **4** | fev–mar | **Emissão fiscal pela Ora** via provedor homologado; Nogle ativação/recarga; conciliação PicPay/PagSeguro; **desligar a Rein na Santa Cândida** | Go/no-go assinado |
| **5** | mar–abr | Implantação em ondas **3 → 7 → 14 lojas**; Mercado Livre | 14 lojas operando |
| **6** | abr–mai | TikTok Shop, loja virtual básica, WhatsApp oficial no atendimento, backups testados e segurança reforçada | Operação estável |
| **Depois** | a partir de mai/2027 | Shopee e demais plataformas, Meta Ads com atribuição, IA no atendimento e BI avançado | — |

**O que pode atrasar o plano:**
- **Provedor fiscal e contador** definidos até o fim do mês 2 (senão o desligamento da Rein escorrega).
- **Rotas de ativação/recarga da Nogle** e uma linha de teste combinada com a Contel até o mês 3.
- **Disponibilidade da equipe da Santa Cândida** para o lançamento duplo no piloto.
- **Contas e aprovações** de Mercado Livre e TikTok Shop (dependem das plataformas).
- Respostas rápidas suas nas decisões de negócio (limites de desconto, fluxos das financeiras).

---

## 5. Pendências técnicas para começar a programar

| Item | Situação verificada em 06/11/2026 |
|---|---|
| Repositório GitHub | **Conectado** (`oraconect5g-boop/sistema-ora5g`, privado, estava vazio). Primeiro envio: documentação |
| Instalação de pacotes | **Ainda bloqueada nesta conversa** (conferido de novo às 12h30). A liberação vale para conversas novas; a programação deve começar numa conversa nova |
| VPS HostGator | Migração em andamento; não é necessária para começar (desenvolvimento e homologação podem rodar antes) |
| Supabase | Conector disponível; nenhum projeto criado. Criar projeto só com a sua autorização (plano gratuito para desenvolvimento) |

---

## 6. Perguntas restantes (atualizado após a 2ª resposta de 06/11)

**Respondidas:** envio da nota (e-mail ou WhatsApp), financeiras (entrada + restante da financeira, sem juros), quem emite (o dono), limites de desconto (por margem), perfis (donos + vendedores).

*Respondidas na 3ª resposta: repositório conectado; assistência por técnico central; conexão Nogle pela API.*

1. **Técnico:** ele é funcionário da Ora ou um prestador de fora? Ele usaria o sistema (painel próprio) ou só receberia mensagens?
2. **Portal da nota:** qual portal o dono usa para emitir (o da Secretaria da Fazenda do estado, outro emissor gratuito, outro sistema)? E qual tipo de nota sai: de consumidor (NFC-e) ou a nota "completa" (NF-e)?
3. **Contador:** a empresa tem um contador que faz a contabilidade e os impostos? Ele precisará validar a configuração fiscal antes da automação.
4. **Financeiras:** a financeira repassa à loja exatamente o valor do aparelho menos a entrada, ou desconta alguma taxa da loja? Em quantos dias?
5. **Assistência:** hoje o conserto é feito na própria loja pelo vendedor, ou existe um técnico/local central que recebe os aparelhos das lojas?
6. **Nogle:** a documentação pede, no login da API, uma chave de um destes três tipos: **franquia**, **marca/MVNO** ou **PDV**. No ERP da Nogle, em qual dessas áreas a chave de API da Ora foi gerada? (Responder só a área, nunca a chave.)
