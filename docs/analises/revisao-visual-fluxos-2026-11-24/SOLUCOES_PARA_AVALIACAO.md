# Soluções viáveis para avaliação — não aplicadas

Estas ideias reutilizam TypeScript/Next/Supabase. Não são patches prontos para aplicar cegamente nem autorização para mudar regras financeiras. Cada uma precisa de adaptação aos contratos existentes, teste e revisão do lote.

## 1. Preservar contexto ao abrir o estoque de um produto

Em `estoque/page.tsx:381`, a URL atual perde os filtros. Um helper puro pode preservar apenas parâmetros admitidos pela tela:

```ts
type ContextoDeBusca = {
  q?: string;
  pagina?: number;
};

export function enderecoDoProdutoNoEstoque(
  variante: string,
  contexto: ContextoDeBusca,
): string {
  const parametros = new URLSearchParams();
  if (contexto.q) parametros.set("q", contexto.q);
  if (typeof contexto.pagina === "number" && Number.isSafeInteger(contexto.pagina) && contexto.pagina > 1) {
    parametros.set("pagina", String(contexto.pagina));
  }
  parametros.set("variante", variante);
  return `/estoque?${parametros.toString()}`;
}
```

Os valores continuam validados no servidor; expandir o tipo se a tela admitir mais filtros. Não copiar parâmetros arbitrários nem usar isso como autorização. Verificar os nomes reais dos parâmetros antes de integrar. Teste significativo: pesquisa paginada → detalhe → volta mantém a busca.

## 2. Agrupar navegação com as mesmas permissões

Criar uma camada de agrupamento sobre o catálogo de menus existente, mantendo os IDs atuais e a avaliação `permite`. Agrupar só os itens já autorizados; esconder grupo vazio. Não duplicar a matriz de permissão num segundo objeto e não proteger a rota apenas pelo menu.

```ts
type ItemVisivel = { id: string; href: string; rotulo: string };
type Grupo = { titulo: string; ids: readonly string[] };

export function agruparMenu(
  permitidos: readonly ItemVisivel[],
  grupos: readonly Grupo[],
) {
  const porId = new Map(permitidos.map((item) => [item.id, item]));
  return grupos.map((grupo) => ({
    titulo: grupo.titulo,
    itens: grupo.ids.flatMap((id) => {
      const item = porId.get(id);
      return item ? [item] : [];
    }),
  })).filter((grupo) => grupo.itens.length > 0);
}
```

Antes de adotar, verificar itens omitidos/duplicados e cobertura de todos os itens permitidos. Os três perfis precisam de testes de navegação; usuários não ganham acesso por mudança de grupo.

## 3. Transferências com fila e histórico

Proposta de contrato, não implementação SQL executável:

```ts
type ConsultaDeTransferencias = {
  fila: "pendentes" | "historico";
  cursor?: string;
  numero?: number;
  limite: number;
};
type PaginaDeTransferencias<T> = {
  itens: T[];
  proximoCursor: string | null;
  totalPendentes: number;
};
```

No banco: autorização pela sessão/lojas, lista de estados operacionalmente resolvíveis incluindo divergências, ordenação estável com desempate, limite limitado pelo servidor e cursor validado. Contador e resultados com critérios coerentes. Criar migration nova; manter assinatura anterior durante deploy gradual se houver versões coexistentes. Testar >50 canceladas, >50 abertas, concorrência e acesso cruzado. O teste anexado é a prova inicial; não basta aumentar o limite.

## 4. Um resumo de release gerado por dados existentes

Usar `status-requisitos.json`, checkpoint de lotes e SHA publicado para gerar o placar de todos os documentos. Validar coerência entre `estado`, `homologado`, parecer, aceite e pendência. Não preencher aceite automaticamente. A solução reduz F24-05 e evita que Claude continue uma fila desatualizada.

## 5. Reutilização com maior retorno

- Componentes de gráfico, dinheiro, foto, seletor de loja/período e estados de tela já existentes.
- O mesmo parser de entrada/erro para o mesmo contrato, mantendo regras sensíveis no banco.
- Adaptadores externos apenas no worker existente; chaves privadas fora do Next público.
- Publicação e verificação de SHA já existentes, ampliadas com evidência por jornada.

Não há indicação de ganho com nova linguagem, microserviço adicional ou nova biblioteca de gráficos durante os cinco dias. Otimizar depois de medir; não desabilitar isolamento de testes apenas porque o runner sugere velocidade.
