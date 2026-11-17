// Lote MKT-a (ORA-ONLINE-003 e ORA-META-002): de onde o visitante chegou ao site. Endereços e campanhas fictícios.
import { describe, expect, it } from "vitest";

import {
  dominioDeFora, escreverOrigem, lerOrigem, origemDaFonte, origemDaVisita, origemDoSite, textoDaOrigem, textoDeCampanha, type OrigemDaVisita,
} from "./origem";

const PROPRIOS = ["ora5g.com.br", "127.0.0.1:3100"];
const visita = (consulta: string, referencia: string | null = null) => origemDaVisita(new URLSearchParams(consulta), referencia, PROPRIOS);

describe("o texto da campanha, limpo como o banco limpa", () => {
  it("minúsculas, um espaço no lugar de espaços e controles, até 100 letras; vazio vira nada", () => {
    expect(textoDeCampanha("  Natal\t2026 ")).toBe("natal 2026");
    expect(textoDeCampanha("Paid\n\u0007Social")).toBe("paid social");
    expect(textoDeCampanha("X".repeat(150))).toBe("x".repeat(100));
    expect(textoDeCampanha(`${"a".repeat(99)} b`)).toBe("a".repeat(99));
    expect(textoDeCampanha("   ")).toBeUndefined();
    expect(textoDeCampanha(5)).toBeUndefined();
    expect(textoDeCampanha(null)).toBeUndefined();
  });
});

describe("a origem pela fonte da campanha e pelo site", () => {
  it("as fontes conhecidas, com as grafias comuns; as outras são 'outra campanha'", () => {
    expect(["google", "google_ads", "adwords"].map((f) => origemDaFonte(f))).toEqual(["google", "google", "google"]);
    expect(["ig", "instagram"].map((f) => origemDaFonte(f))).toEqual(["instagram", "instagram"]);
    expect(["fb", "facebook", "meta"].map((f) => origemDaFonte(f))).toEqual(["facebook", "facebook", "facebook"]);
    expect(["whatsapp", "wpp", "zap"].map((f) => origemDaFonte(f))).toEqual(["whatsapp", "whatsapp", "whatsapp"]);
    expect([origemDaFonte("tiktok"), origemDaFonte("youtube"), origemDaFonte("newsletter")]).toEqual(["tiktok", "youtube", "email"]);
    expect(origemDaFonte("parceiro", "email")).toBe("email");
    expect(origemDaFonte("panfleto")).toBe("outra_campanha");
  });

  it("o site que mandou o visitante", () => {
    expect(["www.google.com", "google.com.br", "l.instagram.com", "m.facebook.com", "wa.me", "www.tiktok.com", "youtu.be", "mail.google.com", "exemplo.com.br"].map(origemDoSite))
      .toEqual(["google", "google", "instagram", "facebook", "whatsapp", "tiktok", "youtube", "email", "outro_site"]);
  });

  it("o próprio site não conta como origem (com ou sem www e porta); endereço que não é http(s) também não", () => {
    expect(dominioDeFora("https://ora5g.com.br/loja", PROPRIOS)).toBeNull();
    expect(dominioDeFora("https://www.ora5g.com.br/loja/x", PROPRIOS)).toBeNull();
    expect(dominioDeFora("http://127.0.0.1:3100/loja", PROPRIOS)).toBeNull();
    expect(dominioDeFora("android-app://com.instagram.android/", PROPRIOS)).toBeNull();
    expect(dominioDeFora("isto não é endereço", PROPRIOS)).toBeNull();
    expect(dominioDeFora("https://L.Instagram.com/?u=x", PROPRIOS)).toBe("l.instagram.com");
  });
});

describe("o que o proxy guarda quando o visitante abre a loja online", () => {
  it("o link com campanha: a fonte decide a origem; o site que mandou fica como referência", () => {
    expect(visita("utm_source=Instagram&utm_medium=paid&utm_campaign=Natal&outro=1", "https://l.instagram.com/")).toEqual({
      origem: "instagram", utm_source: "instagram", utm_medium: "paid", utm_campaign: "natal", referencia: "l.instagram.com",
    });
    expect(visita("utm_source=panfleto&utm_campaign=black-friday")).toEqual({ origem: "outra_campanha", utm_source: "panfleto", utm_campaign: "black-friday" });
  });

  it("campanha sem a fonte: a origem sai do site que mandou, ou fica 'outra campanha'", () => {
    expect(visita("utm_campaign=natal", "https://www.google.com/")).toEqual({ origem: "google", utm_campaign: "natal", referencia: "www.google.com" });
    expect(visita("utm_campaign=natal")).toEqual({ origem: "outra_campanha", utm_campaign: "natal" });
  });

  it("sem campanha, vindo de outro site: o site; dentro do próprio site ou sem informação: nada novo", () => {
    expect(visita("", "https://www.google.com.br/")).toEqual({ origem: "google", referencia: "www.google.com.br" });
    expect(visita("busca=capa", "https://ora5g.com.br/loja")).toBeNull();
    expect(visita("")).toBeNull();
    expect(visita("utm_source=%20%20")).toBeNull();
  });
});

describe("o cookie da origem", () => {
  it("vai e volta igual, só com letras, números, - e _", () => {
    const origem: OrigemDaVisita = { origem: "instagram", utm_source: "instagram", utm_campaign: "natal 2026", referencia: "l.instagram.com" };
    const valor = escreverOrigem(origem);
    expect(valor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(lerOrigem(valor)).toEqual(origem);
  });

  it("fora do formato vale como sem cookie; campo a mais ou sujo fica de fora", () => {
    const codificar = (dados: unknown) => Buffer.from(JSON.stringify(dados), "utf8").toString("base64url");
    expect(lerOrigem(undefined)).toBeNull();
    expect(lerOrigem("não é base64!")).toBeNull();
    expect(lerOrigem(codificar(["instagram"]))).toBeNull();
    expect(lerOrigem(codificar({ origem: "outdoor" }))).toBeNull();
    expect(lerOrigem("a".repeat(2_001))).toBeNull();
    expect(lerOrigem(codificar({ origem: "google", utm_campaign: " Natal ", referencia: "exemplo.com/x", whatsapp: "41999999999" })))
      .toEqual({ origem: "google", utm_campaign: "natal" });
  });
});

describe("o texto da origem para a equipe", () => {
  it("o nome da origem, a fonte quando é outra campanha e a campanha", () => {
    expect(textoDaOrigem({ origem: "instagram", utm_source: "instagram", utm_campaign: "natal" })).toBe("Instagram · campanha natal");
    expect(textoDaOrigem({ origem: "outra_campanha", utm_source: "panfleto", utm_campaign: null })).toBe("Outra campanha (panfleto)");
    expect(textoDaOrigem({ origem: "direto" })).toBe("Direto");
    expect(textoDaOrigem({ origem: null })).toBe("Sem registro");
  });
});
