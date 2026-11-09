# Proposta visual — produto, lojas e transferência

Protótipo React/TypeScript/CSS independente, fora das rotas operacionais. Usa somente os valores da imagem e o cadastro confirmado de 11 lojas + DEFEITOS; não chama API, cria pedido real ou altera saldo. A foto pendente é identificada, sem imagem inventada do produto.

Na raiz, com as dependências do lockfile e Node 22.23.4:

```bash
npx vite docs/prototipos/estoque-por-loja-2026-11-09 --host 127.0.0.1 --port 3197
```

Abrir `http://127.0.0.1:3197`. Buscar → tocar produto → consultar lojas/pendências → pedir transferência → escolher quantidade/destino → criar pedido simulado. A diferença dos totais da origem é apresentada sem ajuste arbitrário. O recebimento e o livro real pertencem à implementação #60, não a este protótipo.

Preservar a stack atual ao levar os componentes ao produto, usando os componentes/Tailwind e as Server Actions do projeto; trocar o estado de apresentação pelo contrato persistente testado. Não importar os dados desta imagem para o banco real sem conciliação.
