// Lote INTEG-d (a orientação do proprietário de 18/11, seção 4; a reanálise do Codex de 18/11): a matriz das APIs, uma
// linha por integração. O teste confere a forma da matriz, não o fornecedor: cada linha com todas as colunas pedidas, a
// situação entre as sete da orientação, cada variável só pelo nome e existente no .env.example, nenhum valor parecido com
// uma chave, e o texto de leitura (MATRIZ_DAS_APIS.md) com cada API da fonte.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ler = (caminho: string) => readFileSync(fileURLToPath(new URL(`../../../${caminho}`, import.meta.url)), "utf8");
type Api = Record<string, unknown> & { id: string; api: string; situacao: string; variaveis: string[] };
const matriz = JSON.parse(ler("docs/integracoes/MATRIZ_DAS_APIS.json")) as { situacoes: string[]; campos: string[]; apis: Api[] };
const exemplo = ler(".env.example");
const leitura = ler("docs/integracoes/MATRIZ_DAS_APIS.md");

const COLUNAS_DA_ORIENTACAO = [
  "documentacao", "operacoes", "implementado", "falta_codigo", "falta_acesso", "variaveis", "ambiente_de_teste", "autenticacao",
  "limites", "idempotencia", "aviso_ou_reconsulta", "conciliacao", "testes", "publicacao", "homologacao",
];

describe("a matriz das APIs (INTEG-d)", () => {
  it("tem as quinze colunas da orientação e as sete situações, nessa ordem", () => {
    expect(matriz.campos).toEqual(COLUNAS_DA_ORIENTACAO);
    expect(matriz.situacoes).toEqual(["não iniciado", "parcial", "código testado", "configuração pendente", "publicado", "homologado", "bloqueio externo"]);
  });

  it("cada API tem todas as colunas preenchidas, quem fornece o que falta e o que pode andar sem isso", () => {
    const ids = new Set<string>();
    for (const a of matriz.apis) {
      expect(ids.has(a.id), `id repetido: ${a.id}`).toBe(false);
      ids.add(a.id);
      expect(matriz.situacoes, a.id).toContain(a.situacao);
      for (const campo of [...COLUNAS_DA_ORIENTACAO.filter((c) => c !== "variaveis"), "api", "requisitos", "quem_fornece", "pode_prosseguir"]) {
        expect(typeof a[campo] === "string" && (a[campo] as string).trim().length > 0, `${a.id}.${campo}`).toBe(true);
      }
      expect(Array.isArray(a.variaveis), `${a.id}.variaveis`).toBe(true);
    }
    // As integrações que a orientação cita nominalmente estão na matriz.
    for (const id of ["nogle", "fiscal", "whatsapp", "payjoy", "aiva", "qitech", "j7", "pagamento_online", "mercadolivre", "tiktokshop", "shopee", "meta_ads", "meta_conversoes", "meta_comercio"]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("cada variável aparece só pelo nome e existe no .env.example; nenhum texto parece uma chave", () => {
    for (const a of matriz.apis) {
      for (const nome of a.variaveis) {
        expect(nome, a.id).toMatch(/^[A-Z][A-Z0-9_]+$/);
        expect(exemplo, `${a.id}: ${nome} fora do .env.example`).toMatch(new RegExp(`^${nome}=`, "m"));
      }
      expect(JSON.stringify(a), a.id).not.toMatch(/[A-Za-z0-9]{28,}/);
    }
  });

  it("a leitura tem cada API da fonte, com a situação no resumo", () => {
    for (const a of matriz.apis) {
      expect(leitura, a.id).toContain(`### ${a.api}`);
      expect(leitura, a.id).toContain(`| **${a.api}** | ${a.situacao} |`);
    }
  });
});
