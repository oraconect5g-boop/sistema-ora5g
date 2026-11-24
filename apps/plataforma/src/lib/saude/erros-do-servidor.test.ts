// Erros do servidor (lote OBS-a): o que entra na linha do log e na lista da Saúde da operação, e o que nunca entra. Desde o
// QUAL-006a: o pedido estranho (robôs) fora da conta, o relato para o worker dos avisos e o endereço só de dentro do servidor.
import { beforeEach, describe, expect, it } from "vitest";

import { relatoDoSite } from "@ora5g/dominio/avisos";

import {
  ERROS_GUARDADOS, pedidoDeDentroDoServidor, recomecarErrosDoServidor, registrarErroDoServidor, relatoDosErros, resumoDosErros,
} from "./erros-do-servidor";

const INICIO = Date.parse("2026-11-18T19:00:00Z");
let relogio = INICIO;
const linhas: string[] = [];
const meios = { agora: () => relogio, escrever: (linha: string) => void linhas.push(linha) };
const erroComCodigo = (mensagem: string, digest: string) => Object.assign(new Error(mensagem), { digest });

beforeEach(() => {
  relogio = INICIO;
  linhas.length = 0;
  recomecarErrosDoServidor(INICIO);
});

describe("o registro de cada erro", () => {
  it("guarda o tipo, o método, o molde da rota e o código; a linha do log não leva o texto do erro nem os valores", () => {
    const erro = erroComCodigo("CPF 123.456.789-00 não encontrado para Ana", "2398712345");
    const r = registrarErroDoServidor(erro, { method: "get" }, { routePath: "/vendas/[id]?cpf=12345678900", routeType: "render" }, meios);
    expect(r).toEqual({ quando: INICIO, tipo: "tela", metodo: "GET", rota: "/vendas/[id]", codigo: "2398712345", etapa: null, estranho: false });
    expect(linhas).toEqual(["[erro] tela GET /vendas/[id] código 2398712345"]);
    expect(linhas.join(" ")).not.toMatch(/CPF|Ana|12345678900/);
  });

  it("da FalhaDoServico entra a etapa; de outro erro, não", () => {
    const falha = Object.assign(new Error("Falha ao consultar o serviço (connect)"), { name: "FalhaDoServico", etapa: "connect", digest: "11" });
    expect(registrarErroDoServidor(falha, { method: "POST" }, { routePath: "/connect", routeType: "action" }, meios)?.etapa).toBe("connect");
    const outro = Object.assign(new Error("x"), { etapa: "connect" });
    expect(registrarErroDoServidor(outro, { method: "POST" }, { routePath: "/connect", routeType: "route" }, meios)?.etapa).toBeNull();
    expect(linhas).toEqual(["[erro] acao POST /connect código 11 etapa connect", "[erro] rota POST /connect"]);
  });

  it("os \"erros\" do próprio Next (redirect, 404) não contam", () => {
    for (const digest of ["NEXT_REDIRECT;replace;/entrar;307;", "NEXT_HTTP_ERROR_FALLBACK;404", "NEXT_NOT_FOUND"]) {
      expect(registrarErroDoServidor(erroComCodigo("x", digest), { method: "GET" }, { routePath: "/inicio", routeType: "render" }, meios)).toBeNull();
    }
    expect(linhas).toEqual([]);
    expect(resumoDosErros(INICIO).total).toBe(0);
  });

  it("o que vem estranho vira o neutro: método desconhecido, rota fora do molde, código fora do formato, tipo novo", () => {
    const r = registrarErroDoServidor(erroComCodigo("x", "código com espaço"), { method: "<script>" }, { routePath: "javascript:alert(1)", routeType: "novo" }, meios);
    expect(r).toMatchObject({ tipo: "tela", metodo: "?", rota: "(rota desconhecida)", codigo: null });
    expect(registrarErroDoServidor("só um texto", {}, {}, meios)).toMatchObject({ metodo: "?", rota: "(rota desconhecida)", codigo: null, etapa: null });
    expect(registrarErroDoServidor(new Error("x"), { method: "GET" }, { routePath: "/api/pendencias", routeType: "proxy" }, meios)?.tipo).toBe("proxy");
  });
});

describe("o resumo da Saúde da operação", () => {
  it("conta na última hora e nas últimas 24 horas, agrupa por rota (as de mais erros primeiro) e lista os mais recentes primeiro", () => {
    const em = (minutosAtras: number, rota: string, tipo = "render") => {
      relogio = INICIO - minutosAtras * 60_000;
      registrarErroDoServidor(new Error("x"), { method: "GET" }, { routePath: rota, routeType: tipo }, meios);
    };
    em(26 * 60, "/caixa");          // mais de um dia: fora do dia, mas no total
    em(5 * 60, "/vender");
    em(90, "/vender");
    em(30, "/estoque", "route");
    em(2, "/vender");
    const r = resumoDosErros(INICIO);
    expect(r).toMatchObject({ desde: INICIO, total: 5, ultimaHora: 2, ultimoDia: 4, cheia: false });
    expect(r.porRota).toEqual([
      { tipo: "tela", rota: "/vender", quantidade: 3, ultimo: INICIO - 2 * 60_000 },
      { tipo: "rota", rota: "/estoque", quantidade: 1, ultimo: INICIO - 30 * 60_000 },
    ]);
    expect(r.recentes.map((e) => e.rota)).toEqual(["/vender", "/estoque", "/vender", "/vender", "/caixa"]);
  });

  it(`guarda só os ${ERROS_GUARDADOS} mais recentes; o total conta todos e o dia vira "pelo menos"`, () => {
    for (let i = 0; i < ERROS_GUARDADOS + 5; i += 1) {
      relogio = INICIO - (ERROS_GUARDADOS + 5 - i) * 1_000;
      registrarErroDoServidor(new Error("x"), { method: "GET" }, { routePath: "/inicio", routeType: "render" }, meios);
    }
    const r = resumoDosErros(INICIO);
    expect(r.total).toBe(ERROS_GUARDADOS + 5);
    expect(r.ultimoDia).toBe(ERROS_GUARDADOS);
    expect(r.cheia).toBe(true);
    expect(r.recentes).toHaveLength(10);
  });
});

describe("o pedido estranho (QUAL-006a)", () => {
  it("o malformado e o do endereço que não existe contam à parte: fora da conta, da lista e do relato; a linha do log diz", () => {
    const malformado = erroComCodigo("The router state header was sent but could not be parsed.", "77");
    expect(registrarErroDoServidor(malformado, { method: "POST" }, { routePath: "/page", routeType: "render" }, meios)?.estranho).toBe(true);
    const inexistente = Object.assign(new Error("Invariant: Expected RSC response, got text/plain. This is a bug in Next.js."), { name: "InvariantError" });
    expect(registrarErroDoServidor(inexistente, { method: "POST" }, { routePath: "/_not-found/page", routeType: "render" }, meios)?.estranho).toBe(true);
    // O mesmo texto do Next num endereço que existe é falha: avisa.
    const deVerdade = new Error("Invariant: Expected RSC response, got text/plain. This is a bug in Next.js.");
    expect(registrarErroDoServidor(deVerdade, { method: "POST" }, { routePath: "/vender", routeType: "render" }, meios)?.estranho).toBe(false);
    expect(linhas).toEqual([
      "[erro] tela POST /page código 77 (pedido estranho)", "[erro] tela POST /_not-found/page (pedido estranho)", "[erro] tela POST /vender",
    ]);
    const r = resumoDosErros(INICIO);
    expect(r).toMatchObject({ total: 1, estranhos: 2, ultimaHora: 1, ultimoDia: 1 });
    expect(r.porRota.map((p) => p.rota)).toEqual(["/vender"]);
    expect(r.recentes.map((e) => e.rota)).toEqual(["/vender"]);
    expect(relatoDosErros(INICIO).erros).toBe(1);
  });
});

describe("o relato para o worker dos avisos (QUAL-006a)", () => {
  it("desde quando conta, quantos erros e o mais recente, no formato que o worker confere", () => {
    const vazio = relatoDosErros(INICIO);
    expect(vazio).toEqual({ desde: "2026-11-18T19:00:00.000Z", erros: 0, ultimo: null });
    expect(relatoDoSite(vazio)).toEqual(vazio);
    for (const [minutos, rota] of [[5, "/vender"], [12, "/vendas/[id]"]] as const) {
      relogio = INICIO + minutos * 60_000;
      registrarErroDoServidor(erroComCodigo("CPF 123.456.789-00", "9"), { method: "GET" }, { routePath: `${rota}?cpf=1`, routeType: "render" }, meios);
    }
    registrarErroDoServidor(erroComCodigo("The router state header was sent but could not be parsed.", "8"), { method: "POST" }, { routePath: "/page", routeType: "render" }, meios);
    const relato = relatoDosErros(INICIO + 13 * 60_000);
    expect(relato).toEqual({ desde: "2026-11-18T19:00:00.000Z", erros: 2, ultimo: { quando: "2026-11-18T19:12:00.000Z", rota: "/vendas/[id]" } });
    expect(relatoDoSite(relato)).toEqual(relato);
    expect(JSON.stringify(relato)).not.toMatch(/CPF|cpf|123/);
  });
});

describe("o endereço do relato só responde dentro do servidor (QUAL-006a)", () => {
  // Os cabeçalhos como o Next os deixa: ele preenche os x-forwarded-* que faltam com os do próprio pedido.
  const deDentro = { host: "127.0.0.1:3100", "x-forwarded-for": "127.0.0.1", "x-forwarded-host": "127.0.0.1:3100", "x-forwarded-proto": "http", "x-forwarded-port": "3100" };
  // Pelo domínio: o Apache passa o IP de quem pediu, o domínio, o https e o nome do servidor; o host é o do servidor local.
  const peloApache = { host: "127.0.0.1:3100", "x-forwarded-for": "200.100.50.25", "x-forwarded-host": "ora5g.com.br", "x-forwarded-proto": "https", "x-forwarded-server": "ora5g.com.br" };
  const pedido = (cabecalhos: Record<string, string>) => pedidoDeDentroDoServidor(new Headers(cabecalhos));

  it("o worker, no mesmo servidor (IPv4 ou IPv6), passa", () => {
    expect(pedido(deDentro)).toBe(true);
    expect(pedido({ ...deDentro, host: "[::1]:3100", "x-forwarded-host": "[::1]:3100", "x-forwarded-for": "::1" })).toBe(true);
  });

  it("pelo domínio, não passa, nem fingindo ser de dentro", () => {
    expect(pedido(peloApache)).toBe(false);
    // Quem manda o próprio x-forwarded-for: o Apache acrescenta o IP de verdade depois.
    expect(pedido({ ...peloApache, "x-forwarded-for": "127.0.0.1, 200.100.50.25", "x-forwarded-host": "127.0.0.1:3100", "x-forwarded-proto": "http" })).toBe(false);
    expect(pedido({ ...deDentro, "x-forwarded-host": "127.0.0.1:3100, ora5g.com.br" })).toBe(false);
    expect(pedido({ ...deDentro, "x-forwarded-proto": "https" })).toBe(false);
    expect(pedido({ ...deDentro, "x-forwarded-server": "ora5g.com.br" })).toBe(false);
    expect(pedido({ ...deDentro, forwarded: "for=200.100.50.25" })).toBe(false);
    expect(pedido({ ...deDentro, "x-real-ip": "200.100.50.25" })).toBe(false);
    expect(pedido({ ...deDentro, host: "ora5g.com.br", "x-forwarded-host": "ora5g.com.br" })).toBe(false);
    const semOrigem: Record<string, string> = { ...deDentro };
    delete semOrigem["x-forwarded-for"];
    expect(pedido(semOrigem)).toBe(false);
  });
});
