// Menu único das telas reais (revisão de 10/11/2026): antes cada tela tinha o seu próprio cabeçalho,
// com links diferentes, e o início não levava às aprovações. Agora todas usam o mesmo menu, montado
// pela permissão real na loja do turno. Esconder um item é só experiência de uso: o banco confere a
// permissão de novo em cada consulta e em cada ação (RLS e funções).

/** Permissões que decidem o menu. usuarios.gerir vale para a rede (sem loja); as demais, na loja do turno. */
export const PERMISSOES_DO_MENU = [
  "venda.registrar", "venda.ver_unidade", "venda.ver_todas", "caixa.abrir", "caixa.conferir", "estoque.consultar",
  "connect.operar", "connect.gerir", "desconto.aprovar", "nota.aprovar", "auditoria.ver", "usuarios.gerir",
] as const;
export type PermissaoDoMenu = (typeof PERMISSOES_DO_MENU)[number];

export type PaginaReal =
  | "inicio" | "vender" | "vendas" | "caixa" | "connect"
  | "estoque" | "transferencias" | "catalogo"
  | "aprovacoes" | "notas" | "auditoria"
  | "equipe";
export type GrupoReal = "Operação" | "Estoque e catálogo" | "Gestão" | "Administração";
export const GRUPOS_REAIS: readonly GrupoReal[] = ["Operação", "Estoque e catálogo", "Gestão", "Administração"];

type Permissoes = ReadonlySet<string>;
export const PAGINAS_REAIS: Record<PaginaReal, { titulo: string; curto: string; caminho: string; icone: string; grupo: GrupoReal; liberada: (p: Permissoes) => boolean }> = {
  inicio: { titulo: "Início", curto: "Início", caminho: "/inicio", icone: "inicio", grupo: "Operação", liberada: () => true },
  vender: { titulo: "Vender", curto: "Vender", caminho: "/vender", icone: "vender", grupo: "Operação", liberada: (p) => p.has("venda.registrar") },
  vendas: {
    titulo: "Vendas", curto: "Vendas", caminho: "/vendas", icone: "vendas", grupo: "Operação",
    liberada: (p) => p.has("venda.registrar") || p.has("venda.ver_unidade") || p.has("venda.ver_todas"),
  },
  caixa: { titulo: "Caixa", curto: "Caixa", caminho: "/caixa", icone: "financeiro", grupo: "Operação", liberada: (p) => p.has("caixa.abrir") || p.has("caixa.conferir") },
  connect: { titulo: "Ora Connect", curto: "Connect", caminho: "/connect", icone: "connect", grupo: "Operação", liberada: (p) => p.has("connect.operar") || p.has("connect.gerir") },
  estoque: { titulo: "Estoque e conferência", curto: "Estoque", caminho: "/estoque", icone: "estoque", grupo: "Estoque e catálogo", liberada: (p) => p.has("estoque.consultar") },
  transferencias: { titulo: "Transferências entre lojas", curto: "Transferir", caminho: "/transferencias", icone: "transferencias", grupo: "Estoque e catálogo", liberada: (p) => p.has("estoque.consultar") },
  // O catálogo (fotos, nomes e SKUs, sem custo) é visível a quem é da rede, como as políticas do banco.
  catalogo: { titulo: "Catálogo e fotos", curto: "Catálogo", caminho: "/catalogo", icone: "produtos", grupo: "Estoque e catálogo", liberada: () => true },
  aprovacoes: { titulo: "Aprovações de desconto", curto: "Aprovações", caminho: "/aprovacoes", icone: "aprovacoes", grupo: "Gestão", liberada: (p) => p.has("desconto.aprovar") },
  notas: { titulo: "Notas fiscais", curto: "Notas", caminho: "/notas", icone: "notas", grupo: "Gestão", liberada: (p) => p.has("nota.aprovar") },
  auditoria: { titulo: "Auditoria", curto: "Auditoria", caminho: "/auditoria", icone: "auditoria", grupo: "Gestão", liberada: (p) => p.has("auditoria.ver") },
  equipe: { titulo: "Equipe e acessos", curto: "Equipe", caminho: "/equipe", icone: "lojas", grupo: "Administração", liberada: (p) => p.has("usuarios.gerir") },
};

// Barra inferior do celular: até 4 atalhos, na ordem de uso no balcão; o resto fica em "Mais".
const PRIORIDADE_NO_CELULAR: readonly PaginaReal[] = [
  "inicio", "vender", "aprovacoes", "vendas", "estoque", "caixa", "connect", "catalogo", "notas", "equipe", "auditoria", "transferencias",
];

export function montarMenu(permissoes: Permissoes) {
  const visiveis = (Object.keys(PAGINAS_REAIS) as PaginaReal[]).filter((p) => PAGINAS_REAIS[p].liberada(permissoes));
  const atalhos = PRIORIDADE_NO_CELULAR.filter((p) => visiveis.includes(p)).slice(0, 4);
  const grupos = GRUPOS_REAIS
    .map((grupo) => ({ grupo, paginas: visiveis.filter((p) => PAGINAS_REAIS[p].grupo === grupo) }))
    .filter((g) => g.paginas.length > 0);
  return { visiveis, atalhos, grupos };
}
