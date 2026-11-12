// Maquininhas e conciliação manual (lote L7a: ORA-PAY-012, ORA-PAY-003, ORA-PAY-007). Catálogos, leitura dos
// formulários e mensagens. O banco decide de novo; aqui só se evita ir até ele com o que já se sabe errado.
import { lerReais } from "@ora5g/dominio";

export const PROVEDORES = { picpay: "PicPay", pagbank: "PagBank" } as const;
export type Provedor = keyof typeof PROVEDORES;

/** Situação do dinheiro de cada pagamento: venda não é dinheiro recebido (PAY-003). */
export const SITUACOES_DO_DINHEIRO = {
  no_caixa: { nome: "No caixa (dinheiro)", tom: "sucesso" },
  a_liquidar: { nome: "A liquidar (cartão e Pix)", tom: "aviso" },
  conciliado: { nome: "Conciliado com o extrato", tom: "sucesso" },
  com_a_financeira: { nome: "A receber da financeira", tom: "info" },
  vale_troca: { nome: "Pago com vale-troca", tom: "neutro" },
  estorno_pendente: { nome: "Estorno a confirmar", tom: "perigo" },
  estornado: { nome: "Estornado", tom: "neutro" },
} as const;
export type SituacaoDoDinheiro = keyof typeof SITUACOES_DO_DINHEIRO;

export const ERROS_DOS_PAGAMENTOS = {
  dados: "Confira os dados digitados.",
  provedor: "Escolha o provedor da maquininha.",
  identificador: "Número do terminal inválido (de 3 a 40 letras e números).",
  apelido: "Dê um apelido à maquininha (de 2 a 60 letras), por exemplo \"Balcão 1\".",
  repetida: "Esta maquininha já está cadastrada na rede.",
  referencia: "Informe a referência do extrato (de 3 a 80 letras): NSU, código ou linha do extrato.",
  liquido: "Valor líquido entre zero e o valor do pagamento.",
  data: "A data em que o dinheiro caiu vai do dia da venda até hoje.",
  ja_conciliado: "Pagamento já conciliado: desfaça a conciliação antes de mudar.",
  nao_liquidavel: "Só se concilia pagamento de cartão ou Pix confirmado.",
  periodo: "Escolha um período de até 62 dias.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  permissao: "Sem permissão para esta ação.",
  nao_encontrado: "Não encontrado (ou não é desta loja).",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDosPagamentos = keyof typeof ERROS_DOS_PAGAMENTOS;

export function erroDosPagamentos(erro: { code?: string; message?: string } | null | undefined): ErroDosPagamentos {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  const porCodigo: Record<string, ErroDosPagamentos> = { "42501": "permissao", P0002: "nao_encontrado", OR020: "repetida", OR030: "ja_conciliado" };
  if (Object.hasOwn(porCodigo, codigo)) return porCodigo[codigo] as ErroDosPagamentos;
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDosPagamentos][] = [
    ["provedor", "provedor"], ["número do terminal", "identificador"], ["apelido", "apelido"], ["referência", "referencia"],
    ["valor líquido", "liquido"], ["dinheiro caiu", "data"], ["só se concilia", "nao_liquidavel"], ["período", "periodo"], ["informe o motivo", "motivo"],
  ];
  return regras.find(([t]) => m.includes(t))?.[1] ?? "dados";
}

type Formulario = { get: (nome: string) => unknown };
const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export function lerMaquininha(dados: Formulario): { ok: true; provedor: Provedor; identificador: string; apelido: string } | { ok: false; erro: ErroDosPagamentos } {
  const provedor = texto(dados.get("provedor"));
  if (!Object.hasOwn(PROVEDORES, provedor)) return { ok: false, erro: "provedor" };
  const identificador = texto(dados.get("identificador")).toUpperCase();
  if (!/^[A-Z0-9._/-]{3,40}$/.test(identificador)) return { ok: false, erro: "identificador" };
  const apelido = texto(dados.get("apelido"));
  if (apelido.length < 2 || apelido.length > 60) return { ok: false, erro: "apelido" };
  return { ok: true, provedor: provedor as Provedor, identificador, apelido };
}

/** Conciliação de um pagamento: referência do extrato, valor líquido em reais e a data em que o dinheiro caiu. */
export function lerConciliacao(dados: Formulario): { ok: true; referencia: string; liquido: number; data: string } | { ok: false; erro: ErroDosPagamentos } {
  const referencia = texto(dados.get("referencia"));
  if (referencia.length < 3 || referencia.length > 80) return { ok: false, erro: "referencia" };
  let liquido: number;
  try {
    liquido = lerReais(texto(dados.get("liquido")));
  } catch {
    return { ok: false, erro: "liquido" };
  }
  if (!Number.isInteger(liquido) || liquido < 0) return { ok: false, erro: "liquido" };
  const data = texto(dados.get("data"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(new Date(`${data}T12:00:00Z`).getTime())) return { ok: false, erro: "data" };
  return { ok: true, referencia, liquido, data };
}

/** Período da tela de conciliação: AAAA-MM-DD, de até 62 dias; sem escolha, os últimos 7 dias até hoje. */
export function periodoDaConciliacao(inicio: unknown, fim: unknown, hoje: string): { inicio: string; fim: string } {
  const valido = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime());
  const dias = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);
  const menos = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
  if (valido(inicio) && valido(fim) && dias(inicio as string, fim as string) >= 0 && dias(inicio as string, fim as string) <= 62) return { inicio: inicio as string, fim: fim as string };
  return { inicio: menos(hoje, 6), fim: hoje };
}
