// O desenho das categorias da loja online (lote ONLINE-g): o ícone de cada família pelo nome e os atalhos da vitrine
// principal. Nomes no formato do relatório da Rein (maiúsculas, com e sem acento) e alguns inventados para o teste.
import { BatteryCharging, Headphones, Laptop, MemoryStick, Package, Smartphone, Speaker } from "lucide-react";
import { describe, expect, it } from "vitest";

import { atalhosDoInicio, iconeDaCategoria } from "./categorias";

describe("as categorias da loja online (ONLINE-g)", () => {
  it("o ícone pelo nome, sem acento e sem diferença de maiúsculas; a que não se reconhece fica com o pacote", () => {
    expect(iconeDaCategoria("FONES")).toBe(Headphones);
    expect(iconeDaCategoria("Caixa de som")).toBe(Speaker);
    expect(iconeDaCategoria("CARREGADORES")).toBe(BatteryCharging);
    expect(iconeDaCategoria("CAPINHAS")).toBe(Smartphone);
    expect(iconeDaCategoria("C/MEMORIA")).toBe(MemoryStick);
    expect(iconeDaCategoria("INFORMÁTICA")).toBe(Laptop);
    expect(iconeDaCategoria("Acessórios")).toBe(Package);
    expect(iconeDaCategoria("Qualquer outra")).toBe(Package);
  });

  it("os atalhos: até 4, as preferidas primeiro e sem repetir; sem nenhuma preferida, as primeiras", () => {
    const c = (nome: string) => ({ id: nome.toLowerCase(), nome });
    const todas = [c("ADAPTADOR"), c("CABOS"), c("CAIXA DE SOM"), c("CAPINHAS"), c("CARREGADORES"), c("FONES"), c("PILHAS")];
    expect(atalhosDoInicio(todas).map((x) => x.nome)).toEqual(["FONES", "CAPINHAS", "CARREGADORES", "CAIXA DE SOM"]);
    expect(atalhosDoInicio([c("FONES"), c("PILHAS"), c("GAMER")]).map((x) => x.nome)).toEqual(["FONES", "PILHAS", "GAMER"]);
    expect(atalhosDoInicio([c("PILHAS"), c("GAMER")], 1).map((x) => x.nome)).toEqual(["PILHAS"]);
    expect(atalhosDoInicio([])).toEqual([]);
  });
});
