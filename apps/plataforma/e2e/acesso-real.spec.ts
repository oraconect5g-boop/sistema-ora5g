import { expect, test } from "@playwright/test";

// Sistema real (ORA-006): sem login, nenhuma página real abre; saída forçada só mostra motivos
// conhecidos. Roda com ou sem a configuração pública do Supabase no ambiente de teste.
// Telas reais e exportações: sem login, nenhuma abre (nem o esqueleto de carregamento).
const PROTEGIDAS = ["/inicio", "/escolher-loja", "/equipe", "/catalogo", "/catalogo/lote", "/vender", "/caixa", "/aprovacoes", "/estoque", "/transferencias", "/connect", "/notas", "/notas/conciliacao", "/vendas", "/auditoria", "/financeiro", "/financeiro/exportar", "/relatorios", "/relatorios/exportar", "/metas", "/metas/bonus", "/metas/extrato", "/metas/fechamento", "/lojas", "/produtos", "/produtos/precos", "/produtos/importar", "/estoque/entrada", "/estoque/pedidos", "/estoque/inventario", "/clientes", "/clientes/novo", "/clientes/00000000-0000-4000-8000-000000000001", "/clientes/00000000-0000-4000-8000-000000000001/titular", "/reservas-do-site", "/crm", "/crm/agenda", "/crm/00000000-0000-4000-8000-000000000001", "/pagamentos/conciliacao", "/pagamentos/recebiveis", "/assistencia", "/assistencia/nova", "/assistencia/relatorios", "/pagamentos/financeiras", "/pagamentos/maquininhas", "/contas-a-pagar", "/contas-a-pagar/00000000-0000-4000-8000-000000000001/documentos/00000000-0000-4000-8000-000000000002", "/resultado", "/previsao", "/vendas/00000000-0000-4000-8000-000000000001", "/conta/senha", "/conta/seguranca", "/conta/confirmar", "/entrar/codigo", "/api/pendencias", "/operacao", "/entregas"];

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
