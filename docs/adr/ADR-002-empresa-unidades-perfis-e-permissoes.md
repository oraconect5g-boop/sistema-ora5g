# ADR-002 — Empresa, unidades, perfis e permissões (fundação do acesso)

**Status:** Aceita pelo proprietário em 07/11/2026, como proposta (perguntas 1, 3 e 5 da seção 5 respondidas: sim). Perguntas 2 (ranking) e 4 (técnico) seguem abertas, sem bloquear o banco. Implementada em `packages/banco` (ORA-004/005)
**Data:** 06/11/2026 · **Autor:** Claude Code
**Requisitos:** ORA-ORG-001 a 006 (P0), ORA-ORG-007 a 010 (preparados, não implementados), ORA-QUAL-001
**Decisões de origem:** DEC-U18 (piloto Santa Cândida), DEC-U19 (CNPJ raiz + filiais), DEC-U33 (login por e-mail, celular pessoal), DEC-U34 (vendedor em várias lojas), DEC-U42/U43 (perfis reais), DEC-U47 (técnico central), loja online como unidade (plano de 06/11)
**Libera:** ORA-004 (primeira migration), ORA-005 (RLS e testes negativos), ORA-006 (login)

---

## 1. Contexto

- Uma empresa com **CNPJ raiz** e **um CNPJ de filial por loja**. 14 lojas físicas; piloto na **Santa Cândida**.
- Haverá também a **Loja Online**, um **técnico central** de assistência e, no futuro, depósito e outras empresas/UF.
- Pessoas reais hoje: **2 donos**, **1 administrador do sistema** (o proprietário, que atua como desenvolvedor) e **vendedores que fazem tudo** (vendem, recebem, lançam). **Não há gerente oficial**, caixa nem estoquista.
- Vendedores **circulam entre lojas** (2 ou 3 lojas, às vezes alternando no mesmo dia), entram por **e-mail** e usam **celular pessoal**, celular da loja e às vezes notebook.
- Regra do projeto: isolamento por loja garantido **no servidor e no banco**, nunca só na tela.

## 2. Decisão

### 2.1 Estrutura organizacional

```text
organização (Ora 5G)
 └─ empresa (CNPJ raiz, ex.: 12.345.678)
     ├─ unidade "Santa Cândida"   tipo: loja_fisica   CNPJ 12.345.678/0001-xx
     ├─ unidade ... (14 lojas)    tipo: loja_fisica   CNPJ 12.345.678/000N-xx
     ├─ unidade "Loja Online"     tipo: online        CNPJ próprio OU emite pelo CNPJ de outra unidade (a decidir)
     ├─ unidade "Assistência"     tipo: assistencia   guarda aparelhos de clientes em conserto (custódia, não estoque de venda)
     └─ unidade "Depósito"        tipo: deposito      futuro
```

- **"Unidade"** é o nome genérico; loja física é um tipo de unidade. Assim a loja online, o técnico e um futuro depósito usam a mesma estrutura de permissão, estoque e relatório.
- **Organização** existe desde já (uma só) para permitir, no futuro, outra empresa ou outro CNPJ raiz sem refazer o banco (ORA-ORG-010).
- **Regiões** (ORA-ORG-009) **não entram agora**: não há gerente regional. Entram depois por migration, sem quebrar nada.

### 2.2 Tabelas da primeira migration (ORA-004)

| Tabela | Campos principais | Regras garantidas pelo banco |
|---|---|---|
| `organizacoes` | id, nome, status | — |
| `empresas` | id, organizacao_id, razao_social, nome_fantasia, cnpj_raiz (8 dígitos), status | `cnpj_raiz` único por organização |
| `unidades` | id, empresa_id, codigo, nome, tipo (`loja_fisica`, `online`, `assistencia`, `deposito`), cnpj (14 dígitos), unidade_emissora_id, uf, cidade, endereço, fuso, status | `codigo` único por organização; `cnpj` único; CNPJ com **dígitos verificadores válidos** e **começando pelo CNPJ raiz da empresa**; `loja_fisica` **exige** CNPJ; `online` exige CNPJ **ou** `unidade_emissora_id` |
| `perfis_usuario` | id (= usuário do login), nome, email, status (`ativo`, `bloqueado`), ultimo_acesso_em | Usuário bloqueado perde acesso **no banco**, mesmo com sessão aberta |
| `papeis` | codigo, nome, escopo_padrao (`organizacao` ou `unidade`), ativo | Lista fixa via migration (seção 2.3) |
| `permissoes` | codigo (ex.: `venda.registrar`), descricao, modulo | Lista fixa via migration |
| `papel_permissoes` | papel, permissao | Mudança só por migration auditada |
| `vinculos` | id, usuario_id, papel, escopo (`organizacao` ou `unidade`), unidade_id, inicio, fim, criado_por, motivo | Um vínculo **ativo** por (usuário, papel, unidade); `unidade_id` obrigatório quando escopo = `unidade` |
| `contexto_sessao` | sessao_id, usuario_id, unidade_atual_id, iniciado_em, trocado_em | Só aceita unidade em que o usuário tem vínculo ativo; toda troca é registrada |
| `auditoria` | id, ocorrido_em, usuario_id, unidade_id, acao, alvo_tipo, alvo_id, antes, depois, motivo, origem | **Só inserção**: ninguém altera nem apaga, nem o administrador |

Convenções: identificadores UUID; datas `timestamptz` exibidas em America/Sao_Paulo; **nada é apagado**: desativação por `status` ou `fim` do vínculo; nomes de tabelas em português para facilitar a leitura pelo proprietário.

### 2.3 Papéis

| Papel | Escopo | Existe hoje? | Resumo |
|---|---|---|---|
| `dono` | organização | Sim (2 pessoas) | Vê tudo, aprova descontos e notas, define metas, comissões e preços |
| `administrador` | organização | Sim (o proprietário/desenvolvedor) | Usuários, unidades, configurações e integrações. **Não vende, não aprova desconto nem nota** (separação entre técnico e negócio) |
| `gerente` | unidade | Previsto, sem titular | Aprova descontos e notas **da sua unidade** dentro do limite; confere caixa |
| `vendedor` | unidade | Sim | Vende, recebe, lança, consulta estoque, abre OS, solicita desconto e nota **na unidade em que está** |
| `tecnico` | unidade `assistencia` | Previsto | Vê só as OS enviadas a ele; informa orçamento e conclusão (depende da resposta sobre o técnico) |

Papéis da documentação original que **não existem hoje** (financeiro, fiscal, atendimento, marketing, operador Ora Connect, gerente regional) ficam **cadastráveis depois por migration**, sem mudar a estrutura.

### 2.4 Matriz de permissões inicial

Legenda: ✅ permitido · 🏬 só na unidade atual/vinculada · 👤 só o próprio · ⏳ só solicita · ❌ negado

| Ação | Dono | Administrador | Gerente | Vendedor | Técnico |
|---|---|---|---|---|---|
| Entrar e escolher unidade | ✅ | ✅ | 🏬 | 🏬 | 🏬 |
| Registrar venda e pagamento | ✅ | ❌ | 🏬 | 🏬 | ❌ |
| Ver vendas | ✅ todas | ✅ (leitura) | 🏬 | 👤 + resumo da unidade | ❌ |
| Ranking de vendedores | ✅ | ✅ | 🏬 | Configurável pelos donos (seção 5) | ❌ |
| Ver custo e margem | ✅ | ✅ | 🏬 | ❌ (vê só "dentro do limite" ou "precisa aprovação") | ❌ |
| Dar desconto dentro do limite | ✅ | ❌ | 🏬 | 🏬 | ❌ |
| Aprovar desconto acima do limite | ✅ | ❌ | 🏬 dentro da alçada | ❌ | ❌ |
| Solicitar nota fiscal | ✅ | ❌ | 🏬 | 🏬 | ❌ |
| Aprovar e emitir nota | ✅ | ❌ | 🏬 | ❌ | ❌ |
| Abrir caixa / fechar o próprio | ✅ | ❌ | 🏬 | 👤 | ❌ |
| Conferir caixa | ✅ | ❌ | 🏬 | ❌ | ❌ |
| Consultar estoque | ✅ | ✅ | 🏬 | 🏬 (+ consulta de outras unidades sem custo) | ❌ |
| Conferir estoque (contagem) | ✅ | ❌ | 🏬 | 🏬 | ❌ |
| Ajustar estoque / registrar perda | ✅ | ❌ | ⏳ | ⏳ | ❌ |
| Importar CSV da Rein | ✅ aprova | ✅ executa | ❌ | ❌ | ❌ |
| Alterar preço | ✅ | ❌ | ❌ | ❌ | ❌ |
| Metas e comissões | ✅ | ❌ | consulta 🏬 | 👤 consulta | ❌ |
| Buscar cliente por CPF/telefone | ✅ | ❌ | ✅ | ✅ (busca exata, registrada) | só os das suas OS |
| Exportar lista de clientes | ✅ | ❌ | ❌ | ❌ | ❌ |
| Abrir OS | ✅ | ❌ | 🏬 | 🏬 | ❌ |
| Orçar e concluir OS | ❌ | ❌ | ❌ | ❌ | ✅ OS dele |
| Gerir usuários e vínculos | ✅ | ✅ | ❌ | ❌ | ❌ |
| Gerir unidades e configurações | ✅ | ✅ | ❌ | ❌ | ❌ |
| Integrações e credenciais | ❌ | ✅ | ❌ | ❌ | ❌ |
| Ver auditoria | ✅ | ✅ | 🏬 | ❌ | ❌ |

Regras transversais:
- **Ninguém aprova a própria solicitação** (desconto, nota, ajuste), nem o dono. Garantido no banco.
- Um usuário pode ter **vários vínculos**: ex.: vendedor na Santa Cândida e em outra loja. Ele vê e opera **somente a unidade atual** escolhida na sessão, que precisa estar entre as vinculadas.
- **Clientes são da empresa, não da loja**: o mesmo cliente compra em qualquer unidade. O vendedor encontra o cliente por **busca exata** (CPF ou telefone), não por lista completa, e cada consulta fica registrada (LGPD).

### 2.5 Como a permissão é garantida (três camadas)

1. **Serviço no servidor:** toda ação passa por `autorizar(usuário, permissão, unidade)`, que lê vínculos e papéis do banco. A unidade vem do **contexto da sessão no servidor**, nunca do que o celular envia.
2. **RLS no banco:** toda tabela com `unidade_id` tem política que só libera linhas de unidades em que o usuário tem vínculo ativo (ou escopo organização), **e** só se `perfis_usuario.status = 'ativo'`. Funções auxiliares `SECURITY DEFINER` com `search_path` fixo.
3. **Escrita crítica só por funções do banco:** o aplicativo não faz `insert`/`update` direto em tabelas críticas. Usa funções que validam permissão, gravam a operação e a auditoria **na mesma transação**.

A **chave secreta do Supabase** (que ignora RLS) é usada **só** pelo worker e pelas migrations, nunca em requisições de usuário.

### 2.6 Sessão e celular pessoal

- Login por **e-mail e senha**; recuperação por e-mail com mensagem neutra (não revela se o e-mail existe).
- **Sessão por turno:** expira em até 12 horas ou ao fim do dia; no dia seguinte, novo login.
- **Ações sensíveis** (aprovar desconto, aprovar nota, conferir caixa, gerir usuários) pedem **confirmação de senha recente**.
- **Nada sensível guardado no aparelho:** sem lista de clientes ou custos em cache; ao sair, a tela é limpa.
- **Bloqueio imediato:** ao bloquear um usuário ou encerrar um vínculo, as sessões são revogadas e o banco já nega acesso pela regra de `status` (camada 2).
- **Autenticação em dois fatores** para dono e administrador fica preparada para a fase P1 (ORA-ORG-007).

### 2.7 Testes obrigatórios (aceite de ORA-005)

| # | Cenário | Resultado esperado |
|---|---|---|
| T1 | Vendedor da unidade A consulta venda, estoque, caixa ou meta da unidade B | Nenhuma linha retornada / recusado |
| T2 | Vendedor vinculado a A e B escolhe A e tenta gravar venda em B | Recusado e auditado |
| T3 | Requisição envia `unidade_id` diferente do contexto da sessão | Ignorado ou recusado e auditado |
| T4 | Vendedor tenta aprovar o próprio desconto | Recusado pelo banco |
| T5 | Dono tenta aprovar solicitação criada por ele mesmo | Recusado pelo banco |
| T6 | Usuário bloqueado com sessão ainda aberta faz consulta | Recusado pelo banco |
| T7 | Vínculo encerrado (fim no passado) | Unidade some da escolha e das consultas |
| T8 | Administrador tenta registrar venda ou aprovar desconto | Recusado |
| T9 | Qualquer usuário tenta alterar ou apagar registro de auditoria | Recusado, inclusive com papel de administrador |
| T10 | Cadastro de unidade com CNPJ inválido ou de outra raiz | Recusado pelo banco |
| T11 | Vendedor tenta listar todos os clientes | Só busca exata funciona; listagem negada |
| T12 | Técnico tenta ver OS de outro técnico ou venda | Nada retornado |

## 3. Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Permissões só no aplicativo, sem RLS | Um erro de código exporia dados de outras lojas; o projeto exige as duas camadas |
| Tabela "lojas" separada de online/assistência | Duplicaria permissões, estoque e relatórios para cada tipo |
| Cliente "pertencente" a uma loja | O mesmo cliente compra em várias lojas e na loja online; isolaria o histórico |
| Papéis livres criados pela tela | Risco de alguém criar um papel com poder demais; papéis mudam por migration revisada |
| Nomes de tabelas em inglês | Padrão comum, mas o proprietário acompanha o banco; português reduz erros de entendimento. Código TypeScript segue o mesmo vocabulário |

## 4. Consequências

- A primeira migration terá **10 tabelas**, nenhuma de venda ou estoque ainda.
- Novos papéis, regiões e empresas entram depois **sem reescrever** o que existe.
- Toda tela nova precisa declarar qual permissão usa; o teste T1–T12 roda a cada mudança no CI.

## 5. Perguntas para aprovação

1. **Administrador sem aprovar desconto e nota:** você, como administrador do sistema, fica **sem** poder vender e aprovar desconto ou nota (só os donos e um futuro gerente aprovam). Concorda?
2. **Ranking:** os vendedores podem ver o ranking **com o nome dos colegas** (motivação) ou só a **própria posição**?
3. **Clientes:** confirma que qualquer vendedor, em qualquer loja, pode **encontrar** um cliente pela busca exata de CPF ou telefone?
4. **Técnico:** ele vai usar o sistema com login próprio (perfil `tecnico`) ou só receber mensagens?
5. **Nomes em português** nas tabelas do banco: de acordo?

## 6. Complemento de implementação (08/11/2026, ORA-006 e pedido do proprietário)

Migration `20261108202654_acesso_sessao_e_equipe.sql` (aplicada no `ora5g-dev`). Não muda as decisões acima; registra como elas foram cumpridas:

- **Sessão por turno (§2.6), no banco:** toda permissão passa por `privado.vinculos_vigentes()`, que agora exige a sessão viva em `auth.sessions` (a do token), começada há menos de 12 horas e no mesmo dia em São Paulo (`privado.turno_valido`). Sair ou revogar a sessão no Auth corta o acesso na hora, mesmo com o token ainda válido. O aplicativo lê `public.situacao_da_sessao()` e manda a pessoa entrar de novo.
- **Bloqueio imediato (§2.6):** `public.alterar_situacao_pessoa` bloqueia em todas as lojas na hora (camada 2) e o worker reflete no login do Auth (`ban_duration`).
- **Gestão da equipe (§2.2):** só quem tem `usuarios.gerir` na organização (dono e administrador). Dono e administrador só o dono concede, retira ou bloqueia; ninguém mexe no próprio acesso; a organização nunca fica sem dono. Pessoa nova entra por **convite** (`public.convidar_pessoa`), com motivo na auditoria.
- **Chave secreta (§2.5):** continua só no worker (`apps/worker`), fora das requisições; o `publicar.sh` entrega ao aplicativo web o arquivo de ambiente **sem** `SUPABASE_SECRET_KEY` e `DATABASE_URL`. As funções do worker (`identidade_*`) só executam com `service_role`.
- **Pendente:** "confirmação de senha recente" para as ações da equipe (§2.6) entra numa migration seguinte; MFA para dono e administrador segue em ORA-ORG-007 (P1).
