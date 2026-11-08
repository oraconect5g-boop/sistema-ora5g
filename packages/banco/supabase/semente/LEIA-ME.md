# Semente do banco de desenvolvimento

Só para o projeto **`ora5g-dev`**. Dados fictícios; nunca rodar em homologação com dados reais nem em produção.

| Arquivo | O que faz | Quando |
|---|---|---|
| `desenvolvimento.sql` | Organização "Ora 5G (desenvolvimento)", empresa com o CNPJ de exemplo 11.222.333, unidades Santa Cândida (teste), Loja de teste 2 e Assistência (teste), catálogo com 6 variações, preços, custos e estoque (9 aparelhos, 8 chips, capas e cabos; o cabo tem 3 unidades na Santa Cândida, como na demonstração) | Uma vez; pode rodar de novo sem duplicar |
| `vincular-usuarios-de-teste.sql` | Dá perfil e vínculo aos usuários que o proprietário criou no painel com `+vendedor` (vendedor nas duas lojas) e `+dono` (dono da organização) no e-mail. Não contém e-mail nem senha | Depois que os usuários existirem (pendência 1.1) |

Os dois arquivos são testados do zero no PGlite (`src/semente.test.ts`): rodam duas vezes sem duplicar, o saldo bate com o livro e tudo fica na auditoria com o motivo.
