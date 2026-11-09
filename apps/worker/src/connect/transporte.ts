// Transporte HTTP do worker da Ora Connect (ADR-005). Fala HTTPS com a Contel (HTTP só em 127.0.0.1,
// para os testes). Diferente do fetch, o node:https manda corpo em GET, como a documentação da Nogle
// pede em 25 consultas; o cliente só usa isso depois da confirmação da Contel (pergunta 2).
// "enviada" diz se o pedido pode ter chegado à Contel: sem conexão (DNS, recusa, tempo antes de
// conectar, TLS) nada saiu e o pedido volta para a fila sem risco de duplicar.
import { request as pedirHttp, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { request as pedirHttps } from "node:https";
import type { Socket } from "node:net";

export type RespostaHttp =
  | { tipo: "resposta"; status: number; corpo: unknown }
  | { tipo: "falha"; enviada: boolean; motivo: string };

export type PedidoHttp = { metodo: "GET" | "POST"; caminho: string; corpo?: unknown; token?: string };
export type Transporte = (pedido: PedidoHttp) => Promise<RespostaHttp>;

const LIMITE_DA_RESPOSTA = 5_000_000;

export function transporteHttp(base: string, tempoLimiteMs = 20_000): Transporte {
  const url = new URL(base);
  const seguro = url.protocol === "https:";
  if (!seguro && !(url.protocol === "http:" && url.hostname === "127.0.0.1")) {
    throw new Error("o endereço da Contel precisa ser https");
  }
  const pedir: (opcoes: RequestOptions, aoResponder: (r: IncomingMessage) => void) => ClientRequest = seguro ? pedirHttps : pedirHttp;
  const prefixo = url.pathname.replace(/\/+$/, "");

  return (pedido) => new Promise<RespostaHttp>((resolver) => {
    const corpo = pedido.corpo === undefined ? undefined : JSON.stringify(pedido.corpo);
    let conectou = false;
    let terminou = false;
    const fim = (r: RespostaHttp) => {
      if (!terminou) {
        terminou = true;
        resolver(r);
      }
    };
    const requisicao = pedir({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: prefixo + pedido.caminho,
      method: pedido.metodo,
      agent: false,
      timeout: tempoLimiteMs,
      headers: {
        Accept: "application/json",
        ...(corpo !== undefined ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(corpo) } : {}),
        ...(pedido.token ? { Authorization: `Bearer ${pedido.token}` } : {}),
      },
    }, (resposta) => {
      const partes: Buffer[] = [];
      let tamanho = 0;
      resposta.on("data", (parte: Buffer) => {
        tamanho += parte.length;
        if (tamanho > LIMITE_DA_RESPOSTA) {
          requisicao.destroy(new Error("resposta grande demais"));
          return;
        }
        partes.push(parte);
      });
      resposta.on("end", () => {
        const texto = Buffer.concat(partes).toString("utf8");
        let json: unknown = null;
        try {
          json = texto ? JSON.parse(texto) : null;
        } catch {
          json = null; // resposta que não é JSON: as regras tratam como formato inesperado
        }
        fim({ tipo: "resposta", status: resposta.statusCode ?? 0, corpo: json });
      });
      resposta.on("error", () => fim({ tipo: "falha", enviada: true, motivo: "resposta interrompida" }));
    });
    requisicao.on("socket", (socket: Socket) => {
      if (!socket.connecting) conectou = true;
      else socket.once(seguro ? "secureConnect" : "connect", () => { conectou = true; });
    });
    requisicao.on("timeout", () => requisicao.destroy(new Error("tempo esgotado")));
    requisicao.on("error", (erro: NodeJS.ErrnoException) => fim(conectou
      ? { tipo: "falha", enviada: true, motivo: "sem resposta da Contel depois do envio" }
      : { tipo: "falha", enviada: false, motivo: `sem conexão com a Contel (${erro.code ?? "rede"})` }));
    if (corpo !== undefined) requisicao.write(corpo);
    requisicao.end();
  });
}
