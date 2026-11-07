// Perfis da DEMONSTRAÇÃO, seguindo o ADR-002 (§2.3 papéis e §2.4 matriz). Esconder um menu é só
// experiência de uso: no sistema real quem decide é o servidor e o banco (RLS). Aqui não há dados reais.

export const PERFIS = {
  vendedor: {
    nome: "Vendedor",
    pessoaId: "ana",
    pessoa: "Ana Souza (fictícia)",
    descricao: "Vende pelo celular, escolhe em qual loja está trabalhando e vê só os próprios números.",
  },
  gerente: {
    nome: "Gerente",
    pessoaId: "marcos",
    pessoa: "Marcos Lima (fictício)",
    descricao: "Cuida da loja: equipe inteira, metas, caixa e aprovações de desconto e nota.",
  },
  dono: {
    nome: "Dono / diretoria",
    pessoaId: "ricardo",
    pessoa: "Ricardo Andrade (fictício)",
    descricao: "Vê a rede inteira ou uma loja, todos os vendedores, relatórios, preços e aprovações.",
  },
  administrador: {
    nome: "Administrador",
    pessoaId: "admin",
    pessoa: "Admin do sistema (fictício)",
    descricao: "Configura usuários, lojas, importação e integrações. Não vende nem aprova.",
  },
  tecnico: {
    nome: "Técnico",
    pessoaId: "teo",
    pessoa: "Téo Martins (fictício)",
    descricao: "Recebe as ordens de serviço, faz o orçamento e conclui o conserto. Login próprio do técnico ainda depende da decisão P5.",
  },
} as const;

export type Perfil = keyof typeof PERFIS;
export const PERFIL_PADRAO: Perfil = "dono";
export const COOKIE_PERFIL = "ora_demo_perfil";
export const COOKIE_LOJA = "ora_demo_loja";
/** Código especial: o dono e o administrador podem olhar a rede inteira. */
export const REDE = "rede";

// Object.hasOwn e não "in": "constructor", "__proto__" e "toString" não são perfis (REV-010).
export const ehPerfil = (valor: unknown): valor is Perfil => typeof valor === "string" && Object.hasOwn(PERFIS, valor);

export type Pagina =
  | "inicio" | "vender" | "vendas" | "estoque" | "connect" | "assistencia"
  | "aprovacoes" | "metas" | "financeiro" | "relatorios"
  | "clientes" | "produtos" | "canais"
  | "lojas" | "importacao" | "auditoria";

export type Grupo = "Operação" | "Gestão" | "Clientes e catálogo" | "Administração";

export const PAGINAS: Record<Pagina, { titulo: string; curto: string; caminho: string; icone: string; grupo: Grupo }> = {
  inicio: { titulo: "Início", curto: "Início", caminho: "/demo", icone: "inicio", grupo: "Operação" },
  vender: { titulo: "Nova venda", curto: "Vender", caminho: "/demo/vender", icone: "vender", grupo: "Operação" },
  vendas: { titulo: "Vendas", curto: "Vendas", caminho: "/demo/vendas", icone: "vendas", grupo: "Operação" },
  estoque: { titulo: "Estoque e IMEI", curto: "Estoque", caminho: "/demo/estoque", icone: "estoque", grupo: "Operação" },
  connect: { titulo: "Ora Connect", curto: "Connect", caminho: "/demo/connect", icone: "connect", grupo: "Operação" },
  assistencia: { titulo: "Assistência (OS)", curto: "OS", caminho: "/demo/assistencia", icone: "assistencia", grupo: "Operação" },
  aprovacoes: { titulo: "Aprovações", curto: "Aprovações", caminho: "/demo/aprovacoes", icone: "aprovacoes", grupo: "Gestão" },
  metas: { titulo: "Metas e desempenho", curto: "Metas", caminho: "/demo/metas", icone: "metas", grupo: "Gestão" },
  financeiro: { titulo: "Caixa e financeiro", curto: "Caixa", caminho: "/demo/financeiro", icone: "financeiro", grupo: "Gestão" },
  relatorios: { titulo: "Relatórios", curto: "Relatórios", caminho: "/demo/relatorios", icone: "relatorios", grupo: "Gestão" },
  clientes: { titulo: "Clientes e WhatsApp", curto: "Clientes", caminho: "/demo/clientes", icone: "clientes", grupo: "Clientes e catálogo" },
  produtos: { titulo: "Produtos e preços", curto: "Produtos", caminho: "/demo/produtos", icone: "produtos", grupo: "Clientes e catálogo" },
  canais: { titulo: "Canais online", curto: "Canais", caminho: "/demo/canais", icone: "canais", grupo: "Clientes e catálogo" },
  lojas: { titulo: "Lojas e usuários", curto: "Lojas", caminho: "/demo/lojas", icone: "lojas", grupo: "Administração" },
  importacao: { titulo: "Importar CSV da Rein", curto: "Importar", caminho: "/demo/importacao", icone: "importacao", grupo: "Administração" },
  auditoria: { titulo: "Auditoria", curto: "Auditoria", caminho: "/demo/auditoria", icone: "auditoria", grupo: "Administração" },
};

export const GRUPOS: readonly Grupo[] = ["Operação", "Gestão", "Clientes e catálogo", "Administração"];

// Matriz do ADR-002 §2.4 aplicada às telas da demonstração.
export const ACESSO: Record<Perfil, readonly Pagina[]> = {
  vendedor: ["inicio", "vender", "vendas", "estoque", "connect", "assistencia", "metas", "clientes", "produtos"],
  gerente: ["inicio", "vender", "vendas", "estoque", "connect", "assistencia", "aprovacoes", "metas", "financeiro", "relatorios", "clientes", "produtos", "auditoria"],
  dono: ["inicio", "vender", "vendas", "estoque", "connect", "assistencia", "aprovacoes", "metas", "financeiro", "relatorios", "clientes", "produtos", "canais", "lojas", "importacao", "auditoria"],
  administrador: ["inicio", "vendas", "estoque", "relatorios", "produtos", "canais", "lojas", "importacao", "auditoria"],
  tecnico: ["inicio", "assistencia"],
};

// Barra inferior do celular: no máximo 4 atalhos + "Mais".
export const ATALHOS_CELULAR: Record<Perfil, readonly Pagina[]> = {
  vendedor: ["inicio", "vender", "estoque", "connect"],
  gerente: ["inicio", "aprovacoes", "vendas", "metas"],
  dono: ["inicio", "aprovacoes", "relatorios", "financeiro"],
  administrador: ["inicio", "lojas", "importacao", "auditoria"],
  tecnico: ["inicio", "assistencia"],
};

/** Lojas em que o perfil pode entrar (vínculos). REDE = pode olhar a rede inteira. */
export const LOJAS_DO_PERFIL: Record<Perfil, readonly string[]> = {
  vendedor: ["santa-candida", "loja-03"],
  gerente: ["santa-candida"],
  dono: [REDE],
  administrador: [REDE],
  tecnico: ["assistencia"],
};

export const podeAcessar = (perfil: Perfil, pagina: Pagina) => ACESSO[perfil].includes(pagina);

/** Quem vê custo e margem (ADR-002: vendedor vê só "dentro do limite" ou "precisa aprovação"). */
export const podeVerCusto = (perfil: Perfil) => perfil === "dono" || perfil === "gerente" || perfil === "administrador";

/** Quem vê os números de TODOS os vendedores (o vendedor vê só os dele; ranking aguarda decisão P3). */
export const vePorVendedor = (perfil: Perfil) => perfil === "dono" || perfil === "gerente" || perfil === "administrador";
