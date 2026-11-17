// A conexão mantida com o Supabase (lote VEL-a: ORA-QUAL-010; ADR-010). O servidor de mentira abaixo fala HTTP/1.1
// direto no soquete, como a borda do Supabase: responde "Connection: keep-alive" SEM dizer por quanto tempo guarda
// a conexão. O teste conta quantas conexões o fetch de verdade do Node abriu. Nada sai da máquina (127.0.0.1).
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CONEXAO_PARADA_MS, manterConexoesAbertas } from "./conexao-mantida";

const DESPACHANTE_GLOBAL = Symbol.for("undici.globalDispatcher.1");
const global = globalThis as unknown as Record<symbol, unknown>;
const RESPOSTA = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: keep-alive\r\n\r\nok";

const esperar = (ms: number) => new Promise<void>((feito) => setTimeout(feito, ms));
/** Espera a condição valer, até o prazo; devolve se valeu. */
const ate = async (condicao: () => boolean, prazoMs: number) => {
  const fim = Date.now() + prazoMs;
  while (!condicao() && Date.now() < fim) await esperar(25);
  return condicao();
};
const pedir = async (endereco: string) => (await fetch(endereco)).text();

let original: unknown;
let servidor: Server | undefined;
const soquetes = new Set<Socket>();

/**
 * Sobe o servidor de mentira e devolve o endereço, quantas conexões já foram abertas, quantas estão abertas e
 * quantos pedidos chegaram. Com `fechaNoSegundoPedido`, o segundo pedido de cada conexão fica sem resposta: o
 * servidor fecha a conexão, como quando o fechamento do outro lado cruza com um pedido que já estava a caminho.
 */
async function servidorQueContaConexoes(opcoes: { fechaNoSegundoPedido?: boolean } = {}) {
  let conexoes = 0;
  let pedidos = 0;
  const novo = createServer((soquete) => {
    conexoes += 1;
    soquetes.add(soquete);
    soquete.on("close", () => soquetes.delete(soquete));
    soquete.on("error", () => undefined);
    let recebido = "";
    let nestaConexao = 0;
    soquete.on("data", (pedaco) => {
      recebido += pedaco.toString("latin1");
      // cada linha em branco fecha um pedido (sem corpo): uma resposta para cada um
      for (let fim = recebido.indexOf("\r\n\r\n"); fim >= 0; fim = recebido.indexOf("\r\n\r\n")) {
        recebido = recebido.slice(fim + 4);
        pedidos += 1;
        nestaConexao += 1;
        if (opcoes.fechaNoSegundoPedido && nestaConexao === 2) {
          soquete.destroy();
          return;
        }
        soquete.write(RESPOSTA);
      }
    });
  });
  servidor = novo;
  await new Promise<void>((pronto) => novo.listen(0, "127.0.0.1", pronto));
  const { port } = novo.address() as AddressInfo;
  return { endereco: `http://127.0.0.1:${port}/`, conexoes: () => conexoes, abertas: () => soquetes.size, pedidos: () => pedidos };
}

beforeAll(async () => {
  // o despachante do Node nasce no primeiro fetch
  await (await fetch("data:,")).arrayBuffer();
  original = global[DESPACHANTE_GLOBAL];
});

afterEach(async () => {
  vi.unstubAllGlobals();
  const usado = global[DESPACHANTE_GLOBAL] as { close?: () => Promise<void> } | undefined;
  global[DESPACHANTE_GLOBAL] = original;
  if (usado !== original && typeof usado?.close === "function") await usado.close();
  for (const soquete of soquetes) soquete.destroy();
  const aberto = servidor;
  servidor = undefined;
  if (aberto) await new Promise<void>((fechado) => aberto.close(() => fechado()));
});

describe("conexão mantida com o Supabase", () => {
  it("troca o despachante do fetch por outro da mesma classe do Node", async () => {
    const antes = global[DESPACHANTE_GLOBAL] as object;
    expect(await manterConexoesAbertas()).toBe(true);
    const depois = global[DESPACHANTE_GLOBAL] as object;
    expect(depois).not.toBe(antes);
    expect(depois.constructor).toBe(antes.constructor);
  });

  it("o limite pedido é o que vale: parada além dele, a conexão é fechada e o pedido seguinte abre outra", async () => {
    const { endereco, conexoes, abertas } = await servidorQueContaConexoes();
    expect(await manterConexoesAbertas(250)).toBe(true);
    expect(await pedir(endereco)).toBe("ok");
    // O Node espera uma volta do laço de eventos antes de reaproveitar a conexão: um pedido disparado no mesmo
    // instante em que o anterior terminou abre outra. Com a resposta vindo da rede isso não acontece.
    await esperar(50);
    expect(await pedir(endereco)).toBe("ok");
    expect(conexoes()).toBe(1);
    expect(await ate(() => abertas() === 0, 3_000)).toBe(true);
    expect(await pedir(endereco)).toBe("ok");
    expect(conexoes()).toBe(2);
  });

  // O teste que falhava antes do lote: o Node, sozinho, fecha a conexão parada aos 4 s e o segundo pedido abre outra.
  it("com o limite do sistema, o pedido feito 6 s depois reaproveita a conexão", async () => {
    expect(CONEXAO_PARADA_MS).toBeGreaterThanOrEqual(60_000);
    const { endereco, conexoes, abertas } = await servidorQueContaConexoes();
    expect(await manterConexoesAbertas()).toBe(true);
    expect(await pedir(endereco)).toBe("ok");
    await esperar(6_000);
    expect(abertas()).toBe(1);
    expect(await pedir(endereco)).toBe("ok");
    expect(conexoes()).toBe(1);
  }, 20_000);

  // O que a decisão de NÃO repetir o pedido toma por certo (ADR-010, decisão 4): quando o outro lado fecha a conexão
  // com o pedido já a caminho, esse pedido falha, o Node não o manda de novo (o servidor não recebe um segundo) e o
  // pedido seguinte abre outra conexão. É o comportamento do Node, não o nosso: se um Node novo passar a repetir
  // sozinho uma gravação, este teste avisa.
  it("o pedido que cruza com o fechamento do outro lado falha uma vez só: o Node não repete, e o seguinte abre outra conexão", async () => {
    const { endereco, conexoes, pedidos } = await servidorQueContaConexoes({ fechaNoSegundoPedido: true });
    expect(await manterConexoesAbertas()).toBe(true);
    const gravar = () => fetch(endereco, { method: "POST" });
    expect(await (await gravar()).text()).toBe("ok");
    await esperar(50);
    const erro: unknown = await gravar().then(() => null, (falha: unknown) => falha);
    expect(erro).toBeInstanceOf(TypeError);
    expect((erro as { cause?: { code?: unknown } }).cause?.code).toBe("UND_ERR_SOCKET");
    // tempo de sobra para um pedido repetido chegar, se o Node repetisse
    await esperar(300);
    expect({ pedidos: pedidos(), conexoes: conexoes() }).toEqual({ pedidos: 2, conexoes: 1 });
    expect(await (await gravar()).text()).toBe("ok");
    expect({ pedidos: pedidos(), conexoes: conexoes() }).toEqual({ pedidos: 3, conexoes: 2 });
  });

  it("num Node com outro despachante, não mexe em nada e devolve false", async () => {
    const estranho = { dispatch: () => false };
    global[DESPACHANTE_GLOBAL] = estranho;
    expect(await manterConexoesAbertas()).toBe(false);
    expect(global[DESPACHANTE_GLOBAL]).toBe(estranho);
  });

  it("se o fetch falhar, devolve false em vez de derrubar o servidor que está subindo", async () => {
    vi.stubGlobal("fetch", () => { throw new Error("sem fetch"); });
    expect(await manterConexoesAbertas()).toBe(false);
    expect(global[DESPACHANTE_GLOBAL]).toBe(original);
  });
});
