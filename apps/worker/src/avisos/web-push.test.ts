// O aviso no celular pelo padrão Web Push (lote PWA-b). A cifra é conferida com o exemplo oficial da RFC 8291 (seção 5 e
// apêndice A), byte a byte; o caminho de volta, decifrado como o celular faz, prova a cifra com chave e sal novos; o VAPID
// é conferido pela assinatura com a chave pública. Chaves de teste geradas aqui ou as do exemplo público da RFC.
import { createDecipheriv, createECDH, createHmac, createPublicKey, generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { autorizacaoDoRemetente, cifrar, enviarAviso, servicoDeEnvioConhecido, type ChavesDoRemetente } from "./web-push.ts";

// RFC 8291, seção 5 e apêndice A (o exemplo público do padrão; não são chaves do Ora 5G).
const RFC = {
  mensagem: "When I grow up, I want to be a watermelon",
  publicaDoCelular: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  privadaDoCelular: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  segredoDoCelular: "BTBZMqHH6r4Tts7J_aSIgg",
  privadaDoRemetente: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  sal: "DGv6ra1nlYgDCS1FRnbzlw",
  corpo: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};
const b = (texto: string) => Buffer.from(texto, "base64url");

/** O que o celular faz ao receber (RFC 8291, do lado de quem recebe): independente da cifra, para provar o caminho de volta. */
function decifrar(corpo: Buffer, privadaDoCelular: Buffer, publicaDoCelular: Buffer, segredoDoCelular: Buffer): string {
  const hmac = (chave: Buffer, dados: Buffer) => createHmac("sha256", chave).update(dados).digest();
  const sal = corpo.subarray(0, 16);
  const tamanhoDaChave = corpo[20] ?? 0;
  const publicaDoRemetente = corpo.subarray(21, 21 + tamanhoDaChave);
  const cifrado = corpo.subarray(21 + tamanhoDaChave);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privadaDoCelular);
  const segredoEcdh = ecdh.computeSecret(publicaDoRemetente);
  const ikm = hmac(hmac(segredoDoCelular, segredoEcdh), Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), publicaDoCelular, publicaDoRemetente, Buffer.from([1])]));
  const prk = hmac(sal, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0", "latin1"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0", "latin1"), Buffer.from([1])])).subarray(0, 12);
  const decifra = createDecipheriv("aes-128-gcm", cek, nonce);
  decifra.setAuthTag(cifrado.subarray(cifrado.length - 16));
  const claro = Buffer.concat([decifra.update(cifrado.subarray(0, cifrado.length - 16)), decifra.final()]);
  expect(claro.at(-1)).toBe(2);
  return claro.subarray(0, -1).toString("utf8");
}

/** Um par de chaves de remetente gerado aqui, no formato das variáveis do servidor. */
function chavesDeTeste(): ChavesDoRemetente {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const ponto = Buffer.concat([Buffer.from([4]), b(pub.x ?? ""), b(pub.y ?? "")]);
  return { publica: ponto.toString("base64url"), privada: privateKey.export({ format: "jwk" }).d ?? "", contato: "https://ora5g.invalid" };
}
/** Um celular inscrito de verdade (o par de chaves dele fica com o teste, para decifrar). */
function celularDeTeste() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const segredo = Buffer.from("0123456789abcdef");
  return {
    ecdh, segredo,
    inscricao: { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", p256dh: ecdh.getPublicKey().toString("base64url"), auth: segredo.toString("base64url") },
  };
}

describe("a cifra do aviso (RFC 8291)", () => {
  it("é igual, byte a byte, ao exemplo oficial da RFC (o mesmo sal e a mesma chave efêmera)", () => {
    const corpo = cifrar(Buffer.from(RFC.mensagem), { p256dh: RFC.publicaDoCelular, auth: RFC.segredoDoCelular }, { sal: b(RFC.sal), privadaEfemera: b(RFC.privadaDoRemetente) });
    expect(corpo.toString("base64url")).toBe(RFC.corpo);
    expect(decifrar(corpo, b(RFC.privadaDoCelular), b(RFC.publicaDoCelular), b(RFC.segredoDoCelular))).toBe(RFC.mensagem);
  });

  it("com sal e chave novos a cada vez, o celular decifra; a mesma mensagem nunca sai igual", () => {
    const { ecdh, segredo, inscricao } = celularDeTeste();
    const texto = JSON.stringify({ titulo: "Desconto para aprovar", corpo: "Loja A: desconto pedido na venda nº 12", endereco: "/aprovacoes" });
    const um = cifrar(Buffer.from(texto), inscricao);
    const dois = cifrar(Buffer.from(texto), inscricao);
    expect(um.equals(dois)).toBe(false);
    expect(decifrar(um, ecdh.getPrivateKey(), ecdh.getPublicKey(), segredo)).toBe(texto);
    expect(um.readUInt32BE(16)).toBe(4096);
  });

  it("recusa chave de celular fora do formato e mensagem grande demais", () => {
    expect(() => cifrar(Buffer.from("x"), { p256dh: "curta", auth: RFC.segredoDoCelular })).toThrow();
    expect(() => cifrar(Buffer.from("x".repeat(3001)), { p256dh: RFC.publicaDoCelular, auth: RFC.segredoDoCelular })).toThrow();
  });
});

describe("a identificação do remetente (VAPID, RFC 8292)", () => {
  it("o JWT vai para o domínio do serviço de envio, vale 12 horas, leva o contato e confere com a chave pública", () => {
    const chaves = chavesDeTeste();
    const cabecalho = autorizacaoDoRemetente("https://fcm.googleapis.com/fcm/send/abc123", chaves, 1_800_000_000);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(cabecalho) ?? [];
    expect(k).toBe(chaves.publica);
    const [topo, corpo, assinatura] = (jwt ?? "").split(".");
    expect(JSON.parse(b(topo ?? "").toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(b(corpo ?? "").toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_800_000_000 + 12 * 3600, sub: "https://ora5g.invalid" });
    const ponto = b(chaves.publica);
    const publica = createPublicKey({ key: { kty: "EC", crv: "P-256", x: ponto.subarray(1, 33).toString("base64url"), y: ponto.subarray(33).toString("base64url") }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${topo}.${corpo}`), { key: publica, dsaEncoding: "ieee-p1363" }, b(assinatura ?? ""))).toBe(true);
  });
});

describe("o envio a um celular", () => {
  const MENSAGEM = { titulo: "Aviso de teste", corpo: "Os avisos estão chegando.", endereco: "/inicio" };

  it("só posta nos serviços de envio dos navegadores, por https", () => {
    for (const ok of ["https://fcm.googleapis.com/fcm/send/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/x", "https://wns2-par02p.notify.windows.com/w/?token=x"]) {
      expect(servicoDeEnvioConhecido(ok), ok).toBe(true);
    }
    for (const nao of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://fcm.googleapis.com.exemplo.invalid/x", "https://127.0.0.1/x", "https://ora5g.com.br/x", "lixo"]) {
      expect(servicoDeEnvioConhecido(nao), nao).toBe(false);
    }
  });

  it("manda a mensagem cifrada com os cabeçalhos do padrão; 201 é entregue, 404 e 410 tiram o celular, o resto tenta de novo", async () => {
    const chaves = chavesDeTeste();
    const { ecdh, segredo, inscricao } = celularDeTeste();
    const pedidos: { url: string; init: RequestInit }[] = [];
    const comResposta = (status: number) => (async (url: string | URL | Request, init?: RequestInit) => {
      pedidos.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status });
    }) as typeof fetch;
    expect(await enviarAviso(inscricao, MENSAGEM, chaves, { buscar: comResposta(201) })).toBe("entregue");
    const { url, init } = pedidos[0]!;
    expect(url).toBe(inscricao.endpoint);
    expect(init.method).toBe("POST");
    const cabecalhos = init.headers as Record<string, string>;
    expect(cabecalhos["Content-Encoding"]).toBe("aes128gcm");
    expect(cabecalhos.TTL).toBe("21600");
    expect(cabecalhos.Urgency).toBe("high");
    expect(cabecalhos.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(JSON.parse(decifrar(Buffer.from(init.body as Uint8Array), ecdh.getPrivateKey(), ecdh.getPublicKey(), segredo))).toEqual(MENSAGEM);
    expect(await enviarAviso(inscricao, MENSAGEM, chaves, { buscar: comResposta(410) })).toBe("expirada");
    expect(await enviarAviso(inscricao, MENSAGEM, chaves, { buscar: comResposta(404) })).toBe("expirada");
    expect(await enviarAviso(inscricao, MENSAGEM, chaves, { buscar: comResposta(429) })).toBe("falha");
    expect(await enviarAviso(inscricao, MENSAGEM, chaves, { buscar: comResposta(500) })).toBe("falha");
    const quebrado = (async () => { throw new Error("sem rede"); }) as typeof fetch;
    expect(await enviarAviso(inscricao, MENSAGEM, chaves, { buscar: quebrado })).toBe("falha");
    // Endereço fora dos serviços de envio, ou chave do celular inválida: o celular sai, sem postar nada.
    const antes = pedidos.length;
    expect(await enviarAviso({ ...inscricao, endpoint: "https://ora5g.com.br/x" }, MENSAGEM, chaves, { buscar: comResposta(201) })).toBe("expirada");
    expect(await enviarAviso({ ...inscricao, p256dh: "curta" }, MENSAGEM, chaves, { buscar: comResposta(201) })).toBe("expirada");
    expect(pedidos.length).toBe(antes);
  });
});
