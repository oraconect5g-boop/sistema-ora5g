// O link de pagamento e o Pix online (lote ADAPT-a; ORA-PAY-014 e ORA-PAY-008): desligado sem o provedor escolhido e o
// contrato, e a regra de cada aviso de pagamento. Avisos FICTÍCIOS (fixtures): provam a regra, não o formato de provedor nenhum.
import { describe, expect, it } from "vitest";

import { ADAPTADOR_PRONTO, PROVEDORES_DE_COBRANCA, decidirAviso, oQueFaltaParaACobranca, type AvisoDePagamento } from "./cobranca.ts";

const ambiente = (valores: Record<string, string>) => (nome: string) => valores[nome] ?? "";
const aviso = (mudar: Partial<AvisoDePagamento> = {}): AvisoDePagamento => ({ idDoAviso: "AVISO-1", identificador: "COB-1", situacao: "pago", valor: 7_900, assinaturaConferida: true, ...mudar });

describe("o link de pagamento", () => {
  it("nenhum provedor pronto: mesmo com as variáveis, falta o adaptador oficial", () => {
    for (const p of PROVEDORES_DE_COBRANCA) expect(ADAPTADOR_PRONTO[p], p).toBe(false);
    expect(oQueFaltaParaACobranca("picpay", ambiente({}))).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "PICPAY_CLIENT_ID", "PICPAY_CLIENT_SECRET", "PICPAY_WEBHOOK_SECRET",
      "o adaptador oficial do provedor (espera a escolha do provedor, o contrato e o formato do aviso confirmado)",
    ]);
    const tudo = ambiente(Object.fromEntries(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "PAGBANK_ENVIRONMENT", "PAGBANK_API_TOKEN"].map((n) => [n, "x"])));
    expect(oQueFaltaParaACobranca("pagbank", tudo)).toEqual(["o adaptador oficial do provedor (espera a escolha do provedor, o contrato e o formato do aviso confirmado)"]);
  });

  it("o aviso só confirma com a assinatura, de cobrança nossa, do mesmo valor e uma vez só", () => {
    const cobranca = { valor: 7_900 };
    expect(decidirAviso(aviso(), cobranca, new Set())).toEqual({ acao: "confirmar" });
    expect(decidirAviso(aviso(), cobranca, new Set(["AVISO-1"]))).toEqual({ acao: "ignorar", motivo: "repetido" });
    expect(decidirAviso(aviso({ assinaturaConferida: false }), cobranca, new Set())).toEqual({ acao: "ignorar", motivo: "sem_assinatura" });
    expect(decidirAviso(aviso(), null, new Set())).toEqual({ acao: "reconsultar", motivo: "cobranca_desconhecida" });
    expect(decidirAviso(aviso({ valor: 7_000 }), cobranca, new Set())).toEqual({ acao: "reconsultar", motivo: "valor_diferente" });
    expect(decidirAviso(aviso({ situacao: "cancelado" }), cobranca, new Set())).toEqual({ acao: "reconsultar", motivo: "cancelado" });
    expect(decidirAviso(aviso({ situacao: "outro" }), cobranca, new Set())).toEqual({ acao: "ignorar", motivo: "outra_situacao" });
  });
});
