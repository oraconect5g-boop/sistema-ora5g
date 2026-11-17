// O que o worker do WhatsApp precisa para ligar (lote WHATS-a): os nomes vêm do .env.example; sem o adaptador oficial
// da Meta, ele continua desligado mesmo com todas as variáveis.
import { describe, expect, it } from "vitest";

import { ADAPTADOR_DA_META_PRONTO, oQueFaltaParaOWhatsApp } from "./configuracao.ts";

const ambiente = (valores: Record<string, string>) => (nome: string) => valores[nome] ?? "";

describe("o que falta para o worker do WhatsApp ligar", () => {
  it("sem nada, lista as variáveis na ordem e o adaptador", () => {
    expect(oQueFaltaParaOWhatsApp(ambiente({}))).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "WHATSAPP_GRAPH_API_VERSION", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN",
      "o adaptador oficial da Meta (espera o contrato verificado e o modelo de mensagem aprovado)",
    ]);
  });

  it("com todas as variáveis, ainda falta o adaptador: o contrato da Meta não foi verificado", () => {
    const tudo = ambiente({
      NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.invalid", SUPABASE_SECRET_KEY: "x",
      WHATSAPP_GRAPH_API_VERSION: "x", WHATSAPP_PHONE_NUMBER_ID: "x", WHATSAPP_ACCESS_TOKEN: "x",
    });
    expect(ADAPTADOR_DA_META_PRONTO).toBe(false);
    expect(oQueFaltaParaOWhatsApp(tudo)).toEqual(["o adaptador oficial da Meta (espera o contrato verificado e o modelo de mensagem aprovado)"]);
  });
});
