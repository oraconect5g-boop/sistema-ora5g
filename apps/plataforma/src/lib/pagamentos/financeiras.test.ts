// Valores a receber das financeiras (lote L7b): leitura estrita, idade das contas, formulário do repasse e
// mensagens. A regra do banco está em packages/banco/src/financeiras-a-receber.test.ts. Dados fictícios.
import { describe, expect, it } from "vitest";

import { erroDasFinanceiras, idadeDaConta, lerFinanceirasAReceber, lerRepasse } from "./financeiras";

const CONTA = "00000000-0000-4000-9000-0000000000a1";
const VENDA = "00000000-0000-4000-9000-0000000000b1";
const RESPOSTA = {
  por_devedor: [
    { devedor: "aiva", abertas: 1, valor_aberto: "129900", mais_antiga_dias: 12, recebidas: 0, valor_recebido: 0, taxa_observada: 0 },
    { devedor: "payjoy", abertas: 0, valor_aberto: 0, mais_antiga_dias: null, recebidas: 1, valor_recebido: 125_000, taxa_observada: 4_900 },
  ],
  contas: [
    { id: CONTA, venda_id: VENDA, venda_numero: 42, concluida_em: "2026-11-01T15:00:00Z", devedor: "aiva", valor: 129_900, situacao: "aberta", dias: 12, recebido_em: null, valor_recebido: null, referencia: null },
    { id: VENDA, venda_id: CONTA, venda_numero: 40, concluida_em: "2026-10-30T15:00:00Z", devedor: "payjoy", valor: 129_900, situacao: "recebida", dias: 14, recebido_em: "2026-11-12", valor_recebido: 125_000, referencia: "PJ-1" },
  ],
};
const com = (mudar: (r: typeof RESPOSTA) => unknown) => mudar(JSON.parse(JSON.stringify(RESPOSTA)) as typeof RESPOSTA);

describe("financeiras: leitura e formulário (L7b)", () => {
  it("lê os totais por financeira e as contas, abertas e recebidas", () => {
    const f = lerFinanceirasAReceber(RESPOSTA);
    expect(f.porDevedor).toEqual([
      { devedor: "aiva", abertas: 1, valorAberto: 129_900, maisAntigaDias: 12, recebidas: 0, valorRecebido: 0, taxaObservada: 0 },
      { devedor: "payjoy", abertas: 0, valorAberto: 0, maisAntigaDias: null, recebidas: 1, valorRecebido: 125_000, taxaObservada: 4_900 },
    ]);
    expect(f.contas.map((c) => [c.vendaNumero, c.devedor, c.situacao, c.valorRecebido, c.referencia])).toEqual([[42, "aiva", "aberta", null, null], [40, "payjoy", "recebida", 125_000, "PJ-1"]]);
  });

  it("forma inesperada é falha: financeira desconhecida, recebida sem os dados do repasse, aberta com eles, recebido acima do valor", () => {
    const ruins = [
      null, { ...RESPOSTA, contas: undefined },
      com((r) => { (r.por_devedor[0] as Record<string, unknown>).devedor = "banco"; return r; }),
      com((r) => { (r.por_devedor[0] as Record<string, unknown>).mais_antiga_dias = null; return r; }),
      com((r) => { (r.contas[1] as Record<string, unknown>).referencia = null; return r; }),
      com((r) => { (r.contas[0] as Record<string, unknown>).recebido_em = "2026-11-12"; return r; }),
      com((r) => { (r.contas[1] as Record<string, unknown>).valor_recebido = 129_901; return r; }),
      com((r) => { (r.contas[0] as Record<string, unknown>).situacao = "cancelada"; return r; }),
      com((r) => { (r.contas[0] as Record<string, unknown>).id = "conta"; return r; }),
    ];
    for (const ruim of ruins) expect(() => lerFinanceirasAReceber(ruim), JSON.stringify(ruim)).toThrow();
  });

  it("idade da conta aberta: até uma semana neutra, até 30 dias informativa, depois em atenção (sem prazo contratual, só os dias desde a venda)", () => {
    expect([idadeDaConta(0), idadeDaConta(1), idadeDaConta(7), idadeDaConta(8), idadeDaConta(31)]).toEqual([
      { rotulo: "vendida hoje", tom: "neutro" }, { rotulo: "há 1 dia", tom: "neutro" }, { rotulo: "há 7 dias", tom: "neutro" },
      { rotulo: "há 8 dias", tom: "info" }, { rotulo: "há 31 dias", tom: "aviso" },
    ]);
  });

  it("o formulário do repasse: conta, referência, valor em reais e data", () => {
    const f = (campos: Record<string, string>) => ({ get: (n: string) => ({ conta: CONTA, referencia: " PJ   lote 1 ", recebido: "1.250,00", data: "2026-11-12", ...campos })[n] ?? null });
    expect(lerRepasse(f({}))).toEqual({ ok: true, conta: CONTA, referencia: "PJ lote 1", recebido: 125_000, data: "2026-11-12" });
    expect(lerRepasse(f({ recebido: "0" }))).toMatchObject({ ok: true, recebido: 0 });
    expect(lerRepasse(f({ conta: "x" }))).toEqual({ ok: false, erro: "dados" });
    expect(lerRepasse(f({ referencia: "ab" }))).toEqual({ ok: false, erro: "referencia" });
    expect(lerRepasse(f({ recebido: "-1" }))).toEqual({ ok: false, erro: "recebido" });
    expect(lerRepasse(f({ recebido: "abc" }))).toEqual({ ok: false, erro: "recebido" });
    expect(lerRepasse(f({ data: "12/11/2026" }))).toEqual({ ok: false, erro: "data" });
  });

  it("o erro do banco vira a mensagem certa", () => {
    expect(erroDasFinanceiras({ code: "P0002" })).toBe("nao_encontrada");
    expect(erroDasFinanceiras({ code: "OR030" })).toBe("ja_recebido");
    expect(erroDasFinanceiras({ code: "22023", message: "Informe a referência do repasse (de 3 a 80 letras)" })).toBe("referencia");
    expect(erroDasFinanceiras({ code: "22023", message: "Valor recebido entre zero e o valor a receber" })).toBe("recebido");
    expect(erroDasFinanceiras({ code: "22023", message: "A data do repasse vai do dia da venda até hoje" })).toBe("data");
    expect(erroDasFinanceiras({ code: "22023", message: "Conta cancelada com a venda: não há o que receber" })).toBe("cancelada");
    expect(erroDasFinanceiras({ code: "22023", message: "Informe o motivo" })).toBe("motivo");
    expect(erroDasFinanceiras({ code: "08006" })).toBe("falha");
  });
});
