# Semente do banco de desenvolvimento

Só para o projeto **`ora5g-dev`**. Dados fictícios; nunca rodar em homologação com dados reais nem em produção.

| Arquivo | O que faz | Quando |
|---|---|---|
| `desenvolvimento.sql` | Organização "Ora 5G (desenvolvimento)", empresa com o CNPJ de exemplo 11.222.333, unidades Santa Cândida (teste), Loja de teste 2 e Assistência (teste), catálogo com 6 variações, preços, custos e estoque (9 aparelhos, 8 chips, capas e cabos; o cabo tem 3 unidades na Santa Cândida, como na demonstração) | Uma vez; pode rodar de novo sem duplicar |
| `vincular-usuarios-de-teste.sql` | Dá perfil e vínculo aos usuários que o proprietário criou no painel com `+vendedor` (vendedor nas duas lojas), `+gerente` (gerente só na Santa Cândida) e `+dono` (dono da organização) no e-mail. Não contém senha | Depois que os usuários existirem no Auth |

Os dois arquivos são testados do zero no PGlite (`src/semente.test.ts`): rodam duas vezes sem duplicar, o saldo bate com o livro e tudo fica na auditoria com o motivo.

## Três contas para testar a aplicação real (pedido de 10/11/2026, issue #63)

No projeto **ora5g-dev**, abra **Authentication → Users → Add user → Create new user**. Crie as contas abaixo com senhas distintas guardadas no seu gerenciador de senhas e confirmação automática do e-mail. Use criação direta, sem enviar convite: os endereços são fictícios e não recebem e-mail.

| E-mail fictício | Papel | Escopo |
|---|---|---|
| `teste+vendedor@example.com` | Vendedor | Santa Cândida (teste) e Loja de teste 2 |
| `teste+gerente@example.com` | Gerente | Somente Santa Cândida (teste) |
| `teste+dono@example.com` | Dono | Organização de desenvolvimento |

As contas do **Auth** precisam existir primeiro; este SQL não cria senhas nem usuários de login. Depois, no mesmo projeto, execute `vincular-usuarios-de-teste.sql` para criar os perfis e os vínculos. Não é preciso reaplicar a semente do catálogo se ela já está instalada.

Entre em `https://ora5g.com.br/entrar`, escolha a loja e teste as rotas reais. O gerente pode aprovar desconto só na sua loja e não gere os usuários da rede; o vendedor não ganha aprovação. O dono é apenas o **dono de teste da organização fictícia**. Nenhuma dessas contas é o cadastro oficial do proprietário, e a existência delas não comprova homologação comercial ou integração Nogle.

Criação pelo Claude Code: usar a API administrativa oficial do Supabase no servidor autorizado, com `SUPABASE_SECRET_KEY` só no worker, confirmação do e-mail e senhas geradas/entregues pelo canal privado definido pelo proprietário. Não enviar senhas ou links de acesso por GitHub/chat nem inserir diretamente em `auth.users`. Reutilizar conta já criada sem redefinir sua senha silenciosamente. Em seguida, executar a mesma vinculação e conferir os escopos.
