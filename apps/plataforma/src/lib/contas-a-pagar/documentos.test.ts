// Regras da tela dos documentos da conta a pagar (lote FIN-004b): a leitura dos formulários, as mensagens do banco e do
// Storage e a leitura da lista quando o banco ainda não tem a tabela. As regras que valem estão no banco
// (packages/banco/src/documentos-da-conta.test.ts).
import { describe, expect, it, vi } from "vitest";

import { erroDoEnvio, erroDosDocumentos, lerDadosDoDocumento, lerDocumentos, lerRetirada } from "./documentos";
import { ERROS_DAS_CONTAS, OK_DAS_CONTAS } from "./regras";

const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });

describe("documentos da conta a pagar (FIN-004b)", () => {
  it("o tipo e a descrição: os quatro tipos, a descrição de 3 a 120 letras e obrigatória no \"Outro documento\"", () => {
    expect(lerDadosDoDocumento("boleto", "")).toEqual({ ok: true, tipo: "boleto", descricao: null });
    expect(lerDadosDoDocumento("nota_fiscal", "  NF  77 ")).toEqual({ ok: true, tipo: "nota_fiscal", descricao: "NF 77" });
    expect(lerDadosDoDocumento("comprovante_pagamento", null)).toEqual({ ok: true, tipo: "comprovante_pagamento", descricao: null });
    expect(lerDadosDoDocumento("outro", "Recibo")).toEqual({ ok: true, tipo: "outro", descricao: "Recibo" });
    for (const [tipo, descricao] of [["outro", ""], ["boleto", "ab"], ["boleto", "x".repeat(121)], ["contrato_linha", ""], [null, ""]]) {
      expect(lerDadosDoDocumento(tipo, descricao), String(tipo)).toEqual({ ok: false });
    }
  });

  it("retirar: o documento e o motivo de 3 a 200 letras", () => {
    const doc = "00000000-0000-4000-9000-0000000000b1";
    expect(lerRetirada(formulario({ documento: doc, motivo: "  Boleto  errado " }))).toEqual({ ok: true, documento: doc, motivo: "Boleto errado" });
    expect(lerRetirada(formulario({ documento: "x", motivo: "Boleto errado" }))).toEqual({ ok: false, erro: "dados" });
    expect(lerRetirada(formulario({ documento: doc, motivo: "ab" }))).toEqual({ ok: false, erro: "documento_motivo" });
    expect(lerRetirada(formulario({ documento: doc, motivo: "y".repeat(201) }))).toEqual({ ok: false, erro: "documento_motivo" });
    expect(lerRetirada(formulario({ documento: doc }))).toEqual({ ok: false, erro: "documento_motivo" });
  });

  it("cada recusa do banco e do Storage tem a sua mensagem; o resto é falha (e toda mensagem existe na tela)", () => {
    const casos: [{ code?: string; message?: string } | null, string][] = [
      [{ code: "P0002", message: "Conta a pagar não encontrada para você" }, "nao_encontrada"],
      [{ code: "P0002", message: "Documento não encontrado" }, "documento_nao_encontrado"],
      [{ code: "P0002", message: "O arquivo não chegou ao Storage" }, "documento_falha"],
      [{ code: "42501", message: "new row violates row-level security policy" }, "documento_permissao"],
      [{ code: "PGRST202" }, "indisponivel"],
      [{ code: "22023", message: "Tipo de documento desconhecido" }, "documento_dados"],
      [{ code: "22023", message: "Descrição do documento: de 3 a 120 letras" }, "documento_dados"],
      [{ code: "22023", message: "Diga que documento é (descrição de 3 a 120 letras)" }, "documento_dados"],
      [{ code: "22023", message: "Esta conta já tem 20 documentos: retire um errado antes" }, "documento_limite"],
      [{ code: "22023", message: "O motivo tem até 200 letras" }, "documento_motivo"],
      [{ code: "22023", message: "O arquivo no Storage não é do formato informado" }, "documento_arquivo"],
      [{ code: "22023", message: "Caminho do documento fora do padrão desta conta" }, "documento_falha"],
      [{ code: "57014" }, "documento_falha"],
      [null, "documento_falha"],
    ];
    for (const [erro, esperado] of casos) expect(erroDosDocumentos(erro), erro?.message ?? erro?.code ?? "nulo").toBe(esperado);
    expect([erroDoEnvio("403"), erroDoEnvio("413"), erroDoEnvio("500"), erroDoEnvio(null)]).toEqual(["documento_permissao", "documento_grande", "documento_falha", "documento_falha"]);
    for (const [, chave] of casos) expect(Object.hasOwn(ERROS_DAS_CONTAS, chave), chave).toBe(true);
    for (const chave of ["documento_guardado", "documento_retirado", "documento_sem_mudanca"]) expect(Object.hasOwn(OK_DAS_CONTAS, chave), chave).toBe(true);
  });

  it("banco sem a tabela (as duas formas do erro): nulo, e a tela segue sem o bloco; lista vazia: nada a ler", async () => {
    for (const code of ["PGRST205", "42P01"]) {
      const consulta = { select: () => consulta, in: () => consulta, order: () => consulta, range: async () => ({ data: null, error: { code } }) };
      const supabase = { from: vi.fn(() => consulta) };
      expect(await lerDocumentos(supabase as never, ["00000000-0000-4000-9000-0000000000e1"]), code).toBeNull();
    }
    const supabase = { from: vi.fn() };
    expect(await lerDocumentos(supabase as never, [])).toEqual({ estado: "ok", dados: new Map() });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
