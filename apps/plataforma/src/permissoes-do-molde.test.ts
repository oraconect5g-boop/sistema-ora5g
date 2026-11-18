// VEL-b (18/11/2026; ADR-010, "O que vem depois"): as telas, as rotas e as ações leem do molde da sessão as permissões
// da loja do turno e da rede (`permite(sessao, "...")`, em lib/acesso/molde.ts): o banco as respondeu na mesma ida que
// decide a sessão. Perguntar ao banco uma a uma (rpc "tem_permissao") fica só onde a pergunta é sobre OUTRA loja, cuja
// resposta pode ser outra. Por que a loja do turno e a rede dão a mesma resposta: packages/banco/src/
// sessao-molde-e-pdv.test.ts, "na loja do turno e sem loja".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = new URL(".", import.meta.url).pathname;
const arquivos = (pasta: string): string[] =>
  readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return nome === "node_modules" ? [] : arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });

/** Os únicos lugares que perguntam ao banco, e sobre que loja. */
const SOBRE_OUTRA_LOJA = new Map([
  ["app/vendas/[id]/page.tsx", "venda.data.unidade_id"],
  ["app/estoque/inventario/[id]/page.tsx", "inv.unidade_id"],
]);

describe("as permissões vêm do molde da sessão (VEL-b)", () => {
  const perguntas = arquivos(RAIZ).flatMap((caminho) => {
    const texto = readFileSync(caminho, "utf8");
    return [...texto.matchAll(/rpc\("tem_permissao", \{ p_permissao: "[a-z_.]+"(?:, p_unidade: ([^}]+?))? \}\)/g)]
      .map((m) => ({ arquivo: relative(RAIZ, caminho), unidade: m[1]?.trim() ?? null }));
  });

  it("só as perguntas sobre outra loja vão ao banco: a da venda e a do inventário", () => {
    expect([...new Set(perguntas.map((p) => p.arquivo))].sort()).toEqual([...SOBRE_OUTRA_LOJA.keys()].sort());
    for (const p of perguntas) expect(p.unidade, p.arquivo).toBe(SOBRE_OUTRA_LOJA.get(p.arquivo));
  });

  it("nenhum arquivo pergunta a permissão por outro caminho (lista montada, nome numa variável)", () => {
    const outros = arquivos(RAIZ).filter((caminho) => {
      const texto = readFileSync(caminho, "utf8");
      const todas = (texto.match(/rpc\("tem_permissao"/g) ?? []).length;
      const vistas = (texto.match(/rpc\("tem_permissao", \{ p_permissao: "[a-z_.]+"(?:, p_unidade: [^}]+?)? \}\)/g) ?? []).length;
      return todas !== vistas;
    });
    expect(outros.map((c) => relative(RAIZ, c))).toEqual([]);
  });
});
