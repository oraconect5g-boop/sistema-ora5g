import { describe, expect, it } from "vitest";

import { FUNCOES_NOGLE } from "./catalogo";
import { iccidNoFormatoContel, linhaValida, minutosIlimitados, normalizarResposta, situacaoDoIccid } from "./regras";

// Exemplos copiados da documentação oficial (docs/integracoes/nogle/colecao-postman-2026-11-07.json).

describe("catálogo gerado da documentação oficial", () => {
  it("tem as 62 funções, sem método e caminho repetidos", () => {
    expect(FUNCOES_NOGLE).toHaveLength(62);
    expect(new Set(FUNCOES_NOGLE.map((f) => `${f.metodo} ${f.caminho}`)).size).toBe(62);
  });

  it("cobre os 16 grupos da documentação", () => {
    expect(new Set(FUNCOES_NOGLE.map((f) => f.grupo))).toEqual(new Set([
      "Token", "Geral", "Cliente", "Linha", "Histórico de consumo", "Ativação", "Recarga", "Portabilidade",
      "Compra", "Atendimento", "Relatórios", "FAQ", "Validações", "Pagamento", "Saldo", "PDV",
    ]));
  });

  it("toda operação que cria algo na operadora diz o que consultar antes de reenviar", () => {
    for (const caminho of ["/ativacao/solicitar", "/recarga/solicitar", "/portabilidade/solicitar", "/compra/solicitar", "/atendimento/bloqueio"]) {
      const funcao = FUNCOES_NOGLE.find((f) => f.caminho === caminho);
      expect(funcao?.reconsultar.length, caminho).toBeGreaterThan(0);
      for (const consulta of funcao?.reconsultar ?? []) expect(FUNCOES_NOGLE.some((f) => f.caminho === consulta), consulta).toBe(true);
    }
  });

  it("registra os campos obrigatórios da ativação e as consultas GET que levam corpo", () => {
    const ativacao = FUNCOES_NOGLE.find((f) => f.caminho === "/ativacao/solicitar");
    expect(ativacao?.obrigatorios).toEqual(expect.arrayContaining(["metodo_pagamento", "nome", "cpf", "data_nascimento", "chips.id_plano", "chips.ddd", "chips.iccid"]));
    expect(FUNCOES_NOGLE.find((f) => f.caminho === "/linhas/detalhes")?.corpoEmGet).toBe(true);
    expect(FUNCOES_NOGLE.filter((f) => f.corpoEmGet).length).toBe(25);
  });

  it("bloqueio e desbloqueio de linha ficam com a gestão; consulta de linha fica na loja", () => {
    expect(FUNCOES_NOGLE.find((f) => f.caminho === "/atendimento/bloqueio")?.quem).toBe("gestao");
    expect(FUNCOES_NOGLE.find((f) => f.caminho === "/linhas/detalhes")?.quem).toBe("loja");
  });
});

describe("respostas da operadora em um formato só", () => {
  it("sucesso com retorno=true e dados embrulhados", () => {
    const r = normalizarResposta(200, { retorno: true, mensagem: "", data: { restante_dados: 2395.226721, restante_minutos: 60, restante_sms: 60 } });
    expect(r.ok).toBe(true);
    expect(r.dados).toEqual({ restante_dados: 2395.226721, restante_minutos: 60, restante_sms: 60 });
  });

  it("falha de negócio com HTTP 200 (retorno=false) não vira sucesso", () => {
    const r = normalizarResposta(200, { retorno: false, mensagem: "Cliente não encontrado.", recarga: [] });
    expect(r).toMatchObject({ ok: false, mensagem: "Cliente não encontrado." });
  });

  it("erro de validação, inclusive quando vem com HTTP 200", () => {
    for (const status of [422, 200]) {
      const r = normalizarResposta(status, { message: "The given data was invalid.", errors: { "numeros.0.numero": ["O campo número do telefone é obrigatório."] } });
      expect(r.ok, String(status)).toBe(false);
      expect(r.mensagem).toBe("O campo número do telefone é obrigatório.");
      expect(r.errosDeCampo["numeros.0.numero"]).toHaveLength(1);
    }
  });

  it("404 com {erro}, envelope {status} do atendimento e corpo sem envelope", () => {
    expect(normalizarResposta(404, { erro: "Endpoint inexistente ou recurso não encontrato." })).toMatchObject({ ok: false });
    expect(normalizarResposta(200, { status: false, mensagem: "Motivo de bloqueio não encontrado", data: null })).toMatchObject({ ok: false, mensagem: "Motivo de bloqueio não encontrado" });
    expect(normalizarResposta(200, { status: true, mensagem: "Bloqueio realizado com sucesso.", data: "2023-06-04 20:01:44" })).toMatchObject({ ok: true, dados: "2023-06-04 20:01:44" });
    expect(normalizarResposta(200, { valor_frete: "4.90", valor_chip: "10.00" })).toMatchObject({ ok: true, dados: { valor_frete: "4.90", valor_chip: "10.00" } });
    expect(normalizarResposta(200, [{ id: 6, descricao: "Atendimento" }])).toMatchObject({ ok: true });
  });

  it("{mensagem} sozinho é ambíguo: decide o código HTTP", () => {
    expect(normalizarResposta(200, { mensagem: "Linha atualizada com sucesso." }).ok).toBe(true);
    expect(normalizarResposta(400, { mensagem: "Chip já está ativo." })).toMatchObject({ ok: false, mensagem: "Chip já está ativo." });
  });

  it("sem resposta ou erro do servidor: orienta consultar antes de repetir", () => {
    expect(normalizarResposta(0, null).mensagem).toMatch(/Consulte antes de tentar de novo/);
    expect(normalizarResposta(502, "Bad Gateway").ok).toBe(false);
    expect(normalizarResposta(200, "texto").ok).toBe(false);
  });
});

describe("regras de chip e linha da documentação", () => {
  it("só chip virgem (88) pode ser ativado; em processamento (33) não se reenvia", () => {
    expect(situacaoDoIccid(88).podeAtivar).toBe(true);
    for (const codigo of [11, 22, 33, 99]) expect(situacaoDoIccid(codigo).podeAtivar, String(codigo)).toBe(false);
    expect(situacaoDoIccid("33").orientacao).toMatch(/Não reenvie/);
    expect(situacaoDoIccid(42)).toMatchObject({ codigo: null, podeAtivar: false });
    expect(situacaoDoIccid("constructor")).toMatchObject({ codigo: null });
  });

  it("linha com 11 dígitos e ICCID de 19 começando com 8955", () => {
    expect(linhaValida("(41) 9 0000-0101")).toBe(true);
    expect(linhaValida("4133334444")).toBe(false);
    expect(iccidNoFormatoContel("8955100000000000017")).toBe(true);
    expect(iccidNoFormatoContel("8955")).toBe(false);
  });

  it("mais de 999 minutos significa ligações ilimitadas", () => {
    expect(minutosIlimitados(1000)).toBe(true);
    expect(minutosIlimitados(60)).toBe(false);
  });
});
