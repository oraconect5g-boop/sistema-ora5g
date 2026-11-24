// Os depósitos das maquininhas (lote FIN-006a: ORA-FIN-006) com a sessão e o Supabase SIMULADOS: nenhuma credencial, dados
// fictícios. As regras do banco estão em packages/banco/src/deposito-da-maquininha*.test.ts; a leitura e os formulários,
// em lib/extratos/depositos.test.ts.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const LINHA = "00000000-0000-4000-9000-0000000000d1";
const OUTRA = "00000000-0000-4000-9000-0000000000d2";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, Resposta>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
vi.mock("next/form", () => ({ default: ({ children }: { children: unknown }) => children }));
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-24T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Dono (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    rpc: (nome: string, argumentos: Record<string, unknown> = {}) => {
      cenario.chamadas.push({ nome, argumentos });
      return Promise.resolve(cenario.respostas[nome] ?? { data: null, error: null });
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import { casarDeposito, desfazerDeposito } from "./acoes";
import DepositosDasMaquininhas from "./page";

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
const tela = async (parametros: Record<string, string> = {}) => texto(await DepositosDasMaquininhas({ searchParams: Promise.resolve(parametros as never) })).replace(/\s+/g, " ");
const destinoDe = async (acao: Promise<unknown>) => {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  throw new Error("a ação não redirecionou");
};
const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
};
const chamadas = (nome: string) => cenario.chamadas.filter((c) => c.nome === nome).map((c) => c.argumentos);
const PAINEL = {
  depositos: [
    { provedor: "picpay", data_liquidacao: "2026-11-21", pagamentos: 2, esperado: 23_384, bruto: 23_700, casado: null,
      sugestoes: [{ linha: LINHA, extrato: 5, data: "2026-11-21", valor: 23_384, descricao: "PICPAY REPASSE" }, { linha: OUTRA, extrato: 5, data: "2026-11-22", valor: 23_000, descricao: null }] },
    { provedor: "pagbank", data_liquidacao: "2026-11-20", pagamentos: 1, esperado: 7_600, bruto: 7_900, sugestoes: [],
      casado: { linha: OUTRA, extrato: 4, data: "2026-11-21", recebido: 7_500, esperado_ao_casar: 7_600, pagamentos_ao_casar: 1, motivo: "Tarifa de transferência" } },
  ],
  sem_conciliacao: { pagamentos: 3, valor: 23_700 },
};

beforeEach(() => {
  cenario.permissoes = new Set(["pagamento.conciliar"]);
  cenario.chamadas = [];
  cenario.respostas = { maquininha_depositos_painel: { data: PAINEL, error: null } };
});

describe("a tela dos depósitos das maquininhas (FIN-006a)", () => {
  it("mostra o esperado, o recebido, a diferença e cada depósito: o casado com a linha e o motivo; o solto com as linhas que podem ser ele", async () => {
    const t = await tela({ inicio: "2026-11-01", fim: "2026-11-24" });
    expect(chamadas("maquininha_depositos_painel")).toEqual([{ p_inicio: "2026-11-01", p_fim: "2026-11-24" }]);
    for (const trecho of [
      "Depósitos das maquininhas", "De 01/11/2026 a 24/11/2026, pelo dia do dinheiro",
      "Esperado", "R$ 309,84", "2 depósitos", "Recebido no banco", "R$ 75,00", "1 depósito casado", "Diferença dos casados", "−R$ 1,00",
      "Sem linha no extrato", "e 3 pagamentos das maquininhas (R$ 237,00) ainda sem conciliação",
      "PicPay · dinheiro de 21/11/2026", "2 pagamentos · vendido R$ 237,00 · esperado R$ 233,84 (Pix e cartão na maquininha PicPay)", "sem linha no extrato",
      "Nº 5 · 21/11/2026 · R$ 233,84 (o mesmo valor) · PICPAY REPASSE", "Nº 5 · 22/11/2026 · R$ 230,00 (diferença −R$ 3,84)", "Casar",
      "PagBank · dinheiro de 20/11/2026", "casado, diferença −R$ 1,00", "Linha do extrato nº 4, de 21/11/2026: R$ 75,00 recebidos. Motivo da diferença: Tarifa de transferência.",
      "Desfazer",
    ]) expect(t, trecho).toContain(trecho);
  });

  it("quem não concilia vê o aviso sem ler nada; a gerência da loja, recusada pelo banco, também; o painel sem depósitos explica de onde eles vêm", async () => {
    cenario.permissoes = new Set();
    expect(await tela()).toContain("Os depósitos das maquininhas são de quem concilia pela rede inteira (o dono).");
    expect(chamadas("maquininha_depositos_painel")).toEqual([]);
    cenario.permissoes = new Set(["pagamento.conciliar"]);
    cenario.respostas.maquininha_depositos_painel = { data: null, error: { code: "42501", message: "Sem permissão para os depósitos das maquininhas" } };
    expect(await tela()).toContain("Os depósitos das maquininhas são de quem concilia pela rede inteira (o dono).");
    cenario.respostas.maquininha_depositos_painel = { data: { depositos: [], sem_conciliacao: { pagamentos: 0, valor: 0 } }, error: null };
    const vazio = await tela();
    expect(vazio).toContain("Nenhum depósito no período");
    expect(vazio).toContain("todos os pagamentos das maquininhas conciliados");
    // Resposta fora da forma é falha da tela, não zero.
    cenario.respostas.maquininha_depositos_painel = { data: { depositos: [{ ...PAINEL.depositos[0], provedor: "cielo" }], sem_conciliacao: PAINEL.sem_conciliacao }, error: null };
    await expect(tela()).rejects.toThrow();
    cenario.respostas.maquininha_depositos_painel = { data: null, error: { code: "57014" } };
    await expect(tela()).rejects.toThrow();
  });

  it("casar chama o banco com a maquininha, o dia, a linha e o motivo, e volta ao mesmo período com a mensagem", async () => {
    const base = { maquininha: "picpay", data_liquidacao: "2026-11-21", inicio: "2026-11-01", fim: "2026-11-24" };
    cenario.respostas.maquininha_deposito_casar = { data: { diferenca: 0, repetida: false }, error: null };
    expect(await destinoDe(casarDeposito(formulario({ ...base, linha: LINHA })))).toBe("/pagamentos/depositos?inicio=2026-11-01&fim=2026-11-24&ok=casado");
    expect(chamadas("maquininha_deposito_casar")).toEqual([{ p_provedor: "picpay", p_data: "2026-11-21", p_linha: LINHA, p_motivo: null }]);
    cenario.respostas.maquininha_deposito_casar = { data: { diferenca: -384, repetida: false }, error: null };
    expect(await destinoDe(casarDeposito(formulario({ ...base, linha: OUTRA, motivo: "  Tarifa   do saque " })))).toContain("ok=casado_com_diferenca");
    expect(chamadas("maquininha_deposito_casar").at(-1)).toMatchObject({ p_motivo: "Tarifa do saque" });
    cenario.respostas.maquininha_deposito_casar = { data: { diferenca: 0, repetida: true }, error: null };
    expect(await destinoDe(casarDeposito(formulario({ ...base, linha: LINHA })))).toContain("ok=ja_casado");
    // As recusas do banco viram a mensagem da tela.
    for (const [error, chave] of [
      [{ code: "22023", message: "O valor da linha não é o esperado do depósito: diga o motivo da diferença" }, "diferenca"],
      [{ code: "OR045", message: "Esta linha já é de outro depósito, ou este depósito já tem linha: desfaça antes" }, "ocupado"],
      [{ code: "OR046", message: "Esta linha do extrato já tem outro uso (conciliada, repasse, estorno ou fora da conta): desfaça antes" }, "linha_em_uso"],
      [{ code: "P0002", message: "Nenhum pagamento desta maquininha com o dinheiro para este dia" }, "sem_pagamentos"],
      [{ code: "P0002", message: "Linha do extrato não encontrada" }, "linha"],
      [{ code: "42501", message: "Só quem concilia pela rede inteira casa o depósito" }, "permissao"],
    ] as const) {
      cenario.respostas.maquininha_deposito_casar = { data: null, error };
      expect(await destinoDe(casarDeposito(formulario({ ...base, linha: LINHA }))), error.message).toContain(`erro=${chave}`);
    }
    // Dado adulterado nem chega ao banco.
    cenario.chamadas = [];
    expect(await destinoDe(casarDeposito(formulario({ ...base, maquininha: "cielo", linha: LINHA })))).toContain("erro=dados");
    expect(await destinoDe(casarDeposito(formulario({ ...base, linha: "x" })))).toContain("erro=linha");
    expect(await destinoDe(casarDeposito(formulario({ ...base, linha: LINHA, motivo: "ab" })))).toContain("erro=motivo");
    // O período adulterado não volta no endereço (a última resposta do banco ainda é a recusa de permissão).
    expect(await destinoDe(casarDeposito(formulario({ ...base, linha: LINHA, inicio: "../x" })))).toBe("/pagamentos/depositos?fim=2026-11-24&erro=permissao");
    expect(chamadas("maquininha_deposito_casar")).toHaveLength(1);
  });

  it("desfazer pede o motivo e volta com a mensagem; o que já não estava casado diz que nada mudou", async () => {
    const base = { maquininha: "pagbank", data_liquidacao: "2026-11-20" };
    expect(await destinoDe(desfazerDeposito(formulario({ ...base, motivo: "ab" })))).toBe("/pagamentos/depositos?erro=motivo");
    expect(chamadas("maquininha_deposito_desfazer")).toEqual([]);
    cenario.respostas.maquininha_deposito_desfazer = { data: true, error: null };
    expect(await destinoDe(desfazerDeposito(formulario({ ...base, motivo: "Era outra linha" })))).toBe("/pagamentos/depositos?ok=desfeito");
    expect(chamadas("maquininha_deposito_desfazer")).toEqual([{ p_provedor: "pagbank", p_data: "2026-11-20", p_motivo: "Era outra linha" }]);
    cenario.respostas.maquininha_deposito_desfazer = { data: false, error: null };
    expect(await destinoDe(desfazerDeposito(formulario({ ...base, motivo: "De novo" })))).toBe("/pagamentos/depositos?ok=sem_mudanca");
  });
});
