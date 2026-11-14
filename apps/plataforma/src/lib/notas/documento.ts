// Documento da nota emitida (lote L10a: ORA-FISC-005). Antes de guardar o arquivo no bucket privado, o servidor
// confere o que o banco não consegue ler: o PDF começa como PDF; o XML é desta nota (a chave de acesso dentro dele é
// a registrada) e o protocolo de autorização, se vier no XML, é o mesmo digitado. Nada do conteúdo vai para log.
export const TAMANHO_MAXIMO_DO_DOCUMENTO = 5 * 1024 * 1024;

export type ErroDoDocumento = "documento_tipo" | "documento_grande" | "documento_outra_nota" | "protocolo" | "protocolo_outro";
export type DocumentoConferido = { tipo: "pdf" | "xml"; contentType: "application/pdf" | "application/xml"; protocolo: string | null };

const PROTOCOLO = /^\d{15}$/;

export function conferirDocumento(bytes: Uint8Array, chaveDeAcesso: string, protocoloDigitado: string | null):
  { ok: true; documento: DocumentoConferido } | { ok: false; erro: ErroDoDocumento } {
  if (bytes.length === 0) return { ok: false, erro: "documento_tipo" };
  if (bytes.length > TAMANHO_MAXIMO_DO_DOCUMENTO) return { ok: false, erro: "documento_grande" };
  const digitado = protocoloDigitado ? protocoloDigitado.replace(/\D/g, "") : "";
  if (digitado !== "" && !PROTOCOLO.test(digitado)) return { ok: false, erro: "protocolo" };
  const inicio = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
  if (inicio === "%PDF-") return { ok: true, documento: { tipo: "pdf", contentType: "application/pdf", protocolo: digitado || null } };
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return { ok: false, erro: "documento_tipo" };
  }
  if (!/^\s*</.test(texto) || !/<(nfeProc|NFe|procNFe)[\s>]/.test(texto)) return { ok: false, erro: "documento_tipo" };
  const chaves = [...texto.matchAll(/Id="NFe(\d{44})"|<chNFe>(\d{44})<\/chNFe>/g)].map((m) => m[1] ?? m[2]);
  if (chaves.length === 0 || chaves.some((c) => c !== chaveDeAcesso)) return { ok: false, erro: "documento_outra_nota" };
  const doXml = /<nProt>(\d{15})<\/nProt>/.exec(texto)?.[1] ?? null;
  if (doXml && digitado && doXml !== digitado) return { ok: false, erro: "protocolo_outro" };
  return { ok: true, documento: { tipo: "xml", contentType: "application/xml", protocolo: doXml ?? (digitado || null) } };
}
