// /pagamentos/financeiras (lote L7b) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados fictícios.
// Quem vê, o que a tela mostra em cada estado (sem a função no banco, falha, vazio) e o que as ações mandam ao
// banco. As regras do banco estão em packages/banco/src/financeiras-a-receber.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const CONTA = "00000000-0000-4000-9000-0000000000a1";
const VENDA = "00000000-0000-4000-9000-0000000000b1";
const cenario = vi.hoisted(() => ({
  pode: true,
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, { data: unknown; error: null | { code: string; message?: string } }>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-13T23:00:00Z" },
  supabase: {
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      if (nome === "tem_permissao") return { data: cenario.pode, error: null };
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
    },
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { desfazerRecebimento, receberDaFinanceira } from "./acoes";
import Financeiras from "./financeiras/page";

type Linha = Record<string, unknown>;
function visivel(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "function" && (tipo === "EstadoDoPainel" || tipo === "ConteudoFinanceiras")) andar((x.type as (p: unknown) => unknown)(x.props));
      else if (typeof x.type === "string") andar(x.props.children);
      else andar(tipo === "MoldeReal" ? x.props.children : [x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const formularios = (v: unknown): Linha[] => {
  const achados: Linha[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Linha>(x)) {
      if (x.type === "form") achados.push(x.props);
      if (typeof x.type === "function" && x.type.name === "ConteudoFinanceiras") andar((x.type as (p: unknown) => unknown)(x.props));
      else andar(Object.values(x.props));
    }
  };
  andar(v);
  return achados;
};
const pagina = async (parametros: Record<string, string> = {}) => (await Financeiras({ searchParams: Promise.resolve(parametros) })) as ReactElement;
const LISTA = {
  por_devedor: [
    { devedor: "aiva", abertas: 1, valor_aberto: 129_900, mais_antiga_dias: 35, recebidas: 0, valor_recebido: 0, taxa_observada: 0 },
    { devedor: "payjoy", abertas: 0, valor_aberto: 0, mais_antiga_dias: null, recebidas: 1, valor_recebido: 125_000, taxa_observada: 4_900 },
  ],
  contas: [
    { id: CONTA, venda_id: VENDA, venda_numero: 42, concluida_em: "2026-10-09T15:00:00Z", devedor: "aiva", valor: 129_900, situacao: "aberta", dias: 35, recebido_em: null, valor_recebido: null, referencia: null },
    { id: VENDA, venda_id: CONTA, venda_numero: 40, concluida_em: "2026-11-01T15:00:00Z", devedor: "payjoy", valor: 129_900, situacao: "recebida", dias: 12, recebido_em: "2026-11-12", valor_recebido: 125_000, referencia: "PJ-1" },
  ],
};
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
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.assign(cenario, { pode: true, chamadas: [], respostas: { financeiras_a_receber: { data: LISTA, error: null } } });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("/pagamentos/financeiras (L7b)", () => {
  it("a gerência vê o que cada financeira deve e o que caiu, com a idade de cada conta; abertas com o formulário do repasse, recebidas com o desfazer", async () => {
    const tela = await pagina();
    const t = visivel(tela);
    expect(cenario.chamadas).toEqual([{ nome: "financeiras_a_receber", argumentos: {} }]);
    expect(t).toContain("Aiva R$ 1.299,00 1 venda em aberto · a mais antiga há 35 dias");
    expect(t).toContain("PayJoy R$ 0,00 nada em aberto Recebido em 60 dias: R$ 1.250,00 (1 venda) · taxa observada R$ 49,00");
    expect(t).toContain("Venda nº 42");
    expect(t).toContain("há 35 dias");
    expect(t).toContain("Caiu em 12/11/2026 · recebido R$ 1.250,00 · taxa R$ 49,00 · PJ-1");
    const forms = formularios(tela);
    expect(forms.map((f) => (f.action as { name: string }).name)).toEqual(["receberDaFinanceira", "desfazerRecebimento"]);
  });

  it("sem a função no banco, em falha ou sem nada: o cartão diz por quê, sem número inventado", async () => {
    cenario.respostas = {};
    expect(visivel(await pagina())).toContain("Indisponível neste ambiente");
    cenario.respostas = { financeiras_a_receber: { data: null, error: { code: "57014" } } };
    expect(visivel(await pagina())).toContain("Não foi possível ler agora");
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["pagamentos: falha ao consultar financeiras_a_receber", { codigo: "57014" }]);
    cenario.respostas = { financeiras_a_receber: { data: { por_devedor: [], contas: [] }, error: null } };
    expect(visivel(await pagina())).toContain("Nada a receber das financeiras");
    cenario.respostas = { financeiras_a_receber: { data: { ...LISTA, contas: [{ ...LISTA.contas[0], devedor: "banco" }] }, error: null } };
    expect(visivel(await pagina())).toContain("Não foi possível ler agora");
  });

  it("quem não concilia na loja não chega à lista", async () => {
    cenario.pode = false;
    const t = visivel(await pagina());
    expect(t).toContain("Os valores a receber das financeiras são da gerência da loja.");
    expect(cenario.chamadas).toEqual([]);
  });

  it("as ações: o repasse vai ao banco em centavos; formulário errado volta antes; o erro do banco vira a mensagem; desfazer pede motivo", async () => {
    cenario.respostas.financeira_receber = { data: true, error: null };
    expect(await destinoDe(receberDaFinanceira(formulario({ conta: CONTA, referencia: "AV lote 7", recebido: "1.250,00", data: "2026-11-12" })))).toBe("/pagamentos/financeiras?ok=recebido");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "financeira_receber", argumentos: { p_conta: CONTA, p_referencia: "AV lote 7", p_valor_recebido: 125_000, p_recebido_em: "2026-11-12" } });
    cenario.respostas.financeira_receber = { data: false, error: null };
    expect(await destinoDe(receberDaFinanceira(formulario({ conta: CONTA, referencia: "AV lote 7", recebido: "1.250,00", data: "2026-11-12" })))).toBe("/pagamentos/financeiras?ok=sem_mudanca");
    const antes = cenario.chamadas.length;
    expect(await destinoDe(receberDaFinanceira(formulario({ conta: CONTA, referencia: "x", recebido: "1", data: "2026-11-12" })))).toBe("/pagamentos/financeiras?erro=referencia");
    expect(cenario.chamadas).toHaveLength(antes);
    cenario.respostas.financeira_receber = { data: null, error: { code: "OR030", message: "Recebimento já registrado" } };
    expect(await destinoDe(receberDaFinanceira(formulario({ conta: CONTA, referencia: "AV lote 8", recebido: "1", data: "2026-11-12" })))).toBe("/pagamentos/financeiras?erro=ja_recebido");
    expect(await destinoDe(desfazerRecebimento(formulario({ conta: CONTA, motivo: "ok" })))).toBe("/pagamentos/financeiras?erro=motivo");
    cenario.respostas.financeira_desfazer_recebimento = { data: true, error: null };
    expect(await destinoDe(desfazerRecebimento(formulario({ conta: CONTA, motivo: "Valor digitado errado" })))).toBe("/pagamentos/financeiras?ok=desfeito");
    expect(cenario.chamadas.at(-1)).toEqual({ nome: "financeira_desfazer_recebimento", argumentos: { p_conta: CONTA, p_motivo: "Valor digitado errado" } });
  });
});
