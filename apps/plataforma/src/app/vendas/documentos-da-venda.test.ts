// Os documentos da venda no comprovante (lote L5d: ORA-CRM-008), com sessão e Supabase SIMULADOS: nenhuma credencial,
// nenhuma rede. Dados fictícios. As regras do banco estão em packages/banco/src/anexos-da-venda.test.ts.
import { isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EU = "00000000-0000-4000-8000-0000000000aa";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const VENDA = "00000000-0000-4000-8000-00000000d201";
const CAPA = "00000000-0000-4000-8000-00000000e201";

type Linha = Record<string, unknown>;
const cenario = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  erros: {} as Record<string, { code: string }>,
  permissoes: new Set<string>(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); },
  notFound: () => { throw new Error("não encontrada"); },
}));
class Consulta {
  linhas: Linha[];
  erro: { code: string } | null;
  constructor(nome: string) { this.linhas = [...(cenario.tabelas[nome] ?? [])]; this.erro = cenario.erros[nome] ?? null; }
  select() { return this; }
  eq(coluna: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || l[coluna] === valor); return this; }
  neq() { return this; }
  in(coluna: string, valores: unknown[]) { this.linhas = this.linhas.filter((l) => l[coluna] === undefined || valores.includes(l[coluna])); return this; }
  not() { return this; }
  is() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas[0] ?? null, error: null }); }
  then(resolver: (r: { data: Linha[] | null; error: { code: string } | null }) => unknown) {
    return Promise.resolve(this.erro ? { data: null, error: this.erro } : { data: this.linhas, error: null }).then(resolver);
  }
}
const supabase = {
  from: (nome: string) => new Consulta(nome),
  rpc: async (nome: string, argumentos: Record<string, unknown> = {}) =>
    nome === "tem_permissao" ? { data: cenario.permissoes.has(String(argumentos.p_permissao)), error: null } : { data: null, error: { code: "PGRST202" } },
  storage: { from: () => ({ createSignedUrls: async (caminhos: string[]) => ({ data: caminhos.map((path) => ({ path, signedUrl: `https://assinado.invalid/${path}`, error: null })), error: null }) }) },
};
vi.mock("../../lib/acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {},
  obterSessao: async () => ({
    usuario: { id: EU },
    situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-14T23:00:00Z" },
    supabase,
  }),
}));

import Venda from "./[id]/page";

function texto(v: unknown): string {
  const pedacos: string[] = [];
  const andar = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(andar);
    else if (typeof x === "string" || typeof x === "number") pedacos.push(String(x));
    else if (isValidElement<Linha>(x)) {
      const tipo = typeof x.type === "function" ? x.type.name : "";
      if (typeof x.type === "string") andar(x.props.children);
      else andar(tipo === "MoldeReal" ? x.props.children : [x.props.titulo, x.props.subtitulo, x.props.children]);
    }
  };
  andar(v);
  return pedacos.join(" ").replace(/\s+/g, " ");
}
const comprovante = async (parametros: Record<string, string> = {}) =>
  texto(await Venda({ params: Promise.resolve({ id: VENDA }), searchParams: Promise.resolve(parametros) } as never) as ReactElement);
const anexo = (extra: Linha = {}) => ({
  id: "a1", venda_id: VENDA, tipo: "contrato_financiamento", descricao: null, caminho: `org/${LOJA}/${VENDA}/a1.pdf`, formato: "pdf", bytes: 850 * 1024,
  enviado_em: "2026-11-14T15:00:00Z", retirado_em: null, motivo_retirada: null, ...extra,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  cenario.erros = {};
  cenario.permissoes = new Set(["venda.registrar"]);
  cenario.tabelas = {
    vendas: [{ id: VENDA, numero: 51, situacao: "concluida", unidade_id: LOJA, vendedor_id: EU, cliente_nome: null, cliente_id: null, total_centavos: 7_900, subtotal_centavos: 7_900, desconto_centavos: 0, troco_centavos: 0, recebido_centavos: 7_900, a_receber_centavos: 0, devolvido_centavos: 0, concluida_em: "2026-11-14T15:00:00Z", cancelada_em: null, motivo_cancelamento: null }],
    venda_itens: [{ id: "i1", venda_id: VENDA, variante_id: CAPA, item_serializado_id: null, tipo: "acessorio", quantidade: 1, preco_unitario_centavos: 7_900, desconto_centavos: 0, preco_id: null }],
    variantes: [{ id: CAPA, sku: "ACE-0001", nome: "Capa de proteção" }],
    venda_anexos: [
      anexo(),
      anexo({ id: "a2", tipo: "termo_garantia", descricao: "Termo assinado", caminho: `org/${LOJA}/${VENDA}/a2.jpg`, formato: "jpg", bytes: 1_300_000,
        retirado_em: "2026-11-14T16:00:00Z", motivo_retirada: "Foto de outro termo" }),
    ],
    unidades: [{ id: LOJA, nome: "Santa Cândida (teste)", cnpj: null }],
    perfis_usuario: [{ id: EU, nome: "Vendedora Teste" }],
  };
});
afterEach(() => { vi.restoreAllMocks(); });

describe("documentos da venda no comprovante (L5d)", () => {
  it("quem vendeu vê os documentos com o link privado, o retirado com o motivo, e envia outro; retirar não é dela", async () => {
    const t = await comprovante();
    for (const trecho of ["Documentos da venda", "Contrato do financiamento", "PDF · 850 KB", "Termo de garantia", "JPG · 1,2 MB", "retirado",
      "Termo assinado", "Foto de outro termo", "Guardar o documento", "Contrato da linha", "Comprovante assinado", "Outro documento"]) {
      expect(t, trecho).toContain(trecho);
    }
    expect(t).not.toContain("Retirar (documento errado)");
  });

  it("a gerência (venda.cancelar) retira o documento vigente; os avisos da volta da rota aparecem", async () => {
    cenario.permissoes.add("venda.cancelar");
    const t = await comprovante({ anexo: "guardado" });
    expect(t).toContain("Retirar (documento errado)");
    expect(t).toContain("Documento guardado em privado");
    expect(await comprovante({ erro_anexo: "anexo_limite" })).toContain("Esta venda já tem 20 documentos");
    expect(await comprovante({ anexo: "retirado" })).toContain("Documento retirado; o registro e o motivo ficaram.");
  });

  it("venda aberta não tem o bloco; banco sem a migration (sem a tabela), o comprovante segue sem ele", async () => {
    cenario.tabelas.vendas = [{ ...cenario.tabelas.vendas![0], situacao: "rascunho", concluida_em: null }];
    expect(await comprovante()).not.toContain("Documentos da venda");
    cenario.tabelas.vendas = [{ ...cenario.tabelas.vendas![0], situacao: "concluida", concluida_em: "2026-11-14T15:00:00Z" }];
    cenario.erros = { venda_anexos: { code: "PGRST205" } };
    const t = await comprovante();
    expect(t).not.toContain("Documentos da venda");
    expect(t).toContain("Venda nº 51");
  });
});
