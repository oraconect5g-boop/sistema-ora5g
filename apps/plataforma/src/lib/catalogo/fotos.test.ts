import { describe, expect, it } from "vitest";

import { centavosDoBanco, ValorForaDoLimite } from "../dinheiro";
import { caminhoDaFoto, conferirArquivo, dimensionar } from "./fotos";

describe("fotos dos produtos", () => {
  it("aceita JPEG, PNG e WebP até 5 MB e com pelo menos 200 px no menor lado", () => {
    expect(conferirArquivo("image/webp", 300_000, 1200, 900)).toBeNull();
    expect(conferirArquivo("image/gif", 300_000, 1200, 900)).toBe("tipo");
    expect(conferirArquivo("image/svg+xml", 300, 1200, 900)).toBe("tipo");
    expect(conferirArquivo("image/jpeg", 6 * 1024 * 1024, 1200, 900)).toBe("grande");
    expect(conferirArquivo("image/png", 10_000, 150, 900)).toBe("pequena");
  });

  it("reduz mantendo a proporção, sem cortar", () => {
    expect(dimensionar(4000, 3000)).toEqual({ largura: 1600, altura: 1200 });
    expect(dimensionar(3000, 4000)).toEqual({ largura: 1200, altura: 1600 });
    expect(dimensionar(800, 600)).toEqual({ largura: 800, altura: 600 });
  });

  it("o caminho segue o padrão que o banco confere", () => {
    const org = "0a5e0000-0000-4000-8000-000000000001";
    const produto = "0a5e0000-0000-4000-8000-000000000201";
    const id = "11111111-2222-4333-8444-555555555555";
    expect(caminhoDaFoto(org, produto, null, id, "image/webp")).toBe(`${org}/${produto}/produto/${id}.webp`);
    expect(caminhoDaFoto(org, produto, produto, id, "image/jpeg")).toBe(`${org}/${produto}/${produto}/${id}.jpg`);
  });
});

describe("centavos vindos do banco (auditoria §7.2)", () => {
  it("aceita inteiro seguro (número ou texto) e recusa o resto sem arredondar", () => {
    expect(centavosDoBanco(129900)).toBe(129900);
    expect(centavosDoBanco("129900")).toBe(129900);
    expect(() => centavosDoBanco("9007199254740993")).toThrow(ValorForaDoLimite);
    expect(() => centavosDoBanco(12.5)).toThrow(ValorForaDoLimite);
    expect(() => centavosDoBanco(null)).toThrow(ValorForaDoLimite);
  });
});
