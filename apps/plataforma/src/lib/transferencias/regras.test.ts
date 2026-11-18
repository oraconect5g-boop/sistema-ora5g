import { describe, expect, it } from "vitest";

import {
  comALinha, efeitoNoEstoque, erroDaTransferencia, escreverLinhasDaRemessa, lerIdentificadores, lerLinhasDaRemessa, lerQuantidade, linhasDoFormulario, MAXIMO_DE_LINHAS_DA_REMESSA, nomeDaSituacao,
  saldoDaLoja, semALinha, SITUACOES_DA_TRANSFERENCIA,
} from "./regras";

describe("regras da tela de transferência", () => {
  it("IMEI/ICCID: um por linha, sem máscara e sem repetir; número curto recusa a lista", () => {
    expect(lerIdentificadores("35-209900-176148-7\n352099001761487, 8955100000000000013")).toEqual(["352099001761487", "8955100000000000013"]);
    expect(lerIdentificadores("  ")).toEqual([]);
    expect(lerIdentificadores("1234")).toBeNull();
  });
  it("quantidade inteira dentro do limite; contagem aceita zero", () => {
    expect(lerQuantidade("3")).toBe(3);
    expect(lerQuantidade("0")).toBeNull();
    expect(lerQuantidade("0", 0)).toBe(0);
    expect(lerQuantidade("1,5")).toBeNull();
    expect(lerQuantidade("10000")).toBeNull();
  });
  it("códigos do banco viram mensagens do catálogo; situação tem nome", () => {
    expect(erroDaTransferencia({ code: "OR002" })).toBe("indisponivel");
    expect(erroDaTransferencia({ code: "toString" })).toBe("falha");
    expect(nomeDaSituacao("enviada")).toBe("Em trânsito");
  });
});

// A remessa (lote TRF-a): as linhas no endereço da tela de montar e no formulário do pedido.
describe("as linhas da remessa", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  it("lê do endereço só o que vale, sem repetir o produto, e escreve de volta igual", () => {
    expect(lerLinhasDaRemessa(`${A}:2,${B}:10`)).toEqual([{ variante: A, quantidade: 2 }, { variante: B, quantidade: 10 }]);
    expect(lerLinhasDaRemessa(`${A}:2,${A}:5,nao-e-uuid:1,${B}:0,${B}:abc`)).toEqual([{ variante: A, quantidade: 2 }]);
    expect(lerLinhasDaRemessa(undefined)).toEqual([]);
    expect(escreverLinhasDaRemessa(lerLinhasDaRemessa(`${A}:2,${B}:10`))).toBe(`${A}:2,${B}:10`);
  });

  it("adiciona com uma unidade, não repete, respeita o máximo, e tira", () => {
    const uma = comALinha([], A);
    expect(uma).toEqual([{ variante: A, quantidade: 1 }]);
    expect(comALinha(uma, A)).toEqual(uma);
    expect(comALinha(uma, "nao-e-uuid")).toEqual(uma);
    const cheias = Array.from({ length: MAXIMO_DE_LINHAS_DA_REMESSA }, (_, i) => ({ variante: `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`, quantidade: 1 }));
    expect(comALinha(cheias, B)).toHaveLength(MAXIMO_DE_LINHAS_DA_REMESSA);
    expect(semALinha([{ variante: A, quantidade: 1 }, { variante: B, quantidade: 3 }], A)).toEqual([{ variante: B, quantidade: 3 }]);
  });

  it("o formulário do pedido: os pares na ordem; um valor ruim recusa tudo", () => {
    expect(linhasDoFormulario([A, B], ["2", "10"])).toEqual([{ variante: A, quantidade: 2 }, { variante: B, quantidade: 10 }]);
    expect(linhasDoFormulario([A, B], ["2"])).toBeNull();
    expect(linhasDoFormulario([A, A], ["2", "3"])).toBeNull();
    expect(linhasDoFormulario([A], ["0"])).toBeNull();
    expect(linhasDoFormulario([A], ["10000"])).toBeNull();
    expect(linhasDoFormulario([], [])).toBeNull();
  });
});

// TRF-b (18/11; achado F10 da auditoria do Codex de 17/11): o que cada passo faz no estoque e o saldo de cada lado.
describe("o efeito de cada passo no estoque", () => {
  // TRF-c (achado F18-05 da reanálise de 18/11; D-049): pedir já reserva; separar não reserva de novo.
  it("toda situação tem o texto; pedir reserva, separar escolhe os itens, enviar baixa o físico, receber põe no destino", () => {
    for (const s of Object.keys(SITUACOES_DA_TRANSFERENCIA)) expect(efeitoNoEstoque(s), s).toBeTruthy();
    expect(efeitoNoEstoque("solicitada")).toContain("reservada na origem desde o pedido. Saiu do disponível");
    expect(efeitoNoEstoque("separada")).toContain("seguem reservados na origem; o físico continua lá até o envio");
    expect(efeitoNoEstoque("recusada")).toContain("voltou ao disponível da origem");
    expect(efeitoNoEstoque("enviada")).toContain("saiu do físico da origem");
    expect(efeitoNoEstoque("recebida")).toContain("entrou no físico do destino");
    expect(efeitoNoEstoque("constructor")).toBeNull();
  });

  it("o saldo de uma loja: físico, reservado e disponível; sem a linha (a RLS não mostra) ou com número estranho, nulo", () => {
    const linhas = [{ unidade_id: "a", variante_id: "v", quantidade: 10, reservado: 2 }, { unidade_id: "b", variante_id: "v", quantidade: "x", reservado: 0 }];
    expect(saldoDaLoja(linhas, "a", "v")).toEqual({ fisico: 10, reservado: 2, disponivel: 8 });
    expect(saldoDaLoja(linhas, "b", "v")).toBeNull();
    expect(saldoDaLoja(linhas, "c", "v")).toBeNull();
  });
});
