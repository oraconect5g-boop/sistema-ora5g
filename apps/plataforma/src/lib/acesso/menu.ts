// Menu único das telas reais (revisão de 10/11/2026): antes cada tela tinha o seu próprio cabeçalho,
// com links diferentes, e o início não levava às aprovações. Agora todas usam o mesmo menu, montado
// pela permissão real na loja do turno. Esconder um item é só experiência de uso: o banco confere a
// permissão de novo em cada consulta e em cada ação (RLS e funções).

/** Permissões que decidem o menu. As da rede (equipe e lojas) valem sem loja; as demais, na loja do turno. */
export const PERMISSOES_DO_MENU = [
  "venda.registrar", "venda.ver_unidade", "venda.ver_todas", "caixa.abrir", "caixa.conferir", "estoque.consultar",
  "connect.operar", "connect.gerir", "desconto.aprovar", "nota.aprovar", "auditoria.ver", "usuarios.gerir", "unidades.gerir",
  "catalogo.gerir",
] as const;
export type PermissaoDoMenu = (typeof PERMISSOES_DO_MENU)[number];
/** Conferidas para a rede inteira (sem loja): só papéis de organização as têm (dono e administrador). */
export const PERMISSOES_DA_REDE: ReadonlySet<PermissaoDoMenu> = new Set(["usuarios.gerir", "unidades.gerir", "catalogo.gerir"]);

export type PaginaReal =
  | "inicio" | "vender" | "vendas" | "caixa" | "connect"
  | "estoque" | "transferencias" | "catalogo" | "produtos"
  | "financeiro" | "aprovacoes" | "notas" | "auditoria"
  | "equipe" | "lojas";
export type GrupoReal = "Operação" | "Estoque e catálogo" | "Gestão" | "Administração";
export const GRUPOS_REAIS: readonly GrupoReal[] = ["Operação", "Estoque e catálogo", "Gestão", "Administração"];

type Permissoes = ReadonlySet<string>;
export const podeVerFinanceiro = (p: Permissoes) => p.has("venda.ver_unidade") || p.has("venda.ver_todas");
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
  // Cadastro do catálogo (L3a): categorias, marcas, produtos e variações; dono e administrador.
  produtos: { titulo: "Cadastro de produtos", curto: "Cadastro", caminho: "/produtos", icone: "cadastro", grupo: "Estoque e catálogo", liberada: (p) => p.has("catalogo.gerir") },
  // Financeiro real (#65): de quem vê as vendas da loja (gerente) ou da rede (dono, administrador).
  // Abrir caixa não libera o financeiro. O banco confere de novo cada número (RLS na leitura agregada).
  financeiro: { titulo: "Financeiro", curto: "Financeiro", caminho: "/financeiro", icone: "relatorios", grupo: "Gestão", liberada: (p) => podeVerFinanceiro(p) },
  aprovacoes: { titulo: "Aprovações de desconto", curto: "Aprovações", caminho: "/aprovacoes", icone: "aprovacoes", grupo: "Gestão", liberada: (p) => p.has("desconto.aprovar") },
  notas: { titulo: "Notas fiscais", curto: "Notas", caminho: "/notas", icone: "notas", grupo: "Gestão", liberada: (p) => p.has("nota.aprovar") },
  auditoria: { titulo: "Auditoria", curto: "Auditoria", caminho: "/auditoria", icone: "auditoria", grupo: "Gestão", liberada: (p) => p.has("auditoria.ver") },
  equipe: { titulo: "Equipe e acessos", curto: "Equipe", caminho: "/equipe", icone: "equipe", grupo: "Administração", liberada: (p) => p.has("usuarios.gerir") },
  // Lojas da rede (L2): cadastro, situação e configuração com vigência; dono e administrador.
  lojas: { titulo: "Lojas da rede", curto: "Lojas", caminho: "/lojas", icone: "lojas", grupo: "Administração", liberada: (p) => p.has("unidades.gerir") },
};

// Barra inferior do celular: até 4 atalhos, na ordem de uso no balcão; o resto fica em "Mais".
const PRIORIDADE_NO_CELULAR: readonly PaginaReal[] = [
  "inicio", "vender", "aprovacoes", "vendas", "financeiro", "estoque", "caixa", "connect", "catalogo", "produtos", "notas", "equipe", "lojas", "auditoria", "transferencias",
];

export function montarMenu(permissoes: Permissoes) {
  const visiveis = (Object.keys(PAGINAS_REAIS) as PaginaReal[]).filter((p) => PAGINAS_REAIS[p].liberada(permissoes));
  const atalhos = PRIORIDADE_NO_CELULAR.filter((p) => visiveis.includes(p)).slice(0, 4);
  const grupos = GRUPOS_REAIS
    .map((grupo) => ({ grupo, paginas: visiveis.filter((p) => PAGINAS_REAIS[p].grupo === grupo) }))
    .filter((g) => g.paginas.length > 0);
  return { visiveis, atalhos, grupos };
}
