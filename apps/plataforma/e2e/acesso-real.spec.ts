import { expect, test } from "@playwright/test";

// Sistema real (ORA-006): sem login, nenhuma página real abre; saída forçada só mostra motivos
// conhecidos. Roda com ou sem a configuração pública do Supabase no ambiente de teste.
// Telas reais e exportações: sem login, nenhuma abre (nem o esqueleto de carregamento).
const PROTEGIDAS = ["/inicio", "/escolher-loja", "/equipe", "/catalogo", "/catalogo/lote", "/vender", "/caixa", "/aprovacoes", "/estoque", "/transferencias", "/transferencias/remessa", "/connect", "/notas", "/notas/conciliacao", "/vendas", "/auditoria", "/financeiro", "/financeiro/exportar", "/relatorios", "/relatorios/exportar", "/metas", "/metas/bonus", "/metas/extrato", "/metas/fechamento", "/lojas", "/produtos", "/produtos/precos", "/produtos/importar", "/estoque/entrada", "/estoque/pedidos", "/estoque/inventario", "/clientes", "/clientes/novo", "/clientes/00000000-0000-4000-8000-000000000001", "/clientes/00000000-0000-4000-8000-000000000001/titular", "/reservas-do-site", "/crm", "/crm/agenda", "/crm/00000000-0000-4000-8000-000000000001", "/pagamentos/conciliacao", "/pagamentos/recebiveis", "/pagamentos/extratos", "/pagamentos/extratos/importar", "/pagamentos/extratos/00000000-0000-4000-8000-000000000001", "/relatorios/anuncios", "/relatorios/marketplaces", "/relatorios/canais", "/assistencia", "/assistencia/nova", "/assistencia/relatorios", "/pagamentos/financeiras", "/pagamentos/maquininhas", "/contas-a-pagar", "/contas-a-pagar/00000000-0000-4000-8000-000000000001/documentos/00000000-0000-4000-8000-000000000002", "/resultado", "/previsao", "/vendas/00000000-0000-4000-8000-000000000001", "/conta/senha", "/conta/seguranca", "/conta/confirmar", "/entrar/codigo", "/api/pendencias", "/operacao", "/entregas", "/pagamentos/contas-bancarias", "/relatorios/marketplaces/repasses"];

for (const caminho of PROTEGIDAS) {
  test(`${caminho} sem login volta para /entrar`, async ({ page }) => {
    await page.goto(caminho);
    await expect(page).toHaveURL(/\/entrar(\?|$)/);
    await expect(page.getByRole("heading", { name: "Bem-vindo à Ora" })).toBeVisible();
  });
}

// O servidor responde com o redirecionamento (307) antes de qualquer conteúdo. Em 10/11 o /financeiro
// mandava primeiro o esqueleto de carregamento (200) e só depois o redirecionamento embutido: nenhum
// número vazava, mas a tela ficava diferente das outras (a sessão passou a ser conferida no layout).
test("sem login, o servidor redireciona (307) antes de mandar qualquer tela", async ({ request }) => {
  for (const caminho of PROTEGIDAS) {
    const resposta = await request.get(caminho, { maxRedirects: 0 });
    expect(resposta.status(), caminho).toBe(307);
    expect(resposta.headers()["location"] ?? "", caminho).toMatch(/\/entrar/);
  }
});

// EXT-a: o envio do extrato por arquivo, sem login, volta para /entrar antes de ler o arquivo (nada chega ao banco).
test("o envio do extrato sem login volta para /entrar", async ({ request }) => {
  const resposta = await request.post("/pagamentos/extratos/enviar", {
    multipart: { onde: "loja", tipo: "maquininha", fonte: "Teste", meios: "pix_picpay", arquivo: { name: "extrato.csv", mimeType: "text/csv", buffer: Buffer.from("Data;Valor\n17/11/2026;1,00\n") } },
    maxRedirects: 0,
  });
  expect([303, 307]).toContain(resposta.status());
  expect(resposta.headers()["location"] ?? "").toMatch(/\/entrar/);
});

// META-a: o envio do custo dos anúncios, sem login, também volta para /entrar antes de ler o arquivo.
test("o envio do custo dos anúncios sem login volta para /entrar", async ({ request }) => {
  const resposta = await request.post("/relatorios/anuncios/enviar", {
    multipart: { coluna_dia: "0", coluna_campanha: "1", coluna_gasto: "2", arquivo: { name: "anuncios.csv", mimeType: "text/csv", buffer: Buffer.from("Dia;Campanha;Valor usado\n2026-11-17;Teste;1,00\n") } },
    maxRedirects: 0,
  });
  expect([303, 307]).toContain(resposta.status());
  expect(resposta.headers()["location"] ?? "").toMatch(/\/entrar/);
});

// MKTPL-a: o envio dos pedidos de um marketplace, sem login, também volta para /entrar antes de ler o arquivo.
test("o envio dos pedidos dos marketplaces sem login volta para /entrar", async ({ request }) => {
  const resposta = await request.post("/relatorios/marketplaces/enviar", {
    multipart: { canal: "mercado_livre", modo: "em_cada_linha", coluna_pedido: "0", coluna_data: "1", coluna_valor: "2", arquivo: { name: "vendas.csv", mimeType: "text/csv", buffer: Buffer.from("Pedido;Data;Valor\nA1;2026-11-17;1,00\n") } },
    maxRedirects: 0,
  });
  expect([303, 307]).toContain(resposta.status());
  expect(resposta.headers()["location"] ?? "").toMatch(/\/entrar/);
});

test("saída forçada mostra só motivo conhecido", async ({ page }) => {
  await page.goto("/sair?motivo=turno");
  await expect(page).toHaveURL(/\/entrar\?erro=turno$/);
  await expect(page.getByText("Seu turno terminou. Entre de novo para continuar.")).toBeVisible();
  await page.goto("/sair?motivo=__proto__");
  await expect(page).toHaveURL(/\/entrar$/);
  // Nenhum aviso do catálogo de erros (o aviso de "login não configurado" pode existir no CI).
  await expect(page.getByText(/turno terminou|acesso está bloqueado|link venceu|incorretos/)).toHaveCount(0);
});

test("link de acesso inválido ou sem configuração volta ao login com aviso", async ({ page }) => {
  await page.goto("/auth/confirmar?token_hash=invalido&type=recovery");
  await expect(page).toHaveURL(/\/entrar\?erro=(link|configuracao)$/);
});

test("recuperar a senha existe e não revela nada sem configuração", async ({ page }) => {
  await page.goto("/entrar/recuperar");
  await expect(page.getByRole("heading", { name: "Recuperar a senha" })).toBeVisible();
});
