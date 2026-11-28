import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({ aprova: true, chamadas: [] as unknown[][] }));
const loja = "00000000-0000-4000-8000-000000000001";
const idComNome = "00000000-0000-4000-8000-000000000101";
const idSemNome = "00000000-0000-4000-8000-000000000102";
const idEmitida = "00000000-0000-4000-8000-000000000103";
const venda = "00000000-0000-4000-8000-000000000011";
const pedido = { venda_id: venda, tipo: "venda", venda_concluida_em: "2026-11-27T18:00:00Z", observacao: null };

vi.mock("../../lib/acesso/molde", () => ({ permite: (_s: unknown, p: string) => p === "nota.aprovar" && cenario.aprova }));
vi.mock("../../componentes/MoldeReal", () => ({ MoldeReal: () => null }));
vi.mock("./acoes", () => ({ cancelarPedidoDeNota: vi.fn(), decidirNota: vi.fn(), definirPrazo: vi.fn(), registrarEmissao: vi.fn() }));
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    situacao: { unidade_id: loja, unidade_nome: "Loja de teste" },
    supabase: { from: (tab: string) => ({ select: () => {
      let estado: string;
      const q = {
        maybeSingle: async () => ({ data: null, error: null }),
        eq: (campo: string, valor: string) => { cenario.chamadas.push([tab, campo, valor]); if (campo === "situacao") estado = valor; return q; },
        in: (campo: string, valores: string[]) => {
          cenario.chamadas.push([tab, campo, valores]);
          return tab === "vendas" ? Promise.resolve({ data: [{ id: venda, numero: 11, total_centavos: 7900 }], error: null }) : q;
        },
        order: () => q,
        limit: async () => ({ error: null, data: estado === "emitida" ? [
          { id: idEmitida, venda_id: venda, modelo: "55", serie: 1, numero_documento: 100, chave_acesso: null },
        ] : [
          { ...pedido, id: idComNome, situacao: "aprovada", destinatario_nome: "Cliente de teste", destinatario_mascarado: "***" },
          { ...pedido, id: idSemNome, situacao: "aguardando_aprovacao", destinatario_nome: null, destinatario_mascarado: null },
        ] }),
      };
      return q;
    } }) },
  }),
}));

import Notas from "./page";

async function linksParaEmitir() {
  const links: { href: string; prefetch: unknown }[] = [];
  function visitar(no: unknown) {
    if (Array.isArray(no)) { no.forEach(visitar); return; }
    if (!isValidElement<{ href?: string; prefetch?: boolean; children?: unknown }>(no)) return;
    const { href, prefetch, children } = no.props;
    if (href?.endsWith("/emitir")) links.push({ href, prefetch });
    visitar(children);
  }
  visitar(await Notas({ searchParams: Promise.resolve({}) }));
  return links;
}

beforeEach(() => { cenario.aprova = true; cenario.chamadas = []; });

describe("acesso a Dados para emitir pela fila de notas", () => {
  it("mostra a entrada para pedidos abertos com e sem destinatário, sem pré-carregar a tela auditada", async () => {
    expect(await linksParaEmitir()).toEqual([
      { href: `/notas/${idComNome}/emitir`, prefetch: false },
      { href: `/notas/${idSemNome}/emitir`, prefetch: false },
    ]);
    expect(cenario.chamadas).toContainEqual(["notas_pedidos", "unidade_id", loja]);
    expect(cenario.chamadas).toContainEqual(["notas_pedidos", "situacao", ["aguardando_aprovacao", "correcao_solicitada", "aprovada"]]);
  });

  it("não expõe atalhos a quem não aprova notas", async () => {
    cenario.aprova = false;
    expect(await linksParaEmitir()).toEqual([]);
  });
});
