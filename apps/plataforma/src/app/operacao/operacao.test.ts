// /operacao (lote Q1: ORA-QUAL-006 em parte) com a sessão, o menu e o Supabase SIMULADOS: nenhuma credencial, dados
// fictícios. Quem vê, o que está parado (as mais antigas primeiro) e a falha de uma fila sem derrubar as outras.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
type Resposta = { data: unknown; count: number | null; error: { code: string } | null };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  respostas: {} as Record<string, Resposta>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const consulta = (tabela: string) => {
  const c = {
    select: () => c, eq: () => c, in: () => c, is: () => c, lt: () => c, order: () => c, limit: () => c,
    then: (resolver: (r: Resposta) => unknown) => Promise.resolve(cenario.respostas[tabela] ?? { data: [], count: 0, error: null }).then(resolver),
  };
  return c;
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    // As permissões do menu chegam com a sessão (public.molde_da_sessao, lote VEL-a).
    molde: { permissoes: cenario.permissoes, nome: "Ana (fictícia)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    supabase: { from: consulta },
  }),
}));
vi.mock("../../componentes/MoldeReal", () => ({
  MoldeReal: ({ children }: { children: unknown }) => children,
}));

import SaudeDaOperacao from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && ["MoldeReal", "ConteudoDaOperacao"].includes(v.type.name)) return texto((v.type as (p: unknown) => unknown)(v.props));
    const p = v.props;
    return [p.titulo, p.subtitulo, p.rotulo, p.valor, p.detalhe, p.children, p.dados].map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async () => texto(await SaudeDaOperacao() as ReactElement).replace(/\s+/g, " ");
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const diasAtras = (n: number) => new Date(Date.parse(`${hoje}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.permissoes = new Set(["venda.ver_todas", "nota.aprovar", "caixa.conferir", "connect.gerir"]);
  cenario.respostas = {};
});

describe("saúde da operação (Q1)", () => {
  it("o dono vê o que está parado nas filas que decide, as mais antigas primeiro, com quantos e há quanto tempo", async () => {
    cenario.respostas = {
      notas_pedidos: { data: [{ venda_concluida_em: `${diasAtras(5)}T15:00:00Z` }], count: 7, error: null },
      caixas: { data: [{ fechado_em: `${diasAtras(1)}T22:00:00Z` }], count: 2, error: null },
      connect_operacoes: { data: [], count: 0, error: null },
    };
    const t = await tela();
    for (const trecho of ["Saúde da operação", "Itens esperando", "9", "em 2 de", "O mais antigo", "há 5 dias", "Notas na fila", "7", "Caixas para conferir", "há 1 dia",
      "Sem nada esperando: Notas a enviar pelo WhatsApp · Ora Connect em andamento · Saídas do caixa · Estornos a confirmar · Itens a conferir",
      "Erros do sistema e tempo de resposta ainda não aparecem aqui"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t.indexOf("Notas na fila")).toBeLessThan(t.indexOf("Caixas para conferir"));
  });

  it("sem nada parado: zero com a leitura funcionando; falha de uma fila aparece e as outras seguem", async () => {
    let t = await tela();
    expect(t).toContain("Nada parado nas filas que você acompanha");
    cenario.respostas = { notas_pedidos: { data: null, count: null, error: { code: "57014" } }, caixas: { data: [{ fechado_em: `${hoje}T10:00:00Z` }], count: 1, error: null } };
    t = await tela();
    expect(t).toContain("Não deu para ler uma fila agora: Notas na fila");
    expect(t).toContain("Caixas para conferir");
  });

  it("quem não é da gestão não vê a tela", async () => {
    cenario.permissoes = new Set(["venda.registrar"]);
    expect(await tela()).toContain("A saúde da operação é do dono e da gerência.");
  });
});
