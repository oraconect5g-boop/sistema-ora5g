import { describe, expect, it } from "vitest";

import { erroDaTransferencia, lerIdentificadores, lerQuantidade, nomeDaSituacao } from "./regras";

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
