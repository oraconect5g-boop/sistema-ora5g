// /pagamentos/recebiveis (lote L8e: ORA-FIN-005) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados
// fictícios. Quem vê, o que a tela mostra em cada estado (sem a função no banco, sem permissão, vazio, com números)
// e o que vai ao banco. As regras do banco estão em packages/banco/src/recebiveis.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const VENDA = "00000000-0000-4000-9000-0000000000b1";
const PAG = "00000000-0000-4000-9000-0000000000b2";
const cenario = vi.hoisted(() => ({
  pode: true,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
  supabase: {
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.pode, error: null };
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import Recebiveis from "./recebiveis/page";

type Linha = Record<string, unknown>;
// Componentes da tela que são executados para o texto aparecer (os outros são lidos pelos props).
const EXECUTAR = new Set(["EstadoDoPainel", "ConteudoRecebiveis", "PainelDosRecebiveis", "Pendencias", "FiltroSegmentado"]);
function visivel(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "function" && EXECUTAR.has(tipo)) andar((x.type as (p: unknown) => unknown)(x.props));
      else if (typeof x.type === "string") andar(x.props.children);
      else if (tipo === "MoldeReal") andar(x.props.children);
      else andar([x.props.titulo, x.props.subtitulo, x.props.rotulo, x.props.valor, x.props.detalhe, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const tela = async (parametros: Record<string, string> = {}) => visivel(await Recebiveis({ searchParams: Promise.resolve(parametros) }) as ReactElement);

const linha = (extra: Linha) => ({
  unidade: LOJA, adquirente: "picpay", a_receber: 0, valor_a_receber: 0, ate_7_dias: 0, de_8_a_30_dias: 0, mais_de_30_dias: 0, mais_antiga_dias: null,
  recebidos: 0, recebido_bruto: 0, recebido_liquido: 0, estornos_a_confirmar: 0, valor_estornos_a_confirmar: 0, ...extra,
});
const comNumeros = () => ({
  hoje: "2026-11-14", dias: 30, unidade: null,
  lojas: [{ id: LOJA, nome: "Santa Cândida (teste)" }, { id: OUTRA, nome: "Centro (teste)" }],
  linhas: [
    linha({ a_receber: 2, valor_a_receber: 15_800, ate_7_dias: 7_900, mais_de_30_dias: 7_900, mais_antiga_dias: 40, estornos_a_confirmar: 1, valor_estornos_a_confirmar: 7_900 }),
    linha({ adquirente: "pagbank", recebidos: 1, recebido_bruto: 7_900, recebido_liquido: 7_600 }),
    linha({ unidade: OUTRA, adquirente: "aiva", a_receber: 1, valor_a_receber: 129_900, de_8_a_30_dias: 129_900, mais_antiga_dias: 12 }),
  ],
  total_a_receber: { quantidade: 3, valor: 145_700 },
  mais_antigos: [{ tipo: "pagamento", id: PAG, venda_id: VENDA, venda_numero: 12, unidade: LOJA, adquirente: "picpay", valor: 7_900, dias: 40, terminal: "Balcão" }],
  pendencias: {
    sem_maquininha: { quantidade: 0, valor: 0 }, entradas_na_maquininha: { quantidade: 1, valor: 20_000 }, financeira_de_venda_cancelada: { quantidade: 0, valor: 0 },
  },
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.pode = true;
  cenario.chamadas = [];
  cenario.respostas = {};
});
afterEach(() => { vi.restoreAllMocks(); });

describe("/pagamentos/recebiveis (L8e)", () => {
  it("só quem concilia a loja; sem a função no banco, diz que falta a leitura e não mostra número", async () => {
    cenario.pode = false;
    expect(await tela()).toContain("Os recebíveis são de quem concilia os pagamentos da loja (dono e gerente).");
    expect(cenario.chamadas).toEqual([]);
    cenario.pode = true;
    const t = await tela();
    expect(t).toContain("a leitura dos recebíveis por loja e adquirente (migration recebiveis_painel)");
    expect(t).not.toContain("R$");
    expect(cenario.chamadas).toEqual([{ nome: "recebiveis_painel", argumentos: { p_dias: 30 } }]);
  });

  it("loja fora do alcance vem recusada pelo banco: a tela diz que não tem permissão; o filtro vai ao banco", async () => {
    cenario.respostas.recebiveis_painel = { data: null, error: { code: "42501" } };
    expect(await tela({ loja: OUTRA, dias: "90" })).toContain("o gerente vê só a loja dele");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "recebiveis_painel", argumentos: { p_unidade: OUTRA, p_dias: 90 } });
  });

  it("com números: os quatro indicadores, a idade, a tabela por loja, as pendências abertas e os mais antigos", async () => {
    cenario.respostas.recebiveis_painel = { data: comNumeros(), error: null };
    const t = await tela();
    for (const trecho of [
      "A receber: maquininhas e Pix", "R$ 158,00", "2 pagamentos sem conciliar · o mais antigo há 40 dias",
      "A receber: financeiras", "R$ 1.299,00", "1 venda · a mais antiga há 12 dias",
      "Caiu na conta (30 dias)", "R$ 76,00", "bruto R$ 79,00", "Diferença observada (30 dias)", "R$ 3,00", "não é a taxa do contrato",
      "Idade do que falta receber", "Por loja e por quem deve", "Santa Cândida (teste)", "Centro (teste)", "PicPay", "Aiva",
      "Pendências do financeiro", "Estornos de cartão e Pix a confirmar", "Entradas de financiamento pagas no cartão ou no Pix",
      "Os mais antigos a receber", "Venda nº 12", "maquininha Balcão", "Todas as lojas", "90 dias",
    ]) expect(t, trecho).toContain(trecho);
    // Pendência sem nada não aparece.
    expect(t).not.toContain("sem a maquininha informada");
    expect(t).not.toContain("Repasse de financeira de venda cancelada");
  });

  it("vazio de verdade: a leitura funcionou e não há nada a receber nem recebido", async () => {
    cenario.respostas.recebiveis_painel = {
      data: { ...comNumeros(), lojas: [{ id: LOJA, nome: "Santa Cândida (teste)" }], linhas: [], total_a_receber: { quantidade: 0, valor: 0 }, mais_antigos: [],
        pendencias: { sem_maquininha: { quantidade: 0, valor: 0 }, entradas_na_maquininha: { quantidade: 0, valor: 0 }, financeira_de_venda_cancelada: { quantidade: 0, valor: 0 } } },
      error: null,
    };
    const t = await tela();
    expect(t).toContain("Nada a receber nem recebido");
    expect(t).not.toContain("Todas as lojas"); // uma loja só: sem o filtro de lojas
  });

  it("resposta que não fecha vira falha de leitura, com o tentar de novo", async () => {
    cenario.respostas.recebiveis_painel = { data: { ...comNumeros(), total_a_receber: { quantidade: 1, valor: 1 } }, error: null };
    const t = await tela();
    expect(t).toContain("falha de leitura não vira zero");
    expect(t).not.toContain("R$ 158,00");
  });
});
