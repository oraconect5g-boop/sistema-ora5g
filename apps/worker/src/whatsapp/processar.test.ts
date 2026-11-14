// Rotina do envio da nota pelo WhatsApp (K1c) com banco e canal SIMULADOS (dados fictícios, nada sai para a Meta).
// O canal de teste fica só aqui: em produção não existe canal enquanto o contrato da Meta não estiver verificado.
import { describe, expect, it } from "vitest";

import { enviarPendentes, pedidoAoCanal, type BancoWhatsApp, type CanalWhatsApp, type EnvioParaFazer, type ResultadoDoEnvio, type RespostaDoCanal } from "./processar.ts";

const envio = (n: number): EnvioParaFazer => ({
  envioId: `envio-${n}`, telefone: "41987650801", documentoCaminho: `org/loja/pedido/${n}.pdf`, notaNumero: 700 + n, notaSerie: 1,
  chaveAcesso: "4".repeat(44), clienteNome: "Carla Cliente Teste",
});
function bancoCom(fila: EnvioParaFazer[], link: (c: string) => string | null = (c) => `https://exemplo.invalid/assinado/${c}`) {
  const registrados: [string, ResultadoDoEnvio][] = [];
  const banco: BancoWhatsApp = {
    reivindicar: async () => fila,
    registrarResultado: async (id, r) => { registrados.push([id, r]); return r.situacao; },
    linkTemporario: async (c) => link(c),
  };
  return { banco, registrados };
}
const canalQue = (respostas: (RespostaDoCanal | Error)[]) => {
  const pedidos: unknown[] = [];
  const canal: CanalWhatsApp = {
    enviarDocumento: async (p) => {
      pedidos.push(p);
      const r = respostas.shift();
      if (r instanceof Error) throw r;
      return r as RespostaDoCanal;
    },
  };
  return { canal, pedidos };
};

describe("envio da nota pelo WhatsApp: a rotina do worker (K1c)", () => {
  it("sem canal (integração não habilitada) não pega nada da fila", async () => {
    let pegou = false;
    const banco: BancoWhatsApp = { reivindicar: async () => { pegou = true; return []; }, registrarResultado: async () => "", linkTemporario: async () => null };
    expect(await enviarPendentes(banco, null)).toEqual({ aceitos: 0, falhas: 0, desconhecidos: 0, devolvidos: 0, bloqueado: true });
    expect(pegou).toBe(false);
  });

  it("aceite, recusa, sem resposta depois de sair, nada saiu e exceção: cada um no estado certo, sem reenvio cego", async () => {
    const { banco, registrados } = bancoCom([envio(1), envio(2), envio(3), envio(4), envio(5)]);
    const { canal, pedidos } = canalQue([
      { tipo: "aceito", idDaMensagem: "wamid.FICTICIO.1" },
      { tipo: "recusado", motivo: "Número sem WhatsApp" },
      { tipo: "sem_resposta", motivo: "Tempo esgotado", saiu: true },
      { tipo: "sem_resposta", motivo: "Sem conexão", saiu: false },
      new Error("quebrou"),
    ]);
    expect(await enviarPendentes(banco, canal)).toEqual({ aceitos: 1, falhas: 1, desconhecidos: 2, devolvidos: 1, bloqueado: false });
    expect(registrados.map(([id, r]) => `${id}:${r.situacao}`)).toEqual(["envio-1:aceito", "envio-2:falhou", "envio-3:desconhecido", "envio-4:na_fila", "envio-5:desconhecido"]);
    expect(pedidos[0]).toEqual({ telefone: "5541987650801", linkDoDocumento: "https://exemplo.invalid/assinado/org/loja/pedido/1.pdf", nomeDoArquivo: "nota-701.pdf", primeiroNome: "Carla", numeroDaNota: "701" });
  });

  it("sem link do documento nada é chamado: volta para a fila", async () => {
    const { banco, registrados } = bancoCom([envio(1)], () => null);
    const { canal, pedidos } = canalQue([]);
    expect(await enviarPendentes(banco, canal)).toMatchObject({ devolvidos: 1 });
    expect(pedidos).toEqual([]);
    expect(registrados).toEqual([["envio-1", { situacao: "na_fila", erro: "Não deu para gerar o link do documento" }]]);
    expect(pedidoAoCanal({ ...envio(1), notaNumero: null, clienteNome: "  " }, "x")).toMatchObject({ nomeDoArquivo: "nota.pdf", primeiroNome: "" });
  });
});
