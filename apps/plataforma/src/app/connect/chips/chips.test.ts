// A tela do estoque de chips da Nogle (lote CONNECT-d; ORA-INV-011) e a ligação do PDV com a loja, com a sessão e o
// Supabase SIMULADOS: nenhuma credencial, PDVs e ICCIDs FICTÍCIOS. As regras do banco (quem vê o quê, a ligação) estão em
// packages/banco/src/connect-chips-da-nogle.test.ts; a leitura da Nogle, em packages/dominio e apps/worker/src/connect.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA_1 = "00000000-0000-4000-9000-0000000000a1";
const LOJA_2 = "00000000-0000-4000-9000-0000000000a2";
const I1 = "8955170110000000011";
const I2 = "8955170110000000029";
const I3 = "8955170110000000037";
type Resposta = { data: unknown; error: null | { code: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  rpc: [] as { nome: string; argumentos: unknown }[],
  erroDaRpc: null as null | { code: string },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));

class Consulta {
  linhas: Record<string, unknown>[];
  constructor(linhas: Record<string, unknown>[]) { this.linhas = [...linhas]; }
  select() { return this; }
  order() { return this; }
  limit(n: number) { this.linhas = this.linhas.slice(0, n); return this; }
  eq(campo: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[campo] === valor); return this; }
  is(campo: string, valor: unknown) { this.linhas = this.linhas.filter((l) => l[campo] === valor); return this; }
  like(campo: string, padrao: string) { this.linhas = this.linhas.filter((l) => String(l[campo]).endsWith(padrao.replace(/^%/, ""))); return this; }
  then(resolver: (r: Resposta) => unknown) { return Promise.resolve({ data: this.linhas, error: null }).then(resolver); }
}
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA_1, unidade_nome: "Água Verde (fictícia)", turno_termina_em: "2026-11-25T01:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Pessoa (fictícia)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    from: (nome: string) => new Consulta(cenario.tabelas[nome] ?? []),
    rpc: async (nome: string, argumentos: unknown) => { cenario.rpc.push({ nome, argumentos }); return { data: null, error: cenario.erroDaRpc }; },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({
  FalhaDoServico: class extends Error { constructor(m: string) { super(`falha: ${m}`); } },
  obterSessao: async () => sessaoFicticia,
}));

import { cancelarTransferencia, ligarPdv, pedirTransferencia } from "./acoes";
import ChipsDaNogle from "./page";

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
const abrir = async (busca: Record<string, string> = {}) => texto(await ChipsDaNogle({ searchParams: Promise.resolve(busca) } as never)).replace(/\s+/g, " ");
// Os pedaços na ordem (entre eles, o texto achatado traz as classes dos elementos).
const emOrdem = (t: string, ...partes: string[]) => expect(t).toMatch(new RegExp(partes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*?")));
const haMinutos = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const PDV_1 = { pdv_id: 5231, nome: "SUPERCELL AGUA VERDE", cidade: "Curitiba", uf: "PR", estoque_minimo: 10, unidade_id: LOJA_1, ativo: true, estoque_lido_em: haMinutos(5), fisicos: 2, esims: 0 };
const PDV_2 = { pdv_id: 5221, nome: "SUPERCELL BUTIATUVINHA", cidade: "Curitiba", uf: "PR", estoque_minimo: 10, unidade_id: LOJA_2, ativo: true, estoque_lido_em: haMinutos(5), fisicos: 1, esims: 5 };
const REVENDA = { pdv_id: 5250, nome: "Revenda (fictícia)", cidade: "São Paulo", uf: "SP", estoque_minimo: null, unidade_id: null, ativo: true, estoque_lido_em: haMinutos(5), fisicos: 0, esims: 1 };
const LEITURA = { numero: 3, lida_em: haMinutos(5), pdvs: 3, pdvs_lidos: 3, mvno_fisicos: 470, mvno_esims: 223, falhas: 0 };
const CHIPS = [
  { iccid: I1, pdv_id: 5231, tipo: "fisico", repassado_em: "2022-03-21 22:31:23.58", lido_em: haMinutos(5) },
  { iccid: I2, pdv_id: 5231, tipo: "fisico", repassado_em: null, lido_em: haMinutos(5) },
  { iccid: I3, pdv_id: null, tipo: "esim", repassado_em: null, lido_em: haMinutos(5) },
];

beforeEach(() => {
  cenario.permissoes = new Set(["connect.gerir", "connect.operar"]);
  cenario.rpc = [];
  cenario.erroDaRpc = null;
  cenario.tabelas = {
    connect_pdvs: [PDV_1, PDV_2, REVENDA],
    connect_leituras_nogle: [LEITURA],
    connect_chips_nogle: CHIPS,
    unidades: [{ id: LOJA_1, nome: "Água Verde", tipo: "loja_fisica" }, { id: LOJA_2, nome: "Butiatuvinha", tipo: "loja_fisica" }, { id: "x", nome: "Loja Online", tipo: "online" }],
    connect_transferencias_chips: [],
  };
});

describe("a tela dos chips na Nogle (CONNECT-d)", () => {
  it("o dono: a hora da leitura, o resumo, as lojas (abaixo do mínimo), os outros PDVs e a MVNO; só leitura", async () => {
    const t = await abrir();
    expect(t).toContain("Última leitura da Nogle:");
    expect(t).toContain("A leitura não muda nada na Nogle: só o pedido de transferência do dono move chips");
    emOrdem(t, "Nas lojas", "8", "3 físicos · 5 eSIM · 2 lojas ligadas");
    emOrdem(t, "Estoque geral da Ora", "693", "470 físicos · 223 eSIM");
    emOrdem(t, "Abaixo do mínimo", "2", "text-aviso", "lojas abaixo do estoque mínimo");
    emOrdem(t, "Água Verde", "PDV 5231 na Nogle · SUPERCELL AGUA VERDE", "2 físicos · 0 eSIM", "abaixo do mínimo (10)");
    emOrdem(t, "Butiatuvinha", "PDV 5221 na Nogle · SUPERCELL BUTIATUVINHA", "1 físico · 5 eSIM", "abaixo do mínimo (10)");
    emOrdem(t, "Outros PDVs", "Revenda (fictícia)", "PDV 5250 · São Paulo-SP", "0 físicos · 1 eSIM");
    expect(t).toContain("Ver o estoque geral da Ora (MVNO)");
    expect(t).not.toContain("Salvar a ligação");
  });

  it("um PDV aberto: os chips em blocos, com a data do repasse, e a ligação com a loja para quem gere", async () => {
    const t = await abrir({ pdv: "5231" });
    expect(t).toContain("Chips de Água Verde");
    emOrdem(t, "8955 1701 1000 0000 011", "Físico", "repassado em 21/03/2022");
    emOrdem(t, "8955 1701 1000 0000 029", "Físico");
    expect(t).not.toContain("8955 1701 1000 0000 037");
    expect(t).toContain("Salvar a ligação");
    expect(t).toContain("Nenhuma (PDV de fora)");
    expect(t).not.toContain("Loja Online");
    const mvno = await abrir({ pdv: "mvno" });
    expect(mvno).toContain("Estoque geral da Ora (MVNO)");
    emOrdem(mvno, "8955 1701 1000 0000 037", "eSIM");
  });

  it("quem só opera a loja: o PDV dela aberto, sem o resumo da rede e sem a ligação", async () => {
    cenario.permissoes = new Set(["connect.operar"]);
    cenario.tabelas = { ...cenario.tabelas, connect_pdvs: [PDV_1], connect_leituras_nogle: [], connect_chips_nogle: CHIPS.filter((c) => c.pdv_id === 5231) };
    const t = await abrir();
    expect(t).toContain("Última leitura da Nogle:");
    expect(t).toContain("Chips de Água Verde");
    expect(t).toContain("8955 1701 1000 0000 011");
    expect(t).not.toContain("Nas lojas");
    expect(t).not.toContain("Salvar a ligação");
  });

  it("a busca pelo fim do ICCID diz onde está o chip; a leitura atrasada e a loja sem PDV avisam", async () => {
    expect(await abrir({ iccid: "0037" })).toContain("8955 1701 1000 0000 037 · eSIM · no estoque geral da Ora (MVNO), ainda sem PDV");
    expect(await abrir({ iccid: "0011" })).toContain("8955 1701 1000 0000 011 · Físico · na loja Água Verde (PDV 5231)");
    expect(await abrir({ iccid: "9999" })).toContain("Nenhum chip virgem terminado em 9999 na última leitura.");
    cenario.tabelas = { ...cenario.tabelas, connect_leituras_nogle: [{ ...LEITURA, lida_em: haMinutos(3 * 24 * 60), falhas: 2 }] };
    const atrasada = await abrir();
    expect(atrasada).toContain("o servidor não conseguiu ler depois disso");
    expect(atrasada).toContain("Na última leitura, 2 partes não responderam");
    cenario.tabelas = { ...cenario.tabelas, connect_pdvs: [], connect_leituras_nogle: [] };
    const sem = await abrir();
    expect(sem).toContain("Nenhum PDV da Nogle para mostrar");
    expect(sem).toContain("A loja Água Verde (fictícia) ainda não está ligada a um PDV da Nogle");
    expect(sem).toContain("O servidor ainda não leu o estoque da Nogle.");
  });

  it("sem permissão da Ora Connect: só o aviso; o erro e o sucesso da ligação aparecem", async () => {
    cenario.permissoes = new Set(["venda.registrar"]);
    expect(await abrir()).toContain("O estoque de chips da Nogle é de quem opera ou gere a Ora Connect.");
    cenario.permissoes = new Set(["integracoes.gerir"]);
    expect(await abrir({ pdv: "5250", erro: "ja_ligada" })).toContain("Essa loja já está ligada a outro PDV da Nogle");
    expect(await abrir({ pdv: "5250", ok: "ligacao" })).toContain("Ligação salva: fica na auditoria.");
    expect(await abrir({ pdv: "5250" })).toContain("Salvar a ligação");
  });
});

describe("a ligação do PDV com a loja (CONNECT-d)", () => {
  const enviar = (campos: Record<string, string>) => {
    const dados = new FormData();
    for (const [k, v] of Object.entries(campos)) dados.set(k, v);
    return ligarPdv(dados);
  };
  it("liga e desliga por UMA função do banco; o erro do banco vira a mensagem; dado fora da forma não chega ao banco", async () => {
    await expect(enviar({ pdv: "5250", unidade: LOJA_2 })).rejects.toThrow("redirecionou para /connect/chips?pdv=5250&ok=ligacao");
    await expect(enviar({ pdv: "5250", unidade: "" })).rejects.toThrow("redirecionou para /connect/chips?pdv=5250&ok=ligacao");
    expect(cenario.rpc).toEqual([
      { nome: "connect_ligar_pdv", argumentos: { p_pdv: 5250, p_unidade: LOJA_2 } },
      { nome: "connect_ligar_pdv", argumentos: { p_pdv: 5250 } },
    ]);
    cenario.erroDaRpc = { code: "OR051" };
    await expect(enviar({ pdv: "5250", unidade: LOJA_1 })).rejects.toThrow("redirecionou para /connect/chips?pdv=5250&erro=ja_ligada");
    cenario.rpc = [];
    await expect(enviar({ pdv: "abc", unidade: LOJA_1 })).rejects.toThrow("redirecionou para /connect/chips?erro=dados");
    await expect(enviar({ pdv: "5250", unidade: "loja" })).rejects.toThrow("redirecionou para /connect/chips?pdv=5250&erro=dados");
    expect(cenario.rpc).toEqual([]);
  });
});

describe("a transferência de chips na tela (CONNECT-e)", () => {
  const T1 = "00000000-0000-4000-9000-0000000000d1";
  const T2 = "00000000-0000-4000-9000-0000000000d2";
  const PEDIDOS = [
    { id: T1, numero: 7, tipo: "esim", pdv_id: 5221, iccid: null, iccid_final: null, quantidade: 1, motivo: "Reposição", situacao: "confirmada",
      pedida_em: haMinutos(30), concluida_em: haMinutos(29), mensagem: "Sucesso.", resultado: { novos: [I3] } },
    { id: T2, numero: 8, tipo: "unidade", pdv_id: 5231, iccid: I1, iccid_final: null, quantidade: 1, motivo: null, situacao: "registrada",
      pedida_em: haMinutos(1), concluida_em: null, mensagem: null, resultado: {} },
  ];

  it("o dono vê o formulário, com as lojas e os PDVs ativos como destino, e os pedidos com a situação e o que chegou", async () => {
    cenario.tabelas = { ...cenario.tabelas, connect_transferencias_chips: PEDIDOS };
    const t = await abrir();
    emOrdem(t, "Transferir chips", "Livres no estoque geral (última leitura): 470 físicos · 223 eSIM", "Pedir a transferência");
    emOrdem(t, "Água Verde (PDV 5231)", "Butiatuvinha (PDV 5221)", "Revenda (fictícia) (PDV 5250)");
    emOrdem(t, "Nº 7", "Confirmada", "1 × eSIM por quantidade → Butiatuvinha (PDV 5221)", "Sucesso.", "Chegaram no PDV: …000037");
    emOrdem(t, "Nº 8", "Na fila", "1 × Um chip físico → Água Verde (PDV 5231)", "Cancelar o pedido");
    expect(t.match(/Cancelar o pedido/g)).toHaveLength(1);
  });

  it("o administrador vê os pedidos, sem o formulário nem o cancelamento; quem só opera, nada disso", async () => {
    cenario.tabelas = { ...cenario.tabelas, connect_transferencias_chips: PEDIDOS };
    cenario.permissoes = new Set(["integracoes.gerir"]);
    const adm = await abrir();
    expect(adm).toContain("Transferências pedidas");
    expect(adm).not.toContain("Pedir a transferência");
    expect(adm).not.toContain("Cancelar o pedido");
    cenario.permissoes = new Set(["connect.operar", "connect.gerir"]);
    cenario.tabelas = { ...cenario.tabelas, connect_leituras_nogle: [], connect_transferencias_chips: [] };
    const gerente = await abrir();
    expect(gerente).not.toContain("Transferir chips");
    expect(gerente).not.toContain("Transferências pedidas");
  });

  it("os avisos do pedido e do cancelamento", async () => {
    expect(await abrir({ ok: "transferencia", numero: "9" })).toContain("Pedido nº 9 registrado: o servidor envia à Nogle em até 1 minuto");
    expect(await abrir({ ok: "cancelada" })).toContain("Pedido cancelado: fica na auditoria.");
    expect(await abrir({ erro_transferencia: "sem_estoque" })).toContain("Não há chips livres bastantes no estoque geral da Ora");
    expect(await abrir({ erro_transferencia: "qualquer" })).toContain("Não foi possível concluir agora.");
  });

  it("as ações: cada tipo vai ao banco só com os seus campos; o erro vira a mensagem; o cancelamento pede o motivo", async () => {
    const enviar = (acao: (d: FormData) => Promise<unknown>, campos: Record<string, string>) => {
      const dados = new FormData();
      for (const [k, v] of Object.entries(campos)) dados.set(k, v);
      return acao(dados);
    };
    const CHAVE = "00000000-0000-4000-9000-0000000000c1";
    cenario.rpc = [];
    await expect(enviar(pedirTransferencia, { tipo: "esim", pdv: "5221", quantidade: "2", iccid: I1, chave: CHAVE })).rejects.toThrow("redirecionou para /connect/chips?ok=transferencia");
    await expect(enviar(pedirTransferencia, { tipo: "lote", pdv: "5250", iccid: I1, iccid_final: I2, motivo: "Revenda", chave: CHAVE })).rejects.toThrow("ok=transferencia");
    expect(cenario.rpc).toEqual([
      { nome: "connect_transferir_chips", argumentos: { p_tipo: "esim", p_pdv: 5221, p_chave: CHAVE, p_quantidade: 2 } },
      { nome: "connect_transferir_chips", argumentos: { p_tipo: "lote", p_pdv: 5250, p_chave: CHAVE, p_iccid: I1, p_iccid_final: I2, p_motivo: "Revenda" } },
    ]);
    cenario.erroDaRpc = { code: "OR052" };
    await expect(enviar(pedirTransferencia, { tipo: "esim", pdv: "5221", quantidade: "500", chave: CHAVE })).rejects.toThrow("redirecionou para /connect/chips?erro_transferencia=sem_estoque");
    cenario.erroDaRpc = null;
    cenario.rpc = [];
    await expect(enviar(pedirTransferencia, { tipo: "esim", pdv: "5221", quantidade: "0", chave: CHAVE })).rejects.toThrow("erro_transferencia=dados");
    await expect(enviar(cancelarTransferencia, { transferencia: T2, motivo: "x" })).rejects.toThrow("erro_transferencia=motivo");
    expect(cenario.rpc).toEqual([]);
    await expect(enviar(cancelarTransferencia, { transferencia: T2, motivo: " Pedido errado " })).rejects.toThrow("redirecionou para /connect/chips?ok=cancelada");
    expect(cenario.rpc).toEqual([{ nome: "connect_cancelar_transferencia", argumentos: { p_transferencia: T2, p_motivo: "Pedido errado" } }]);
  });
});
