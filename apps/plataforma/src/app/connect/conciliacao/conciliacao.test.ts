// A tela da conciliação com a Nogle (lote CONNECT-c; ORA-CONNECT-009) com a sessão e o Supabase SIMULADOS: nenhuma
// credencial, números fictícios. As regras do banco estão em packages/banco/src/connect-conciliacao.test.ts; a leitura dos
// relatórios, em packages/dominio/src/nogle.test.ts e apps/worker/src/connect.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const C1 = "00000000-0000-4000-9000-00000000c001";
const C2 = "00000000-0000-4000-9000-00000000c002";
type Resposta = { data: unknown; error: null | { code: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  falha: "" as string,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  nome: string;
  constructor(nome: string, linhas: Record<string, unknown>[]) { this.nome = nome; this.linhas = [...linhas]; }
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  eq(campo: string, valor: unknown) { this.linhas = this.linhas.filter((l) => !(campo in l) || l[campo] === valor); return this; }
  neq(campo: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[campo] !== valor); return this; }
  then(resolver: (r: Resposta) => unknown) {
    return Promise.resolve(cenario.falha === this.nome ? { data: null, error: { code: "PGRST000" } } : { data: this.linhas, error: null }).then(resolver);
  }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "loja", unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-18T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Gerente (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: { from: (nome: string) => new Consulta(nome, cenario.tabelas[nome] ?? []) },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error { constructor(m: string) { super(`falha: ${m}`); } },
  obterSessao: async () => sessaoFicticia,
}));

import ConciliacaoDaNogle from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "")) {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const abrir = async (busca: Record<string, string> = {}) => texto(await ConciliacaoDaNogle({ searchParams: Promise.resolve(busca) } as never)).replace(/\s+/g, " ");

beforeEach(() => {
  cenario.permissoes = new Set(["connect.gerir"]);
  cenario.falha = "";
  cenario.tabelas = {
    connect_conciliacoes: [
      { id: C2, numero: 2, relatorio: "recargas", de: "2026-11-11", ate: "2026-11-17", recebida_em: "2026-11-18T09:00:00Z",
        totais: { linhas: 3, conferidas: 1, valor_diferente: 1, so_na_nogle: 1, sem_identificacao: 0, so_aqui: 1 } },
      { id: C1, numero: 1, relatorio: "ativacoes", de: "2026-11-11", ate: "2026-11-17", recebida_em: "2026-11-18T08:00:00Z", totais: { linhas: 0 } },
    ],
    connect_conciliacao_linhas: [
      { conciliacao_id: C2, ordem: 1, linha: "51955556666", iccid: null, dia: "2026-11-15", plano: "7 GB", valor_centavos: 2990, resultado: "conferida", operacao_id: "op1" },
      { conciliacao_id: C2, ordem: 2, linha: "51955557777", iccid: null, dia: "2026-11-15", plano: "7 GB", valor_centavos: 3990, resultado: "valor_diferente", operacao_id: "op2" },
      { conciliacao_id: C2, ordem: 3, linha: "51955558888", iccid: null, dia: "2026-11-16", plano: null, valor_centavos: null, resultado: "so_na_nogle", operacao_id: null },
    ],
    connect_conciliacao_so_aqui: [
      { conciliacao_id: C2, operacao_id: "op9", connect_operacoes: { numero: 41, tipo: "recarga", linha: "51955559999", numero_ativado: null, iccid: null, concluida_em: "2026-11-12T15:00:00Z", valor_face_centavos: 2990 } },
    ],
  };
});

describe("a conciliação com a Nogle (CONNECT-c)", () => {
  it("abre na mais recente: os totais, o que não fecha (sem as conferidas) e só o final da linha", async () => {
    const tela = await abrir();
    for (const trecho of ["Conciliação com a Nogle", "Nº 2 · Recargas · 11/11/2026 a 17/11/2026", "Nº 1 · Ativações", "3 linhas no relatório da Nogle",
      "Conferidas", "Com valor diferente", "Só na Nogle", "Só na Ora", "Linha 2 do relatório · 15/11/2026 · linha final 7777", "R$ 39,90",
      "Linha 3 do relatório · 16/11/2026 · linha final 8888", "Operação nº 41 · recarga · 12/11/2026 · linha final 9999",
      "o extrato do saldo", "as comissões e bonificações"]) {
      expect(tela, trecho).toContain(trecho);
    }
    expect(tela).not.toContain("51955557777");
    expect(tela).not.toContain("Linha 1 do relatório");
  });

  it("escolhe a conciliação pelo endereço; a sem diferença diz que tudo conferiu; a de outro endereço não existe", async () => {
    cenario.tabelas.connect_conciliacao_linhas = [];
    cenario.tabelas.connect_conciliacao_so_aqui = [];
    expect(await abrir({ id: C1 })).toContain("Tudo conferido nesta conciliação.");
    expect(await abrir({ id: "00000000-0000-4000-9000-0000000000ff" })).toContain("Conciliação não encontrada.");
  });

  it("sem conciliação, diz por que; sem connect.gerir, não vê nada; a falha da leitura não vira tela vazia", async () => {
    cenario.tabelas.connect_conciliacoes = [];
    expect(await abrir()).toContain("Nenhuma conciliação ainda");
    cenario.permissoes = new Set(["connect.operar"]);
    const sem = await abrir();
    expect(sem).toContain("A conciliação com a Nogle é de quem gere a Ora Connect.");
    expect(sem).not.toContain("Nenhuma conciliação ainda");
    cenario.permissoes = new Set(["connect.gerir"]);
    cenario.falha = "connect_conciliacoes";
    await expect(abrir()).rejects.toThrow("falha: connect_conciliacoes");
  });
});
