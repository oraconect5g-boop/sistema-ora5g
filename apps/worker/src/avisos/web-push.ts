// O aviso no celular pelo padrão Web Push (lote PWA-b; ADR-014), com o próprio Node, sem biblioteca de fora:
//   * a mensagem vai cifrada para o celular como manda a RFC 8291 (o formato aes128gcm da RFC 8188), conferida no teste
//     com o exemplo oficial da RFC, byte a byte;
//   * o remetente se identifica pelo VAPID (RFC 8292): um JWT ES256 com o endereço do serviço de envio, a validade e o
//     contato, assinado com a chave privada do servidor; o celular só aceita aviso assinado pela chave com que se inscreveu.
// Nada aqui grava log: quem chama conta os desfechos, sem endereço, chave ou texto.
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";

import { servicoDeEnvioConhecido } from "@ora5g/dominio/avisos";

export { servicoDeEnvioConhecido };

export type Inscricao = { endpoint: string; p256dh: string; auth: string };
/** As chaves do remetente, em base64url: a pública (ponto não comprimido, 65 bytes) e a privada (32 bytes). */
export type ChavesDoRemetente = { publica: string; privada: string; contato: string };
export type DesfechoDoEnvio = "entregue" | "expirada" | "falha";

const TAMANHO_DO_REGISTRO = 4096;
const MAXIMO_DA_MENSAGEM = 3000;

const deBase64 = (texto: string) => Buffer.from(texto, "base64url");
const hmac = (chave: Buffer, dados: Buffer) => createHmac("sha256", chave).update(dados).digest();
const rotulo = (texto: string) => Buffer.from(texto, "latin1");

/**
 * Cifra a mensagem para a inscrição (RFC 8291, §3.4, com o cabeçalho da RFC 8188, num registro só de 4096).
 * `sal` e `privadaEfemera` são só para o teste com o exemplo da RFC; no envio, os dois são novos a cada mensagem.
 */
export function cifrar(mensagem: Buffer, inscricao: Pick<Inscricao, "p256dh" | "auth">, teste?: { sal: Buffer; privadaEfemera: Buffer }): Buffer {
  const publicaDoCelular = deBase64(inscricao.p256dh);
  const segredoDoCelular = deBase64(inscricao.auth);
  if (publicaDoCelular.length !== 65 || publicaDoCelular[0] !== 4 || segredoDoCelular.length !== 16) throw new Error("inscrição com chaves inválidas");
  if (mensagem.length > MAXIMO_DA_MENSAGEM) throw new Error("mensagem grande demais para o aviso");
  const efemera = createECDH("prime256v1");
  if (teste) efemera.setPrivateKey(teste.privadaEfemera);
  else efemera.generateKeys();
  const publicaDoRemetente = efemera.getPublicKey();
  const segredoEcdh = efemera.computeSecret(publicaDoCelular);
  // HKDF de um bloco, como no pseudocódigo da RFC: Extract = HMAC(sal, IKM); Expand = HMAC(PRK, info || 0x01).
  const prkDaChave = hmac(segredoDoCelular, segredoEcdh);
  const infoDaChave = Buffer.concat([rotulo("WebPush: info\0"), publicaDoCelular, publicaDoRemetente]);
  const ikm = hmac(prkDaChave, Buffer.concat([infoDaChave, Buffer.from([1])]));
  const sal = teste?.sal ?? randomBytes(16);
  const prk = hmac(sal, ikm);
  const cek = hmac(prk, Buffer.concat([rotulo("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([rotulo("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const cifra = createCipheriv("aes-128-gcm", cek, nonce);
  // O delimitador 0x02 marca o último (e único) registro, sem enchimento.
  const cifrado = Buffer.concat([cifra.update(Buffer.concat([mensagem, Buffer.from([2])])), cifra.final(), cifra.getAuthTag()]);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(TAMANHO_DO_REGISTRO);
  return Buffer.concat([sal, tamanho, Buffer.from([publicaDoRemetente.length]), publicaDoRemetente, cifrado]);
}

/** O cabeçalho Authorization do VAPID (RFC 8292, §3): o JWT ES256 para o serviço de envio e a chave pública. */
export function autorizacaoDoRemetente(endpoint: string, chaves: ChavesDoRemetente, agoraEmSegundos = Math.floor(Date.now() / 1000)): string {
  const publica = deBase64(chaves.publica);
  if (publica.length !== 65 || publica[0] !== 4) throw new Error("chave pública do remetente inválida");
  const parte = (objeto: object) => Buffer.from(JSON.stringify(objeto), "utf8").toString("base64url");
  // Validade de 12 horas (o máximo do padrão é 24).
  const assinado = `${parte({ typ: "JWT", alg: "ES256" })}.${parte({ aud: new URL(endpoint).origin, exp: agoraEmSegundos + 12 * 3600, sub: chaves.contato })}`;
  const chavePrivada = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: chaves.privada, x: publica.subarray(1, 33).toString("base64url"), y: publica.subarray(33).toString("base64url") },
    format: "jwk",
  });
  const assinatura = sign("sha256", Buffer.from(assinado), { key: chavePrivada, dsaEncoding: "ieee-p1363" });
  return `vapid t=${assinado}.${assinatura.toString("base64url")}, k=${chaves.publica}`;
}

/**
 * Manda um aviso a um celular. "expirada": o serviço diz que a inscrição não existe mais (404 ou 410), ou o endereço não
 * é de um serviço de envio conhecido; o celular sai da lista. "falha": qualquer outro problema, para tentar de novo.
 */
export async function enviarAviso(
  inscricao: Inscricao, mensagem: object, chaves: ChavesDoRemetente,
  opcoes: { buscar?: typeof fetch; ttlEmSegundos?: number } = {},
): Promise<DesfechoDoEnvio> {
  if (!servicoDeEnvioConhecido(inscricao.endpoint)) return "expirada";
  let corpo: Buffer;
  try {
    corpo = cifrar(Buffer.from(JSON.stringify(mensagem), "utf8"), inscricao);
  } catch {
    return "expirada";
  }
  try {
    const resposta = await (opcoes.buscar ?? fetch)(inscricao.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        TTL: String(opcoes.ttlEmSegundos ?? 6 * 3600),
        Urgency: "high",
        Authorization: autorizacaoDoRemetente(inscricao.endpoint, chaves),
      },
      body: new Uint8Array(corpo),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (resposta.status >= 200 && resposta.status < 300) return "entregue";
    return resposta.status === 404 || resposta.status === 410 ? "expirada" : "falha";
  } catch {
    return "falha";
  }
}
