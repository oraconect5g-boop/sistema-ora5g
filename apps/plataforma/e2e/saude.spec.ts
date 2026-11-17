import { expect, test } from "@playwright/test";

test("responde 200 e informa que o sistema esta no ar", async ({ page }) => {
  const resposta = await page.goto("/saude");

  expect(resposta?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Sistema no ar" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByTestId("conexao-supabase")).toHaveText(/conectado|não configurado neste ambiente|sem resposta/);
});

test("calcula o horario no acesso, nao na construcao do aplicativo", async ({ page }) => {
  const antes = Date.now();
  await page.goto("/saude");
  const verificadoEm = await page.locator("time").getAttribute("datetime");

  expect(verificadoEm).not.toBeNull();
  const instante = Date.parse(verificadoEm as string);
  expect(instante).toBeGreaterThanOrEqual(antes - 1_000);
  expect(instante).toBeLessThanOrEqual(Date.now() + 1_000);
});

test("cabe na largura da tela, sem rolagem lateral", async ({ page }) => {
  await page.goto("/saude");

  const { conteudo, tela } = await page.evaluate(() => ({
    conteudo: document.documentElement.scrollWidth,
    tela: document.documentElement.clientWidth,
  }));
  expect(conteudo).toBeLessThanOrEqual(tela);
});

test("nao revela o framework no cabecalho de resposta", async ({ request }) => {
  const resposta = await request.get("/saude");

  expect(resposta.headers()["x-powered-by"]).toBeUndefined();
});

test("endereco inexistente responde 404", async ({ request }) => {
  const resposta = await request.get("/nao-existe");

  expect(resposta.status()).toBe(404);
});

test("atrás do Apache, os arquivos de índice abrem a página inicial", async ({ request }) => {
  for (const caminho of ["/", "/index.php", "/index.html", "/index.htm", "/default.htm", "/Default.html", "/index.php8"]) {
    const resposta = await request.get(caminho);
    expect(resposta.status(), caminho).toBe(200);
    expect(await resposta.text(), caminho).toContain("Plataforma de gestão integrada");
  }
  expect((await request.get("/index")).status()).toBe(404);
  expect((await request.get("/indice.php")).status()).toBe(404);
});

test("com os cabeçalhos que o Apache envia, a página inicial e a demonstração abrem", async ({ request }) => {
  const doApache = { "X-Forwarded-Host": "ora5g.com.br", "X-Forwarded-Proto": "https", "X-Forwarded-For": "203.0.113.10" };
  for (const caminho of ["/", "/index.php", "/index.html", "/demo", "/entrar", "/saude"]) {
    const resposta = await request.get(caminho, { headers: doApache });
    expect(resposta.status(), caminho).toBe(200);
  }
  const troca = await request.get("/demo/perfil/usar?p=vendedor", { headers: doApache, maxRedirects: 0 });
  expect(troca.status()).toBe(303);
  expect(troca.headers()["location"]).toBe("/demo");
});

test("A01: o topo da página inicial leva quem compra à loja online e a equipe à entrada, separados e sem rolagem para o lado", async ({ page }) => {
  await page.goto("/");
  const topo = page.getByRole("navigation", { name: "Acesso" });
  await expect(topo.getByRole("link", { name: "Comprar" })).toHaveAttribute("href", "/loja");
  await expect(topo.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
