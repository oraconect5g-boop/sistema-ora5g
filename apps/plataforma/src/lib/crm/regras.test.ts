// Regras dos formulários do funil e da agenda (L5b).
import { describe, expect, it } from "vitest";

import { centavosDigitados, dataLocalParaIso, erroDoCrm, lerAtividade, lerOportunidade, lerProximoPasso, paraCampoLocal } from "./regras";

const form = (campos: Record<string, string>) => ({ get: (n: string) => campos[n] ?? null });

describe("datas e valores", () => {
  it("campo datetime-local vira instante no horário de Brasília e volta igual", () => {
    expect(dataLocalParaIso("2026-11-12T14:30")).toBe("2026-11-12T14:30:00-03:00");
    expect(new Date(dataLocalParaIso("2026-11-12T14:30") as string).toISOString()).toBe("2026-11-12T17:30:00.000Z");
    expect(dataLocalParaIso("")).toBeNull();
    expect(dataLocalParaIso("amanhã")).toBeUndefined();
    expect(paraCampoLocal("2026-11-12T17:30:00.000Z")).toBe("2026-11-12T14:30");
    expect(paraCampoLocal(null)).toBe("");
  });

  it("reais digitados em centavos", () => {
    expect(centavosDigitados("1.299,90")).toBe(129_990);
    expect(centavosDigitados("80")).toBe(8_000);
    expect(centavosDigitados("")).toBeNull();
    expect(centavosDigitados("12,345")).toBeUndefined();
  });
});

describe("formulários", () => {
  it("oportunidade: origem do catálogo, interesse e próximo passo com data (os dois ou nenhum)", () => {
    expect(lerOportunidade(form({ origem: "whatsapp", interesse: " Galaxy  A15 ", campanha: "Black Friday", valor_estimado: "1.499,00",
      proximo_passo: "Ligar", proximo_passo_em: "2026-11-12T10:00" }))).toEqual({ ok: true, dados: {
      origem: "whatsapp", interesse: "Galaxy A15", campanha: "Black Friday", valor_estimado: 149_900, proximo_passo: "Ligar", proximo_passo_em: "2026-11-12T10:00:00-03:00" } });
    expect(lerOportunidade(form({ origem: "pombo", interesse: "Galaxy" }))).toEqual({ ok: false, erro: "origem" });
    expect(lerOportunidade(form({ origem: "loja", interesse: "ok" }))).toEqual({ ok: false, erro: "interesse" });
    expect(lerOportunidade(form({ origem: "loja", interesse: "Galaxy", valor_estimado: "abc" }))).toEqual({ ok: false, erro: "valor" });
    expect(lerOportunidade(form({ origem: "loja", interesse: "Galaxy", proximo_passo: "Ligar" }))).toEqual({ ok: false, erro: "proximo_passo" });
    expect(lerProximoPasso(form({}))).toEqual({ ok: true, passo: {} });
  });

  it("atividade: tipo, descrição e vencimento", () => {
    expect(lerAtividade(form({ tipo: "ligacao", descricao: "Ligar", vence_em: "2026-11-12T09:00" })))
      .toEqual({ ok: true, dados: { tipo: "ligacao", descricao: "Ligar", vence_em: "2026-11-12T09:00:00-03:00" } });
    expect(lerAtividade(form({ tipo: "ligacao", descricao: "Ligar", vence_em: "" }))).toEqual({ ok: false, erro: "atividade" });
    expect(lerAtividade(form({ tipo: "voar", descricao: "Ligar", vence_em: "2026-11-12T09:00" }))).toEqual({ ok: false, erro: "atividade" });
  });

  it("erros do banco viram chaves do catálogo", () => {
    expect(erroDoCrm({ code: "42501", message: "Reabrir oportunidade é da gerência" })).toBe("encerrada");
    expect(erroDoCrm({ code: "42501", message: "Só a gerência registra oportunidade para outra pessoa" })).toBe("permissao");
    expect(erroDoCrm({ code: "P0002", message: "Cliente não encontrado" })).toBe("cliente");
    expect(erroDoCrm({ code: "P0002", message: "Oportunidade não encontrada para você" })).toBe("nao_encontrada");
    expect(erroDoCrm({ code: "22023", message: "Escolha o motivo da perda" })).toBe("motivo_perda");
    expect(erroDoCrm({ code: "22023", message: "A venda precisa estar concluída e ligada ao mesmo cliente" })).toBe("venda");
    expect(erroDoCrm({ code: "22023", message: "O responsável precisa atender nesta loja" })).toBe("responsavel");
    expect(erroDoCrm({ code: "22023", message: "Atividade já encerrada" })).toBe("atividade_encerrada");
    expect(erroDoCrm({ code: "22023", message: "O próximo passo vai de hoje até um ano" })).toBe("proximo_passo");
    expect(erroDoCrm({ code: "OR004" })).toBe("chave");
    expect(erroDoCrm({ code: "XX000" })).toBe("falha");
  });
});
