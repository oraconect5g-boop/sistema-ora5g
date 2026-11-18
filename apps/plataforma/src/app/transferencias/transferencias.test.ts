// A tela das transferências (ADR-007; TRF-b, 18/11: o achado F10 da auditoria do Codex de 17/11) com a sessão e o Supabase
// SIMULADOS: nenhuma credencial, lojas e números fictícios. As regras do banco estão em packages/banco/src/transferencias.test.ts
// e transferencia-remessa.test.ts; aqui, o que a tela diz de cada passo e o saldo de cada lado.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGEM = "00000000-0000-4000-8000-0000000000a1";
const DESTINO = "00000000-0000-4000-8000-0000000000a2";
const CAPA = "00000000-0000-4000-8000-0000000000c1";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  tabelas: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(linhas: Record<string, unknown>[]) { this.linhas = [...linhas]; }
  select() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  eq() { return this; }
  in(campo: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => !(campo in l) || valores.includes(l[campo])); return this; }
  then(resolver: (r: Resposta) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: ORIGEM, unidade_nome: "Santa Cândida", turno_termina_em: "2026-11-18T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Gerente (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (nome: string) => new Consulta(cenario.tabelas[nome] ?? []),
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) =>
      (nome === "tem_permissao" ? { data: cenario.permissoes.has(argumentos.p_permissao as string), error: null } : { data: null, error: null }),
  },
};
vi.mock("../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import Transferencias from "./page";

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
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const transferencia = (numero: number, situacao: string) => ({
  id: `00000000-0000-4000-9000-${String(numero).padStart(12, "0")}`, numero, origem_id: ORIGEM, destino_id: DESTINO, variante_id: CAPA, quantidade: 2,
  motivo: "Reposição", situacao, solicitado_por: "outra", quantidade_recebida: null, observacao: null, solicitado_em: "2026-11-18T03:00:00Z", remessa_id: null,
});

beforeEach(() => {
  cenario.permissoes = new Set(["estoque.transferir"]);
  cenario.tabelas = {
    transferencias: [transferencia(3, "enviada"), transferencia(2, "separada"), transferencia(1, "solicitada")],
    variantes: [{ id: CAPA, nome: "Capa de silicone", sku: "ACE-1", produtos: { tipo: "acessorio" } }],
    unidades: [{ id: ORIGEM, nome: "Santa Cândida", tipo: "loja_fisica" }, { id: DESTINO, nome: "Muffato Santa", tipo: "loja_fisica" }],
    transferencia_itens: [], transferencia_remessas: [],
    estoque_saldos: [{ unidade_id: ORIGEM, variante_id: CAPA, quantidade: 8, reservado: 2 }],
  };
});

describe("a tela das transferências (TRF-b)", () => {
  it("cada transferência diz o que o passo fez no estoque e o saldo de agora de cada lado que a pessoa vê", async () => {
    const tela = limpar(await Transferencias({ searchParams: Promise.resolve({}) }));
    for (const trecho of [
      "Pedida: o estoque da origem ainda não mudou (o pedido não reserva; decisão D-049 do proprietário).",
      "Separada: reservada na origem. Saiu do disponível; o físico continua lá até o envio.",
      "Em trânsito: saiu do físico da origem. Entra no destino quando a loja receber e conferir.",
      "Agora na origem (Santa Cândida): físico 8 · reservado 2 · disponível 6",
    ]) {
      expect(tela, trecho).toContain(trecho);
    }
    // O destino de outra loja não aparece pela RLS: a tela não inventa o saldo de lá.
    expect(tela).not.toContain("no destino (Muffato Santa)");
    cenario.tabelas.estoque_saldos = [...(cenario.tabelas.estoque_saldos ?? []), { unidade_id: DESTINO, variante_id: CAPA, quantidade: 1, reservado: 0 }];
    expect(limpar(await Transferencias({ searchParams: Promise.resolve({}) }))).toContain("no destino (Muffato Santa): físico 1 · reservado 0 · disponível 1");
  });
});
