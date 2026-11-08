# Evidências da revisão de fotos — aebbdcc

Base: `aebbdcc82b3f5de800d41200674fd6910a23c855`. Dados sintéticos e banco descartável. Nenhum upload/chamada Auth/Storage real.

| Prova | Passou | Falhou na base | Resultado |
|---|---:|---:|---|
| busca.repro.ts | 1 | 2 | Produto além do limite 200 não aparece por nome/SKU (#40) |
| banco.repro.ts | 1 | 1 | Índice já cobre a FK; repetir registro confirmado retorna 23505 (#42) |
| fixture/testar.mjs, dois tamanhos | 6 | 6 | URL nova não recupera imagem (#41); descarte retém input (#43); retry repete upload (#42) |
| **Total** | **8** | **9** | **17 casos distintos / quatro causas funcionais** |

Resultados esperados em um código corrigido são verdes. Não copiar provas vermelhas para a suíte de entrega antes de resolver.

## Busca e banco

Copiar temporariamente:

- busca.repro.ts → apps/plataforma/src/app/catalogo/revisao-busca-fotos.test.ts
- banco.repro.ts → packages/banco/src/revisao-fotos-extra.test.ts

~~~bash
npx -w @ora5g/plataforma vitest run src/app/catalogo/revisao-busca-fotos.test.ts
npx -w @ora5g/banco vitest run src/revisao-fotos-extra.test.ts
~~~

Remover as cópias ao terminar. O banco aplica as nove migrations locais, com fixtures, e é descartado. O EXPLAIN com seqscan desabilitado é diagnóstico local de capacidade do índice, não tuning de produção.

## Fixture dos componentes reais

Node 22.23.4, `npm ci` e Chromium do Playwright instalados conforme o README. Não requer outra biblioteca nem modifica a aplicação. O servidor carrega os componentes reais do repositório, usando React e Vite já transitivo do Vitest; apenas os serviços de upload/registro/router são substituídos. Não é homologação da API Supabase nem do fluxo de Auth.

Em um terminal:

~~~bash
node docs/analises/evidencias/2026-11-08-fotos/fixture/servidor.mjs
~~~

Em outro:

~~~bash
node docs/analises/evidencias/2026-11-08-fotos/fixture/testar.mjs
~~~

`ORA_PORTA_FIXTURE` muda a porta (padrão 3195, sempre 127.0.0.1). Usar a mesma nos dois terminais. Se o ambiente usa cache de browsers, manter seu PLAYWRIGHT_BROWSERS_PATH. O teste grava resultados-componentes.json nesta pasta e termina com código 1 pelas seis falhas esperadas na base.

Controles positivos: foto válida abre modal, GIF é recusado e envio válido faz chamada de registro/refresh com dimensões corretas. Casos negativos: trocar URL depois de erro, limpar input ao descartar e repetir apenas o registro depois de upload confirmado.

A fixture portátil foi executada nos dois tamanhos e comparada ao experimento inicial; reexecução não conta como cobertura nova. Ao terminar, parar o servidor local. Não instalar essa fixture como rota do produto.

## Limites

Playwright usa Chromium em 360/1280 px; não substitui homologação da câmera/galeria em celular físico. A prova de descarte mede o valor retido no input, sem afirmar comportamento universal de seleção nativa. Arquivos e metadados são inventados. As nove falhas não foram integradas ao CI normal.

