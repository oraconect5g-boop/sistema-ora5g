// Lote J1-a (19/11/2026; a prova #11 da lista de pendências, A1): o login de verdade, de ponta a ponta, com uma conta de
// teste fictícia (e-mail @example.com) no site no ar. Entra, escolhe a loja, renova a sessão quando o acesso vence, sai,
// a sessão encerrada não volta com os cookies antigos e a segunda visita entra de novo.
//
// Só roda no servidor: ORA_E2E_URL (o site, por exemplo https://ora5g.com.br) e ORA_E2E_CONTAS (o arquivo protegido das
// contas de teste, ~/homologacao/contas-de-teste.txt). No CI os dois ficam vazios e o teste é pulado. A senha nunca vai
// para o log: o Playwright só mostra o nome do passo.
import { readFileSync } from "node:fs";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const arquivo = process.env.ORA_E2E_CONTAS?.trim();
const noAr = Boolean(process.env.ORA_E2E_URL?.trim());

type Conta = { nome: string; email: string; senha: string; onde: string };
function contaDeTeste(nome: string): Conta {
  const linha = readFileSync(arquivo as string, "utf8").split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(" | ")).find(([n]) => n === nome);
  if (!linha || linha.length < 4) throw new Error(`a conta ${nome} não está no arquivo das contas de teste`);
  const [n, email, senha, onde] = linha as [string, string, string, string];
  return { nome: n, email, senha, onde };
}

// O cookie da sessão do Supabase (@supabase/ssr): "base64-" + o JSON da sessão em base64url, às vezes em pedaços (.0, .1).
const PEDACO = 3180;
async function cookiesDaSessao(contexto: BrowserContext) {
  const todos = await contexto.cookies();
  return todos.filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => Number(a.name.split(".").at(-1)) - Number(b.name.split(".").at(-1)));
}
async function sessao(contexto: BrowserContext): Promise<{ access_token: string; expires_at: number } & Record<string, unknown>> {
  const pedacos = await cookiesDaSessao(contexto);
  const valor = pedacos.map((c) => c.value).join("");
  expect(valor.startsWith("base64-"), "o cookie da sessão no formato do @supabase/ssr").toBe(true);
  return JSON.parse(Buffer.from(valor.slice("base64-".length), "base64url").toString("utf8"));
}
/** Faz o acesso vencer no cookie (o expires_at no passado): o servidor tem de renovar com o refresh token. */
async function vencerOAcesso(contexto: BrowserContext) {
  const pedacos = await cookiesDaSessao(contexto);
  const atual = await sessao(contexto);
  const valor = "base64-" + Buffer.from(JSON.stringify({ ...atual, expires_at: Math.floor(Date.now() / 1000) - 60 }), "utf8").toString("base64url");
  const base = pedacos[0];
  if (!base) throw new Error("sem cookie da sessão");
  const nome = base.name.replace(/\.\d+$/, "");
  await contexto.clearCookies({ name: new RegExp(`^${nome.replace(/[-.]/g, "\\$&")}(\\.\\d+)?$`) });
  const partes = valor.length <= PEDACO ? [valor] : Array.from({ length: Math.ceil(valor.length / PEDACO) }, (_, i) => valor.slice(i * PEDACO, (i + 1) * PEDACO));
  await contexto.addCookies(partes.map((v, i) => ({
    name: partes.length === 1 ? nome : `${nome}.${i}`, value: v, domain: base.domain, path: base.path,
    expires: base.expires, httpOnly: base.httpOnly, secure: base.secure, sameSite: base.sameSite,
  })));
}
async function entrar(pagina: Page, conta: Conta) {
  await pagina.goto("/entrar");
  await pagina.getByLabel("E-mail", { exact: true }).fill(conta.email);
  await pagina.getByLabel("Senha", { exact: true }).fill(conta.senha);
  await pagina.getByRole("button", { name: "Entrar na plataforma" }).click();
  // Com uma loja só, o sistema escolhe sozinho e abre o Início; com mais de uma, a pessoa escolhe.
  const inicio = pagina.getByRole("heading", { level: 1, name: `Olá, ${conta.nome}` });
  const loja = pagina.getByRole("button", { name: new RegExp(conta.onde.replace(/[()]/g, "\\$&")) });
  await expect(inicio.or(loja).first()).toBeVisible();
  if (!(await inicio.isVisible())) await loja.click();
  await expect(pagina).toHaveURL(/\/inicio/);
  await expect(inicio).toBeVisible();
}

test.describe("o login de verdade com a conta de teste (J1-a, prova #11)", () => {
  test.skip(!arquivo || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("entra, renova a sessão, sai, a sessão encerrada não volta e a segunda visita entra de novo", async ({ page, context }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    const vendedor = contaDeTeste("Vendedor (teste)");

    await test.step("entra e escolhe a loja", async () => {
      await entrar(page, vendedor);
      await expect(page.getByText(vendedor.onde).first()).toBeVisible();
    });

    await test.step("o acesso vence e o servidor renova a sessão sem pedir a senha", async () => {
      const antes = await sessao(context);
      await vencerOAcesso(context);
      await page.goto("/vender");
      await expect(page).toHaveURL(/\/vender/);
      const depois = await sessao(context);
      expect(depois.access_token, "o servidor trocou o acesso vencido por um novo").not.toBe(antes.access_token);
      expect(depois.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    const cookiesAntigos = await context.cookies();
    await test.step("sai: volta para a entrada, e as telas pedem o login de novo", async () => {
      await page.goto("/sair");
      await expect(page).toHaveURL(/\/entrar/);
      await page.goto("/inicio");
      await expect(page).toHaveURL(/\/entrar/);
    });

    await test.step("a sessão encerrada não volta, nem com os cookies antigos", async () => {
      await context.clearCookies();
      await context.addCookies(cookiesAntigos);
      await page.goto("/inicio");
      await expect(page).toHaveURL(/\/entrar/);
    });

    await test.step("a segunda visita entra de novo e sai", async () => {
      await context.clearCookies();
      await entrar(page, vendedor);
      await page.goto("/sair");
      await expect(page).toHaveURL(/\/entrar/);
    });
  });
});
