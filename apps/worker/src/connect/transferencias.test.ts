// CONNECT-e (25/11/2026; ORA-INV-011): o envio das transferências de chips no worker, com a Nogle e o banco SIMULADOS. O
// caminho de verdade (o transporte HTTP, o token e o banco com as migrations) está em ponta-a-ponta.test.ts. ICCIDs FICTÍCIOS.
import type { PedidoNogle, TransferenciaParaEnviar } from "@ora5g/dominio/nogle";
import { describe, expect, it } from "vitest";

import type { ResultadoChamada } from "./cliente-nogle.ts";
import { enviarTransferencias, type BancoConnect, type ResultadoDaTransferencia } from "./processar.ts";

const I = (n: number) => `895517011000000${String(n).padStart(3, "0")}1`;
const estoqueCom = (...chips: [string, string][]): ResultadoChamada => ({
  tipo: "resposta", status: 200, corpo: { total: chips.length, data: chips.map(([iccid, tipo], k) => ({ id: String(k), iccid, data_repasse: null, tipo })) },
});
const ESIM: TransferenciaParaEnviar = { transferencia_id: "t-esim", tipo: "esim", pdv_id: 5233, iccid: null, iccid_final: null, quantidade: 1 };
const UNIDADE: TransferenciaParaEnviar = { transferencia_id: "t-unidade", tipo: "unidade", pdv_id: 5233, iccid: I(101), iccid_final: null, quantidade: 1 };

/** O banco com a fila dada e a Nogle respondendo, em ordem, cada chamada; o que foi pedido e registrado fica guardado. */
function simulados(fila: TransferenciaParaEnviar[], respostas: ResultadoChamada[]) {
  const pedidos: PedidoNogle[] = [];
  const registrados: { transferencia: string; resultado: ResultadoDaTransferencia }[] = [];
  const banco = {
    transferenciasAEnviar: async () => fila,
    registrarTransferencia: async (transferencia: string, resultado: ResultadoDaTransferencia) => {
      registrados.push({ transferencia, resultado });
      return resultado.envio === "nao_enviada" ? "registrada" : resultado.envio === "recusada" ? "recusada"
        : resultado.envio === "desconhecida" ? "resultado_desconhecido"
        : resultado.confirmacao === "confirmada" ? "confirmada" : resultado.confirmacao === "parcial" ? "parcial" : "resultado_desconhecido";
    },
  } as unknown as BancoConnect;
  const nogle = {
    chamar: async (p: PedidoNogle): Promise<ResultadoChamada> => {
      pedidos.push(p);
      const r = respostas.shift();
      if (!r) throw new Error(`chamada a mais: ${p.metodo} ${p.caminho}`);
      return r;
    },
  };
  return { banco, nogle, pedidos, registrados };
}

describe("o envio das transferências de chips no worker (CONNECT-e)", () => {
  it("lê o estoque do PDV, envia uma vez e confirma pelo estoque de depois", async () => {
    const s = simulados([ESIM], [
      estoqueCom([I(1), "eSIM"], [I(2), "físico"]),
      { tipo: "resposta", status: 200, corpo: { message: "Sucesso." } },
      estoqueCom([I(1), "eSIM"], [I(2), "físico"], [I(3), "eSIM"]),
    ]);
    expect(await enviarTransferencias(s.banco, s.nogle)).toMatchObject({ enviadas: 1, confirmadas: 1, desconhecidas: 0, devolvidas: 0 });
    expect(s.pedidos.map((p) => [p.metodo, p.caminho, p.corpo])).toEqual([
      ["GET", "/pdv/estoque", { id: 5233 }],
      ["POST", "/pdv/transferir-chip-esim", { id: 5233, quantidade: 1 }],
      ["GET", "/pdv/estoque", { id: 5233 }],
    ]);
    expect(s.registrados).toEqual([{ transferencia: "t-esim", resultado: {
      envio: "aceita", mensagem: "Sucesso.", confirmacao: "confirmada", antes: { fisicos: 1, esims: 1 }, depois: { fisicos: 1, esims: 2 },
      novos: [I(3)], transferidos: null, nao_transferidos: null,
    } }]);
  });

  it("a recusa da Nogle fica registrada; enviado sem resposta é resultado desconhecido e não se repete", async () => {
    const recusa = simulados([UNIDADE], [estoqueCom(), { tipo: "resposta", status: 422, corpo: { message: "Chip não encontrado." } }]);
    expect(await enviarTransferencias(recusa.banco, recusa.nogle)).toMatchObject({ enviadas: 1, recusadas: 1 });
    expect(recusa.registrados[0]?.resultado).toEqual({ envio: "recusada", mensagem: "Chip não encontrado.", antes: { fisicos: 0, esims: 0 } });
    const mudo = simulados([UNIDADE], [estoqueCom(), { tipo: "falha", enviada: true, motivo: "sem resposta da Nogle depois do envio" }]);
    expect(await enviarTransferencias(mudo.banco, mudo.nogle)).toMatchObject({ enviadas: 1, desconhecidas: 1 });
    expect(mudo.pedidos.filter((p) => p.metodo === "POST")).toHaveLength(1);
    expect(mudo.registrados[0]?.resultado.envio).toBe("desconhecida");
    // Aceito, mas o estoque de depois não veio: não confirmada (o banco põe como resultado desconhecido).
    const semDepois = simulados([ESIM], [estoqueCom(), { tipo: "resposta", status: 200, corpo: { message: "Sucesso." } }, { tipo: "resposta", status: 500, corpo: {} }]);
    expect(await enviarTransferencias(semDepois.banco, semDepois.nogle)).toMatchObject({ desconhecidas: 1 });
    expect(semDepois.registrados[0]?.resultado).toMatchObject({ envio: "aceita", confirmacao: "nao_confirmada", novos: [] });
  });

  it("sem conexão nada sai: o pedido volta para a fila, e os demais também, sem chamar a Nogle; o pedido fora da forma não sai", async () => {
    const s = simulados([ESIM, UNIDADE], [{ tipo: "falha", enviada: false, motivo: "sem conexão com a Nogle (ENOTFOUND)" }]);
    expect(await enviarTransferencias(s.banco, s.nogle)).toMatchObject({ enviadas: 0, devolvidas: 2 });
    expect(s.pedidos).toHaveLength(1);
    expect(s.registrados.map((r) => r.resultado.envio)).toEqual(["nao_enviada", "nao_enviada"]);
    // A leitura de antes com HTTP 500 devolve só aquele pedido; o seguinte segue.
    const meio = simulados([ESIM, UNIDADE], [{ tipo: "resposta", status: 500, corpo: {} }, estoqueCom(),
      { tipo: "resposta", status: 200, corpo: { message: "Sucesso!" } }, estoqueCom([I(101), "físico"])]);
    expect(await enviarTransferencias(meio.banco, meio.nogle)).toMatchObject({ devolvidas: 1, confirmadas: 1 });
    // Fora da forma (o lote sem o fim): nada é enviado, recusado aqui mesmo.
    const torto = simulados([{ ...UNIDADE, tipo: "lote", iccid_final: null }], []);
    expect(await enviarTransferencias(torto.banco, torto.nogle)).toMatchObject({ recusadas: 1, enviadas: 0 });
    expect(torto.pedidos).toEqual([]);
  });
});
