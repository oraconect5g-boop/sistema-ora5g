// As contas bancárias (lote CONTAS-a): a leitura estrita do saldo, os formulários e as mensagens. Dados FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { RespostaInesperada } from "../financeiro/painel";
import { ERROS_DAS_CONTAS, erroDasContas, lerContasBancarias, lerSaldo, textoDaConta, validarContaNova, validarMudancaDaConta } from "./regras";

const CONTA = "00000000-0000-4000-8000-0000000000a1";
const EMPRESA = "00000000-0000-4000-8000-0000000000e1";
const linha = (extra: Record<string, unknown> = {}) => ({
  id: CONTA, numero: 1, empresa_id: EMPRESA, empresa: "Ora Telecom (fictícia)", apelido: "Itaú principal", banco: "Itaú", agencia: "1234-5",
  conta: null, ativa: true, saldo_inicial_centavos: 500_000, saldo_inicial_em: "2026-11-02", extratos: 2, entradas_centavos: 150_000,
  saidas_centavos: 45_000, saldo_centavos: 605_000, saldo_em: "2026-11-06", ...extra,
});
const campos = (valores: Record<string, string>) => ({ get: (nome: string) => valores[nome] ?? null });
const HOJE = "2026-11-18";

describe("a leitura do saldo", () => {
  it("converte cada conta e confere que o saldo fecha com as partes", () => {
    expect(lerContasBancarias([linha()])).toEqual([{
      id: CONTA, numero: 1, empresaId: EMPRESA, empresa: "Ora Telecom (fictícia)", apelido: "Itaú principal", banco: "Itaú", agencia: "1234-5",
      conta: null, ativa: true, saldoInicial: 500_000, saldoInicialEm: "2026-11-02", extratos: 2, entradas: 150_000, saidas: 45_000,
      saldo: 605_000, saldoEm: "2026-11-06",
    }]);
    expect(lerContasBancarias([])).toEqual([]);
  });

  it("forma inesperada é erro, nunca zero: saldo que não fecha, campo ausente, data fora do formato, número em texto", () => {
    for (const ruim of [linha({ saldo_centavos: 1 }), linha({ apelido: undefined }), linha({ saldo_em: "06/11/2026" }), linha({ extratos: "2" }),
      linha({ ativa: "true" }), linha({ id: "x" })]) {
      expect(() => lerContasBancarias([ruim])).toThrow(RespostaInesperada);
    }
    expect(() => lerContasBancarias({})).toThrow(RespostaInesperada);
  });
});

describe("os formulários", () => {
  it("lê o saldo em reais com vírgula, com sinal", () => {
    expect([lerSaldo("1.234,56"), lerSaldo("-50,00"), lerSaldo("R$ 0"), lerSaldo("0,5"), lerSaldo(""), lerSaldo("abc"), lerSaldo("1,234.56")])
      .toEqual([123_456, -5_000, 0, 50, null, null, null]);
  });

  it("a conta nova: a empresa, o apelido, o banco, a agência e a conta no formato, o saldo e a data de hoje ou de antes", () => {
    const certo = { empresa: EMPRESA, apelido: "  Itaú   principal ", banco: "Itaú", agencia: "1234-5", conta: "", saldo_inicial: "5.000,00", saldo_em: "2026-11-02" };
    expect(validarContaNova(campos(certo), HOJE)).toEqual({ ok: true, dados: {
      empresa: EMPRESA, apelido: "Itaú principal", banco: "Itaú", agencia: "1234-5", conta: null, saldoInicial: 500_000, saldoEm: "2026-11-02",
    } });
    const casos: [Record<string, string>, string][] = [
      [{ empresa: "x" }, "dados"], [{ apelido: "I" }, "apelido"], [{ banco: "" }, "banco"], [{ agencia: "12a" }, "agencia"],
      [{ conta: "12.345" }, "conta"], [{ saldo_inicial: "" }, "saldo"], [{ saldo_em: "2026-11-19" }, "data"], [{ saldo_em: "02/11/2026" }, "data"],
    ];
    for (const [mudanca, erro] of casos) expect(validarContaNova(campos({ ...certo, ...mudanca }), HOJE), erro).toEqual({ ok: false, erro });
  });

  it("a mudança pede o motivo e diz se a conta continua ativa", () => {
    const certo = { conta_bancaria: CONTA, apelido: "Itaú", banco: "Itaú", agencia: "", conta: "12345-6", saldo_inicial: "-10,00", saldo_em: "2026-11-01", ativa: "sim", motivo: "Conta conferida" };
    expect(validarMudancaDaConta(campos(certo), HOJE)).toMatchObject({ ok: true, dados: { id: CONTA, ativa: true, saldoInicial: -1_000, motivo: "Conta conferida", conta: "12345-6", agencia: null } });
    expect(validarMudancaDaConta(campos({ ...certo, ativa: "" }), HOJE)).toMatchObject({ ok: true, dados: { ativa: false } });
    expect(validarMudancaDaConta(campos({ ...certo, motivo: "ok" }), HOJE)).toEqual({ ok: false, erro: "motivo" });
    expect(validarMudancaDaConta(campos({ ...certo, conta_bancaria: "x" }), HOJE)).toEqual({ ok: false, erro: "dados" });
  });

  it("o texto da conta junta o banco com o que houver da agência e da conta", () => {
    expect(textoDaConta({ banco: "Itaú", agencia: "1234-5", conta: "12345-6" })).toBe("Itaú · ag. 1234-5 · c/c 12345-6");
    expect(textoDaConta({ banco: "Caixa", agencia: null, conta: null })).toBe("Caixa");
  });
});

describe("as recusas do banco", () => {
  it("cada recusa vira uma mensagem que existe; o texto do banco não vai para a tela", () => {
    const casos: [{ code: string; message?: string }, string][] = [
      [{ code: "42501" }, "permissao"], [{ code: "23505" }, "apelido_repetido"], [{ code: "OR044" }, "cruzado"], [{ code: "P0002" }, "nao_encontrada"],
      [{ code: "22023", message: "O apelido da conta tem de 2 a 60 letras" }, "apelido"],
      [{ code: "22023", message: "O banco tem de 2 a 60 letras" }, "banco"],
      [{ code: "22023", message: "A agência é só número, com o dígito depois do traço" }, "agencia"],
      [{ code: "22023", message: "A conta é só número, com o dígito depois do traço" }, "conta"],
      [{ code: "22023", message: "Informe o saldo inicial e a data dele" }, "saldo"],
      [{ code: "22023", message: "O saldo inicial é de um dia que já passou ou de hoje" }, "data"],
      [{ code: "22023", message: "Informe o motivo da mudança (de 3 a 200 letras)" }, "motivo"],
      [{ code: "22023", message: "A conta bancária está inativa" }, "inativa"],
      [{ code: "22023", message: "Só o extrato do banco vai para uma conta bancária" }, "so_banco"],
      [{ code: "22023", message: "outra coisa" }, "dados"], [{ code: "57014" }, "falha"],
    ];
    for (const [erro, chave] of casos) {
      expect(erroDasContas(erro), erro.message ?? erro.code).toBe(chave);
      expect(ERROS_DAS_CONTAS[chave as keyof typeof ERROS_DAS_CONTAS]).toBeTruthy();
    }
    expect(erroDasContas(null)).toBe("falha");
  });
});
