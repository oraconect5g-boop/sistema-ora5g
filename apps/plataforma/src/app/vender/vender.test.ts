// A tela do PDV (lote VEL-a: ORA-QUAL-010 e ORA-POS-002), com sessão e Supabase SIMULADOS: nenhuma credencial, nenhuma
// rede. Dados fictícios. O que se confere aqui:
//  - quantas idas SEGUIDAS ao banco a tela faz (a espera de quem vende é a soma delas): abrir o PDV é uma rodada só;
//  - que a tela não pergunta mais as permissões (vieram com a sessão) nem lê tabela para montar o carrinho;
//  - que a busca de produto só lê a disponibilidade DEPOIS de soltar as reservas do site vencidas;
//  - o que aparece: caixa, carrinho, totais, selos de desconto, conserto da OS e os resultados da busca.
// A função do banco é testada em packages/banco/src/sessao-molde-e-pdv.test.ts; a leitura estrita da resposta dela, em
// src/lib/vendas/pdv-tela.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const id = (fim: string) => `00000000-0000-4000-8000-${fim.padStart(12, "0")}`;
const EU = id("aa");
const LOJA = id("cc");
const OUTRA_LOJA = id("cd");
const CAIXA = id("c001");
const VENDA = id("d001");
const ITEM_CAPA = id("a001");
const ITEM_APARELHO = id("a002");
const ITEM_CONSERTO = id("a003");
const P_GALAXY = id("1001");
const P_CAPA = id("1002");
const P_CHIP = id("1003");
const M_SAMSUNG = id("2001");
const V_CAPA = id("e001");
const V_AZUL = id("e002");
const V_CONSERTO = id("e003");
const V_CHIP = id("e004");
const S_LIVRE = id("b001");
const S_RESERVADO = id("b002");
const S_OUTRA_LOJA = id("b003");
const S_CHIP = id("b004");
const CAMPANHA = id("f001");
const OS = id("501");
const MAQUININHA = id("701");

type Linha = Record<string, unknown>;
type Erro = { code: string };
const cenario = vi.hoisted(() => ({
  /** As permissões que vieram com a sessão (public.molde_da_sessao). */
  permissoes: new Set<string>(),
  /** O que foi pedido à sessão em cada chamada. */
  sessoes: [] as unknown[],
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  /** Leitura de tabela que falha, pelo nome da tabela. */
  erros: {} as Record<string, { code: string }>,
  /** A resposta de public.pdv_tela, ou a falha dela. */
  pdv: null as unknown,
  erroDoPdv: null as { code: string } | null,
  /** PAY-015a: o que public.caixa_pix_da_venda responde (o Pix pela Asaas da venda aberta). */
  pix: { data: null, error: null } as { data: unknown; error: { code: string } | null },
  /** PAY-015b: o que public.caixa_cartao_da_venda responde (o cartão pela Asaas da venda aberta). */
  cartao: { data: null, error: null } as { data: unknown; error: { code: string } | null },
  /** O que public.loja_reservas_liberar_vencidas responde. */
  soltura: { data: 0, error: null } as { data: number | null; error: { code: string } | null },
  /** O preço vigente de cada variação nesta loja, em centavos; "falha": a leitura dos preços falha; ausente: sem preço. */
  precos: {} as Record<string, number | "falha">,
  /** As fotos que a tela pediu para assinar. */
  assinaturas: [] as { deposito: string; caminhos: string[]; segundos: number }[],
  /** As idas ao banco, em rodadas: cada rodada é o que a tela pediu antes de chegar qualquer resposta. */
  idas: [] as string[][],
  rodadaAberta: false,
  emVoo: 0,
}));

const registrar = (rotulo: string) => {
  if (!cenario.rodadaAberta) {
    cenario.idas.push([]);
    cenario.rodadaAberta = true;
  }
  cenario.idas.at(-1)?.push(rotulo);
};
/** A resposta chega depois, como na rede, e fecha a rodada: o que a tela pedir a seguir já é outra ida. */
const responder = <T>(valor: T) => {
  cenario.emVoo += 1;
  return new Promise<T>((ok) => setTimeout(() => {
    cenario.emVoo -= 1;
    cenario.rodadaAberta = false;
    ok(valor);
  }, 0));
};
/** As rodadas, cada uma em ordem alfabética (dentro da rodada a ordem não muda a espera). */
const rodadas = () => cenario.idas.map((r) => [...r].sort());

const minusculo = (v: unknown) => String(v ?? "").toLocaleLowerCase("pt-BR");
// O simulador aplica os filtros na ordem das chamadas, como o PostgREST: o que a tela esquecer de filtrar aparece.
class Consulta {
  linhas: Linha[];
  comVariante = false;
  constructor(readonly nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select(colunas = "") {
    // O aparelho pedido já com a variação dele (variantes(...)): o PostgREST embute a linha, ou nulo se quem pede não a lê.
    this.comVariante = this.nome === "itens_serializados" && colunas.includes("variantes(");
    return this;
  }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  is(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  // "imei.eq.3520…,imei2.eq.3520…,iccid.eq.3520…" (o número inteiro) ou "imei.like.*0010,imei2.like.*0010" (o final).
  or(filtro: string) {
    const condicoes = filtro.split(",").map((c) => { const [coluna = "", operador = "", valor = ""] = c.split("."); return { coluna, operador, valor }; });
    this.linhas = this.linhas.filter((l) => condicoes.some(({ coluna, operador, valor }) => {
      const v = l[coluna];
      if (typeof v !== "string") return false;
      return operador === "eq" ? v === valor : v.endsWith(valor.replace(/^\*/, ""));
    }));
    return this;
  }
  ilike(coluna: string, padrao: string) { const t = minusculo(padrao.replaceAll("%", "")); this.linhas = this.linhas.filter((l) => minusculo(l[coluna]).includes(t)); return this; }
  order(coluna: string) { this.linhas = [...this.linhas].sort((a, b) => String(a[coluna]).localeCompare(String(b[coluna]))); return this; }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  then<A, B>(resolver: (r: { data: Linha[] | null; error: Erro | null }) => A, rejeitar?: (motivo: unknown) => B) {
    registrar(`tabela:${this.nome}`);
    const erro = cenario.erros[this.nome];
    const linhas = this.comVariante
      ? this.linhas.map((l) => ({ ...l, variantes: (cenario.tabelas.variantes ?? []).find((v) => v.id === l.variante_id) ?? null }))
      : this.linhas;
    return responder(erro ? { data: null, error: erro } : { data: linhas, error: null }).then(resolver, rejeitar);
  }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: (nome: string, argumentos: Record<string, unknown> = {}) => {
    // As permissões vieram com a sessão: a tela que perguntar de novo ao banco quebra o teste.
    if (nome === "tem_permissao") throw new Error("a tela do PDV perguntou a permissão ao banco");
    registrar(`funcao:${nome}`);
    if (nome === "pdv_tela") return responder(cenario.erroDoPdv ? { data: null, error: cenario.erroDoPdv } : { data: cenario.pdv, error: null });
    if (nome === "loja_reservas_liberar_vencidas") return responder(cenario.soltura);
    if (nome === "caixa_pix_da_venda") return responder(cenario.pix);
    if (nome === "caixa_cartao_da_venda") return responder(cenario.cartao);
    // VEL-b: o preço de todos os resultados num pedido só; perguntar um a um quebra o teste.
    if (nome === "preco_vigente") throw new Error("a busca do PDV perguntou o preço de um resultado por vez");
    if (nome === "precos_vigentes") {
      // O preço é o da loja do turno: pedido para outra loja, não há preço. Só volta a variação que tem preço.
      const variantes = [...new Set((argumentos.p_variantes as string[] | undefined) ?? [])];
      if (variantes.some((v) => cenario.precos[v] === "falha")) return responder({ data: null, error: { code: "57014" } });
      const linhas = argumentos.p_unidade === LOJA
        ? variantes.flatMap((v) => { const preco = cenario.precos[v]; return typeof preco === "number" ? [{ variante_id: v, preco_centavos: preco }] : []; })
        : [];
      return responder({ data: linhas, error: null });
    }
    return responder({ data: null, error: { code: "PGRST202" } });
  },
  storage: {
    from: (deposito: string) => ({
      createSignedUrls: (caminhos: string[], segundos: number) => {
        registrar("fotos:assinar");
        cenario.assinaturas.push({ deposito, caminhos, segundos });
        return responder({ data: caminhos.map((path) => ({ path, signedUrl: `https://fotos.invalid/${path}?assinada`, error: null })), error: null });
      },
    }),
  },
};

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {
    constructor(etapa: string) {
      super(`Falha ao consultar o serviço (${etapa})`);
      this.name = "FalhaDoServico";
    }
  },
  obterSessao: async (opcoes: unknown) => {
    cenario.sessoes.push(opcoes);
    return {
      usuario: { id: EU },
      situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-16T23:00:00Z", segundo_fator_pendente: false },
      molde: { permissoes: cenario.permissoes, nome: "Vendedora Teste", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
      supabase,
    };
  },
}));

import { BotaoConfirmar } from "../../componentes/BotaoConfirmar";
import { QrCode } from "../../componentes/QrCode";
import { FotoAmpliavel } from "../catalogo/FotoAmpliavel";
import { BuscaDeCliente } from "../clientes/BuscaDeCliente";
import { abrirCaixa, adicionarItem, aplicarDesconto, cancelarCartaoAsaas, cancelarPixAsaas, cancelarVenda, concluirVenda, novaVenda, pedirAprovacao, pedirCartaoAsaas,
  pedirPixAsaas, removerItem } from "./acoes";
import { FormasDePagamento } from "./FormasDePagamento";
import Vender from "./page";

type Elemento = ReactElement<Linha>;
/** O texto da tela devolvida pela página. Os componentes não são executados: vale o que a página passou a cada um. */
function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      if (typeof x.type === "string") andar(x.props.children);
      else andar([x.props.sobretitulo, x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
/** Todos os elementos da tela, na ordem em que aparecem. */
function elementos(v: unknown): Elemento[] {
  const achados: Elemento[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Linha>(x)) {
      achados.push(x);
      andar(x.props.children);
    }
  };
  andar(v);
  return achados;
}
/** Os formulários de uma ação, cada um com os campos escondidos e o texto dele. */
const formularios = (tela: unknown, acao: unknown) =>
  elementos(tela).filter((e) => e.type === "form" && e.props.action === acao).map((f) => ({
    escondidos: Object.fromEntries(elementos(f.props.children).filter((e) => e.type === "input" && e.props.type === "hidden").map((e) => [String(e.props.name), e.props.value])),
    texto: texto(f.props.children),
    elementos: elementos(f.props.children),
  }));
const abrir = async (parametros: Record<string, string> = {}) => (await Vender({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Um item do carrinho como public.pdv_tela devolve: todos os campos do combinado. */
const item = (mudar: Linha = {}): Linha => ({
  id: ITEM_CAPA, variante_id: V_CAPA, item_serializado_id: null, tipo: "acessorio", quantidade: 2, preco_unitario_centavos: 6_900, desconto_centavos: 0,
  preco_id: null, os_id: null, variante: { sku: "ACE-0001", nome: "Capa Galaxy A15 transparente" }, serial: null, preco: null, os: null, aprovacao: null,
  loja_reserva_id: null, ...mudar,
});
const aparelho = (mudar: Linha = {}) => item({
  id: ITEM_APARELHO, variante_id: V_AZUL, item_serializado_id: S_LIVRE, tipo: "aparelho", quantidade: 1, preco_unitario_centavos: 129_900, desconto_centavos: 5_000,
  variante: { sku: "APA-0001", nome: "Galaxy A15 128 GB Azul" }, serial: { imei: "352099001700010", iccid: null }, aprovacao: "pendente", ...mudar,
});
const CARRINHO = [
  item({ preco_id: CAMPANHA, preco: { id: CAMPANHA, origem: "campanha", unidade_id: LOJA, motivo: "Semana da capa", fim: "2026-11-21T02:59:00+00:00" } }),
  aparelho(),
  item({ id: ITEM_CONSERTO, variante_id: V_CONSERTO, tipo: "servico", quantidade: 1, preco_unitario_centavos: 33_000, variante: { sku: "OS-CONSERTO", nome: "Conserto genérico" }, os_id: OS, os: { id: OS, numero: 7, situacao: "pronta" } }),
];
/** A resposta de public.pdv_tela: caixa aberto e venda nº 43 em andamento, salvo o que o teste mudar. */
const tela = (mudar: Linha = {}) => ({
  caixa: { id: CAIXA, aberto_em: "2026-11-16T12:00:00+00:00" },
  venda: { id: VENDA, numero: 43, situacao: "rascunho", pago_pelo_site_centavos: null },
  itens: [] as Linha[],
  terminais: [] as Linha[],
  ...mudar,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.permissoes = new Set(["venda.registrar"]);
  cenario.sessoes = [];
  cenario.erros = {};
  cenario.pdv = tela();
  cenario.erroDoPdv = null;
  cenario.soltura = { data: 0, error: null };
  cenario.pix = { data: { ligado: false, venda: null, pix: [] }, error: null };
  cenario.cartao = { data: { ligado: false, venda: null, cartoes: [] }, error: null };
  cenario.precos = { [V_AZUL]: 129_900, [V_CAPA]: 6_900, [V_CHIP]: 1_000 };
  cenario.assinaturas = [];
  cenario.idas = [];
  cenario.rodadaAberta = false;
  cenario.tabelas = {
    marcas: [{ id: M_SAMSUNG, nome: "Samsung" }],
    produtos: [
      { id: P_GALAXY, nome: "Galaxy A15", ativo: true, marca_id: M_SAMSUNG },
      { id: P_CAPA, nome: "Capa de proteção", ativo: true, marca_id: null },
      { id: P_CHIP, nome: "Chip Ora 5G", ativo: true, marca_id: null },
    ],
    variantes: [
      { id: V_AZUL, produto_id: P_GALAXY, sku: "APA-0001", nome: "128 GB Azul", ativa: true, codigo_barras: null, produtos: { nome: "Galaxy A15", tipo: "aparelho" } },
      { id: V_CAPA, produto_id: P_CAPA, sku: "ACE-0001", nome: "Capa Galaxy A15 transparente", ativa: true, codigo_barras: "7890000000028", produtos: { nome: "Capa de proteção", tipo: "acessorio" } },
      { id: V_CHIP, produto_id: P_CHIP, sku: "CHP-0001", nome: "Chip pré-pago", ativa: true, codigo_barras: null, produtos: { nome: "Chip Ora 5G", tipo: "chip" } },
    ],
    variante_codigos_externos: [],
    itens_serializados: [
      { id: S_LIVRE, variante_id: V_AZUL, unidade_id: LOJA, imei: "352099001700010", imei2: null, iccid: null, situacao: "disponivel", em_estoque: true },
      { id: S_RESERVADO, variante_id: V_AZUL, unidade_id: LOJA, imei: "352099001700028", imei2: null, iccid: null, situacao: "reservado", em_estoque: true },
      { id: S_OUTRA_LOJA, variante_id: V_AZUL, unidade_id: OUTRA_LOJA, imei: "352099001700036", imei2: null, iccid: null, situacao: "disponivel", em_estoque: true },
      { id: S_CHIP, variante_id: V_CHIP, unidade_id: LOJA, imei: null, imei2: null, iccid: "8955100000000000013", situacao: "disponivel", em_estoque: true },
    ],
    estoque_saldos: [
      { variante_id: V_AZUL, unidade_id: LOJA, quantidade: 2, reservado: 1 },
      { variante_id: V_AZUL, unidade_id: OUTRA_LOJA, quantidade: 9, reservado: 0 },
      { variante_id: V_CAPA, unidade_id: LOJA, quantidade: 10, reservado: 0 },
      { variante_id: V_CHIP, unidade_id: LOJA, quantidade: 1, reservado: 0 },
    ],
    fotos_produto: [
      { produto_id: P_CAPA, variante_id: null, caminho: "org/capa/principal.webp", ilustracao: true, substituida_em: null },
      { produto_id: P_CAPA, variante_id: null, caminho: "org/capa/antiga.webp", ilustracao: false, substituida_em: "2026-11-01T12:00:00Z" },
    ],
  };
});
afterEach(async () => {
  // Uma tela que parou numa falha pode ter deixado pedidos sem resposta: eles se assentam antes do próximo teste.
  while (cenario.emVoo > 0) await new Promise((ok) => setTimeout(ok, 0));
  vi.restoreAllMocks();
});

// PAY-015a: o Pix pela Asaas da venda aberta vai junto na mesma rodada (o banco acha a mesma venda da tela); PAY-015b: e o
// cartão pela Asaas.
const PRIMEIRA_IDA = ["funcao:caixa_cartao_da_venda", "funcao:caixa_pix_da_venda", "funcao:loja_reservas_liberar_vencidas", "funcao:pdv_tela"];
/** A primeira etapa da busca do catálogo (lib/catalogo/busca.ts), que sai junto com a tela. */
const CATALOGO = ["tabela:marcas", "tabela:produtos", "tabela:variante_codigos_externos", "tabela:variantes", "tabela:variantes"];

describe("as idas ao banco para abrir o PDV (VEL-a)", () => {
  it("sem a permissão de vender: o aviso, e nenhuma ida ao banco além da sessão", async () => {
    cenario.permissoes = new Set(["estoque.consultar", "cliente.buscar"]);
    const t = texto(await abrir({ q: "galaxy" }));
    expect(t).toContain("Seu papel não registra vendas nesta loja.");
    expect(t).not.toContain("Nova venda");
    expect(cenario.idas).toEqual([]);
    expect(cenario.sessoes).toEqual([{ exigirLoja: true }]);
  });

  it("sem busca: uma rodada só, com a tela inteira e a soltura das reservas do site (antes eram até nove idas seguidas)", async () => {
    cenario.pdv = tela({ caixa: null, venda: null });
    await abrir();
    expect(rodadas()).toEqual([PRIMEIRA_IDA]);
    expect(cenario.sessoes).toEqual([{ exigirLoja: true }]);
  });

  it("com o carrinho cheio continua uma rodada só: nomes, números, regras de preço, OS e aprovações vieram juntos", async () => {
    cenario.pdv = tela({ itens: CARRINHO, terminais: [{ id: MAQUININHA, provedor: "picpay", apelido: "Balcão", identificador: "PP-0001" }] });
    const t = texto(await abrir());
    expect(t).toContain("Galaxy A15 128 GB Azul");
    expect(rodadas()).toEqual([PRIMEIRA_IDA]);
    expect(cenario.assinaturas).toEqual([]);
  });

  it("busca por nome: o catálogo sai junto com a tela; saldo, aparelhos, fotos e preços vão numa rodada só, depois da soltura", async () => {
    await abrir({ q: "galaxy" });
    expect(rodadas()).toEqual([
      [...PRIMEIRA_IDA, ...CATALOGO],
      ["tabela:variantes"], // o catálogo: as variações do produto achado pelo nome
      ["tabela:variantes"], // a tela: os oito primeiros resultados, com o tipo do produto
      ["funcao:precos_vigentes", "tabela:estoque_saldos", "tabela:fotos_produto", "tabela:itens_serializados"],
      ["fotos:assinar"],
    ]);
  });

  it("busca pela marca: uma ida a mais, a dos produtos da marca", async () => {
    await abrir({ q: "samsung" });
    expect(rodadas()).toEqual([
      [...PRIMEIRA_IDA, ...CATALOGO],
      ["tabela:produtos"],
      ["tabela:variantes"],
      ["tabela:variantes"],
      ["funcao:precos_vigentes", "tabela:estoque_saldos", "tabela:fotos_produto", "tabela:itens_serializados"],
    ]);
  });

  it("busca pelo final do IMEI: a procura no catálogo sai junto com a tela; a disponibilidade só depois da soltura", async () => {
    await abrir({ q: "700010" });
    const [primeira, ...depois] = rodadas();
    // Com dígitos, o catálogo também olha o código de barras e o final do IMEI do que está em estoque.
    expect(primeira).toEqual([...PRIMEIRA_IDA, "tabela:itens_serializados", ...CATALOGO, "tabela:variantes"].sort());
    expect(depois).toEqual([
      ["tabela:variantes"],
      ["tabela:variantes"],
      ["funcao:precos_vigentes", "tabela:estoque_saldos", "tabela:fotos_produto", "tabela:itens_serializados"],
    ]);
  });

  it("IMEI inteiro: o aparelho já vem com a variação dele; três rodadas ao todo", async () => {
    await abrir({ q: "352099001700010" });
    expect(rodadas()).toEqual([
      PRIMEIRA_IDA,
      ["tabela:itens_serializados"],
      ["funcao:precos_vigentes", "tabela:estoque_saldos", "tabela:fotos_produto"],
    ]);
  });

  it("busca sem venda aberta: nada de saldo, aparelho, preço nem foto (não há onde mostrar)", async () => {
    cenario.pdv = tela({ venda: null });
    const t = texto(await abrir({ q: "galaxy" }));
    expect(t).toContain("Nova venda");
    expect(t).not.toContain("livre(s) aqui");
    const pedidos = cenario.idas.flat();
    expect(pedidos).not.toContain("tabela:estoque_saldos");
    expect(pedidos).not.toContain("tabela:itens_serializados");
    expect(pedidos).not.toContain("tabela:fotos_produto");
    expect(pedidos).not.toContain("funcao:precos_vigentes");
    expect(pedidos).not.toContain("fotos:assinar");
  });

  it("IMEI digitado sem venda aberta: só a primeira rodada", async () => {
    cenario.pdv = tela({ venda: null });
    await abrir({ q: "352099001700010" });
    expect(rodadas()).toEqual([PRIMEIRA_IDA]);
  });
});

describe("o que o PDV mostra", () => {
  it("sem caixa e sem venda: abrir o caixa (com fundo de troco) e começar a venda, cada um com a sua chave", async () => {
    cenario.pdv = tela({ caixa: null, venda: null });
    const arvore = await abrir();
    const t = texto(arvore);
    expect(t).toContain("Santa Cândida (teste)");
    expect(t).toContain("Abra o seu caixa Sem caixa aberto, a venda não é concluída.");
    expect(t).toContain("Abrir caixa");
    expect(t).toContain("Nova venda");
    expect(t).not.toContain("Carrinho");
    const [caixa] = formularios(arvore, abrirCaixa);
    const [venda] = formularios(arvore, novaVenda);
    expect(caixa?.escondidos.chave).toMatch(UUID);
    expect(venda?.escondidos.chave).toMatch(UUID);
    expect(caixa?.escondidos.chave).not.toBe(venda?.escondidos.chave);
  });

  it("com o caixa aberto e sem venda: só o botão de nova venda", async () => {
    cenario.pdv = tela({ venda: null });
    const arvore = await abrir();
    expect(texto(arvore)).not.toContain("Abra o seu caixa");
    expect(formularios(arvore, abrirCaixa)).toEqual([]);
    expect(formularios(arvore, novaVenda)).toHaveLength(1);
  });

  it("venda aberta e carrinho vazio: a busca, o carrinho à espera e nada de pagamento", async () => {
    const arvore = await abrir();
    const t = texto(arvore);
    expect(t).toContain("Venda nº 43 Em andamento");
    expect(t).toContain("Busque um produto para começar.");
    expect(t).toContain("Total R$ 0,00");
    expect(t).not.toContain("Nada encontrado");
    expect(formularios(arvore, concluirVenda)).toEqual([]);
    expect(formularios(arvore, novaVenda)).toEqual([]);
    expect(formularios(arvore, cancelarVenda).map((f) => f.escondidos)).toEqual([{ venda: VENDA }]);
  });

  it("carrinho: nome, SKU, final do IMEI, quantidade e preço, campanha, conserto da OS, desconto e totais", async () => {
    cenario.pdv = tela({ itens: CARRINHO });
    const arvore = await abrir();
    const t = texto(arvore);
    expect(t).toContain("Capa Galaxy A15 transparente ACE-0001 · 2 × R$ 69,00 Campanha da loja: Semana da capa (até 20/11, 23:59) R$ 138,00");
    expect(t).toContain("Galaxy A15 128 GB Azul APA-0001 · •••• 700010 · 1 × R$ 1.299,00 R$ 1.249,00 desconto R$ 50,00");
    expect(t).toContain("Conserto da OS nº 7 valor do orçamento aprovado · ver a OS OS-CONSERTO · 1 × R$ 330,00 R$ 330,00");
    expect(t).not.toContain("Conserto genérico");
    expect(t).toContain("Subtotal R$ 1.767,00 Descontos − R$ 50,00 Total R$ 1.717,00");
    expect(elementos(arvore).some((e) => e.props.href === `/assistencia/${OS}`)).toBe(true);
    // Cada item leva o seu identificador às ações de desconto e de tirar do carrinho.
    expect(formularios(arvore, aplicarDesconto).map((f) => f.escondidos)).toEqual([{ item: ITEM_CAPA }, { item: ITEM_APARELHO }, { item: ITEM_CONSERTO }]);
    expect(formularios(arvore, removerItem).map((f) => f.escondidos)).toEqual([{ item: ITEM_CAPA }, { item: ITEM_APARELHO }, { item: ITEM_CONSERTO }]);
    const descontos = formularios(arvore, aplicarDesconto).map((f) => f.elementos.find((e) => e.props.name === "desconto")?.props.defaultValue);
    expect(descontos).toEqual(["0,00", "50,00", "0,00"]);
  });

  // PDV-c (pedido do proprietário de 18/11): as formas de pagamento por botão. O componente recebe o total, o valor dos
  // celulares (o único que a PayJoy e a Aiva financiam), as formas da loja (sem o link de pagamento) e as maquininhas.
  it("pagamento: o botão das formas recebe o total, o valor dos celulares, as formas da loja sem o link e as maquininhas", async () => {
    cenario.pdv = tela({ itens: CARRINHO, terminais: [{ id: MAQUININHA, provedor: "picpay", apelido: "Balcão", identificador: "PP-0001" }, { id: id("702"), provedor: "pagbank", apelido: "Vitrine", identificador: "PB-0002" }] });
    const arvore = await abrir();
    const [pagamento] = formularios(arvore, concluirVenda);
    expect(pagamento?.escondidos.venda).toBe(VENDA);
    expect(pagamento?.escondidos.chave).toMatch(UUID);
    const formas = elementos(arvore).find((e) => e.type === FormasDePagamento);
    expect(formas?.props.total).toBe(171_700);
    expect(formas?.props.valorDosCelulares).toBe(124_900);
    const opcoes = formas?.props.opcoes as { meio: string; maximoDeParcelas: number | null; podeSerEntrada: boolean }[];
    expect(opcoes.map((o) => o.meio)).not.toContain("link_pagamento");
    expect(Object.fromEntries(opcoes.map((o) => [o.meio, o.maximoDeParcelas]))).toMatchObject({ payjoy: 48, aiva: 48, cartao_picpay: 24, cartao_pagseguro: 24, dinheiro: null, pix_direto: null });
    expect(opcoes.filter((o) => o.podeSerEntrada).map((o) => o.meio)).toEqual(["dinheiro", "pix_direto", "pix_picpay", "cartao_picpay", "cartao_pagseguro"]);
    expect(formas?.props.terminais).toEqual([
      { id: MAQUININHA, provedor: "picpay", rotulo: "Balcão · PicPay PP-0001" }, { id: id("702"), provedor: "pagbank", rotulo: "Vitrine · PagBank PB-0002" }]);
  });

  it("PAY-014b: a venda do pedido pago pelo site mostra o pago, cobra só o resto, o item pago fica sem desconto e sem tirar, e a venda não se cancela por aqui", async () => {
    const paga = item({ quantidade: 1, loja_reserva_id: id("c501") });
    const aMais = item({ id: id("a009"), quantidade: 1 });
    cenario.pdv = tela({ itens: [paga, aMais], venda: { id: VENDA, numero: 43, situacao: "rascunho", pago_pelo_site_centavos: 6_900 } });
    const arvore = await abrir();
    const t = texto(arvore);
    expect(t).toContain("pago pelo site");
    expect(t).toContain("Pago pelo site: sai pelo preço pago, sem desconto, e não sai da venda.");
    expect(t).toContain("Pedido pago pelo site: esta venda não se cancela por aqui.");
    expect(formularios(arvore, removerItem).map((f) => f.escondidos)).toEqual([{ item: id("a009") }]);
    expect(formularios(arvore, aplicarDesconto).map((f) => f.escondidos)).toEqual([{ item: id("a009") }]);
    expect(formularios(arvore, cancelarVenda)).toEqual([]);
    const formas = elementos(arvore).find((e) => e.type === FormasDePagamento);
    expect(formas?.props).toMatchObject({ total: 6_900, pagoPeloSite: 6_900 });
  });

  it("sem maquininha ativa na loja: o botão das formas recebe a lista vazia", async () => {
    cenario.pdv = tela({ itens: CARRINHO });
    const formas = elementos(await abrir()).find((e) => e.type === FormasDePagamento);
    expect(formas?.props.terminais).toEqual([]);
  });

  it.each([
    ["pendente", "aprovação pendente", false],
    ["aprovada", "desconto aprovado", false],
    ["negada", "desconto negado", true],
    [null, null, true],
  ] as const)("desconto com pedido %s: o selo certo, e pedir aprovação só quando não há pedido valendo", async (aprovacao, selo, podePedir) => {
    cenario.pdv = tela({ itens: [aparelho({ aprovacao })] });
    const arvore = await abrir();
    const t = texto(arvore);
    for (const outro of ["aprovação pendente", "desconto aprovado", "desconto negado"]) {
      if (outro === selo) expect(t).toContain(outro);
      else expect(t).not.toContain(outro);
    }
    expect(formularios(arvore, pedirAprovacao).map((f) => f.escondidos)).toEqual(podePedir ? [{ item: ITEM_APARELHO }] : []);
  });

  it("item sem desconto não oferece pedir aprovação", async () => {
    cenario.pdv = tela({ itens: [aparelho({ desconto_centavos: 0, aprovacao: null })] });
    expect(formularios(await abrir(), pedirAprovacao)).toEqual([]);
  });

  it("concluir fica travado sem caixa aberto e enquanto o desconto aguarda aprovação", async () => {
    const concluir = async () => {
      const arvore = await abrir();
      const botoes = elementos(arvore).filter((e) => e.type === BotaoConfirmar);
      expect(botoes).toHaveLength(1);
      return { travado: botoes[0]?.props.disabled, t: texto(arvore) };
    };
    cenario.pdv = tela({ itens: CARRINHO });
    expect(await concluir()).toMatchObject({ travado: false });
    cenario.pdv = tela({ itens: CARRINHO, caixa: null });
    const semCaixa = await concluir();
    expect(semCaixa.travado).toBe(true);
    expect(semCaixa.t).toContain("Abra o caixa para concluir.");
    cenario.pdv = tela({ itens: CARRINHO, venda: { id: VENDA, numero: 43, situacao: "aguardando_aprovacao", pago_pelo_site_centavos: null } });
    const aguardando = await concluir();
    expect(aguardando.travado).toBe(true);
    expect(aguardando.t).toContain("Venda nº 43 Aguardando aprovação de desconto");
  });

  it("o cliente da rede só aparece para quem pode buscar cliente (a permissão veio com a sessão)", async () => {
    cenario.pdv = tela({ itens: CARRINHO });
    expect(elementos(await abrir()).filter((e) => e.type === BuscaDeCliente)).toEqual([]);
    cenario.permissoes = new Set(["venda.registrar", "cliente.buscar"]);
    const buscas = elementos(await abrir()).filter((e) => e.type === BuscaDeCliente);
    expect(buscas.map((e) => e.props.modo)).toEqual(["escolher"]);
  });

  it.each([
    [{ erro: "sem_estoque" }, "Não há quantidade suficiente nesta loja."],
    [{ desconto: "pedir" }, "Esse desconto passa do limite: peça a aprovação do gerente ou do dono."],
    [{ cancelada: "1" }, "Venda cancelada. Os itens voltaram para o estoque da loja."],
    [{ os: "no_carrinho" }, "O conserto da OS entrou no carrinho pelo valor do orçamento aprovado."],
  ])("o aviso da ação que acabou de acontecer (%o)", async (parametros, aviso) => {
    expect(texto(await abrir(parametros))).toContain(aviso);
  });

  it("erro que não é do catálogo de erros da venda não vira aviso", async () => {
    const t = texto(await abrir({ erro: "constructor" }));
    expect(t).toContain("Venda nº 43");
    expect(t).not.toContain("function");
  });
});

describe("a busca de produto dentro da venda", () => {
  it("por nome: acessório com quantidade, aparelho com os IMEIs livres desta loja, preço, saldo livre e foto", async () => {
    const arvore = await abrir({ q: "galaxy" });
    const t = texto(arvore);
    // Em ordem de SKU. O aparelho tem 2 em estoque e 1 reservado nesta loja: 1 livre (o saldo da outra loja não entra).
    expect(t).toContain("Capa Galaxy A15 transparente ACE-0001 · R$ 69,00 · 10 livre(s) aqui Qtd. Adicionar");
    expect(t).toContain("128 GB Azul APA-0001 · R$ 1.299,00 · 1 livre(s) aqui IMEI •••• 700010");
    expect(t.indexOf("ACE-0001 · R$")).toBeLessThan(t.indexOf("APA-0001 · R$"));
    expect(t).not.toContain("700028"); // reservado
    expect(t).not.toContain("700036"); // de outra loja
    expect(t).not.toContain("Nada encontrado");
    const adicionar = formularios(arvore, adicionarItem);
    expect(adicionar.map((f) => ({ ...f.escondidos, chave: "" }))).toEqual([
      { venda: VENDA, variante: V_CAPA, chave: "" },
      { venda: VENDA, variante: V_AZUL, item: S_LIVRE, chave: "" },
    ]);
    for (const f of adicionar) expect(f.escondidos.chave).toMatch(UUID);
    expect(new Set(adicionar.map((f) => f.escondidos.chave)).size).toBe(2);
    // Só a foto em uso é assinada, no depósito fechado dos produtos, por uma hora.
    expect(cenario.assinaturas).toEqual([{ deposito: "produtos", caminhos: ["org/capa/principal.webp"], segundos: 3600 }]);
    expect(elementos(arvore).filter((e) => e.type === FotoAmpliavel).map((e) => e.props)).toEqual([
      { url: "https://fotos.invalid/org/capa/principal.webp?assinada", rotulo: "Capa Galaxy A15 transparente (ACE-0001)", ilustracao: true },
      { url: null, rotulo: "128 GB Azul (APA-0001)", ilustracao: false },
    ]);
  });

  it("IMEI inteiro de aparelho livre desta loja: o botão desse aparelho", async () => {
    const arvore = await abrir({ q: "35 2099 0017 0001 0" });
    const t = texto(arvore);
    expect(t).toContain("128 GB Azul APA-0001 · R$ 1.299,00 · 1 livre(s) aqui IMEI •••• 700010");
    expect(formularios(arvore, adicionarItem).map((f) => ({ ...f.escondidos, chave: "" }))).toEqual([{ venda: VENDA, variante: V_AZUL, item: S_LIVRE, chave: "" }]);
    expect(cenario.assinaturas).toEqual([]);
  });

  it("IMEI secundário inteiro encontra o mesmo aparelho e adiciona a mesma unidade", async () => {
    const item = cenario.tabelas.itens_serializados?.find((i) => i.id === S_LIVRE);
    if (!item) throw new Error("Aparelho fictício ausente");
    item.imei2 = "352099001761499";
    const arvore = await abrir({ q: "352099001761499" });
    expect(formularios(arvore, adicionarItem).map((f) => f.escondidos.item)).toEqual([S_LIVRE]);
  });

  it("IMEI inteiro de aparelho reservado: aparece, mas sem botão", async () => {
    const arvore = await abrir({ q: "352099001700028" });
    const t = texto(arvore);
    expect(t).toContain("128 GB Azul APA-0001");
    expect(t).toContain("Nenhum disponível nesta loja.");
    expect(formularios(arvore, adicionarItem)).toEqual([]);
  });

  it("IMEI inteiro de aparelho de outra loja: nada encontrado, e nenhuma leitura a mais", async () => {
    const arvore = await abrir({ q: "352099001700036" });
    expect(texto(arvore)).toContain("Nada encontrado nesta loja.");
    expect(formularios(arvore, adicionarItem)).toEqual([]);
    expect(rodadas()).toEqual([PRIMEIRA_IDA, ["tabela:itens_serializados"]]);
  });

  it("ICCID inteiro de chip livre: o botão mostra o final do ICCID", async () => {
    const arvore = await abrir({ q: "8955100000000000013" });
    expect(texto(arvore)).toContain("Chip pré-pago CHP-0001 · R$ 10,00 · 1 livre(s) aqui ICCID •••• 000013");
    expect(formularios(arvore, adicionarItem).map((f) => f.escondidos.item)).toEqual([S_CHIP]);
  });

  it("aparelho cuja variação quem pede não lê: a tela abre sem o resultado, sem quebrar", async () => {
    cenario.tabelas.variantes = [];
    const arvore = await abrir({ q: "352099001700010" });
    expect(texto(arvore)).toContain("Venda nº 43");
    expect(formularios(arvore, adicionarItem)).toEqual([]);
  });

  it("nada encontrado: o aviso, sem ler saldo, preço nem foto", async () => {
    const arvore = await abrir({ q: "motorola" });
    expect(texto(arvore)).toContain("Nada encontrado nesta loja.");
    expect(rodadas()).toEqual([[...PRIMEIRA_IDA, ...CATALOGO]]);
  });

  it("variação sem preço nesta loja: aparece, mas não pode ser adicionada", async () => {
    cenario.precos = { [V_AZUL]: 129_900 };
    const arvore = await abrir({ q: "galaxy" });
    expect(texto(arvore)).toContain("Capa Galaxy A15 transparente ACE-0001 · sem preço nesta loja · 10 livre(s) aqui");
    expect(formularios(arvore, adicionarItem).map((f) => f.escondidos.variante)).toEqual([V_AZUL]);
  });

  it("a leitura dos preços falha: página de erro, nunca \"sem preço\" inventado para todos os resultados", async () => {
    cenario.precos = { [V_AZUL]: "falha", [V_CAPA]: 6_900 };
    await expect(abrir({ q: "galaxy" })).rejects.toThrow("Falha ao consultar o serviço (precos)");
  });

  it("o termo perde o que o filtro do banco leria como curinga, e volta para o campo de busca", async () => {
    const arvore = await abrir({ q: "  galaxy%_*(a15),  " });
    const campo = elementos(arvore).find((e) => e.props.name === "q");
    expect(campo?.props.defaultValue).toBe("galaxy a15");
    expect(texto(arvore)).toContain("128 GB Azul APA-0001");
  });
});

describe("falhas: a tela mostra erro, nunca caixa fechado nem carrinho vazio", () => {
  it("a leitura da tela falha: página de erro (não o botão de nova venda por cima de uma venda aberta)", async () => {
    cenario.erroDoPdv = { code: "57014" };
    await expect(abrir()).rejects.toThrow("Falha ao consultar o serviço (pdv_tela)");
  });

  it("a função do banco ainda não existe (migration do lote não aplicada): página de erro", async () => {
    cenario.erroDoPdv = { code: "PGRST202" };
    await expect(abrir()).rejects.toThrow("Falha ao consultar o serviço (pdv_tela)");
  });

  it.each<[string, unknown]>([
    ["nada", null],
    ["objeto vazio", {}],
    ["carrinho sem venda", { caixa: null, venda: null, itens: [item()], terminais: [] }],
    ["valor em texto", tela({ itens: [item({ preco_unitario_centavos: "6900" })] })],
  ])("resposta da tela fora do combinado (%s): página de erro", async (_, resposta) => {
    cenario.pdv = resposta;
    await expect(abrir()).rejects.toThrow("Falha ao consultar o serviço (pdv_tela)");
  });

  it("a soltura das reservas do site falha: a tela abre mesmo assim, e a falha fica registrada só com o código", async () => {
    cenario.soltura = { data: null, error: { code: "57014" } };
    cenario.pdv = tela({ itens: CARRINHO });
    expect(texto(await abrir())).toContain("Total R$ 1.717,00");
    expect(vi.mocked(console.error).mock.calls).toEqual([["loja: falha ao soltar as reservas do site vencidas", { codigo: "57014" }]]);
  });

  it("quem não vende nesta loja segundo o banco (42501 na soltura): sem registro de erro", async () => {
    cenario.soltura = { data: null, error: { code: "42501" } };
    await abrir();
    expect(vi.mocked(console.error).mock.calls).toEqual([]);
  });

  it.each([
    ["produtos", "galaxy", "busca"],
    ["itens_serializados", "352099001700010", "busca"],
    ["estoque_saldos", "352099001700010", "vender_detalhes"],
    ["fotos_produto", "352099001700010", "fotos"],
  ])("a leitura de %s falha durante a busca: página de erro", async (tabela, busca, etapa) => {
    cenario.erros = { [tabela]: { code: "57014" } };
    await expect(abrir({ q: busca })).rejects.toThrow(`Falha ao consultar o serviço (${etapa})`);
  });
});

// PAY-015a (25/11/2026; a D-062): o Pix pela Asaas no caixa: o cartão com o QR Code, o que já foi pago entra no total e a
// conclusão espera o QR que ainda não foi pago. As regras do banco estão em packages/banco/src/pix-da-asaas-no-caixa.test.ts.
describe("PAY-015a: o Pix pela Asaas no caixa", () => {
  const PIX_ESPERA = id("9a01");
  const PIX_PAGO = id("9a02");
  const IMAGEM = "iVBORw0KGgo".padEnd(200, "A");
  const COPIA = "00020126580014br.gov.bcb.pix-ficticio-0001";
  const pix = (mudar: Linha) => ({ id: PIX_ESPERA, numero: 1, valor_centavos: 2_000, situacao: "aguardando", copia_e_cola: COPIA, imagem: IMAGEM,
    expira_em: "2026-11-25T18:30:00Z", pago_em: null, ultima_falha: null, divergencia: null, ...mudar });

  it("ligado: o QR que espera mostra a imagem, o copia e cola e o cancelar; o pedido de outro QR sugere o que falta; concluir fica travado; numa rodada só", async () => {
    cenario.pdv = tela({ itens: [item({ quantidade: 1 })] });
    cenario.pix = { data: { ligado: true, venda: VENDA, pix: [pix({})] }, error: null };
    const arvore = await abrir();
    const t = texto(arvore);
    expect(rodadas()).toEqual([PRIMEIRA_IDA]);
    expect(t).toContain("Pix pela Asaas");
    expect(t).toContain("Esperando o pagamento");
    expect(elementos(arvore).find((e) => e.type === "img")?.props.src).toBe(`data:image/png;base64,${IMAGEM}`);
    expect(elementos(arvore).find((e) => e.type === "textarea")?.props.defaultValue).toBe(COPIA);
    expect(formularios(arvore, cancelarPixAsaas).map((f) => f.escondidos)).toEqual([{ pix: PIX_ESPERA }]);
    const [pedir] = formularios(arvore, pedirPixAsaas);
    expect(pedir?.escondidos.venda).toBe(VENDA);
    expect(String(pedir?.escondidos.chave)).toMatch(UUID);
    // 69,00 da capa menos os 20,00 do QR que espera: o novo QR sugere 49,00.
    expect(pedir?.elementos.find((e) => e.type === "input" && e.props.name === "valor")?.props.defaultValue).toBe("49,00");
    expect(elementos(arvore).find((e) => e.type === BotaoConfirmar)?.props.disabled).toBe(true);
    expect(t).toContain("Há um Pix pela Asaas esperando: espere o pagamento ou cancele o QR Code para concluir.");
  });

  it("pago: o total desconta o Pix, as formas recebem só o resto e o pago, e a venda não se cancela por aqui", async () => {
    cenario.pdv = tela({ itens: [item({ quantidade: 1 })] });
    cenario.pix = { data: { ligado: true, venda: VENDA, pix: [pix({ id: PIX_PAGO, valor_centavos: 5_000, situacao: "pago", copia_e_cola: null, imagem: null, pago_em: "2026-11-25T17:05:00Z" })] }, error: null };
    const arvore = await abrir();
    const t = texto(arvore);
    expect(t).toContain("Pago no Pix pela Asaas");
    expect(t).toContain("Venda com Pix pela Asaas pago: esta venda não se cancela por aqui.");
    expect(formularios(arvore, cancelarVenda)).toEqual([]);
    expect(formularios(arvore, cancelarPixAsaas)).toEqual([]);
    expect(elementos(arvore).find((e) => e.type === FormasDePagamento)?.props).toMatchObject({ total: 1_900, pagoNoPix: 5_000 });
    expect(elementos(arvore).find((e) => e.type === BotaoConfirmar)?.props.disabled).toBe(false);
  });

  it("desligado e sem Pix: o cartão não aparece; a leitura que falha: o aviso; o Pix lido de outra venda não entra", async () => {
    cenario.pdv = tela({ itens: [item({ quantidade: 1 })] });
    expect(formularios(await abrir(), pedirPixAsaas)).toEqual([]);
    cenario.pix = { data: null, error: { code: "57014" } };
    expect(texto(await abrir())).toContain("Não deu para ler o Pix da Asaas agora.");
    cenario.pix = { data: { ligado: true, venda: id("d999"), pix: [pix({ id: PIX_PAGO, situacao: "pago", valor_centavos: 5_000 })] }, error: null };
    const outra = await abrir();
    expect(texto(outra)).not.toContain("Pago no Pix pela Asaas");
    expect(elementos(outra).find((e) => e.type === FormasDePagamento)?.props).toMatchObject({ total: 6_900, pagoNoPix: 0 });
  });
});

// PAY-015b (25/11/2026; a D-062): o cartão pela Asaas no caixa: o cartão com o QR Code do link, o pago entra no total e a
// conclusão espera o link que ainda não foi pago. As regras do banco estão em packages/banco/src/cartao-da-asaas-no-caixa.test.ts.
describe("PAY-015b: o cartão pela Asaas no caixa", () => {
  const CARTAO_ESPERA = id("9b01");
  const CARTAO_PAGO = id("9b02");
  const LINK = "https://sandbox.asaas.invalid/c/lnk_ficticio_1";
  const cartao = (mudar: Linha) => ({ id: CARTAO_ESPERA, numero: 1, valor_centavos: 2_000, situacao: "aguardando", link_url: LINK,
    expira_em: "2026-11-25T18:30:00Z", pago_em: null, cartao_final: null, cartao_bandeira: null, ultima_falha: null, divergencia: null, ...mudar });

  it("ligado: o link que espera mostra o QR Code do link, o botão de abrir e o cancelar; o novo pedido desconta o Pix e o cartão que esperam; concluir fica travado", async () => {
    cenario.pdv = tela({ itens: [item({ quantidade: 1 })] });
    cenario.cartao = { data: { ligado: true, venda: VENDA, cartoes: [cartao({})] }, error: null };
    cenario.pix = { data: { ligado: true, venda: VENDA, pix: [{ id: id("9a01"), numero: 1, valor_centavos: 1_000, situacao: "criando", copia_e_cola: null, imagem: null,
      expira_em: null, pago_em: null, ultima_falha: null, divergencia: null }] }, error: null };
    const arvore = await abrir();
    const t = texto(arvore);
    expect(rodadas()).toEqual([PRIMEIRA_IDA]);
    expect(t).toContain("Cartão pela Asaas");
    expect(elementos(arvore).find((e) => e.type === QrCode)?.props).toMatchObject({ texto: LINK, rotulo: expect.stringMatching(/^QR Code do pagamento no cartão de R\$\s20,00$/) });
    expect(elementos(arvore).find((e) => e.type === "a" && e.props.href === LINK)?.props).toMatchObject({ target: "_blank", rel: "noreferrer noopener" });
    expect(formularios(arvore, cancelarCartaoAsaas).map((f) => f.escondidos)).toEqual([{ cartao: CARTAO_ESPERA }]);
    const [pedir] = formularios(arvore, pedirCartaoAsaas);
    expect(pedir?.escondidos.venda).toBe(VENDA);
    // 69,00 da capa menos os 20,00 do link e os 10,00 do QR que esperam: o novo pedido sugere 39,00 (nos dois).
    expect(pedir?.elementos.find((e) => e.type === "input" && e.props.name === "valor")?.props.defaultValue).toBe("39,00");
    expect(formularios(arvore, pedirPixAsaas)[0]?.elementos.find((e) => e.type === "input" && e.props.name === "valor")?.props.defaultValue).toBe("39,00");
    expect(elementos(arvore).find((e) => e.type === BotaoConfirmar)?.props.disabled).toBe(true);
    expect(t).toContain("Há um cartão pela Asaas esperando: espere o pagamento ou cancele o link para concluir.");
  });

  it("pago: o total desconta o cartão (com a bandeira e o final), as formas recebem só o resto e o pago, e a venda não se cancela por aqui", async () => {
    cenario.pdv = tela({ itens: [item({ quantidade: 1 })] });
    cenario.cartao = { data: { ligado: true, venda: VENDA, cartoes: [cartao({ id: CARTAO_PAGO, valor_centavos: 5_000, situacao: "pago", link_url: null,
      pago_em: "2026-11-25T17:05:00Z", cartao_final: "8829", cartao_bandeira: "VISA" })] }, error: null };
    const arvore = await abrir();
    const t = texto(arvore);
    expect(t).toContain("Pago no cartão pela Asaas");
    expect(t).toContain("VISA final 8829");
    expect(t).toContain("Venda com cartão pela Asaas pago: esta venda não se cancela por aqui.");
    expect(formularios(arvore, cancelarVenda)).toEqual([]);
    expect(formularios(arvore, cancelarCartaoAsaas)).toEqual([]);
    expect(elementos(arvore).find((e) => e.type === QrCode)).toBeUndefined();
    expect(elementos(arvore).find((e) => e.type === FormasDePagamento)?.props).toMatchObject({ total: 1_900, pagoNoCartao: 5_000, pagoNoPix: 0 });
    expect(elementos(arvore).find((e) => e.type === BotaoConfirmar)?.props.disabled).toBe(false);
  });

  it("desligado e sem cartão: o cartão não aparece; a leitura que falha: o aviso; o link de outra venda não entra; o link fora da forma não vira QR", async () => {
    cenario.pdv = tela({ itens: [item({ quantidade: 1 })] });
    expect(formularios(await abrir(), pedirCartaoAsaas)).toEqual([]);
    cenario.cartao = { data: null, error: { code: "57014" } };
    expect(texto(await abrir())).toContain("Não deu para ler o cartão da Asaas agora.");
    cenario.cartao = { data: { ligado: true, venda: id("d999"), cartoes: [cartao({ id: CARTAO_PAGO, situacao: "pago", valor_centavos: 5_000 })] }, error: null };
    const outra = await abrir();
    expect(texto(outra)).not.toContain("Pago no cartão pela Asaas");
    expect(elementos(outra).find((e) => e.type === FormasDePagamento)?.props).toMatchObject({ total: 6_900, pagoNoCartao: 0 });
    cenario.cartao = { data: { ligado: true, venda: VENDA, cartoes: [cartao({ link_url: "javascript:alert(1)" })] }, error: null };
    expect(elementos(await abrir()).find((e) => e.type === QrCode)).toBeUndefined();
  });
});

