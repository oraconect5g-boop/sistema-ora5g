import { describe, expect, it } from "vitest";

import { completarComDigitoVerificador } from "./identificadores";
import { producaoDaVenda, totaisDaVenda, validarItem, type ItemVenda } from "./venda";

const imei = completarComDigitoVerificador("35209900176148");
const iccid = completarComDigitoVerificador("895510000000000001");

const vendaCombinada: ItemVenda[] = [
  { tipo: "aparelho", descricao: "Smartphone 128 GB", quantidade: 1, precoUnitario: 349_900, desconto: 5_000, imei },
  { tipo: "acessorio", descricao: "Capa", quantidade: 2, precoUnitario: 7_900 },
  { tipo: "chip", descricao: "Chip Ora Connect", quantidade: 1, precoUnitario: 1_000, iccid },
  { tipo: "ativacao", descricao: "Ativação de linha", quantidade: 1, precoUnitario: 0, situacaoTelecom: "pendente" },
  { tipo: "recarga", descricao: "Recarga", quantidade: 1, precoUnitario: 3_000, situacaoTelecom: "confirmada" },
];

describe("venda combinada (F04)", () => {
  it("soma os itens e separa o valor de face das recargas", () => {
    expect(totaisDaVenda(vendaCombinada)).toEqual({ total: 364_700, descontos: 5_000, valorDeFaceRecargas: 3_000 });
  });

  it("conta a produção por categoria; ativação pendente ainda não conta", () => {
    expect(producaoDaVenda(vendaCombinada)).toMatchObject({ aparelho: 1, acessorio: 2, chip: 1, ativacao: 0, recarga: 1 });
  });

  it("ativação confirmada pela operadora passa a contar uma vez", () => {
    const confirmada = vendaCombinada.map((i) => (i.tipo === "ativacao" ? { ...i, situacaoTelecom: "confirmada" as const } : i));
    expect(producaoDaVenda(confirmada).ativacao).toBe(1);
  });
});

describe("exigências por tipo de item", () => {
  it("aparelho exige IMEI válido e quantidade 1", () => {
    expect(validarItem({ tipo: "aparelho", descricao: "X", quantidade: 1, precoUnitario: 1, imei })).toEqual([]);
    expect(validarItem({ tipo: "aparelho", descricao: "X", quantidade: 2, precoUnitario: 1, imei })).toContain("Aparelho é vendido um por IMEI");
    expect(validarItem({ tipo: "aparelho", descricao: "X", quantidade: 1, precoUnitario: 1, imei: "123" })).toContain("IMEI inválido");
  });

  it("chip exige ICCID válido", () => {
    expect(validarItem({ tipo: "chip", descricao: "Chip", quantidade: 1, precoUnitario: 1 })).toContain("ICCID inválido");
  });

  it("um ICCID é um chip: quantidade 2 com um ICCID é recusada (#35); controle: quantidade 1", () => {
    const iccidValido = vendaCombinada.find((i) => i.tipo === "chip")?.iccid;
    expect(validarItem({ tipo: "chip", descricao: "Chip", quantidade: 2, precoUnitario: 1_000, iccid: iccidValido })).toContain("Chip é vendido um por ICCID");
    expect(validarItem({ tipo: "chip", descricao: "Chip", quantidade: 1, precoUnitario: 1_000, iccid: iccidValido })).toEqual([]);
  });

  it("desconto não pode passar do valor do item", () => {
    expect(validarItem({ tipo: "acessorio", descricao: "Cabo", quantidade: 1, precoUnitario: 1_000, desconto: 1_001 })).toContain("Desconto maior que o item");
  });
});
