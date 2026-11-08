import { describe, expect, it } from "vitest";

import { chaveDoCatalogo, textoDoParametro } from "./parametros";

// REV-017 (#16): valor do endereço nunca indexa objeto sem conferir chave própria e tipo.
const CATALOGO = { credenciais: "E-mail ou senha incorretos.", dados: "Preencha e-mail e senha." };

describe("parâmetros do endereço", () => {
  it("texto simples passa; lista (parâmetro repetido) e ausência não", () => {
    expect(textoDoParametro("capa")).toBe("capa");
    expect(textoDoParametro("")).toBe("");
    expect(textoDoParametro(["a", "b"])).toBeUndefined();
    expect(textoDoParametro(undefined)).toBeUndefined();
  });

  it("só chaves próprias do catálogo valem", () => {
    expect(chaveDoCatalogo(CATALOGO, "credenciais")).toBe("credenciais");
    expect(chaveDoCatalogo(CATALOGO, "dados")).toBe("dados");
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf", "desconhecido", ""])(
    "%j não é chave do catálogo",
    (valor) => expect(chaveDoCatalogo(CATALOGO, valor)).toBeUndefined(),
  );

  it("lista não vira chave, nem quando o primeiro valor é válido", () => {
    expect(chaveDoCatalogo(CATALOGO, ["credenciais", "dados"])).toBeUndefined();
    expect(chaveDoCatalogo(CATALOGO, ["credenciais"])).toBeUndefined();
    expect(chaveDoCatalogo(CATALOGO, undefined)).toBeUndefined();
  });
});
