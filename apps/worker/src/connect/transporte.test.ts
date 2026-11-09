// Transporte e cliente da Nogle contra um servidor HTTP local (127.0.0.1, porta livre do sistema):
// corpo em GET, token no cabeçalho, renovação no 401, tempo esgotado e falta de conexão. Sem rede externa.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ClienteNogle, corpoDoToken } from "./cliente-nogle.ts";
import { transporteHttp } from "./transporte.ts";

type Recebido = { metodo: string; caminho: string; corpo: string; autorizacao: string | undefined };
let servidor: Server;
let base = "";
let logins = 0;
const recebidos: Recebido[] = [];

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let corpo = "";
    req.on("data", (parte: Buffer) => { corpo += parte.toString("utf8"); });
    req.on("end", () => {
      recebidos.push({ metodo: req.method ?? "", caminho: req.url ?? "", corpo, autorizacao: req.headers.authorization });
      const json = (status: number, dados: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(dados)); };
      if (req.url === "/lento") return; // nunca responde
      if (req.url === "/texto") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html>manutenção</html>"); return; }
      if (req.url === "/auth/token") {
        const pedido = JSON.parse(corpo) as { chave_acesso?: string };
        if (pedido.chave_acesso === "errada") return json(200, { retorno: false, mensagem: "Chave inválida", token: "" });
        return json(200, { retorno: true, mensagem: "", token: `tk-${++logins}` });
      }
      if (req.url === "/protegida") return req.headers.authorization === "Bearer tk-1" ? json(401, { message: "Unauthenticated." }) : json(200, { retorno: true, mensagem: "", ok: 1 });
      return json(200, { retorno: true, mensagem: "", eco: corpo ? JSON.parse(corpo) as unknown : null });
    });
  });
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", () => pronto()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((pronto) => { servidor.closeAllConnections(); servidor.close(() => pronto()); }));

describe("transporte", () => {
  it("manda corpo em GET, como a documentação da Nogle pede nas consultas", async () => {
    const r = await transporteHttp(base)({ metodo: "GET", caminho: "/linhas/historico", corpo: { numero: "51988887777" }, token: "tk-x" });
    expect(r).toEqual({ tipo: "resposta", status: 200, corpo: { retorno: true, mensagem: "", eco: { numero: "51988887777" } } });
    expect(recebidos.at(-1)).toMatchObject({ metodo: "GET", caminho: "/linhas/historico", autorizacao: "Bearer tk-x" });
  });

  it("tempo esgotado depois de conectar: pode ter chegado (enviada); sem conexão: nada saiu", async () => {
    expect(await transporteHttp(base, 300)({ metodo: "POST", caminho: "/lento", corpo: { a: 1 } })).toMatchObject({ tipo: "falha", enviada: true });
    expect(await transporteHttp("http://127.0.0.1:1", 300)({ metodo: "POST", caminho: "/x", corpo: {} })).toMatchObject({ tipo: "falha", enviada: false });
  });

  it("resposta que não é JSON vira corpo nulo; endereço sem https fora do 127.0.0.1 é recusado", async () => {
    expect(await transporteHttp(base)({ metodo: "GET", caminho: "/texto" })).toEqual({ tipo: "resposta", status: 200, corpo: null });
    expect(() => transporteHttp("http://api.conteltelecom.com.br")).toThrow();
  });
});

describe("cliente da Nogle", () => {
  it("login conforme o tipo da chave (documentação de POST /auth/token)", () => {
    expect(corpoDoToken({ tipo: "marca", chaveAcesso: "a" })).toEqual({ chave_acesso: "a" });
    expect(corpoDoToken({ tipo: "franquia", chaveAcesso: "a", chaveSecundaria: "f" })).toEqual({ chave_acesso: "a", chave_acesso_franquia: "f" });
    expect(corpoDoToken({ tipo: "pdv", chaveAcesso: "a", chaveSecundaria: "p" })).toEqual({ chave_acesso: "a", chave_acesso_pdv: "p" });
    expect(() => corpoDoToken({ tipo: "pdv", chaveAcesso: "a" })).toThrow();
  });

  it("401 pede outro token uma vez e repete; login recusado não chama a operação", async () => {
    logins = 0;
    const cliente = new ClienteNogle({ tipo: "marca", chaveAcesso: "ficticia" }, transporteHttp(base), { getComCorpo: false });
    expect(await cliente.chamar({ metodo: "POST", caminho: "/protegida", corpo: { a: 1 } })).toMatchObject({ tipo: "resposta", status: 200 });
    expect(logins).toBe(2);
    const antes = recebidos.length;
    const recusado = new ClienteNogle({ tipo: "marca", chaveAcesso: "errada" }, transporteHttp(base), { getComCorpo: false });
    expect(await recusado.chamar({ metodo: "POST", caminho: "/ativacao/solicitar", corpo: { a: 1 } })).toMatchObject({ tipo: "sem_acesso" });
    expect(recebidos.slice(antes).map((r) => r.caminho)).toEqual(["/auth/token"]);
  });

  it("GET com corpo fica bloqueado até a Nogle confirmar (nada sai); GET sem corpo passa", async () => {
    const cliente = new ClienteNogle({ tipo: "marca", chaveAcesso: "ficticia" }, transporteHttp(base), { getComCorpo: false });
    const antes = recebidos.length;
    expect(await cliente.chamar({ metodo: "GET", caminho: "/linhas/historico", corpo: { numero: "51988887777" } })).toMatchObject({ tipo: "bloqueada" });
    expect(recebidos.length).toBe(antes);
    expect(await cliente.chamar({ metodo: "GET", caminho: "/planos", corpo: {} })).toMatchObject({ tipo: "resposta", status: 200 });
    expect(recebidos.at(-1)).toMatchObject({ metodo: "GET", caminho: "/planos", corpo: "" });
  });
});
