// /entregas (lote ENTREGAS-a; aceite A18 do adendo do Codex de 16/11) com a sessão e o menu SIMULADOS: nenhuma
// credencial, nenhum banco. Quem vê, os indicadores, o placar dos 179 e os lotes com a situação de cada um.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({ permissoes: new Set<string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: "l", unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-17T23:00:00Z" },
    molde: { permissoes: cenario.permissoes, nome: "Dono (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } },
    supabase: {},
  }),
}));
vi.mock("../../componentes/MoldeReal", () => ({ MoldeReal: ({ children }: { children: unknown }) => children }));

import { ENTREGAS, situacaoDoLote } from "../../lib/entregas/entregas";
import Entregas from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && ["MoldeReal", "ConteudoDasEntregas"].includes(v.type.name)) return texto((v.type as (p: unknown) => unknown)(v.props));
    const p = v.props;
    return [p.titulo, p.subtitulo, p.rotulo, p.valor, p.detalhe, p.children, p.dados, p.href].map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const tela = async () => texto(await Entregas() as ReactElement).replace(/\s+/g, " ");

beforeEach(() => { cenario.permissoes = new Set(["venda.ver_todas", "venda.registrar"]); });

describe("entregas do projeto (ENTREGAS-a)", () => {
  it("o dono vê os indicadores, o placar dos 179 e cada lote com a situação e o link do roteiro", async () => {
    const t = await tela();
    for (const trecho of ["Entregas do projeto", "Homologados", `${ENTREGAS.homologados} de ${ENTREGAS.total}`, "Esperando o seu aceite",
      "Testados em desenvolvimento", "Os 179 requisitos", "Lotes com roteiro de aceite", "Versão no ar agora"]) {
      expect(t, trecho).toContain(trecho);
    }
    for (const l of ENTREGAS.lotes) {
      expect(t).toContain(l.lote);
      expect(t).toContain(situacaoDoLote(l).rotulo);
      expect(t).toContain(`https://github.com/oraconect5g-boop/sistema-ora5g/blob/main/${l.roteiro}`);
    }
  });

  it("o mais novo primeiro", async () => {
    const t = await tela();
    const [primeiro, ultimo] = [ENTREGAS.lotes[0]?.lote ?? "", ENTREGAS.lotes.at(-1)?.lote ?? ""];
    expect(t.indexOf(ultimo)).toBeLessThan(t.lastIndexOf(primeiro));
  });

  it("quem não é dono nem administrador não vê", async () => {
    cenario.permissoes = new Set(["venda.ver_unidade", "venda.registrar"]);
    expect(await tela()).toContain("As entregas do projeto são do dono.");
  });
});
