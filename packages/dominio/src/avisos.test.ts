// Regras dos avisos no celular (lote PWA-b): o formato da inscrição, os serviços de envio aceitos e o nome do aparelho.
// Endereços e chaves fictícios.
import { describe, expect, it } from "vitest";

import { inscricaoDoNavegador, nomeDoDispositivo, servicoDeEnvioConhecido } from "./avisos";

const CHAVE = `B${"A".repeat(86)}`;
const SEGREDO = "x".repeat(22);

describe("os avisos no celular", () => {
  it("só os serviços de envio dos navegadores, por https, na porta padrão", () => {
    expect(servicoDeEnvioConhecido("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(servicoDeEnvioConhecido("https://web.push.apple.com/QGz")).toBe(true);
    expect(servicoDeEnvioConhecido("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    for (const nao of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com:444/x", "https://evil-fcm.googleapis.com.invalid/x", "https://localhost/x", "x"]) {
      expect(servicoDeEnvioConhecido(nao), nao).toBe(false);
    }
    expect(servicoDeEnvioConhecido(`https://fcm.googleapis.com/${"a".repeat(1000)}`)).toBe(false);
  });

  it("a inscrição do navegador: o endereço e as duas chaves no formato; o resto fica de fora", () => {
    const boa = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", expirationTime: null, keys: { p256dh: CHAVE, auth: SEGREDO } };
    expect(inscricaoDoNavegador(boa)).toEqual({ endpoint: boa.endpoint, p256dh: CHAVE, auth: SEGREDO });
    expect(inscricaoDoNavegador({ ...boa, endpoint: "https://ora5g.com.br/x" })).toBeNull();
    expect(inscricaoDoNavegador({ ...boa, keys: { p256dh: "curta", auth: SEGREDO } })).toBeNull();
    expect(inscricaoDoNavegador({ ...boa, keys: { p256dh: CHAVE } })).toBeNull();
    expect(inscricaoDoNavegador(null)).toBeNull();
  });

  it("o nome curto do aparelho, sem guardar o resto do navegador", () => {
    expect(nomeDoDispositivo("Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(nomeDoDispositivo("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(nomeDoDispositivo("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0")).toBe("Windows · Edge");
    expect(nomeDoDispositivo("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36")).toBe("Android · Samsung Internet");
    expect(nomeDoDispositivo("")).toBe("Outro aparelho · navegador");
  });
});
