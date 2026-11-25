// CONNECT-g (25/11/2026; ORA-CONNECT-007): as consultas que só leem, no worker, com a Nogle e o banco SIMULADOS e o relógio
// de mentira. O caminho de verdade (o transporte HTTP, o GET com corpo e o banco com as migrations) está em
// ponta-a-ponta.test.ts. Linhas e ICCIDs FICTÍCIOS.
import type { PedidoNogle, RespostaDaConsulta } from "@ora5g/dominio/nogle";
import { describe, expect, it } from "vitest";

import type { ResultadoChamada } from "./cliente-nogle.ts";
import { responderConsultas, type BancoConnect, type ConsultaParaFazer } from "./processar.ts";

const LINHA = "51900000000";
const ICCID = "8955170110000000016";
const ok = (corpo: unknown): ResultadoChamada => ({ tipo: "resposta", status: 200, corpo });

function simulados(filas: ConsultaParaFazer[][], respostas: Record<string, ResultadoChamada>) {
  const gravadas: [string, RespostaDaConsulta][] = [];
  const pedidos: PedidoNogle[] = [];
  let vezes = 0;
  const banco = {
    consultasAFazer: async () => filas[vezes++] ?? [],
    registrarRespostaDaConsulta: async (id: string, r: RespostaDaConsulta) => { gravadas.push([id, r]); return r.situacao; },
  } as unknown as BancoConnect;
  const nogle = {
    chamar: async (p: PedidoNogle) => {
      pedidos.push(p);
      const r = respostas[p.caminho];
      if (!r) throw new Error(`rota inesperada: ${p.caminho}`);
      return r;
    },
  };
  let relogio = 0;
  const opcoes = { duracaoMs: 10, esperaMs: 4, relogio: () => relogio, esperar: async (ms: number) => { relogio += ms; } };
  return { banco, nogle, gravadas, pedidos, opcoes, vezes: () => vezes };
}

describe("as consultas que só leem, no worker (CONNECT-g)", () => {
  it("responde a fila (a linha, o chip e a carteira) só com GET e grava a resposta limpa", async () => {
    const s = simulados([[
      { consulta_id: "c1", tipo: "linha_saldo", parametro: LINHA },
      { consulta_id: "c2", tipo: "iccid_numero", parametro: ICCID },
      { consulta_id: "c3", tipo: "carteira_saldo", parametro: null },
    ]], {
      "/linhas/saldo": ok({ retorno: true, mensagem: "", data: { restante_dados: 1024.5, restante_minutos: 1000, restante_sms: 0 } }),
      "/linhas/numeroPeloIccid": ok({ retorno: true, mensagem: "", numero: LINHA }),
      "/saldo/saldo": ok({ saldo: "1234.56" }),
    });
    expect(await responderConsultas(s.banco, s.nogle, s.opcoes)).toEqual({ respondidas: 3, nao_encontradas: 0, falhas: 0 });
    expect(s.pedidos.every((p) => p.metodo === "GET")).toBe(true);
    expect(s.gravadas).toEqual([
      ["c1", { situacao: "respondida", mensagem: "", resposta: { dados_mb: 1024.5, minutos: 1000, minutos_ilimitados: true, sms: 0 } }],
      ["c2", { situacao: "respondida", mensagem: "", resposta: { numero: LINHA } }],
      ["c3", { situacao: "respondida", mensagem: "", resposta: { saldo_centavos: 123456 } }],
    ]);
  });

  it("sem conexão, com a consulta desligada ou o login recusado: falha com o aviso; a consulta fora da forma nem chama a Nogle", async () => {
    const s = simulados([[
      { consulta_id: "f1", tipo: "linha_detalhes", parametro: LINHA },
      { consulta_id: "f2", tipo: "linha_historico", parametro: LINHA },
      { consulta_id: "f3", tipo: "carteira_saldo", parametro: null },
      { consulta_id: "f4", tipo: "outra_coisa", parametro: LINHA },
      { consulta_id: "f5", tipo: "linha_saldo", parametro: "123" },
    ]], {
      "/linhas/detalhes": { tipo: "falha", enviada: false, motivo: "sem conexão com a Nogle (ENOTFOUND)" },
      "/linhas/historico": { tipo: "bloqueada", motivo: "consulta GET com corpo desligada neste worker (NOGLE_GET_COM_CORPO)" },
      "/saldo/saldo": { tipo: "sem_acesso", motivo: "login recusado pela Nogle (HTTP 401)" },
    });
    expect(await responderConsultas(s.banco, s.nogle, s.opcoes)).toEqual({ respondidas: 0, nao_encontradas: 0, falhas: 5 });
    expect(s.pedidos.map((p) => p.caminho)).toEqual(["/linhas/detalhes", "/linhas/historico", "/saldo/saldo"]);
    expect(s.gravadas.map(([id, r]) => [id, r.mensagem])).toEqual([
      ["f1", "Sem conexão com a Nogle agora: tente de novo em instantes."],
      ["f2", "A consulta com corpo está desligada neste servidor (NOGLE_GET_COM_CORPO)."],
      ["f3", "O login na Nogle foi recusado: avise o administrador."],
      ["f4", "Consulta fora da forma."],
      ["f5", "Consulta fora da forma."],
    ]);
  });

  it("sem nada na fila, espera e olha de novo até o fim do tempo", async () => {
    const s = simulados([], {});
    expect(await responderConsultas(s.banco, s.nogle, s.opcoes)).toEqual({ respondidas: 0, nao_encontradas: 0, falhas: 0 });
    // 10 ms de duração, 4 ms de espera: olha em 0, 4 e 8.
    expect(s.vezes()).toBe(3);
    expect(s.pedidos).toEqual([]);
  });
});
