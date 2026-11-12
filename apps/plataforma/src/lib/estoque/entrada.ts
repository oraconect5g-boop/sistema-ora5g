// Entrada de mercadoria (lote L4a: ORA-INV-009, ORA-INV-004, ORA-CAT-008). Confere o formulário antes de
// chamar o banco, que confere tudo de novo (permissão na loja, IMEI/ICCID válido e único, tipo do item)
// e grava a entrada, o livro e o custo numa transação.
// Lote R1 (REV-NOV-004, REV-NOV-005): cada recusa do banco tem a própria mensagem (o IMEI/ICCID já está
// nesta loja, em outra, vendido, em transferência, baixado, é de outra variação; produto ou variação
// inativos) e a tela aponta a linha e o identificador recusados.
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
  ja_cadastrado: "Este IMEI/ICCID já está cadastrado e não está livre para entrar de novo: use a transferência, a devolução ou o ajuste.",
  segundo_imei: "Este número é o segundo IMEI de um aparelho já cadastrado: informe o IMEI principal do aparelho.",
  no_estoque: "Este IMEI/ICCID já está no estoque desta loja: não precisa de entrada nova.",
  em_outra_loja: "Este IMEI/ICCID já está no estoque de outra loja: use a transferência, não uma entrada nova.",
  vendido: "Este IMEI/ICCID já foi vendido: a volta ao estoque é pela devolução da venda.",
  em_transferencia: "Este IMEI/ICCID está em transferência: conclua o recebimento da transferência.",
  baixado: "Este IMEI/ICCID foi baixado por ajuste ou perda: a entrada não desfaz essa baixa.",
  outra_variacao: "Este IMEI/ICCID já tem histórico (ou está numa contagem aberta) em outra variação: receba na variação original.",
  produto_inativo: "O produto desta linha está inativo no catálogo: reative o produto antes de receber.",
  variacao_inativa: "A variação desta linha está inativa (ou é de outra rede): reative a variação no catálogo ou escolha outra.",
  concorrencia: "O catálogo ou o estoque estava sendo alterado ao mesmo tempo. Nada foi gravado: envie de novo.",
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
  // Deadlock ou conflito de serialização: outra operação (catálogo, importação) mexia nos mesmos itens.
  if (codigo === "40P01" || codigo === "40001") return "concorrencia";
  if (codigo === "23505") {
    // O banco diz onde a identidade está; a ordem importa ("segundo imei" antes das demais). O SKU da
    // variação original vem no fim do texto ("(SKU CNPJ-01)") e não pode escolher a regra: sai antes.
    const semSku = m.replace(/\(sku [^()]{1,60}\)/, "");
    const posicoes: [string, ErroDaEntrada][] = [
      ["cnpj", "cnpj"], ["segundo imei", "segundo_imei"], ["no estoque desta loja", "no_estoque"], ["no estoque de outra loja", "em_outra_loja"],
      ["já foi vendido", "vendido"], ["está em transferência", "em_transferencia"], ["foi baixado", "baixado"], ["outra variação", "outra_variacao"],
      ["já cadastrado", "ja_cadastrado"], ["fornecedor", "nome_repetido"],
    ];
    return posicoes.find(([t]) => semSku.includes(t))?.[1] ?? "ja_cadastrado";
  }
  if (codigo === "22023") {
    // O SKU da linha vem no texto ("Linha 2 (IMEI-500): ...") e não pode escolher a regra: sai antes de procurar.
    const semSku = m.replace(/^linha (\d{1,3}) \([^()]{1,60}\):/, "linha $1:");
    // A ordem importa: as recusas do cadastro de fornecedor (nome, CNPJ, contato) antes de "fornecedor",
    // que é a recusa da entrada (compra sem fornecedor ativo, carga inicial com fornecedor).
    const regras: [string, ErroDaEntrada][] = [
      ["informe o motivo", "motivo"], ["produto está inativo", "produto_inativo"], ["variação inativa", "variacao_inativa"],
      ["imei", "identificador"], ["iccid", "identificador"],
      ["nome do fornecedor", "nome"], ["cnpj", "cnpj"], ["contato do fornecedor", "dados"], ["fornecedor", "fornecedor"],
      ["tipo de entrada", "tipo"], ["documento", "documento"], ["500", "muitos"], ["quantidade", "quantidade"], ["custo", "custo"],
      ["loja física", "loja"], ["linhas", "linhas"],
    ];
    return regras.find(([t]) => semSku.includes(t))?.[1] ?? "dados";
  }
  return "falha";
}

/**
 * O que o banco disse de específico na recusa: a linha do formulário, o IMEI/ICCID e o SKU (da linha ou,
 * quando a identidade é de outra variação, o da variação original). Vai no endereço para a tela apontar
 * onde corrigir; a tela confere o formato de novo antes de mostrar.
 */
export function detalheDoErro(erro: { message?: string } | null | undefined): { linha?: string; id?: string; sku?: string } {
  const m = erro?.message ?? "";
  const linha = /\blinha (\d{1,3})\b/i.exec(m)?.[1];
  const id = /(?:IMEI\/ICCID|IMEI|ICCID)(?: inválido:)? (\d{1,22})(?!\d)/.exec(m)?.[1];
  const sku = (/\(SKU ([^()]{1,60})\)/.exec(m) ?? /\blinha \d{1,3} \(([^()]{1,60})\):/i.exec(m))?.[1];
  return { ...(linha ? { linha } : {}), ...(id ? { id } : {}), ...(sku ? { sku } : {}) };
}

/** Os mesmos três campos, vindos do endereço: só passam no formato esperado (o resto some, sem erro). */
export function detalheDoEndereco(valores: { linha?: string | undefined; id?: string | undefined; sku?: string | undefined }) {
  return {
    linha: valores.linha && /^[1-9]\d{0,2}$/.test(valores.linha) ? valores.linha : null,
    id: valores.id && /^\d{1,22}$/.test(valores.id) ? valores.id : null,
    sku: valores.sku && valores.sku.length <= 60 && /^[\p{L}\p{N}._/+#-]+(?: [\p{L}\p{N}._/+#-]+)*$/u.test(valores.sku) ? valores.sku : null,
  };
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
