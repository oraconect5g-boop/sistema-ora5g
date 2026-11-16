import { expect, test, type Page } from "@playwright/test";

const supabaseConfigurado = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

test("a página de entrada abre e oferece a demonstração", async ({ page }) => {
  const resposta = await page.goto("/entrar");
  expect(resposta?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Bem-vindo à Ora" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver a demonstração" })).toBeVisible();
});

test("a conta exige login", async ({ page }) => {
  await page.goto("/conta");
  await expect(page).toHaveURL(/\/entrar/);
});

// REV-017 / #16: o código de erro vem do endereço. Nome herdado de todo objeto JavaScript dava
// HTTP 500 (o React recebia uma função para exibir). Agora: página normal e nenhum aviso a mais.
test.describe("REV-017 (#16): código de erro estranho no endereço", () => {
  const avisos = (page: Page) => page.getByRole("note");

  async function avisosSemErro(page: Page) {
    await page.goto("/entrar");
    return avisos(page).count();
  }

  for (const consulta of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "desconhecido", "credenciais&erro=dados"]) {
    test(`erro=${consulta} abre a entrada sem aviso`, async ({ page }) => {
      const base = await avisosSemErro(page);
      const resposta = await page.goto(`/entrar?erro=${consulta}`);
      expect(resposta?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Bem-vindo à Ora" })).toBeVisible();
      await expect(avisos(page)).toHaveCount(base);
      await expect(page.getByText(/E-mail ou senha incorretos|Preencha e-mail e senha/)).toHaveCount(0);
    });
  }

  for (const [codigo, mensagem] of [
    ["credenciais", "E-mail ou senha incorretos."],
    ["dados", "Preencha e-mail e senha."],
    ["configuracao", "O login ainda não está configurado neste ambiente."],
  ] as const) {
    test(`erro=${codigo} continua mostrando a mensagem neutra`, async ({ page }) => {
      const base = await avisosSemErro(page);
      const resposta = await page.goto(`/entrar?erro=${codigo}`);
      expect(resposta?.status()).toBe(200);
      await expect(avisos(page)).toHaveCount(base + 1);
      await expect(avisos(page).filter({ hasText: mensagem }).first()).toBeVisible();
    });
  }
});

test("login real recusa credenciais erradas com mensagem neutra", async ({ page }) => {
  test.skip(!supabaseConfigurado, "Supabase não configurado neste ambiente");
  test.skip(test.info().project.name !== "computador", "basta uma tentativa por execução");
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill("ninguem@teste.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-de-teste");
  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
});

test("o botão de ver a senha mostra e esconde o que foi digitado", async ({ page }) => {
  test.skip(!supabaseConfigurado, "o formulário só aparece com o login configurado");
  await page.goto("/entrar");
  const senha = page.getByLabel("Senha", { exact: true });
  await senha.fill("abc123");
  await expect(senha).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar a senha" }).click();
  await expect(senha).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar a senha" }).click();
  await expect(senha).toHaveAttribute("type", "password");
});

// VEL-a (ORA-QUAL-010, ORA-POS-002): retorno imediato no botão de envio, no navegador de verdade. O formulário de
// entrada é o único de ação que abre sem login; os botões das outras telas usam o mesmo componente (BotaoDeEnvio),
// e o teste retorno-imediato.test.ts confere que nenhum formulário ficou de fora.
test("o botão de entrar trava e avisa enquanto o pedido está no servidor", async ({ page }) => {
  test.skip(!supabaseConfigurado, "o formulário só aparece com o login configurado");
  await page.goto("/entrar");
  const senha = page.getByLabel("Senha", { exact: true });
  // a página já responde a toque (o estado do envio só existe depois disso)
  await page.getByRole("button", { name: "Mostrar a senha" }).click();
  await expect(senha).toHaveAttribute("type", "text");
  // Campos vazios: o servidor recusa sem consultar o Supabase, então nenhuma tentativa de login é contada.
  // O navegador não deixaria enviar vazio; aqui a trava dele sai para o pedido chegar ao servidor.
  await page.locator("form input[required]").evaluateAll((campos) => campos.forEach((campo) => campo.removeAttribute("required")));

  // segura o pedido no caminho, para a espera durar o bastante para ser conferida
  let soltar = () => {};
  const segurado = new Promise<void>((resolver) => { soltar = resolver; });
  await page.route("**/entrar", async (rota) => {
    if (rota.request().method() !== "POST") return rota.fallback();
    await segurado;
    await rota.continue();
  });

  await page.getByRole("button", { name: "Entrar na plataforma" }).click();
  const esperando = page.getByRole("button", { name: "Entrando…" });
  await expect(esperando).toBeDisabled();
  await expect(esperando).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("button", { name: "Entrar na plataforma" })).toHaveCount(0);

  soltar();
  await expect(page.getByText("Preencha e-mail e senha.")).toBeVisible();
  const deVolta = page.getByRole("button", { name: "Entrar na plataforma" });
  await expect(deVolta).toBeEnabled();
  await expect(deVolta).toHaveAttribute("aria-busy", "false");
});

test("endereço que não existe mostra a página 404 em português", async ({ page }) => {
  const resposta = await page.goto("/nao-existe-esta-pagina");
  expect(resposta?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});
