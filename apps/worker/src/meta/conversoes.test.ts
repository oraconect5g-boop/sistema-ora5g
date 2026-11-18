// Os eventos de conversão para a Meta (lote ADAPT-a; ORA-META-005): desligado sem a base legal e a conta, e só o evento com
// consentimento, uma vez. Eventos FICTÍCIOS (fixtures).
import { describe, expect, it } from "vitest";

import { ADAPTADOR_DE_CONVERSOES_PRONTO, eventosQuePodemSair, oQueFaltaParaAsConversoes, type EventoDeConversao } from "./conversoes.ts";

const ambiente = (valores: Record<string, string>) => (nome: string) => valores[nome] ?? "";
const evento = (id: string, consentiu = true): EventoDeConversao => ({ idDoEvento: id, tipo: "venda", quando: "2026-11-17T20:00:00Z", valor: 7_900, campanha: "natal", consentiu });

describe("os eventos de conversão para a Meta", () => {
  it("desligado: mesmo com as variáveis, falta a base legal e o adaptador", () => {
    expect(ADAPTADOR_DE_CONVERSOES_PRONTO).toBe(false);
    expect(oQueFaltaParaAsConversoes(ambiente({}))).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "META_APP_ID", "META_SYSTEM_USER_TOKEN", "META_PIXEL_ID",
      "a base legal e o consentimento do cliente para mandar a conversão (D-048) e o adaptador oficial da Meta",
    ]);
  });

  it("só sai o evento com consentimento, uma vez", () => {
    const r = eventosQuePodemSair([evento("E1"), evento("E2", false), evento("E1"), evento("E3"), evento("E0")], new Set(["E0"]));
    expect(r.sair.map((e) => e.idDoEvento)).toEqual(["E1", "E3"]);
    expect(r).toMatchObject({ semConsentimento: 1, repetidos: 2 });
  });
});
