# Fotos obrigatórias dos produtos — ORA-CAT-011

**Decisão do proprietário:** 08/11/2026. **Prioridade:** P0, catálogo e piloto. **Estado:** não iniciado. **Issue:** [#26](https://github.com/oraconect5g-boop/sistema-ora5g/issues/26).

## Necessidade confirmada

Todos os produtos precisam de foto para que o vendedor identifique corretamente itens com nomes parecidos. A foto deve fazer parte do uso diário do catálogo e do PDV no celular.

O requisito ORA-CAT-010 já previa importação assistida de fotos e atributos em lote, como expansão P2. Isso não exigia imagem em cada produto. ORA-CAT-011 acrescenta essa obrigatoriedade e sua exibição operacional; a importação em lote continua separada.

O inventário atual passa de **172 para 173 requisitos**, com **71 no recorte do piloto**. Relatórios e matrizes anteriores com 172 são fotografias da base anterior a esta decisão. Esta inclusão não representa funcionalidade implementada.

## Regras e critérios de aceite

1. Todo produto deve ter foto principal correspondente ao item. A foto acompanha nome, SKU e atributos; não substitui esses identificadores.
2. Uma variante com diferença visual, como cor ou acabamento, precisa de imagem própria. Variantes visualmente iguais podem compartilhar a imagem do produto. Não exigir uma foto de cada unidade/IMEI apenas por ser uma unidade de estoque.
3. Exibir miniatura no catálogo, resultados da busca, consulta de estoque e PDV. Ao tocar, ampliar a imagem no celular sem perder a seleção ou o carrinho.
4. Permitir cadastrar/substituir a foto pelo celular, usando câmera ou galeria, com prévia antes da confirmação. A autorização precisa ser conferida no servidor e no Storage.
5. Ausência de foto ou falha no carregamento deve mostrar estado claro, mantendo nome/SKU legíveis. Placeholder ou ícone genérico não atende ao requisito de foto correspondente.
6. Importação CSV pode trazer produtos com pendência de imagem, preservando SKU e reconciliação. Listar os produtos sem foto para completar o cadastro. Homologação do catálogo piloto exige completar as fotos de todos os produtos.
7. Validar o arquivo, seu tipo real, tamanho e dimensões; gerar miniatura adequada ao celular, com proporção que não corte partes necessárias à identificação.
8. Substituição não pode deixar foto de outro produto/variante nem perder a imagem anterior se o novo envio falhar. Registrar autor, data e alteração na auditoria.
9. Restringir leitura e alteração pela organização e pelas permissões do catálogo. Vendedor consulta a imagem; alteração exige permissão de gestão apropriada, definida com a matriz existente.
10. A obrigação vale para todos os itens cadastrados como produtos. Para tipos não físicos, como serviço/recarga, a forma de representação visual deve ser especificada na implementação e identificada como ilustração quando couber; não usar foto de um aparelho como identificação desses itens.

Não foi decidido bloquear uma venda em andamento por ausência temporária de imagem. Essa regra não deve ser introduzida implicitamente. A exigência de completude do catálogo e sua pendência permanecem explícitas.

## Contrato técnico proposto para o Claude

Manter **TypeScript, React/Next.js, Tailwind, Node.js e PostgreSQL/Supabase**.

- Guardar arquivos no Supabase Storage e metadados relacionais no banco, vinculados à organização, produto e variante quando aplicável.
- Preparar foto principal e estrutura para imagens adicionais/ordenação. Galeria completa não é condição para a primeira entrega da foto principal.
- Guardar identidade estável do objeto (bucket/caminho), não URL assinada com expiração. Criar a URL de leitura conforme autorização e validade.
- Começar com acesso interno autorizado. Publicação em loja online/marketplace segue a política do respectivo canal; não tornar o acervo interno inteiro público por conveniência.
- Aplicar RLS tanto aos metadados quanto aos objetos, considerando vínculo e organização. O papel authenticated sozinho não define autorização; não usar apenas o autor do upload como dono de fotos compartilhadas pela empresa.
- Definir limites de arquivo e formatos aceitos no contrato da implementação. Proposta inicial: JPEG, PNG e WebP; ajustar os limites à operação mobile.
- Versionar objetos ao substituir e coordenar envio/validação/metadados, com limpeza de temporários e recuperação de falha. Não presumir uma transação única entre arquivo externo e SQL.
- Criar migration nova para metadados, constraints e políticas, sem reescrever as seis já aplicadas. Alterações estruturais complementam o ADR-003.
- Reutilizar a mesma consulta/DTO de mídia no catálogo, busca, estoque e PDV. Não duplicar listas de imagens independentes no front-end.
- Nenhuma credencial privilegiada no navegador; nenhuma API Rein para obter imagens.

Esses pontos são o contrato proposto de implementação, sem criação de tabela, bucket, política ou variável secreta nesta entrega documental.

## Ordem de entrega

1. Na demonstração, apresentar miniatura e ampliação com indicação de dados fictícios, para validar o desenho.
2. Ao integrar o catálogo real e o acesso, implementar metadados, Storage, autorização e envio pelo celular.
3. Integrar imagens à busca, estoque e PDV; listar e completar produtos pendentes de foto vindos do CSV.
4. Homologar com produtos de nomes parecidos e variantes de cores diferentes, antes de aceitar o catálogo/PDV piloto.

A correção dos defeitos P1 de estoque (#19 a #22) continua prioritária. Preparação visual e contrato de fotos podem avançar sem alterar as regras transacionais.

## Verificação necessária

- Dois produtos de nomes muito semelhantes mostram fotos distintas e permitem selecionar o SKU correto.
- Variante de outra cor usa a foto correspondente; uma substituição não altera a foto do SKU vizinho.
- Fluxo no celular: câmera/galeria → prévia → confirmação → foto visível nas quatro áreas.
- Arquivo inválido e falha de rede deixam mensagem útil e preservam a foto anterior.
- Usuário sem permissão e usuário de outra organização não alteram nem leem indevidamente os objetos/metadados.
- Produto sem foto aparece na lista de pendências; nenhum placeholder é contado como requisito atendido.
- Miniatura possui texto alternativo e ampliação acessível; imagem quebrada não derruba a tela.

## Referências

- [Requisitos atuais](../01_REQUISITOS.md) e [backlog](../../backlog.json).
- [Rastreabilidade gerada](RASTREABILIDADE.md).
- [ADR-003](../adr/ADR-003-catalogo-estoque-e-operacao-comercial.md).
- Supabase: [buckets e modelos de acesso](https://supabase.com/docs/guides/storage/buckets/fundamentals) e [controle de acesso](https://supabase.com/docs/guides/storage/security/access-control), consultados em 08/11/2026.
