// Conferência do documento da nota emitida antes de guardar (lote L10a, ORA-FISC-005). Arquivos fictícios.
import { describe, expect, it } from "vitest";

import { conferirDocumento, TAMANHO_MAXIMO_DO_DOCUMENTO } from "./documento";

const CHAVE = "41261111222333000181650010000007011123456781";
const bytes = (texto: string) => new TextEncoder().encode(texto);
const xml = (chave = CHAVE, protocolo = "141260000123456") =>
  `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"><NFe><infNFe Id="NFe${chave}" versao="4.00"></infNFe></NFe><protNFe><infProt><chNFe>${chave}</chNFe><nProt>${protocolo}</nProt></infProt></protNFe></nfeProc>`;

describe("conferirDocumento (L10a)", () => {
  it("PDF pelo começo do arquivo; protocolo digitado vai junto", () => {
    expect(conferirDocumento(bytes("%PDF-1.7\n..."), CHAVE, "1412 6000 0123 456")).toEqual({ ok: true, documento: { tipo: "pdf", contentType: "application/pdf", protocolo: "141260000123456" } });
    expect(conferirDocumento(bytes("%PDF-1.4"), CHAVE, null)).toMatchObject({ ok: true, documento: { protocolo: null } });
  });

  it("XML desta nota: a chave confere e o protocolo sai do próprio XML", () => {
    expect(conferirDocumento(bytes(xml()), CHAVE, null)).toEqual({ ok: true, documento: { tipo: "xml", contentType: "application/xml", protocolo: "141260000123456" } });
    expect(conferirDocumento(bytes(`﻿${xml()}`), CHAVE, "141260000123456")).toMatchObject({ ok: true });
  });

  it("recusa XML de outra nota, sem chave, protocolo diferente ou inválido, arquivo vazio, grande ou de outro tipo", () => {
    expect(conferirDocumento(bytes(xml(CHAVE.replace(/1$/, "2"))), CHAVE, null)).toEqual({ ok: false, erro: "documento_outra_nota" });
    expect(conferirDocumento(bytes("<?xml version=\"1.0\"?><nfeProc></nfeProc>"), CHAVE, null)).toEqual({ ok: false, erro: "documento_outra_nota" });
    expect(conferirDocumento(bytes(xml()), CHAVE, "141260000999999")).toEqual({ ok: false, erro: "protocolo_outro" });
    expect(conferirDocumento(bytes("%PDF-1.7"), CHAVE, "123")).toEqual({ ok: false, erro: "protocolo" });
    expect(conferirDocumento(new Uint8Array(), CHAVE, null)).toEqual({ ok: false, erro: "documento_tipo" });
    expect(conferirDocumento(new Uint8Array(TAMANHO_MAXIMO_DO_DOCUMENTO + 1), CHAVE, null)).toEqual({ ok: false, erro: "documento_grande" });
    expect(conferirDocumento(bytes("<html><body>nota</body></html>"), CHAVE, null)).toEqual({ ok: false, erro: "documento_tipo" });
    expect(conferirDocumento(new Uint8Array([0xff, 0xfe, 0x00, 0x41]), CHAVE, null)).toEqual({ ok: false, erro: "documento_tipo" });
  });
});
