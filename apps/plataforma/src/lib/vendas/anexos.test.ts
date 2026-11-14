// Documentos da venda (lote L5d): a conferência do arquivo pelo conteúdo, o formulário e as mensagens. Dados FICTÍCIOS;
// as regras do banco estão em packages/banco/src/anexos-da-venda.test.ts.
import { describe, expect, it } from "vitest";

import { conferirAnexo, erroDosAnexos, lerDadosDoAnexo, tamanhoDoAnexo, TAMANHO_MAXIMO_DO_ANEXO } from "./anexos";

const bytes = (...partes: (number[] | string)[]) =>
  new Uint8Array(partes.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("conferência do documento pelo conteúdo", () => {
  it("PDF, JPEG, PNG e WebP pelo começo do arquivo, com o tipo certo para o Storage", () => {
    expect(conferirAnexo(bytes("%PDF-1.7 fictício"))).toEqual({ ok: true, formato: "pdf", contentType: "application/pdf" });
    expect(conferirAnexo(bytes([0xff, 0xd8, 0xff, 0xe0], "resto"))).toEqual({ ok: true, formato: "jpg", contentType: "image/jpeg" });
    expect(conferirAnexo(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "resto"))).toEqual({ ok: true, formato: "png", contentType: "image/png" });
    expect(conferirAnexo(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toEqual({ ok: true, formato: "webp", contentType: "image/webp" });
  });
  it("outro conteúdo (mesmo com nome de PDF), vazio e grande demais são recusados", () => {
    expect(conferirAnexo(bytes("<html><body>contrato</body></html>"))).toEqual({ ok: false, erro: "anexo_tipo" });
    expect(conferirAnexo(new Uint8Array())).toEqual({ ok: false, erro: "anexo_tipo" });
    expect(conferirAnexo(new Uint8Array(TAMANHO_MAXIMO_DO_ANEXO + 1))).toEqual({ ok: false, erro: "anexo_grande" });
  });
});

describe("formulário e mensagens", () => {
  it("o tipo do catálogo e a descrição (obrigatória em \"outro\", de 3 a 120 letras)", () => {
    expect(lerDadosDoAnexo("termo_garantia", "")).toEqual({ ok: true, tipo: "termo_garantia", descricao: null });
    expect(lerDadosDoAnexo("outro", "  Foto do  documento ")).toEqual({ ok: true, tipo: "outro", descricao: "Foto do documento" });
    for (const [tipo, descricao] of [["outro", ""], ["nota_fiscal", ""], ["termo_garantia", "ab"], ["termo_garantia", "x".repeat(121)], [null, ""]] as const) {
      expect(lerDadosDoAnexo(tipo, descricao), String(tipo)).toEqual({ ok: false });
    }
  });
  it("os erros do banco viram a mensagem da tela", () => {
    for (const [erro, chave] of [
      [{ code: "P0002", message: "Venda não encontrada" }, "anexo_permissao"], [{ code: "42501", message: "Retirar documento da venda é da gerência da loja" }, "anexo_permissao"],
      [{ code: "P0002", message: "O arquivo não chegou ao Storage" }, "anexo_falha"], [{ code: "22023", message: "Anexe o documento depois de concluir a venda" }, "anexo_venda_aberta"],
      [{ code: "22023", message: "Esta venda já tem 20 documentos: retire um errado antes" }, "anexo_limite"], [{ code: "22023", message: "Informe o motivo" }, "anexo_motivo"],
      [{ code: "22023", message: "Diga que documento é (descrição de 3 a 120 letras)" }, "anexo_dados"],
      [{ code: "22023", message: "O arquivo no Storage não é do formato informado" }, "anexo_tipo"], [{ code: "57014" }, "anexo_falha"],
    ] as const) {
      expect(erroDosAnexos(erro), erro.code).toBe(chave);
    }
  });
  it("o tamanho legível", () => {
    expect(tamanhoDoAnexo(850 * 1024)).toBe("850 KB");
    expect(tamanhoDoAnexo(1_300_000)).toBe("1,2 MB");
    expect(tamanhoDoAnexo(10)).toBe("1 KB");
  });
});
