// As abas da Ora Connect no formato da demonstração (lote CONNECT-m), com a sessão e o Supabase SIMULADOS: nenhuma credencial;
// linhas, nomes e links FICTÍCIOS. O banco (quem registra, quem vê, a produção) tem os testes em packages/banco; aqui, o que
// cada papel vê em cada aba, os filtros da lista e para onde cada formulário volta.
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  vinculos: [] as { papel: string; escopo: string; unidade_id: string | null }[],
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  painel: null as unknown,
  rpc: [] as { nome: string; argumentos: Record<string, unknown> }[],
  erroDaRpc: null as null | { code: string },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  useRouter: () => ({ refresh: () => undefined }),
}));
// Os filtros do PostgREST que as telas usam; campo de tabela ligada ("vendas.situacao") não filtra aqui.
class Consulta {
  linhas: Linha[];
  constructor(linhas: Linha[]) { this.linhas = [...linhas]; }
  private filtrar(campo: string, passa: (v: unknown) => boolean) { this.linhas = this.linhas.filter((l) => !(campo in l) || passa(l[campo])); return this; }
  select() { return this; }
  order() { return this; }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  eq(campo: string, valor: unknown) { return this.filtrar(campo, (v) => v === valor); }
  in(campo: string, valores: unknown[]) { return this.filtrar(campo, (v) => valores.includes(v)); }
  not(campo: string) { return this.filtrar(campo, (v) => v !== null); }
  gte(campo: string, valor: string) { return this.filtrar(campo, (v) => new Date(String(v)) >= new Date(valor)); }
  lte(campo: string, valor: string) { return this.filtrar(campo, (v) => new Date(String(v)) <= new Date(valor)); }
  lt(campo: string, valor: string) { return this.filtrar(campo, (v) => new Date(String(v)) < new Date(valor)); }
  then(resolver: (r: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja", unidade_nome: "Santa Cândida (fictícia)", turno_termina_em: "2026-11-26T03:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Pessoa (fictícia)", vinculos: cenario.vinculos, pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    // O RLS de connect_operacoes: quem não gere a Ora Connect vê só as próprias.
    from: (tabela: string) => new Consulta((cenario.tabelas[tabela] ?? []).filter((l) => tabela !== "connect_operacoes" || cenario.permissoes.has("connect.gerir") || l.vendedor_id === "eu")),
    rpc: async (nome: string, argumentos: Record<string, unknown>) => {
      cenario.rpc.push({ nome, argumentos });
      return nome === "connect_painel" ? { data: cenario.painel, error: null } : { data: null, error: cenario.erroDaRpc };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error { constructor(m: string) { super(`falha: ${m}`); } },
  obterSessao: async () => sessaoFicticia,
}));

import { FUNCOES_NOGLE } from "../../integracoes/nogle/catalogo";
import { habilitarOperacao, registrarOperacao } from "./acoes";
import AtivarChip from "./ativar/page";
import { ABAS_DA_CONNECT, abasVisiveis, CabecalhoConnect } from "./CabecalhoConnect";
import Integracao from "./integracao/page";
import { filtroDaLista, horaOuDia, naLista } from "./lista";
import Connect from "./page";
import Portabilidade from "./portabilidade/page";
import Recarga from "./recarga/page";

// O texto da tela: os componentes são chamados (os com estado ficam pelas propriedades).
function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Linha>(v)) {
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "")) {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
// Os elementos da árvore sem chamar os componentes: as propriedades de cada um, pelo nome.
function elementos(v: unknown, nome: string): Linha[] {
  const achados: Linha[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Linha>(x)) {
      if (typeof x.type === "function" && (x.type as { name?: string }).name === nome) achados.push(x.props);
      Object.values(x.props).forEach(andar);
    } else if (x && typeof x === "object" && !("$$typeof" in x)) Object.values(x).forEach(andar);
  };
  andar(v);
  return achados;
}
const limpo = (t: string) => t.replace(/\s+/g, " ");
/** As contagens do filtro da lista (o último filtro da tela: o primeiro, quando há, é o do período). */
const contagens = (arvore: unknown) => Object.fromEntries(((elementos(arvore, "FiltroSegmentado").at(-1)?.opcoes ?? []) as { rotulo: string; contagem?: number }[]).map((o) => [o.rotulo, o.contagem]));
const emOrdem = (t: string, ...partes: string[]) => expect(t).toMatch(new RegExp(partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*?")));
const pagina = async (tela: (p: never) => Promise<unknown>, busca: Record<string, string> = {}) => limpo(texto(await tela({ searchParams: Promise.resolve(busca) } as never)));

const VENDEDOR = ["connect.operar", "venda.registrar"];
const GERENTE = ["connect.operar", "connect.gerir", "custo.ver", "venda.registrar"];
const AGORA = new Date("2026-11-25T15:00:00Z"); // 12h em Brasília
const OPERACAO = {
  unidade_id: "loja", iccid: null, esim: false, linha_doadora: null, recebido_na_loja_centavos: null, venda_item_id: null, cliente_nome: null,
  documento_mascarado: null, link_pagamento: null, link_esim: null, numero_ativado: null, mensagem_operadora: null, evidencia: null, motivo_resolucao: null,
};
const OPERACOES = [
  { ...OPERACAO, id: "op1", numero: 1, tipo: "recarga", situacao: "confirmada", vendedor_id: "v1", metodo_pagamento: "LINK", linha: "41999998888", plano_nome: "10 GB",
    valor_face_centavos: 2_000, recebido_na_loja_centavos: 2_000, venda_item_id: "vi1", criado_em: "2026-11-25T14:30:00Z" },
  { ...OPERACAO, id: "op2", numero: 2, tipo: "ativacao", situacao: "aguardando_operadora", vendedor_id: "eu", metodo_pagamento: "LINK", linha: null, esim: true,
    plano_nome: "10 GB", valor_face_centavos: 2_000, link_pagamento: "https://pagamento.exemplo/cliente", criado_em: "2026-11-25T13:00:00Z" },
  { ...OPERACAO, id: "op3", numero: 3, tipo: "ativacao", situacao: "resultado_desconhecido", vendedor_id: "v1", metodo_pagamento: "SALDO", linha: null,
    iccid: "8955170110000000016", plano_nome: "10 GB", valor_face_centavos: 2_000, criado_em: "2026-11-20T18:00:00Z" },
  { ...OPERACAO, id: "op4", numero: 4, tipo: "portabilidade", situacao: "recusada", vendedor_id: "v1", metodo_pagamento: null, linha: "41999997777",
    linha_doadora: "41988887777", plano_nome: null, valor_face_centavos: null, criado_em: "2026-11-24T12:00:00Z" },
  { ...OPERACAO, id: "op5", numero: 5, tipo: "recarga", situacao: "aguardando_operadora", vendedor_id: "v1", metodo_pagamento: "LINK", linha: "41999996666",
    plano_nome: "20 GB", valor_face_centavos: 3_000, recebido_na_loja_centavos: 3_000, venda_item_id: "vi2", link_pagamento: "https://pagamento.exemplo/loja",
    criado_em: "2026-11-25T14:00:00Z", unidades: { nome: "Santa Cândida (fictícia)" } },
];
const TOTAIS = { chips: 3, ativacoes: 0, portabilidades: 0, recargas: 1, por_evidencia: 1, por_revisao: 0, valor_face_recargas: 2_000, em_andamento: 2, sem_resultado: 1, debito: 1_900, lojas_sem_custo: 0 };

beforeEach(() => {
  vi.useFakeTimers({ now: AGORA, toFake: ["Date"] });
  cenario.permissoes = new Set(GERENTE);
  cenario.vinculos = [{ papel: "gerente", escopo: "unidade", unidade_id: "loja" }];
  cenario.tabelas = {
    connect_operacoes: OPERACOES,
    connect_operacoes_custos: [{ operacao_id: "op1", valor_debitado_centavos: 1_900 }],
    perfis_usuario: [{ id: "eu", nome: "Gerente (fictícia)" }, { id: "v1", nome: "Vendedora (fictícia)" }],
    connect_habilitacoes: [{ tipo: "ativacao", habilitada: true }, { tipo: "recarga", habilitada: true }, { tipo: "portabilidade", habilitada: false }],
    connect_referencias: [
      { tipo: "plano", codigo: "1718", nome: "10 GB", uf: null, valor_centavos: 2_000 }, { tipo: "plano", codigo: "1719", nome: "20 GB", uf: null, valor_centavos: 3_000 },
      { tipo: "ddd", codigo: "41", nome: "41", uf: "PR", valor_centavos: null }, { tipo: "cidade", codigo: "4106902", nome: "Curitiba", uf: "PR", valor_centavos: null },
      { tipo: "operadora", codigo: "1", nome: "Operadora A (fictícia)", uf: null, valor_centavos: null },
    ],
    venda_itens: [],
  };
  cenario.painel = { totais: TOTAIS, periodos: [] };
  cenario.rpc = [];
  cenario.erroDaRpc = null;
});
afterEach(() => { vi.useRealTimers(); });

describe("as abas no topo (CONNECT-m)", () => {
  it("cada papel vê as suas abas, na ordem da demonstração", () => {
    expect(abasVisiveis({ opera: true, gere: false, integra: false })).toEqual(["operacoes", "ativar", "linha", "recarga", "portabilidade", "chips", "carteira"]);
    expect(abasVisiveis({ opera: true, gere: true, integra: false })).toEqual(Object.keys(ABAS_DA_CONNECT));
    expect(abasVisiveis({ opera: false, gere: true, integra: false })).toEqual(["operacoes", "linha", "portabilidade", "atendimento", "chips", "carteira", "integracao"]);
    expect(abasVisiveis({ opera: false, gere: false, integra: true })).toEqual(["operacoes", "chips", "integracao"]);
    expect(abasVisiveis({ opera: false, gere: false, integra: false })).toEqual(["operacoes"]);
  });

  it("toda função oficial da Nogle aparece numa aba, e cada aba tem o seu endereço", () => {
    for (const fn of FUNCOES_NOGLE) expect(ABAS_DA_CONNECT[fn.aba].rotulo, fn.nome).toBeTruthy();
    const enderecos = Object.values(ABAS_DA_CONNECT).map((a) => a.href);
    expect(new Set(enderecos).size).toBe(enderecos.length);
  });

  it("o cabeçalho: a aba atual marcada, o título da aba e o Vender chip só para quem opera e vende", () => {
    cenario.permissoes = new Set(VENDEDOR);
    let cabecalho = CabecalhoConnect({ sessao: sessaoFicticia as never, aba: "recarga", titulo: "Recarga do plano" });
    const abas = elementos(cabecalho, "FiltroSegmentado")[0]?.opcoes as { href: string; rotulo: string; ativo: boolean }[];
    expect(abas.filter((a) => a.ativo).map((a) => a.rotulo)).toEqual(["Recarga"]);
    expect(abas.map((a) => a.href)).toEqual(["/connect", "/connect/ativar", "/connect/linha", "/connect/recarga", "/connect/portabilidade", "/connect/chips", "/connect/carteira"]);
    expect(elementos(cabecalho, "BotaoLink")[0]).toMatchObject({ href: "/vender?q=chip" });
    emOrdem(limpo(texto(cabecalho)), "Santa Cândida (fictícia)", "Ora Connect", "Vender chip", "Recarga do plano");
    cenario.permissoes = new Set(["connect.operar"]);
    cabecalho = CabecalhoConnect({ sessao: sessaoFicticia as never, aba: "operacoes" });
    expect(elementos(cabecalho, "BotaoLink")).toEqual([]);
    cenario.permissoes = new Set(["venda.registrar"]);
    expect(elementos(CabecalhoConnect({ sessao: sessaoFicticia as never, aba: "operacoes" }), "FiltroSegmentado")).toEqual([]);
  });
});

describe("a lista de operações", () => {
  it("os filtros pela situação; o que não é filtro volta para Todas", () => {
    expect(["aguardando", "confirmadas", "falharam", "todas", "x", "__proto__", null].map((v) => filtroDaLista(v))).toEqual(["aguardando", "confirmadas", "falharam", "todas", "todas", "todas", "todas"]);
    expect(naLista("todas", "qualquer")).toBe(true);
    expect(["registrada", "enviando", "aguardando_operadora", "resultado_desconhecido", "confirmada"].map((s) => naLista("aguardando", s))).toEqual([true, true, true, true, false]);
    expect(["recusada", "negada", "erro_operadora", "nao_recebida", "cancelada"].map((s) => naLista("falharam", s))).toEqual([true, true, true, true, false]);
  });

  it("a hora em Brasília, se é do mesmo dia; se não, o dia", () => {
    const tarde = new Date("2026-11-26T02:30:00Z"); // 23h30 de 25/11 em Brasília
    expect(horaOuDia("2026-11-26T01:00:00Z", tarde)).toBe("22:00");
    expect(horaOuDia("2026-11-25T02:00:00Z", tarde)).toBe("24/11");
    expect(horaOuDia("2025-11-25T15:00:00Z", tarde)).toBe("25/11");
  });
});

describe("a aba Operações do dia", () => {
  it("quem gere: os 4 cartões, o Pix que a loja paga, as operações de hoje com as abertas de antes, os filtros e a produção por vendedor", async () => {
    const t = await pagina(Connect);
    emOrdem(t, "Chips vendidos", "3", "Ativações confirmadas", "0", "3 operações ainda sem confirmação", "Portabilidades", "Recargas", "1", "R$ 20,00 em valor de face (não é receita)");
    emOrdem(t, "Pix da Nogle para a loja pagar", "Nº 5 · Recarga · 20 GB · Santa Cândida (fictícia)", "recebido na loja R$ 30,00", "Abrir o pagamento da Nogle");
    emOrdem(t, "Operações de hoje", "com 1 aberta de antes");
    expect(contagens(await Connect({ searchParams: Promise.resolve({}) } as never))).toEqual({ Todas: 4, Aguardando: 3, Confirmadas: 1, Falharam: 0 });
    // A mais nova primeiro; a aberta de antes no fim, com o dia; a de ontem já terminada fica de fora.
    emOrdem(t, "11:30", "Recarga · (41) 99999-8888", "Nº 1 · Vendedora (fictícia) · 10 GB · R$ 20,00", "Confirmada", "debitado da carteira R$ 19,00",
      "11:00", "Recarga · (41) 99999-6666", "Nº 5 · Vendedora (fictícia)", "Aceita pela Nogle", "Pix da Nogle: a loja paga",
      "10:00", "Ativação de chip · eSIM", "Nº 2 · Gerente (fictícia)", "Pix da Nogle: o cliente paga agora",
      "20/11", "Ativação de chip", "Nº 3 · Vendedora (fictícia)", "Resultado desconhecido", "ICCID 8955170110000000016", "Registrar decisão");
    expect(t).not.toContain("Nº 4");
    emOrdem(t, "Operações por tipo", "Chips vendidos e operações confirmadas (hoje)", "Confirmadas pela operadora", "Débito registrado na carteira", "R$ 19,00");
    emOrdem(t, "Produção por vendedor", "Vendedora (fictícia)", "Ver o relatório completo");
    expect(cenario.rpc.find((r) => r.nome === "connect_painel")?.argumentos).toEqual({ p_inicio: "2026-11-25T03:00:00.000Z", p_fim: AGORA.toISOString(), p_unidade: "loja" });
  });

  it("os filtros e o período mudam a lista e os endereços", async () => {
    let t = await pagina(Connect, { filtro: "aguardando" });
    expect(t).toContain("Nº 5 ·");
    expect(t).not.toContain("Nº 1 ·");
    t = await pagina(Connect, { periodo: "7" });
    expect(t).toContain("Operações dos últimos 7 dias");
    expect(contagens(await Connect({ searchParams: Promise.resolve({ periodo: "7" }) } as never))).toEqual({ Todas: 5, Aguardando: 3, Confirmadas: 1, Falharam: 1 });
    expect(t).toContain("Nº 4 ·");
    const filtros = elementos(await Connect({ searchParams: Promise.resolve({ periodo: "7", filtro: "falharam" }) } as never), "FiltroSegmentado");
    expect((filtros[1]?.opcoes as { href: string }[]).map((o) => o.href)).toEqual(["/connect?periodo=7", "/connect?periodo=7&filtro=aguardando", "/connect?periodo=7&filtro=confirmadas", "/connect?periodo=7&filtro=falharam"]);
    expect((filtros[0]?.opcoes as { href: string }[]).map((o) => o.href)).toContain("/connect?filtro=falharam");
  });

  it("quem só opera: as próprias, sem nomes, sem o Pix da loja, sem a produção por vendedor; a produção é a dele", async () => {
    cenario.permissoes = new Set(VENDEDOR);
    const t = await pagina(Connect);
    emOrdem(t, "Vender chip", "Minhas operações de hoje", "Ativação de chip · eSIM", "Nº 2 · 10 GB");
    expect(contagens(await Connect({ searchParams: Promise.resolve({}) } as never))).toEqual({ Todas: 1, Aguardando: 1, Confirmadas: 0, Falharam: 0 });
    for (const fora of ["Vendedora (fictícia)", "Gerente (fictícia)", "Pix da Nogle para a loja pagar", "Produção por vendedor", "Débito", "Nº 1 ·", "Registrar decisão"]) expect(t).not.toContain(fora);
    expect(cenario.rpc.find((r) => r.nome === "connect_painel")?.argumentos).toMatchObject({ p_unidade: "loja", p_vendedor: "eu" });
  });

  it("os avisos: a operação registrada e o erro", async () => {
    expect(await pagina(Connect, { ok: "registrada" })).toContain("Operação registrada. O servidor envia à Nogle");
    expect(await pagina(Connect, { erro: "nao_habilitada" })).toContain("Esta operação ainda não foi liberada");
  });
});

describe("as abas dos formulários", () => {
  it("Ativar chip (CONNECT-n): o assistente recebe as listas da Nogle, os serviços pagos livres e os chips vendidos sem operação; sem liberação, o aviso", async () => {
    // Um serviço pago no caixa (o item da ativação) e dois chips vendidos na loja, um deles já com operação viva.
    cenario.tabelas.venda_itens = [
      { id: "vi9", tipo: "ativacao", preco_unitario_centavos: 2_000, quantidade: 1, desconto_centavos: 0, variantes: { nome: "ATV-10 GB" }, itens_serializados: { iccid: null },
        vendas: { numero: 12, situacao: "concluida", unidade_id: "loja", concluida_em: "2026-11-25T12:00:00Z" } },
      { id: "vc1", tipo: "produto", preco_unitario_centavos: 1_000, quantidade: 1, desconto_centavos: 0, variantes: null, itens_serializados: { iccid: "8955170110000000099" },
        vendas: { numero: 13, situacao: "concluida", unidade_id: "loja", concluida_em: "2026-11-25T13:00:00Z" } },
      { id: "vc2", tipo: "produto", preco_unitario_centavos: 1_000, quantidade: 1, desconto_centavos: 0, variantes: null, itens_serializados: { iccid: "8955170110000000016" },
        vendas: { numero: 11, situacao: "concluida", unidade_id: "loja", concluida_em: "2026-11-24T13:00:00Z" } },
    ];
    const arvore = await AtivarChip({ searchParams: Promise.resolve({}) } as never);
    const assistente = elementos(arvore, "AssistenteDeAtivacao")[0];
    expect(assistente).toMatchObject({
      planos: [{ codigo: "1718", nome: "10 GB", valor_centavos: 2_000 }, { codigo: "1719", nome: "20 GB", valor_centavos: 3_000 }],
      ddds: [{ codigo: "41", uf: "PR" }], cidades: [{ codigo: "4106902", nome: "Curitiba", uf: "PR" }],
      pagos: [{ id: "vi9", rotulo: expect.stringMatching(/^Venda nº 12 · ATV-10 GB · R\$\s20,00$/) }],
      chips: [{ iccid: "8955170110000000099", venda: 13 }],
    });
    expect(assistente?.chave).toMatch(/^[0-9a-f-]{36}$/);
    emOrdem(await pagina(AtivarChip), "Ativar chip na operadora", "Como a ativação funciona", "O chip:", "O cliente:", "O plano e o DDD", "O pagamento à Nogle:", "Conferir e registrar:");
    cenario.tabelas.connect_habilitacoes = [];
    expect(await pagina(AtivarChip)).toContain("A ativação ainda não foi liberada nesta rede");
    cenario.permissoes = new Set(["connect.gerir"]);
    expect(await pagina(AtivarChip)).toContain("Seu papel não ativa chips nesta loja.");
  });

  it("Recarga: a linha, os planos e o pagamento; quem gere vê onde ficam as programadas", async () => {
    emOrdem(await pagina(Recarga, { erro: "linha" }), "Linha com DDD: 11 dígitos", "Recarga do plano", "Número da linha (com DDD)", "10 GB", "Solicitar recarga", "Bloqueio e atendimento");
    cenario.permissoes = new Set(VENDEDOR);
    expect(await pagina(Recarga)).not.toContain("As recargas programadas");
  });

  it("Portabilidade: sem liberação, o aviso; a lista da loja com os filtros", async () => {
    const t = await pagina(Portabilidade);
    emOrdem(t, "Trazer número de outra operadora", "A portabilidade ainda não foi liberada nesta rede", "Portabilidades", "(41) 98888-7777 → (41) 99999-7777", "Recusada");
    expect(contagens(await Portabilidade({ searchParams: Promise.resolve({}) } as never))).toEqual({ Todas: 1, Aguardando: 0, Confirmadas: 0, Falharam: 1 });
    cenario.tabelas.connect_habilitacoes = [{ tipo: "portabilidade", habilitada: true }];
    emOrdem(await pagina(Portabilidade), "Operadora atual", "Operadora A (fictícia)", "Solicitar portabilidade");
  });

  it("Integração Nogle: a liberação de cada operação, as listas carregadas e as funções oficiais com a aba de cada uma", async () => {
    cenario.permissoes = new Set(["connect.gerir", "integracoes.gerir"]);
    const t = await pagina(Integracao);
    emOrdem(t, "Situação da integração", "Ativação de chip", "liberada", "Portabilidade", "aguardando liberação", "Listas oficiais carregadas: 2 planos, 1 DDDs, 1 cidades e 1 operadoras.",
      "Liberar operações", "Registrar", `As ${FUNCOES_NOGLE.length} funções da coleção oficial`, "Autenticação", "POST /auth/token", "Integração Nogle", "O servidor");
    cenario.permissoes = new Set(VENDEDOR);
    expect(await pagina(Integracao)).toContain("A integração com a Nogle é do dono, dos gerentes e de quem cuida das integrações.");
  });
});

describe("para onde cada formulário volta", () => {
  const enviar = (acao: (d: FormData) => Promise<unknown>, campos: Record<string, string>) => {
    const dados = new FormData();
    for (const [k, v] of Object.entries(campos)) dados.set(k, v);
    return acao(dados);
  };
  const RECARGA = { tipo: "recarga", linha: "(41) 99999-8888", plano: "1718", metodo: "LINK" };

  it("o erro volta para a aba do formulário; a operação registrada vai para Operações do dia", async () => {
    await expect(enviar(registrarOperacao, { ...RECARGA, linha: "123" })).rejects.toThrow("redirecionou para /connect/recarga?erro=linha");
    await expect(enviar(registrarOperacao, { tipo: "portabilidade", linha: "41999998888", linha_doadora: "1", operadora: "1" })).rejects.toThrow("redirecionou para /connect/portabilidade?erro=linha");
    await expect(enviar(registrarOperacao, { tipo: "ativacao", plano: "1718", metodo: "LINK", ddd: "41", esim: "on", documento: "123" })).rejects.toThrow("redirecionou para /connect/ativar?erro=documento");
    await expect(enviar(registrarOperacao, { tipo: "outra" })).rejects.toThrow("redirecionou para /connect?erro=dados");
    expect(cenario.rpc).toEqual([]);
    cenario.erroDaRpc = { code: "OR012" };
    await expect(enviar(registrarOperacao, RECARGA)).rejects.toThrow("redirecionou para /connect/recarga?erro=nao_habilitada");
    cenario.erroDaRpc = null;
    await expect(enviar(registrarOperacao, RECARGA)).rejects.toThrow("redirecionou para /connect?ok=registrada");
    expect(cenario.rpc.at(-1)).toMatchObject({ nome: "connect_registrar", argumentos: { p_tipo: "recarga", p_pedido: { metodo: "LINK", plano: 1718, linha: "41999998888" } } });
  });

  it("a liberação volta para a aba Integração Nogle", async () => {
    await expect(enviar(habilitarOperacao, { tipo: "recarga", habilitar: "sim", evidencia: "curta" })).rejects.toThrow("redirecionou para /connect/integracao?erro=evidencia");
    cenario.erroDaRpc = { code: "42501" };
    await expect(enviar(habilitarOperacao, { tipo: "recarga", habilitar: "sim", evidencia: "Conferido com a Nogle (fictício)" })).rejects.toThrow("redirecionou para /connect/integracao?erro=sem_permissao");
    cenario.erroDaRpc = null;
    await expect(enviar(habilitarOperacao, { tipo: "recarga", habilitar: "sim", evidencia: "Conferido com a Nogle (fictício)" })).rejects.toThrow("redirecionou para /connect/integracao?ok=habilitacao");
  });
});
