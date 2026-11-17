// O processamento da fila dos avisos (lote PWA-b), com o banco e o envio SIMULADOS. Quem decide quem recebe é o banco:
// packages/banco/src/avisos-no-celular.test.ts. Endereços fictícios.
import { describe, expect, it } from "vitest";

import { oQueFaltaParaOsAvisos } from "./configuracao.ts";
import { enviarAvisosPendentes, type AvisoParaEnviar, type BancoDosAvisos, type Enviar, type ResultadoDoAviso } from "./processar.ts";

const celular = (id: string) => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: "p", auth: "a" });
const LOTE: AvisoParaEnviar[] = [
  { id: "aviso-1", tipo: "desconto", titulo: "Desconto para aprovar", corpo: "Loja A: desconto pedido na venda nº 7", endereco: "/aprovacoes", inscricoes: [celular("c1"), celular("c2"), celular("c3")] },
  { id: "aviso-2", tipo: "teste", titulo: "Aviso de teste", corpo: "Os avisos estão chegando.", endereco: "/inicio", inscricoes: [celular("c4")] },
];

function bancoSimulado(lote: AvisoParaEnviar[]) {
  const registrados: ResultadoDoAviso[][] = [];
  const limites: number[] = [];
  const banco: BancoDosAvisos = {
    aEnviar: async (limite) => { limites.push(limite); return lote; },
    registrar: async (resultados) => { registrados.push(resultados); },
  };
  return { banco, registrados, limites };
}

describe("o envio do lote (PWA-b)", () => {
  it("manda cada aviso a cada celular e devolve ao banco o que aconteceu: entregue, celular fora e falha", async () => {
    const { banco, registrados, limites } = bancoSimulado(LOTE);
    const enviados: { endpoint: string; mensagem: unknown }[] = [];
    const enviar: Enviar = async (inscricao, mensagem) => {
      enviados.push({ endpoint: inscricao.endpoint, mensagem });
      if (inscricao.endpoint.endsWith("c2")) return "expirada";
      if (inscricao.endpoint.endsWith("c3")) throw new Error("sem rede");
      return "entregue";
    };
    expect(await enviarAvisosPendentes(banco, enviar)).toEqual({ avisos: 2, entregues: 2, expiradas: 1, falhas: 1 });
    expect(limites).toEqual([20]);
    expect(registrados).toEqual([[
      { aviso: "aviso-1", entregues: ["c1"], expiradas: ["c2"], falhas: 1 },
      { aviso: "aviso-2", entregues: ["c4"], expiradas: [], falhas: 0 },
    ]]);
    // O celular recebe só o título, o texto e o endereço.
    expect(enviados[0]?.mensagem).toEqual({ titulo: "Desconto para aprovar", corpo: "Loja A: desconto pedido na venda nº 7", endereco: "/aprovacoes" });
    expect(enviados).toHaveLength(4);
  });

  it("fila vazia: nada a registrar", async () => {
    const { banco, registrados } = bancoSimulado([]);
    expect(await enviarAvisosPendentes(banco, async () => "entregue")).toEqual({ avisos: 0, entregues: 0, expiradas: 0, falhas: 0 });
    expect(registrados).toEqual([]);
  });
});

describe("o que o worker dos avisos precisa para ligar", () => {
  const COMPLETO: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: "https://ficticio.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ficticia",
    NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: Buffer.alloc(65, 4).toString("base64url"),
    WEB_PUSH_PRIVATE_KEY: Buffer.alloc(32, 7).toString("base64url"),
    WEB_PUSH_SUBJECT: "https://ora5g.invalid",
    WEB_PUSH_SEGREDO_DA_FILA: "s".repeat(43),
  };
  const faltando = (mudancas: Record<string, string>) => oQueFaltaParaOsAvisos((nome) => ({ ...COMPLETO, ...mudancas })[nome] ?? "");

  it("com tudo, liga; não precisa da chave secreta do Supabase", () => {
    expect(faltando({})).toEqual([]);
  });

  it("aponta cada uma que falta ou está fora do formato, só pelo nome", () => {
    expect(faltando({ NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: "", WEB_PUSH_SEGREDO_DA_FILA: "curto" })).toEqual(["NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY", "WEB_PUSH_SEGREDO_DA_FILA"]);
    expect(faltando({ WEB_PUSH_PRIVATE_KEY: Buffer.alloc(31).toString("base64url"), WEB_PUSH_SUBJECT: "ora5g.com.br", NEXT_PUBLIC_SUPABASE_URL: "http://x" }))
      .toEqual(["NEXT_PUBLIC_SUPABASE_URL", "WEB_PUSH_PRIVATE_KEY", "WEB_PUSH_SUBJECT"]);
  });
});
