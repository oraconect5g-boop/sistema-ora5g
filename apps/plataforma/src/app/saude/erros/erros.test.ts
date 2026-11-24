// O endereço do relato dos erros (lote QUAL-006a): responde ao worker dos avisos, dentro do servidor, e não a quem chega
// pelo domínio. Pedidos fictícios, sem rede.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import { recomecarErrosDoServidor, registrarErroDoServidor } from "../../../lib/saude/erros-do-servidor";
import { GET } from "./route";

const DE_DENTRO = { host: "127.0.0.1:3100", "x-forwarded-for": "127.0.0.1", "x-forwarded-host": "127.0.0.1:3100", "x-forwarded-proto": "http" };
const PELO_DOMINIO = { host: "127.0.0.1:3100", "x-forwarded-for": "200.100.50.25", "x-forwarded-host": "ora5g.com.br", "x-forwarded-proto": "https", "x-forwarded-server": "ora5g.com.br" };
const pedir = (cabecalhos: Record<string, string>) => GET(new NextRequest("http://127.0.0.1:3100/saude/erros", { headers: cabecalhos }));
const silencio = { escrever: () => undefined };

beforeEach(() => recomecarErrosDoServidor(Date.parse("2026-11-24T12:00:00.000Z")));

describe("/saude/erros (QUAL-006a)", () => {
  it("dentro do servidor: o relato, sem cache, com o último erro pelo molde da rota", async () => {
    registrarErroDoServidor(Object.assign(new Error("Cliente Ana, CPF 123"), { digest: "5" }), { method: "GET" }, { routePath: "/vendas/[id]?cpf=1", routeType: "render" }, silencio);
    const resposta = pedir(DE_DENTRO);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store, max-age=0");
    const corpo = await resposta.json();
    expect(corpo).toMatchObject({ desde: "2026-11-24T12:00:00.000Z", erros: 1, ultimo: { rota: "/vendas/[id]" } });
    expect(JSON.stringify(corpo)).not.toMatch(/Ana|CPF|cpf/);
  });

  it("pelo domínio: 404, como um endereço que não existe, sem corpo", async () => {
    const resposta = pedir(PELO_DOMINIO);
    expect(resposta.status).toBe(404);
    expect(await resposta.text()).toBe("");
  });
});
