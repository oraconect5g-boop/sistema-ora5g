// /catalogo/lote (lote CAT-010) com a sessão e o Supabase SIMULADOS: a página só para quem envia fotos, e a ação que acha
// para onde vai a foto de cada SKU (a cor ou o produto), pelas leituras de quem pede. O registro de cada foto é o da foto
// avulsa (registrar_foto), conferido pelo banco.
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000aa";
const ORG = "00000000-0000-4000-8000-000000000001";
const CAPA = "00000000-0000-4000-9000-000000000021";
const APARELHO = "00000000-0000-4000-9000-000000000022";
const INATIVO = "00000000-0000-4000-9000-000000000023";
const V = (n: number) => `00000000-0000-4000-9000-0000000001${String(n).padStart(2, "0")}`;

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  pode: true,
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  erros: {} as Record<string, { code: string }>,
  pedidos: [] as string[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => { throw new Error(`redirecionou para ${d}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("../../../lib/supabase/configuracao", () => ({ configuracaoSupabase: () => ({ url: "https://banco.exemplo", chavePublica: "chave-publica-de-teste" }) }));

class Consulta {
  linhas: Linha[];
  constructor(readonly tabela: string) { this.linhas = [...(cenario.tabelas[tabela] ?? [])]; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => valores.includes(l[coluna])); return this; }
  is(coluna: string, valor: null) { this.linhas = this.linhas.filter((l) => l[coluna] === valor); return this; }
  not(coluna: string, _op: string, valor: null) { this.linhas = this.linhas.filter((l) => l[coluna] !== valor); return this; }
  // ilike(any): o "_" é curinga de um caractere, como no banco
  ilikeAnyOf(coluna: string, padroes: string[]) {
    cenario.pedidos.push(`${this.tabela} ${coluna} ilike(any) ${padroes.join(",")}`);
    const casa = (valor: string) => padroes.some((p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&").replace(/_/g, ".")}$`, "i").test(valor));
    this.linhas = this.linhas.filter((l) => casa(String(l[coluna])));
    return this;
  }
  order() { return this; }
  limit() { return this; }
  range(de: number, ate: number) { this.linhas = this.linhas.slice(de, ate + 1); return this; }
  then(resolver: (r: { data: Linha[] | null; error: { code: string } | null }) => unknown) {
    const erro = cenario.erros[this.tabela] ?? null;
    return Promise.resolve(erro ? { data: null, error: erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error {},
  obterSessao: async () => ({
    usuario: { id: "u" },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Loja A (teste)", turno_termina_em: "2026-11-15T23:00:00Z" },
    supabase: {
      from: (tabela: string) => new Consulta(tabela),
      rpc: async (nome: string, argumentos: Record<string, unknown>) => {
        cenario.pedidos.push(`rpc ${nome} ${JSON.stringify(argumentos)}`);
        return { data: cenario.pode, error: null };
      },
    },
  }),
}));

import { localizarDestinos } from "../acoes";
import FotosEmLotePagina from "./page";

const elementos = (v: unknown): ReactElement<Linha>[] => {
  const achados: ReactElement<Linha>[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (isValidElement<Linha>(x)) { achados.push(x); andar(Object.values(x.props)); }
  };
  andar(v);
  return achados;
};
const texto = (v: unknown): string => {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Linha>(v)) return Object.values(v.props).map(texto).join(" ");
  return "";
};

beforeEach(() => {
  cenario.pode = true;
  cenario.erros = {};
  cenario.pedidos = [];
  cenario.tabelas = {
    variantes: [
      { id: V(1), produto_id: CAPA, sku: "ACE-0001", nome: "Capa azul", cor: "Azul", ativa: true },
      { id: V(2), produto_id: CAPA, sku: "ACE-0002", nome: "Capa preta", cor: "Preta", ativa: true },
      { id: V(3), produto_id: CAPA, sku: "ACE-0003", nome: "Capa sem cor", cor: null, ativa: true },
      { id: V(4), produto_id: APARELHO, sku: "APA_0001", nome: "Galaxy 128 GB", cor: "Azul", ativa: true },
      { id: V(5), produto_id: APARELHO, sku: "APAX0001", nome: "Galaxy 256 GB", cor: "azul", ativa: true },
      { id: V(6), produto_id: INATIVO, sku: "OLD-0001", nome: "Produto antigo", cor: null, ativa: true },
      { id: V(7), produto_id: CAPA, sku: "ACE-0009", nome: "Capa desativada", cor: "Verde", ativa: false },
    ],
    produtos: [
      { id: CAPA, nome: "Capa de proteção", organizacao_id: ORG, ativo: true },
      { id: APARELHO, nome: "Galaxy A15", organizacao_id: ORG, ativo: true },
      { id: INATIVO, nome: "Produto antigo", organizacao_id: ORG, ativo: false },
    ],
    fotos_produto: [
      { id: "f1", produto_id: CAPA, variante_id: V(1), substituida_em: null },
      { id: "f2", produto_id: APARELHO, variante_id: null, substituida_em: null },
      { id: "f3", produto_id: CAPA, variante_id: null, substituida_em: "2026-11-10T10:00:00Z" },
    ],
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("/catalogo/lote: para onde vai cada foto (CAT-010)", () => {
  it("a cor quando o produto tem cores diferentes; o produto quando não; sem diferença de maiúsculas e com a foto atual", async () => {
    const r = await localizarDestinos(["ace-0001", "ACE-0003", "APA_0001", "OLD-0001", "ACE-0009", "NAO-EXISTE"]);
    expect(r).toEqual({ ok: true, destinos: [
      { sku: "ACE-0001", organizacao: ORG, produto: CAPA, variante: V(1), rotulo: "Capa azul: foto da cor Azul", temFoto: true },
      { sku: "ACE-0003", organizacao: ORG, produto: CAPA, variante: null, rotulo: "Capa de proteção: foto do produto", temFoto: false },
      // o aparelho tem "Azul" e "azul": uma cor só, então a foto é do produto (que já tem foto)
      { sku: "APA_0001", organizacao: ORG, produto: APARELHO, variante: null, rotulo: "Galaxy A15: foto do produto", temFoto: true },
    ] });
    // a permissão é a da foto avulsa, na loja do turno; o "_" do APA_0001 também casa APAX0001, que fica de fora na conferência
    expect(cenario.pedidos[0]).toBe(`rpc tem_permissao {"p_permissao":"catalogo.fotos","p_unidade":"${LOJA}"}`);
    expect(cenario.pedidos[1]).toBe("variantes sku ilike(any) ace-0001,ace-0003,apa_0001,old-0001,ace-0009,nao-existe");
  });

  it("sem permissão, nome fora do padrão ou lote grande demais: recusa sem procurar; falha de leitura é falha", async () => {
    cenario.pode = false;
    expect(await localizarDestinos(["ACE-0001"])).toEqual({ ok: false, erro: "permissao" });
    expect(cenario.pedidos.some((p) => p.startsWith("variantes"))).toBe(false);
    cenario.pode = true;
    cenario.pedidos = [];
    for (const skus of [[], ["ACE 0001"], ["ACE-0001.jpg"], ["capa%"], Array.from({ length: 51 }, (_, i) => `SKU-${i}`), "ACE-0001" as unknown as string[]]) {
      expect(await localizarDestinos(skus), JSON.stringify(skus).slice(0, 40)).toEqual({ ok: false, erro: "dados" });
    }
    expect(cenario.pedidos).toEqual([]);
    cenario.erros.variantes = { code: "57014" };
    expect(await localizarDestinos(["ACE-0001"])).toEqual({ ok: false, erro: "falha" });
    delete cenario.erros.variantes;
    cenario.erros.fotos_produto = { code: "57014" };
    expect(await localizarDestinos(["ACE-0001"])).toEqual({ ok: false, erro: "falha" });
    expect(vi.mocked(console.error).mock.calls).toContainEqual(["catálogo: falha ao ler os produtos das fotos em lote", { codigo: "57014" }]);
    delete cenario.erros.fotos_produto;
    expect(await localizarDestinos(["NAO-EXISTE"])).toEqual({ ok: true, destinos: [] });
  });

  it("a página: sem permissão, só o aviso; com ela, o envio com a configuração pública do Supabase", async () => {
    cenario.pode = false;
    let tela = await FotosEmLotePagina();
    expect(texto(tela)).toContain("Só quem gere o catálogo envia fotos.");
    expect(elementos(tela).some((e) => typeof e.type === "function" && e.type.name === "FotosEmLote")).toBe(false);
    cenario.pode = true;
    tela = await FotosEmLotePagina();
    const envio = elementos(tela).find((e) => typeof e.type === "function" && e.type.name === "FotosEmLote");
    expect(envio?.props).toEqual({ supabaseUrl: "https://banco.exemplo", chavePublica: "chave-publica-de-teste" });
    expect(texto(tela)).toContain("Até 50 fotos por vez");
  });
});
