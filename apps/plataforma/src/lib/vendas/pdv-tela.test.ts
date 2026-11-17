// A leitura estrita da resposta de public.pdv_tela (lote VEL-a: ORA-QUAL-010 e ORA-POS-002). A função do banco é
// testada em packages/banco/src/sessao-molde-e-pdv.test.ts; aqui, o que a aplicação aceita dela. Forma fora do
// combinado é erro (a tela mostra falha): nunca vira carrinho vazio, caixa fechado nem valor zero. Dados fictícios.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({
  FalhaDoServico: class FalhaDoServico extends Error {
    constructor(etapa: string) { super(`Falha ao consultar o serviço (${etapa})`); this.name = "FalhaDoServico"; }
  },
}));

import { RespostaInesperada } from "../financeiro/painel";
import { consultarTelaDoPdv, lerTelaDoPdv } from "./pdv-tela";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const CAIXA = "00000000-0000-4000-8000-00000000c001";
const VENDA = "00000000-0000-4000-8000-00000000d001";
const ITEM_CAPA = "00000000-0000-4000-8000-00000000a001";
const ITEM_APARELHO = "00000000-0000-4000-8000-00000000a002";
const ITEM_CONSERTO = "00000000-0000-4000-8000-00000000a003";
const CAPA = "00000000-0000-4000-8000-00000000e001";
const APARELHO = "00000000-0000-4000-8000-00000000e002";
const CONSERTO = "00000000-0000-4000-8000-00000000e003";
const SERIAL = "00000000-0000-4000-8000-00000000b001";
const CAMPANHA = "00000000-0000-4000-8000-00000000f001";
const PRECO_DA_REDE = "00000000-0000-4000-8000-00000000f002";
const OS = "00000000-0000-4000-8000-000000000501";
const MAQUININHA = "00000000-0000-4000-8000-000000000701";

const item = (mudar: Record<string, unknown> = {}) => ({
  id: ITEM_CAPA, variante_id: CAPA, item_serializado_id: null, tipo: "acessorio", quantidade: 2, preco_unitario_centavos: 3990, desconto_centavos: 0,
  preco_id: null, os_id: null, variante: { sku: "ACE-0001", nome: "Capa de proteção" }, serial: null, preco: null, os: null, aprovacao: null,
  ...mudar,
});
const resposta = () => ({
  caixa: { id: CAIXA, aberto_em: "2026-11-16T12:00:00+00:00" },
  venda: { id: VENDA, numero: 43, situacao: "rascunho" },
  itens: [
    item({ preco_id: CAMPANHA, preco: { id: CAMPANHA, origem: "campanha", unidade_id: LOJA, motivo: "Semana da capa", fim: "2026-11-15T02:59:00+00:00" } }),
    item({
      id: ITEM_APARELHO, variante_id: APARELHO, item_serializado_id: SERIAL, tipo: "aparelho", quantidade: 1, preco_unitario_centavos: 129900, desconto_centavos: 5000,
      preco_id: PRECO_DA_REDE, preco: { id: PRECO_DA_REDE, origem: "tabela", unidade_id: null, motivo: null, fim: null },
      variante: { sku: "APA-0002", nome: "Galaxy A15 256 GB Preto" }, serial: { imei: "352099001700010", iccid: null }, aprovacao: "pendente",
    }),
    item({
      id: ITEM_CONSERTO, variante_id: CONSERTO, tipo: "servico", quantidade: 1, preco_unitario_centavos: 33000,
      variante: { sku: "SRV-0001", nome: "Conserto genérico" }, os_id: OS, os: { id: OS, numero: 7, situacao: "pronta" },
    }),
  ],
  terminais: [{ id: MAQUININHA, provedor: "picpay", apelido: "Balcão", identificador: "PP-0001" }],
});
type Resposta = ReturnType<typeof resposta>;
const com = (mudar: (r: Resposta) => unknown) => {
  const r = resposta();
  mudar(r);
  return r;
};
const itemDe = (r: Resposta, n: number) => r.itens[n] as Record<string, unknown>;

describe("lerTelaDoPdv", () => {
  it("resposta combinada: o caixa, a venda, o carrinho inteiro e as maquininhas", () => {
    const tela = lerTelaDoPdv(resposta());
    expect(tela.caixa).toEqual({ id: CAIXA, aberto_em: "2026-11-16T12:00:00+00:00" });
    expect(tela.venda).toEqual({ id: VENDA, numero: 43, situacao: "rascunho" });
    expect(tela.terminais).toEqual([{ id: MAQUININHA, provedor: "picpay", apelido: "Balcão", identificador: "PP-0001" }]);
    expect(tela.itens.map((i) => i.id)).toEqual([ITEM_CAPA, ITEM_APARELHO, ITEM_CONSERTO]);
    expect(tela.itens[0]).toEqual({
      id: ITEM_CAPA, variante_id: CAPA, item_serializado_id: null, tipo: "acessorio", quantidade: 2, preco_unitario_centavos: 3990, desconto_centavos: 0,
      variante: { sku: "ACE-0001", nome: "Capa de proteção" }, serial: null, os: null, aprovacao: null,
      regra: { texto: "Campanha da loja: Semana da capa (até 14/11, 23:59)", campanha: true },
    });
  });

  it("aparelho: o IMEI, o desconto e a situação do pedido de aprovação vêm com o item", () => {
    const aparelho = lerTelaDoPdv(resposta()).itens[1];
    expect(aparelho).toMatchObject({
      item_serializado_id: SERIAL, tipo: "aparelho", preco_unitario_centavos: 129900, desconto_centavos: 5000,
      serial: { imei: "352099001700010", iccid: null }, aprovacao: "pendente", regra: { texto: "Preço da rede", campanha: false },
    });
  });

  it("conserto da OS: o item aponta a ordem, com o número e a situação", () => {
    expect(lerTelaDoPdv(resposta()).itens[2]?.os).toEqual({ os: OS, numero: 7, situacao: "pronta" });
  });

  it("OS que quem pede não lê mais: o conserto continua no carrinho, só sem o número", () => {
    const tela = lerTelaDoPdv(com((r) => { itemDe(r, 2).os = null; }));
    expect(tela.itens[2]?.os).toEqual({ os: OS, numero: null, situacao: null });
  });

  it("item de antes de a regra de preço ser gravada e item cuja linha de preço não veio: nenhum vira campanha", () => {
    const tela = lerTelaDoPdv(com((r) => { itemDe(r, 0).preco_id = null; itemDe(r, 0).preco = null; itemDe(r, 1).preco = null; }));
    expect(tela.itens[0]?.regra).toEqual({ texto: "Regra de preço não registrada (item de antes de 13/11/2026)", campanha: false });
    expect(tela.itens[1]?.regra).toEqual({ texto: "Regra de preço não lida agora", campanha: false });
  });

  it("variação que quem pede não lê mais: o item continua no carrinho, sem nome", () => {
    expect(lerTelaDoPdv(com((r) => { itemDe(r, 0).variante = null; })).itens[0]?.variante).toBeNull();
  });

  it("sem caixa aberto, sem venda em andamento e sem maquininha: tudo vazio é resposta válida", () => {
    expect(lerTelaDoPdv({ caixa: null, venda: null, itens: [], terminais: [] })).toEqual({ caixa: null, venda: null, itens: [], terminais: [] });
  });

  it("venda aberta com o carrinho ainda vazio é resposta válida", () => {
    const tela = lerTelaDoPdv(com((r) => { r.itens = []; }));
    expect(tela.venda?.numero).toBe(43);
    expect(tela.itens).toEqual([]);
  });

  it.each<[string, unknown]>([
    ["nada", null],
    ["texto", "ok"],
    ["lista", []],
    ["número", 0],
  ])("resposta que não é o objeto combinado (%s) é erro", (_, dado) => {
    expect(() => lerTelaDoPdv(dado)).toThrow(RespostaInesperada);
  });

  it.each<[string, (r: Resposta) => unknown]>([
    ["sem o caixa", (r) => delete (r as Partial<Resposta>).caixa],
    ["caixa que não é objeto", (r) => { (r as { caixa: unknown }).caixa = true; }],
    ["caixa sem identificador", (r) => { (r.caixa as { id: unknown }).id = "cx1"; }],
    ["caixa sem a hora de abertura", (r) => delete (r.caixa as Partial<Resposta["caixa"]>).aberto_em],
    ["sem a venda", (r) => delete (r as Partial<Resposta>).venda],
    ["venda que é lista", (r) => { (r as { venda: unknown }).venda = [{ id: VENDA }]; }],
    ["venda com identificador numérico", (r) => { (r.venda as { id: unknown }).id = 43; }],
    ["número da venda em texto", (r) => { (r.venda as { numero: unknown }).numero = "43"; }],
    ["venda sem situação", (r) => { r.venda.situacao = ""; }],
    ["sem os itens", (r) => delete (r as Partial<Resposta>).itens],
    ["itens que não são lista", (r) => { (r as { itens: unknown }).itens = { [ITEM_CAPA]: item() }; }],
    ["item que não é objeto", (r) => { (r as { itens: unknown[] }).itens = [ITEM_CAPA]; }],
    ["item sem identificador", (r) => delete itemDe(r, 0).id],
    ["item sem a variação apontada", (r) => { itemDe(r, 0).variante_id = null; }],
    ["item com aparelho que não é identificador", (r) => { itemDe(r, 1).item_serializado_id = "352099001700010"; }],
    ["item sem tipo", (r) => { itemDe(r, 0).tipo = null; }],
    ["quantidade em texto", (r) => { itemDe(r, 0).quantidade = "2"; }],
    ["quantidade negativa", (r) => { itemDe(r, 0).quantidade = -1; }],
    ["quantidade quebrada", (r) => { itemDe(r, 0).quantidade = 1.5; }],
    ["preço ausente", (r) => delete itemDe(r, 0).preco_unitario_centavos],
    ["preço nulo", (r) => { itemDe(r, 0).preco_unitario_centavos = null; }],
    ["preço negativo", (r) => { itemDe(r, 0).preco_unitario_centavos = -3990; }],
    ["preço fora do que cabe num número inteiro", (r) => { itemDe(r, 0).preco_unitario_centavos = 2 ** 60; }],
    ["desconto ausente", (r) => delete itemDe(r, 0).desconto_centavos],
    ["desconto em texto", (r) => { itemDe(r, 1).desconto_centavos = "5000"; }],
    ["variação ausente (nem nula)", (r) => delete itemDe(r, 0).variante],
    ["variação sem nome", (r) => { itemDe(r, 0).variante = { sku: "ACE-0001", nome: "" }; }],
    ["variação sem SKU", (r) => { itemDe(r, 0).variante = { nome: "Capa de proteção" }; }],
    ["número do aparelho ausente (nem nulo)", (r) => delete itemDe(r, 1).serial],
    ["IMEI numérico", (r) => { itemDe(r, 1).serial = { imei: 352099001700010, iccid: null }; }],
    ["regra de preço ausente (nem nula)", (r) => delete itemDe(r, 0).preco_id],
    ["regra de preço que não é identificador", (r) => { itemDe(r, 0).preco_id = "campanha"; }],
    ["linha de preço sem origem", (r) => { itemDe(r, 0).preco = { id: CAMPANHA, origem: "", unidade_id: LOJA, motivo: null, fim: null }; }],
    ["linha de preço com loja que não é identificador", (r) => { itemDe(r, 0).preco = { id: CAMPANHA, origem: "campanha", unidade_id: "loja-1", motivo: null, fim: null }; }],
    ["linha de preço que é texto", (r) => { itemDe(r, 0).preco = "campanha"; }],
    ["OS ausente (nem nula)", (r) => delete itemDe(r, 2).os_id],
    ["OS com número em texto", (r) => { itemDe(r, 2).os = { id: OS, numero: "7", situacao: "pronta" }; }],
    ["OS sem situação", (r) => { itemDe(r, 2).os = { id: OS, numero: 7 }; }],
    ["aprovação ausente (nem nula)", (r) => delete itemDe(r, 0).aprovacao],
    ["aprovação que não é texto", (r) => { itemDe(r, 1).aprovacao = true; }],
    ["itens sem venda em andamento", (r) => { (r as { venda: unknown }).venda = null; }],
    ["sem as maquininhas", (r) => delete (r as Partial<Resposta>).terminais],
    ["maquininha sem identificador", (r) => { (r.terminais[0] as { id: unknown }).id = null; }],
    ["maquininha sem apelido", (r) => { (r.terminais[0] as { apelido: unknown }).apelido = ""; }],
    ["maquininha sem provedor", (r) => delete (r.terminais[0] as Partial<Resposta["terminais"][number]>).provedor],
  ])("%s: erro, nunca carrinho vazio nem valor inventado", (_, mudar) => {
    expect(() => lerTelaDoPdv(com(mudar))).toThrow(RespostaInesperada);
  });
});

describe("consultarTelaDoPdv", () => {
  const cliente = (resultado: unknown) => {
    const chamadas: unknown[][] = [];
    const supabase = { rpc: async (...argumentos: unknown[]) => { chamadas.push(argumentos); return resultado; } };
    return { supabase: supabase as unknown as Parameters<typeof consultarTelaDoPdv>[0], chamadas };
  };

  it("uma chamada só, sem argumentos: o banco usa quem pede e a loja do turno", async () => {
    const { supabase, chamadas } = cliente({ data: resposta(), error: null });
    const tela = await consultarTelaDoPdv(supabase);
    expect(chamadas).toEqual([["pdv_tela"]]);
    expect(tela.itens).toHaveLength(3);
  });

  it("erro do banco é falha do serviço (página de erro), nunca PDV vazio", async () => {
    const { supabase } = cliente({ data: null, error: { code: "57014" } });
    await expect(consultarTelaDoPdv(supabase)).rejects.toThrow("pdv_tela");
    await expect(consultarTelaDoPdv(supabase)).rejects.toMatchObject({ name: "FalhaDoServico" });
  });

  it("função que o banco ainda não tem é falha do serviço: a migration do lote vem antes da publicação", async () => {
    const { supabase } = cliente({ data: null, error: { code: "PGRST202" } });
    await expect(consultarTelaDoPdv(supabase)).rejects.toMatchObject({ name: "FalhaDoServico" });
  });

  it("resposta fora do combinado é falha do serviço", async () => {
    const { supabase } = cliente({ data: { caixa: null, venda: null, itens: null, terminais: [] }, error: null });
    await expect(consultarTelaDoPdv(supabase)).rejects.toMatchObject({ name: "FalhaDoServico" });
  });
});
