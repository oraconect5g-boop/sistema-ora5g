// Erros do servidor (lote OBS-a): o que entra na linha do log e na lista da Saúde da operação, e o que nunca entra.
import { beforeEach, describe, expect, it } from "vitest";

import { ERROS_GUARDADOS, recomecarErrosDoServidor, registrarErroDoServidor, resumoDosErros } from "./erros-do-servidor";

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
    expect(r).toEqual({ quando: INICIO, tipo: "tela", metodo: "GET", rota: "/vendas/[id]", codigo: "2398712345", etapa: null });
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
