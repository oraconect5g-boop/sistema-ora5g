// O relato dos erros do site (lote QUAL-006a), sem credencial real: um servidor local faz o papel do site (/saude/erros),
// e o banco é o de teste, com todas as migrations (PGlite), chamado como o worker chama (sem sessão de pessoa, com o
// segredo dos avisos). Quem decide o alerta é o banco: packages/banco/src/aviso-do-erro-do-servidor.test.ts.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { PGlite } from "@electric-sql/pglite";
import { comoUsuario, criarBanco, type Sessao } from "@ora5g/banco/src/banco-de-teste.ts";
import { ids, montarCenario } from "@ora5g/banco/src/cenario.ts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  leitorDoSite, linhaDoRelato, relatarOsErrosDoSite, SITE_LOCAL, type BancoDoRelato, type RelatoParaOBanco, type RespostaDoSite,
} from "./erros-do-site.ts";

const SEGREDO = "segredo-ficticio-dos-avisos-para-o-teste-0123456789";
const DESDE = new Date(Date.now() - 30 * 60_000).toISOString();
const ULTIMO = { quando: new Date(Date.now() - 60_000).toISOString(), rota: "/vendas/[id]" };

/** O banco simulado: guarda o que recebeu e responde quantos alertas. */
function bancoSimulado(alertas = 0) {
  const relatos: RelatoParaOBanco[] = [];
  const banco: BancoDoRelato = { relatar: async (r) => { relatos.push(r); return { alertas }; } };
  return { banco, relatos };
}
const site = (resposta: RespostaDoSite) => async () => resposta;

describe("o relato ao banco (QUAL-006a)", () => {
  it("o relato do site vai ao banco só com os campos dele; o site sem resposta (conexão, tempo ou 5xx) vai como sem resposta", async () => {
    const { banco, relatos } = bancoSimulado(2);
    const corpo = { desde: DESDE, erros: 3, ultimo: { ...ULTIMO, texto: "não vai" }, extra: "não vai" };
    expect(await relatarOsErrosDoSite(site({ status: 200, corpo }), banco)).toEqual({ situacao: "relatado", erros: 3, alertas: 2 });
    expect(await relatarOsErrosDoSite(site(null), banco)).toEqual({ situacao: "sem_resposta", alertas: 2 });
    expect(await relatarOsErrosDoSite(site({ status: 503, corpo: null }), banco)).toEqual({ situacao: "sem_resposta", alertas: 2 });
    expect(relatos).toEqual([{ respondeu: true, desde: DESDE, erros: 3, ultimo: ULTIMO }, { respondeu: false }, { respondeu: false }]);
  });

  it("o site que responde outra coisa ou o relato fora do formato: nada vai ao banco", async () => {
    const { banco, relatos } = bancoSimulado();
    expect(await relatarOsErrosDoSite(site({ status: 404, corpo: null }), banco)).toEqual({ situacao: "sem_relato", status: 404 });
    expect(await relatarOsErrosDoSite(site({ status: 307, corpo: null }), banco)).toEqual({ situacao: "sem_relato", status: 307 });
    for (const corpo of [undefined, null, { desde: DESDE, erros: 2, ultimo: null }, { desde: DESDE, erros: 1, ultimo: { ...ULTIMO, rota: "/vendas/7?cpf=1" } }]) {
      expect(await relatarOsErrosDoSite(site({ status: 200, corpo }), banco)).toEqual({ situacao: "fora_do_formato" });
    }
    expect(relatos).toEqual([]);
  });

  it("a linha do log só aparece quando há o que dizer, e só com contagens", () => {
    expect(linhaDoRelato({ situacao: "relatado", erros: 0, alertas: 0 })).toBeNull();
    expect(linhaDoRelato({ situacao: "relatado", erros: 3, alertas: 2 })).toBe("site: 3 erros do servidor desde que subiu; 2 alertas na fila");
    expect(linhaDoRelato({ situacao: "sem_resposta", alertas: 0 })).toBe("site sem resposta no relato dos erros");
    expect(linhaDoRelato({ situacao: "sem_resposta", alertas: 1 })).toBe("site sem resposta no relato dos erros; 1 alertas na fila");
    expect(linhaDoRelato({ situacao: "sem_relato", status: 404 })).toBe("site respondeu 404 no relato dos erros; nada relatado");
    expect(linhaDoRelato({ situacao: "fora_do_formato" })).toBe("relato dos erros do site fora do formato; nada relatado");
  });

  it("o endereço do site é só o de dentro do servidor", () => {
    for (const bom of ["http://127.0.0.1:3100", "http://127.0.0.1:3182"]) expect(SITE_LOCAL.test(bom), bom).toBe(true);
    for (const ruim of ["https://ora5g.com.br", "http://localhost:3100", "http://127.0.0.1:3100/", "http://127.0.0.1", "http://10.0.0.1:3100", ""]) {
      expect(SITE_LOCAL.test(ruim), ruim).toBe(false);
    }
  });
});

// Um servidor local no papel do site: o que /saude/erros responde em cada teste.
let servidor: Server;
let base = "";
let responder: (res: import("node:http").ServerResponse) => void = () => undefined;
const caminhos: string[] = [];
let db: PGlite;

beforeAll(async () => {
  servidor = createServer((req, res) => { caminhos.push(`${req.method} ${req.url}`); responder(res); });
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  db = await criarBanco();
  await montarCenario(db);
  await db.query("insert into privado.segredos_de_rotina (nome, impressao) values ('avisos_no_celular', sha256(convert_to($1, 'UTF8')))", [SEGREDO]);
});
afterAll(async () => {
  await new Promise((fim) => servidor.close(fim));
  await db.close();
});
beforeEach(() => { caminhos.length = 0; });
const json = (status: number, dados: unknown) => (res: import("node:http").ServerResponse) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(dados));
};

describe("a leitura do site (QUAL-006a)", () => {
  it("lê /saude/erros: o 200 com o corpo, outro status sem corpo, sem seguir redirecionamento", async () => {
    responder = json(200, { desde: DESDE, erros: 0, ultimo: null });
    expect(await leitorDoSite(base)()).toEqual({ status: 200, corpo: { desde: DESDE, erros: 0, ultimo: null } });
    responder = json(404, { nada: true });
    expect(await leitorDoSite(base)()).toEqual({ status: 404, corpo: null });
    responder = (res) => { res.writeHead(302, { location: `${base}/outro` }); res.end(); };
    expect(await leitorDoSite(base)()).toEqual({ status: 302, corpo: null });
    responder = (res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("{quebrado"); };
    expect(await leitorDoSite(base)()).toEqual({ status: 200, corpo: undefined });
    expect(caminhos).toEqual(Array(4).fill("GET /saude/erros"));
  });

  it("o site que não responde a tempo, ou que não está no ar, é null", async () => {
    responder = () => undefined;
    expect(await leitorDoSite(base, 200)()).toBeNull();
    const fechado = createServer();
    await new Promise<void>((pronto) => fechado.listen(0, "127.0.0.1", pronto));
    const porta = (fechado.address() as AddressInfo).port;
    await new Promise((fim) => fechado.close(fim));
    expect(await leitorDoSite(`http://127.0.0.1:${porta}`, 2_000)()).toBeNull();
  });
});

describe("de ponta a ponta, com o banco de teste (QUAL-006a)", () => {
  it("o site com erros vira o alerta na fila dos avisos, para o celular do dono; o mesmo relato de novo não repete", async () => {
    const bancoDeTeste: BancoDoRelato = {
      relatar: (relato) => comoUsuario(db, null, async () =>
        (await db.query<{ v: { alertas: number } }>("select public.erros_do_servidor_relatar($1, $2::jsonb) as v", [SEGREDO, JSON.stringify(relato)])).rows[0]?.v as { alertas: number }),
    };
    const dono: Sessao = { usuario: ids.dono, sessao: "4e100000-0000-4000-8000-000000000001" };
    await comoUsuario(db, dono, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
    await comoUsuario(db, dono, () => db.query("select public.aviso_inscrever($1, $2, $3, null)",
      ["https://push.exemplo.invalid/servidor/ponta", `B${"A".repeat(85)}`, `auth${"x".repeat(18)}`]), { criarSessao: false });

    responder = json(200, { desde: DESDE, erros: 2, ultimo: ULTIMO });
    expect(await relatarOsErrosDoSite(leitorDoSite(base), bancoDeTeste)).toEqual({ situacao: "relatado", erros: 2, alertas: 2 });
    expect(await relatarOsErrosDoSite(leitorDoSite(base), bancoDeTeste)).toEqual({ situacao: "relatado", erros: 2, alertas: 0 });
    const fila = await comoUsuario(db, null, async () => (await db.query<{ v: { titulo: string; corpo: string; endereco: string; inscricoes: { endpoint: string }[] }[] }>(
      "select public.avisos_a_enviar($1, 100) as v", [SEGREDO])).rows[0]?.v ?? []);
    const doDono = fila.filter((a) => a.inscricoes.some((i) => i.endpoint.endsWith("/servidor/ponta")));
    expect(doDono).toHaveLength(1);
    expect(doDono[0]).toMatchObject({ titulo: "Erros no servidor do site", endereco: "/operacao" });
    expect(doDono[0]?.corpo).toMatch(/^2 erros novos; o último às \d{2}:\d{2}, em \/vendas\/\[id\]\. Veja na Saúde da operação\.$/);
  });
});
