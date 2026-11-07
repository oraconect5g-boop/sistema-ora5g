// Perfis da DEMONSTRAÇÃO, seguindo o ADR-002. Esconder um menu é só experiência de uso:
// no sistema real quem decide é o servidor e o banco (RLS). Aqui não há dados reais.

export const PERFIS = {
  vendedor: { nome: "Vendedor", pessoa: "Ana (fictícia)", escopo: "Santa Cândida (piloto)" },
  gerente: { nome: "Gerente", pessoa: "Gerente da loja (fictício)", escopo: "Santa Cândida (piloto)" },
  dono: { nome: "Dono", pessoa: "Dono (fictício)", escopo: "Rede inteira" },
  administrador: { nome: "Administrador", pessoa: "Administrador do sistema", escopo: "Rede inteira (sem vender nem aprovar)" },
} as const;

export type Perfil = keyof typeof PERFIS;
export const PERFIL_PADRAO: Perfil = "dono";
export const COOKIE_PERFIL = "ora_demo_perfil";

export const ehPerfil = (valor: unknown): valor is Perfil => typeof valor === "string" && valor in PERFIS;

export type Pagina =
  | "inicio" | "vender" | "estoque" | "aprovacoes" | "connect" | "assistencia" | "metas"
  | "financeiro" | "clientes" | "canais" | "lojas" | "importacao";

export const PAGINAS: Record<Pagina, { titulo: string; caminho: string; icone: string }> = {
  inicio: { titulo: "Início", caminho: "/demo", icone: "inicio" },
  vender: { titulo: "Vender", caminho: "/demo/vender", icone: "vender" },
  estoque: { titulo: "Estoque e IMEI", caminho: "/demo/estoque", icone: "estoque" },
  aprovacoes: { titulo: "Aprovações", caminho: "/demo/aprovacoes", icone: "aprovacoes" },
  connect: { titulo: "Ora Connect", caminho: "/demo/connect", icone: "connect" },
  assistencia: { titulo: "Assistência (OS)", caminho: "/demo/assistencia", icone: "assistencia" },
  metas: { titulo: "Metas e desempenho", caminho: "/demo/metas", icone: "metas" },
  financeiro: { titulo: "Caixa, financeiro e notas", caminho: "/demo/financeiro", icone: "financeiro" },
  clientes: { titulo: "Clientes e WhatsApp", caminho: "/demo/clientes", icone: "clientes" },
  canais: { titulo: "Canais online", caminho: "/demo/canais", icone: "canais" },
  lojas: { titulo: "Lojas e usuários", caminho: "/demo/lojas", icone: "lojas" },
  importacao: { titulo: "Importar CSV da Rein", caminho: "/demo/importacao", icone: "importacao" },
};

// Matriz do ADR-002 §2.4 aplicada às telas da demonstração.
export const ACESSO: Record<Perfil, Pagina[]> = {
  vendedor: ["inicio", "vender", "estoque", "connect", "assistencia", "metas", "clientes"],
  gerente: ["inicio", "aprovacoes", "vender", "estoque", "connect", "assistencia", "metas", "financeiro", "clientes"],
  dono: ["inicio", "aprovacoes", "lojas", "metas", "financeiro", "estoque", "connect", "assistencia", "clientes", "canais", "vender"],
  administrador: ["inicio", "lojas", "importacao", "canais", "estoque"],
};

// Barra inferior do celular: no máximo 4 atalhos + "Mais".
export const ATALHOS_CELULAR: Record<Perfil, Pagina[]> = {
  vendedor: ["inicio", "vender", "estoque", "connect"],
  gerente: ["inicio", "aprovacoes", "vender", "estoque"],
  dono: ["inicio", "aprovacoes", "metas", "financeiro"],
  administrador: ["inicio", "lojas", "importacao", "canais"],
};

export const podeAcessar = (perfil: Perfil, pagina: Pagina) => ACESSO[perfil].includes(pagina);
