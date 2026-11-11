// Entrada de mercadoria (lote L4a: ORA-INV-009, ORA-INV-004, ORA-CAT-008). Confere o formulário antes de
// chamar o banco, que confere tudo de novo (permissão na loja, IMEI/ICCID válido e único, tipo do item)
// e grava a entrada, o livro e o custo numa transação.
import { iccidValido, imeiValido, lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";

export const TIPOS_DE_ENTRADA = { compra: "Compra de fornecedor", carga_inicial: "Carga inicial (estoque que já está na loja)" } as const;
export type TipoDeEntrada = keyof typeof TIPOS_DE_ENTRADA;
export const CONDICOES = { novo: "Novo", seminovo: "Seminovo", avariado: "Avariado" } as const;
export type Condicao = keyof typeof CONDICOES;

export const ERROS_DA_ENTRADA = {
  dados: "Dados inválidos: confira os campos.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  tipo: "Escolha se é compra ou carga inicial.",
  fornecedor: "Compra precisa de fornecedor ativo (carga inicial não tem fornecedor).",
  documento: "Documento longo demais (até 60 caracteres).",
  linhas: "A entrada precisa ter de 1 a 200 linhas, cada uma com o item escolhido.",
  identificador: "Algum IMEI/ICCID está inválido ou repetido: confira os dígitos.",
  quantidade: "Quantidade inválida (de 1 a 10.000).",
  custo: "Custo inválido: use reais com vírgula (ex.: 1.050,00).",
  muitos: "Até 500 aparelhos e chips por entrada: divida em mais de uma.",
  ja_cadastrado: "Algum IMEI/ICCID já está cadastrado: use a transferência, a devolução ou o ajuste.",
  repetida: "Este formulário já foi enviado com outros dados. Recarregue a tela e tente de novo.",
  loja: "Entrada só em loja física ou depósito ativos.",
  em_uso: "Algum item já foi vendido, reservado ou transferido: o estorno não é possível.",
  sem_saldo: "Não há quantidade livre para estornar (já vendida, reservada ou transferida).",
  nome: "Informe o nome do fornecedor (de 2 a 120 letras).",
  cnpj: "CNPJ do fornecedor inválido ou já usado em outro fornecedor.",
  nome_repetido: "Já existe outro fornecedor com este nome.",
  permissao: "Sem permissão para receber mercadoria nesta loja.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDaEntrada = keyof typeof ERROS_DA_ENTRADA;

export function erroDaEntrada(erro: { code?: string; message?: string } | null | undefined): ErroDaEntrada {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "OR004") return "repetida";
  if (codigo === "OR002") return "em_uso";
  if (codigo === "OR001") return "sem_saldo";
  if (codigo === "23505") return m.includes("cnpj") ? "cnpj" : m.includes("fornecedor") ? "nome_repetido" : "ja_cadastrado";
  if (codigo === "22023") {
    const regras: [string, ErroDaEntrada][] = [
      ["informe o motivo", "motivo"], ["imei", "identificador"], ["iccid", "identificador"], ["fornecedor", "fornecedor"],
      ["tipo de entrada", "tipo"], ["documento", "documento"], ["500", "muitos"], ["quantidade", "quantidade"], ["custo", "custo"],
      ["loja física", "loja"], ["linhas", "linhas"], ["cnpj", "cnpj"], ["nome do fornecedor", "nome"],
    ];
    return regras.find(([t]) => m.includes(t))?.[1] ?? "dados";
  }
  return "falha";
}

export type LinhaDoFormulario = { variante: string; tipo: string; quantidade?: string; identificadores?: string; custo?: string; condicao?: string };
export type LinhaParaOBanco = { variante: string; quantidade?: number; identificadores?: string[]; custo?: number; condicao: Condicao };

/** IMEIs/ICCIDs digitados: um por linha (ou separados por espaço, vírgula ou ponto e vírgula), só dígitos. */
export const separarIdentificadores = (texto: string) =>
  texto.split(/[\s,;]+/).map((x) => x.replace(/\D/g, "")).filter((x) => x.length > 0);

export function validarEntrada(campo: (n: string) => unknown):
  | { ok: true; dados: { unidade: string; tipo: TipoDeEntrada; fornecedor: string | null; documento: string | null; itens: LinhaParaOBanco[]; chave: string; motivo: string } }
  | { ok: false; erro: ErroDaEntrada } {
  const unidade = campo("unidade");
  if (!ehUuid(unidade)) return { ok: false, erro: "dados" };
  const tipo = campo("tipo");
  if (tipo !== "compra" && tipo !== "carga_inicial") return { ok: false, erro: "tipo" };
  const fornecedor = ehUuid(campo("fornecedor")) ? (campo("fornecedor") as string) : null;
  if ((tipo === "compra") !== (fornecedor !== null)) return { ok: false, erro: "fornecedor" };
  const documento = typeof campo("documento") === "string" ? (campo("documento") as string).trim() || null : null;
  if (documento && documento.length > 60) return { ok: false, erro: "documento" };
  const chave = campo("chave");
  if (typeof chave !== "string" || !/^[A-Za-z0-9:-]{8,80}$/.test(chave)) return { ok: false, erro: "dados" };
  const motivo = typeof campo("motivo") === "string" ? (campo("motivo") as string).trim().replace(/\s+/g, " ") : "";
  if (motivo.length < 3 || motivo.length > 200) return { ok: false, erro: "motivo" };

  let linhas: LinhaDoFormulario[];
  try {
    linhas = JSON.parse(String(campo("itens") ?? "[]")) as LinhaDoFormulario[];
  } catch {
    return { ok: false, erro: "dados" };
  }
  if (!Array.isArray(linhas) || linhas.length < 1 || linhas.length > 200) return { ok: false, erro: "linhas" };
  const vistos = new Set<string>();
  let seriais = 0;
  const itens: LinhaParaOBanco[] = [];
  for (const l of linhas) {
    if (!l || typeof l !== "object" || !ehUuid(l.variante) || typeof l.tipo !== "string") return { ok: false, erro: "linhas" };
    const condicao = (l.condicao && Object.hasOwn(CONDICOES, l.condicao) ? l.condicao : "novo") as Condicao;
    let custo: number | undefined;
    if (l.custo && l.custo.trim() !== "") {
      try {
        custo = lerReais(l.custo);
      } catch {
        return { ok: false, erro: "custo" };
      }
      if (custo > 100_000_000) return { ok: false, erro: "custo" };
    }
    if (l.tipo === "aparelho" || l.tipo === "chip") {
      const ids = separarIdentificadores(l.identificadores ?? "");
      if (ids.length === 0) return { ok: false, erro: "identificador" };
      for (const id of ids) {
        const valido = l.tipo === "aparelho" ? imeiValido(id) : iccidValido(id);
        if (!valido || vistos.has(id)) return { ok: false, erro: "identificador" };
        vistos.add(id);
      }
      seriais += ids.length;
      if (seriais > 500) return { ok: false, erro: "muitos" };
      itens.push({ variante: l.variante, identificadores: ids, condicao, ...(custo !== undefined ? { custo } : {}) });
    } else if (l.tipo === "acessorio") {
      const q = (l.quantidade ?? "").trim();
      if (!/^\d{1,5}$/.test(q) || Number(q) < 1 || Number(q) > 10_000) return { ok: false, erro: "quantidade" };
      itens.push({ variante: l.variante, quantidade: Number(q), condicao: "novo", ...(custo !== undefined ? { custo } : {}) });
    } else {
      return { ok: false, erro: "linhas" };
    }
  }
  return { ok: true, dados: { unidade, tipo, fornecedor, documento, itens, chave, motivo } };
}
