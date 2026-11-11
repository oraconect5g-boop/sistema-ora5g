// PDV, lote L6a, com a sessão e o Supabase SIMULADOS (dados fictícios): pendências da venda (ORA-POS-009) e o
// pedido de nota no nome do cliente da venda (ORA-POS-011). As regras do banco estão em packages/banco/src/pdv-l6.test.ts.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const EU = "00000000-0000-4000-8000-0000000000ab";
const VENDA = "00000000-0000-4000-9000-0000000000b1";
const CLIENTE = "00000000-0000-4000-9000-0000000000b2";

const cenario = vi.hoisted(() => ({
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
class Consulta {
  linhas: Record<string, unknown>[];
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  order() { return this; }
  limit() { return this; }
  then(resolver: (r: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  usuario: { id: EU },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-11T23:00:00Z" },
  supabase: {
    from: (nome: string) => new Consulta(nome),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { erroDasNotas } from "../../lib/notas/regras";
import { pedirNota } from "../notas/acoes";
import { Pendencias } from "./Pendencias";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) return Object.values(v.props).map(texto).join(" ");
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  cenario.chamadas = [];
  cenario.respostas = {};
  cenario.tabelas = {};
});

describe("pendências da venda (ORA-POS-009)", () => {
  it("sem nada pendente, não aparece", async () => {
    expect(await Pendencias({ sessao: sessaoFicticia as never, unidade: LOJA })).toBeNull();
  });

  it("venda em aberto, aprovação, nota a corrigir, estorno e retorno, da mais antiga para a mais nova, cada uma com o caminho para resolver", async () => {
    cenario.tabelas = {
      vendas: [
        { id: "v1", numero: 10, situacao: "rascunho", criado_em: "2026-11-11T10:00:00Z", vendedor_id: EU, unidade_id: LOJA },
        { id: "v2", numero: 11, situacao: "aguardando_aprovacao", criado_em: "2026-11-11T09:00:00Z", vendedor_id: EU, unidade_id: LOJA },
      ],
      notas_pedidos: [{ id: "n1", venda_id: VENDA, situacao: "correcao_solicitada", criado_em: "2026-11-10T12:00:00Z", unidade_id: LOJA }],
      estornos_externos: [{ id: "e1", numero: 3, venda_id: VENDA, meio: "pix_direto", valor_centavos: "7900", solicitado_em: "2026-11-10T13:00:00Z", situacao: "pendente", unidade_id: LOJA }],
      venda_retornos: [{ id: "r1", venda_id: VENDA, solicitado_em: "2026-11-10T14:00:00Z", situacao: "pendente", unidade_id: LOJA }],
    };
    const t = texto(await Pendencias({ sessao: sessaoFicticia as never, unidade: LOJA }) as ReactElement).replace(/\s+/g, " ");
    expect(t).toContain("Pendências (5)");
    const ordem = ["Nota fiscal com correção pedida", "Estorno nº 3 a confirmar", "Item da venda cancelada a conferir", "Venda nº 11 esperando aprovação", "Venda nº 10 em aberto"];
    const posicoes = ordem.map((trecho) => t.indexOf(trecho));
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    expect(t).toContain("/vender");
    expect(t).toContain(`/vendas/${VENDA}`);
  });
});

describe("nota no nome do cliente da venda (ORA-POS-011)", () => {
  it("marcado, manda só o cliente (o banco copia nome e documento); sem marcar, manda o digitado", async () => {
    expect(await destinoDe(pedirNota(formulario({ venda: VENDA, chave: "00000000-0000-4000-8000-000000000003", usar_cliente: "sim", cliente: CLIENTE, nome: "Ignorado", documento: "123" }))))
      .toBe(`/vendas/${VENDA}?nota=pedida`);
    expect(cenario.chamadas[0]?.argumentos).toMatchObject({ p_venda: VENDA, p_destinatario: { cliente: CLIENTE } });
    await destinoDe(pedirNota(formulario({ venda: VENDA, chave: "00000000-0000-4000-8000-000000000004", nome: "Comprador Avulso" })));
    expect(cenario.chamadas[1]?.argumentos).toMatchObject({ p_destinatario: { nome: "Comprador Avulso" } });
    cenario.respostas.notas_solicitar = { data: null, error: { code: "22023", message: "O cliente não tem CPF/CNPJ no cadastro: corrija o cadastro ou informe o documento aqui" } };
    expect(await destinoDe(pedirNota(formulario({ venda: VENDA, usar_cliente: "sim", cliente: CLIENTE })))).toBe(`/vendas/${VENDA}?erro_nota=cliente_sem_documento`);
    expect(erroDasNotas({ code: "22023", message: "CPF ou CNPJ inválido" })).toBe("dados");
  });
});
