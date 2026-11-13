// Contas a pagar da empresa (lote L8a: ORA-FIN-004; decisões do proprietário de 13/11/2026: o dono em todas
// e o gerente na loja dele; categorias com a lista inicial que o dono ajusta; parcelas e repetição mensal).
// Regras da tela: os nomes, o selo do vencimento, a leitura dos formulários e as mensagens. A regra está
// no banco (packages/banco/src/contas-a-pagar.test.ts); aqui só se evita ir até ele com o que já se sabe errado.
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";

export const FORMAS = {
  unica: { nome: "Uma vez", explicacao: "Uma conta só, com o valor e o vencimento informados." },
  parcelada: { nome: "Parcelada", explicacao: "O valor é o TOTAL, dividido nas parcelas, uma por mês a partir do vencimento." },
  mensal: { nome: "Repete todo mês", explicacao: "O valor é o de CADA mês (como o aluguel), repetido pelos meses informados." },
} as const;
export type Forma = keyof typeof FORMAS;
export const ehForma = (v: unknown): v is Forma => typeof v === "string" && Object.hasOwn(FORMAS, v);

export const SITUACOES_DA_CONTA = { aberta: "em aberto", paga: "paga", cancelada: "cancelada" } as const;
export type SituacaoDaConta = keyof typeof SITUACOES_DA_CONTA;
export const ehSituacaoDaConta = (v: unknown): v is SituacaoDaConta => typeof v === "string" && Object.hasOwn(SITUACOES_DA_CONTA, v);

/** As três listas da tela; as pagas e as canceladas são as dos últimos 60 dias. */
export const VISOES_DAS_CONTAS = { abertas: "Em aberto", pagas: "Pagas (60 dias)", canceladas: "Canceladas (60 dias)" } as const;
export type VisaoDasContas = keyof typeof VISOES_DAS_CONTAS;
export const visaoDasContas = (v: unknown): VisaoDasContas => (v === "pagas" || v === "canceladas" ? v : "abertas");

const DIA = /^\d{4}-\d{2}-\d{2}$/;
export const ehDia = (v: string) => DIA.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
/** "13/11/2026" de "2026-11-13". */
export const dataDoDia = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
/** O dia de hoje em São Paulo, "2026-11-13". */
export const hojeEmSaoPaulo = (agora: Date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

/** Selo do prazo de uma conta em aberto. */
export function prazoDaConta(vencimento: string, hoje: string): { rotulo: string; tom: "perigo" | "aviso" | "info" | "neutro" } {
  const dias = diasEntre(hoje, vencimento);
  if (dias < 0) return { rotulo: dias === -1 ? "venceu ontem" : `vencida há ${-dias} dias`, tom: "perigo" };
  if (dias === 0) return { rotulo: "vence hoje", tom: "aviso" };
  if (dias <= 7) return { rotulo: dias === 1 ? "vence amanhã" : `vence em ${dias} dias`, tom: "info" };
  return { rotulo: `vence em ${dias} dias`, tom: "neutro" };
}

/** "parcela 2 de 3" ou "mês 2 de 12"; nada na conta única. */
export function parcelaDaConta(forma: Forma, parcela: number, parcelas: number): string | null {
  if (forma === "unica") return null;
  return `${forma === "parcelada" ? "parcela" : "mês"} ${parcela} de ${parcelas}`;
}

export const OK_DAS_CONTAS = {
  lancada: "Conta lançada.",
  lancadas: "Contas lançadas: cada parcela (ou mês) já está na lista, com o seu vencimento.",
  paga: "Pagamento registrado.",
  desfeito: "Pagamento desfeito; o motivo ficou na auditoria.",
  cancelada: "Conta cancelada; o motivo ficou na auditoria.",
  canceladas: "Contas canceladas: esta e as seguintes do mesmo lançamento.",
  corrigida: "Conta corrigida; o motivo ficou na auditoria.",
  categoria: "Categoria salva.",
  sem_mudanca: "Nada mudou: os dados já eram esses.",
} as const;
export type OkDasContas = keyof typeof OK_DAS_CONTAS;

export const ERROS_DAS_CONTAS = {
  dados: "Confira os dados digitados.",
  loja: "Escolha onde a conta fica: a rede ou uma loja.",
  descricao: "Descreva a conta (de 3 a 120 letras).",
  documento: "O documento tem até 60 letras.",
  valor: "Valor inválido: em reais com vírgula, maior que zero.",
  vencimento: "O vencimento vai de um ano atrás até cinco anos à frente.",
  vezes: "Parcelas ou meses: de 2 a 36.",
  parcelas_pequenas: "Valor pequeno demais para tantas parcelas.",
  categoria: "Escolha uma categoria ativa.",
  fornecedor: "Fornecedor inválido ou inativo.",
  referencia: "Informe a referência do pagamento (de 3 a 80 letras): comprovante, autenticação ou linha do extrato.",
  valor_pago: "O valor pago vai de R$ 0,01 até o dobro do valor da conta.",
  data_pagamento: "A data do pagamento vai de um ano atrás até hoje.",
  ja_paga: "Pagamento já registrado: desfaça antes de mudar.",
  paga: "Conta paga: desfaça o pagamento antes de cancelar.",
  cancelada: "Conta cancelada: não há o que pagar.",
  so_aberta: "Só a conta em aberto pode ser corrigida.",
  motivo: "Informe o motivo (de 3 a 300 letras); ele fica na auditoria.",
  categoria_nome: "O nome da categoria tem de 2 a 60 letras.",
  categoria_repetida: "Já existe uma categoria com esse nome.",
  so_dono: "Só o dono ajusta as categorias das contas a pagar.",
  permissao: "Sem permissão para lançar contas a pagar aqui.",
  nao_encontrada: "Conta não encontrada (ou não é sua para gerir).",
  indisponivel: "As contas a pagar ainda não estão disponíveis neste ambiente.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDasContas = keyof typeof ERROS_DAS_CONTAS;

/** Do erro do banco para a mensagem. O que não se reconhece é falha; a mensagem do banco não vai para a tela. */
export function erroDasContas(erro: { code?: string; message?: string } | null | undefined): ErroDasContas {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "P0002") return m.includes("categoria") ? "so_dono" : "nao_encontrada";
  if (codigo === "42501") return m.includes("dono") ? "so_dono" : "permissao";
  if (codigo === "OR030") return "ja_paga";
  if (codigo === "OR004") return "dados";
  if (codigo === "PGRST202" || codigo === "42883") return "indisponivel";
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDasContas][] = [
    ["loja inválida", "loja"], ["descreva a conta", "descricao"], ["documento", "documento"], ["vencimento", "vencimento"],
    ["parcelas ou meses", "vezes"], ["pequeno demais", "parcelas_pequenas"], ["categoria ativa", "categoria"], ["fornecedor", "fornecedor"],
    ["referência do pagamento", "referencia"], ["valor pago", "valor_pago"], ["data do pagamento", "data_pagamento"],
    ["desfaça o pagamento", "paga"], ["conta cancelada", "cancelada"], ["só a conta em aberto", "so_aberta"], ["motivo", "motivo"],
    ["nome da categoria", "categoria_nome"], ["já existe uma categoria", "categoria_repetida"], ["valor inválido", "valor"],
  ];
  return regras.find(([trecho]) => m.includes(trecho))?.[1] ?? "dados";
}

// ---------------------------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------------------------
type Formulario = { get: (nome: string) => unknown };
const textoDo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const motivoValido = (m: string) => m.length >= 3 && m.length <= 300;
function reais(v: unknown): number | null {
  try {
    const centavos = lerReais(textoDo(v));
    return Number.isSafeInteger(centavos) && centavos > 0 ? centavos : null;
  } catch {
    return null;
  }
}
type Resultado<T> = ({ ok: true } & T) | { ok: false; erro: ErroDasContas };

export type Lancamento = {
  /** null: a conta é da rede (central). */
  unidade: string | null;
  categoria: string; fornecedor: string | null; descricao: string; documento: string | null;
  valor: number; vencimento: string; forma: Forma; vezes: number;
};

/** O lançamento: onde (a rede ou uma loja), categoria, descrição, valor, vencimento e a forma (uma vez, parcelada ou mensal). */
export function lerLancamento(dados: Formulario): Resultado<{ lancamento: Lancamento }> {
  const onde = textoDo(dados.get("unidade"));
  if (onde !== "rede" && !ehUuid(onde)) return { ok: false, erro: "loja" };
  const categoria = textoDo(dados.get("categoria"));
  if (!ehUuid(categoria)) return { ok: false, erro: "categoria" };
  const fornecedorTexto = textoDo(dados.get("fornecedor"));
  if (fornecedorTexto !== "" && !ehUuid(fornecedorTexto)) return { ok: false, erro: "fornecedor" };
  const descricao = textoDo(dados.get("descricao"));
  if (descricao.length < 3 || descricao.length > 120) return { ok: false, erro: "descricao" };
  const documento = textoDo(dados.get("documento"));
  if (documento.length > 60) return { ok: false, erro: "documento" };
  const valor = reais(dados.get("valor"));
  if (valor === null) return { ok: false, erro: "valor" };
  const vencimento = textoDo(dados.get("vencimento"));
  if (!ehDia(vencimento)) return { ok: false, erro: "vencimento" };
  const forma = textoDo(dados.get("forma")) || "unica";
  if (!ehForma(forma)) return { ok: false, erro: "dados" };
  let vezes = 1;
  if (forma !== "unica") {
    vezes = Number(textoDo(dados.get("vezes")));
    if (!Number.isInteger(vezes) || vezes < 2 || vezes > 36) return { ok: false, erro: "vezes" };
    if (forma === "parcelada" && valor < vezes) return { ok: false, erro: "parcelas_pequenas" };
  }
  return {
    ok: true,
    lancamento: { unidade: onde === "rede" ? null : onde, categoria, fornecedor: fornecedorTexto || null, descricao, documento: documento || null, valor, vencimento, forma, vezes },
  };
}

/** O pagamento feito fora: a data, o valor pago (com juros ou desconto) e a referência. */
export function lerPagamento(dados: Formulario): Resultado<{ conta: string; pagoEm: string; valorPago: number; referencia: string }> {
  const conta = textoDo(dados.get("conta"));
  if (!ehUuid(conta)) return { ok: false, erro: "dados" };
  const pagoEm = textoDo(dados.get("pago_em"));
  if (!ehDia(pagoEm)) return { ok: false, erro: "data_pagamento" };
  const valorPago = reais(dados.get("valor_pago"));
  if (valorPago === null) return { ok: false, erro: "valor_pago" };
  const referencia = textoDo(dados.get("referencia"));
  if (referencia.length < 3 || referencia.length > 80) return { ok: false, erro: "referencia" };
  return { ok: true, conta, pagoEm, valorPago, referencia };
}

/** Desfazer o pagamento ou cancelar a conta: a conta e o motivo (cancelar pode levar as seguintes). */
export function lerMotivo(dados: Formulario): Resultado<{ conta: string; motivo: string; seguintes: boolean }> {
  const conta = textoDo(dados.get("conta"));
  if (!ehUuid(conta)) return { ok: false, erro: "dados" };
  const motivo = textoDo(dados.get("motivo"));
  if (!motivoValido(motivo)) return { ok: false, erro: "motivo" };
  return { ok: true, conta, motivo, seguintes: dados.get("seguintes") === "sim" };
}

/** Corrigir a conta aberta: o valor e o vencimento, com motivo. */
export function lerCorrecao(dados: Formulario): Resultado<{ conta: string; valor: number; vencimento: string; motivo: string }> {
  const conta = textoDo(dados.get("conta"));
  if (!ehUuid(conta)) return { ok: false, erro: "dados" };
  const valor = reais(dados.get("valor"));
  if (valor === null) return { ok: false, erro: "valor" };
  const vencimento = textoDo(dados.get("vencimento"));
  if (!ehDia(vencimento)) return { ok: false, erro: "vencimento" };
  const motivo = textoDo(dados.get("motivo"));
  if (!motivoValido(motivo)) return { ok: false, erro: "motivo" };
  return { ok: true, conta, valor, vencimento, motivo };
}

/** Categoria nova (sem id) ou ajuste de uma existente: o nome e, se veio, se fica ativa. */
export function lerCategoria(dados: Formulario): Resultado<{ categoria: string | null; nome: string; ativa: boolean | null }> {
  const id = textoDo(dados.get("categoria"));
  if (id !== "" && !ehUuid(id)) return { ok: false, erro: "dados" };
  const nome = textoDo(dados.get("nome"));
  if (nome.length < 2 || nome.length > 60) return { ok: false, erro: "categoria_nome" };
  const ativa = dados.get("ativa");
  return { ok: true, categoria: id || null, nome, ativa: ativa === "sim" ? true : ativa === "nao" ? false : null };
}

// ---------------------------------------------------------------------------------------------
// Filtro de loja da tela: todas (o que a pessoa lê), só a rede, ou uma loja do escopo
// ---------------------------------------------------------------------------------------------
export type FiltroDasContas = { tipo: "todas" } | { tipo: "rede" } | { tipo: "loja"; id: string };
export function filtroDasContas(valor: unknown): FiltroDasContas {
  if (valor === "rede") return { tipo: "rede" };
  if (typeof valor === "string" && ehUuid(valor)) return { tipo: "loja", id: valor };
  return { tipo: "todas" };
}
/** O filtro no endereço ("rede", o id da loja) ou nada (todas). */
export const filtroNoEndereco = (f: FiltroDasContas) => (f.tipo === "todas" ? null : f.tipo === "rede" ? "rede" : f.id);
