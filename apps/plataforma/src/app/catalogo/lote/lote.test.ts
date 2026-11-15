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
  /** CAT-011b: as respostas das funções da limpeza (o padrão é a função ausente) e o que o Storage apagou. */
  respostas: {} as Record<string, { data: unknown; error: { code: string } | null }>,
  apagadosPeloStorage: [] as string[][],
  falhaDoStorageNaVez: 0,
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
      rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
        cenario.pedidos.push(`rpc ${nome} ${JSON.stringify(argumentos)}`);
        if (nome === "tem_permissao") return { data: cenario.pode, error: null };
        return cenario.respostas[nome] ?? { data: null, error: { code: "PGRST202" } };
      },
      storage: {
        from: (balde: string) => ({
          remove: async (caminhos: string[]) => {
            expect(balde).toBe("produtos");
            cenario.apagadosPeloStorage.push(caminhos);
            if (cenario.falhaDoStorageNaVez === cenario.apagadosPeloStorage.length) return { data: null, error: { statusCode: "500" } };
            return { data: caminhos.map((name) => ({ name })), error: null };
          },
        }),
      },
    },
  }),
}));

import { limparFotosSemRegistro, localizarDestinos } from "../acoes";
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
  cenario.respostas = {};
  cenario.apagadosPeloStorage = [];
  cenario.falhaDoStorageNaVez = 0;
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
    let tela = await FotosEmLotePagina({ searchParams: Promise.resolve({}) });
    expect(texto(tela)).toContain("Só quem gere o catálogo envia fotos.");
    expect(elementos(tela).some((e) => typeof e.type === "function" && e.type.name === "FotosEmLote")).toBe(false);
    cenario.pode = true;
    tela = await FotosEmLotePagina({ searchParams: Promise.resolve({}) });
    const envio = elementos(tela).find((e) => typeof e.type === "function" && e.type.name === "FotosEmLote");
    expect(envio?.props).toEqual({ supabaseUrl: "https://banco.exemplo", chavePublica: "chave-publica-de-teste" });
    expect(texto(tela)).toContain("Até 50 fotos por vez");
  });
});

// ---------------------------------------------------------------------------------------------
// CAT-011b: a limpeza das fotos enviadas sem registro
// ---------------------------------------------------------------------------------------------
const ARQ = (n: number) => `${ORG}/${CAPA}/produto/00000000-0000-4000-a000-${String(n).padStart(12, "0")}.webp`;
const lista = (n: number) => ({ data: { quantos: n, bytes: n * 300_000, arquivos: Array.from({ length: n }, (_, i) => ({ caminho: ARQ(i), bytes: 300_000, enviado_em: "2026-11-13T10:00:00Z" })) }, error: null });
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const telaDaLimpeza = async (parametros: Record<string, string> = {}) => texto(await FotosEmLotePagina({ searchParams: Promise.resolve(parametros) }));

describe("/catalogo/lote: a limpeza dos arquivos sem registro (CAT-011b)", () => {
  it("o cartão: sem a função no banco some; com arquivos, quantos, o tamanho e o botão; sem nenhum, diz; falha, diz", async () => {
    expect(await telaDaLimpeza()).not.toContain("Arquivos sem registro");
    cenario.respostas.fotos_sem_registro = lista(3);
    let t = await telaDaLimpeza();
    expect(t).toContain("3 arquivos enviados há mais de um dia e nunca registrados (879 KB)");
    expect(t).toContain("Limpar 3 arquivos");
    const formulario = elementos(await FotosEmLotePagina({ searchParams: Promise.resolve({}) })).find((e) => e.type === "form");
    expect((formulario?.props.action as { name: string } | undefined)?.name).toBe("limparFotosSemRegistro");
    cenario.respostas.fotos_sem_registro = lista(0);
    expect(await telaDaLimpeza()).toContain("Nenhum arquivo sem registro enviado há mais de um dia.");
    cenario.respostas.fotos_sem_registro = { data: null, error: { code: "57014" } };
    t = await telaDaLimpeza();
    expect(t).toContain("Não deu para ver os arquivos sem registro agora.");
    expect(t).not.toContain("Limpar");
  });

  it("as mensagens da volta: tudo apagado, parte apagada, nada a limpar e falha", async () => {
    cenario.respostas.fotos_sem_registro = lista(0);
    expect(await telaDaLimpeza({ apagados: "3", de: "3" })).toContain("3 arquivos apagados; a limpeza ficou na auditoria.");
    expect(await telaDaLimpeza({ apagados: "2", de: "3" })).toContain("2 de 3 arquivos apagados; tente de novo para os outros.");
    expect(await telaDaLimpeza({ limpeza: "nada" })).toContain("Nada a limpar: nenhum arquivo sem registro.");
    expect(await telaDaLimpeza({ limpeza: "falha" })).toContain("Não deu para limpar agora. Nada foi apagado");
    // números estranhos no endereço não viram mensagem
    expect(await telaDaLimpeza({ apagados: "5", de: "3" })).not.toContain("apagados");
  });

  it("limpar: o banco lista e libera (tudo ou nada), e o Storage apaga de 100 em 100; cada recusa volta com a mensagem", async () => {
    cenario.respostas.fotos_sem_registro = lista(150);
    cenario.respostas.fotos_sem_registro_limpar = { data: { caminhos: Array.from({ length: 150 }, (_, i) => ARQ(i)) }, error: null };
    expect(await destinoDe(limparFotosSemRegistro())).toBe("/catalogo/lote?apagados=150&de=150#limpeza");
    expect(cenario.pedidos.find((p) => p.startsWith("rpc fotos_sem_registro_limpar"))).toContain(ARQ(149));
    expect(cenario.apagadosPeloStorage.map((l) => l.length)).toEqual([100, 50]);
    // o Storage falha na segunda vez: volta com quantos saíram
    cenario.apagadosPeloStorage = [];
    cenario.falhaDoStorageNaVez = 2;
    expect(await destinoDe(limparFotosSemRegistro())).toBe("/catalogo/lote?apagados=100&de=150#limpeza");
    cenario.apagadosPeloStorage = [];
    cenario.falhaDoStorageNaVez = 1;
    expect(await destinoDe(limparFotosSemRegistro())).toBe("/catalogo/lote?limpeza=falha#limpeza");
    // o banco recusa a limpeza: nada vai ao Storage
    cenario.apagadosPeloStorage = [];
    cenario.respostas.fotos_sem_registro_limpar = { data: null, error: { code: "P0002" } };
    expect(await destinoDe(limparFotosSemRegistro())).toBe("/catalogo/lote?limpeza=falha#limpeza");
    expect(cenario.apagadosPeloStorage).toEqual([]);
    cenario.respostas.fotos_sem_registro = lista(0);
    expect(await destinoDe(limparFotosSemRegistro())).toBe("/catalogo/lote?limpeza=nada#limpeza");
    cenario.respostas.fotos_sem_registro = { data: null, error: { code: "42501" } };
    expect(await destinoDe(limparFotosSemRegistro())).toBe("/catalogo/lote?limpeza=permissao#limpeza");
  });
});
