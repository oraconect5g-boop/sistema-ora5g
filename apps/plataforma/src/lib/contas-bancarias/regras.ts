// As contas bancárias de cada empresa (lote CONTAS-a: ORA-FIN-006, a parte multiempresa). A leitura de
// public.contas_bancarias_saldos, os formulários e as mensagens. O banco confere tudo de novo; aqui não há acesso a dados.
//   * O saldo é o do extrato: o saldo inicial (no fim do dia informado) mais as linhas dos extratos do banco ligados à conta
//     depois desse dia. Ele vale até o último dia coberto por um extrato, e a tela diz que dia é esse.
//   * Dois extratos da mesma conta não cruzam o período (OR044): a mesma linha contaria duas vezes.
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";
import { RespostaInesperada } from "../financeiro/painel";
import { booleano, contagem, ehObjeto, inteiro as n, texto as t, textoOuNulo, type Linha } from "../leitura-do-banco";

export type ContaBancaria = {
  id: string;
  numero: number;
  empresaId: string;
  empresa: string;
  apelido: string;
  banco: string;
  agencia: string | null;
  conta: string | null;
  ativa: boolean;
  saldoInicial: number;
  saldoInicialEm: string;
  extratos: number;
  entradas: number;
  saidas: number;
  saldo: number;
  /** O último dia que o saldo cobre (o fim do último extrato, ou o dia do saldo inicial). */
  saldoEm: string;
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const dia = (l: Linha, campo: string): string => {
  const v = t(l, campo).slice(0, 10);
  if (!DIA.test(v)) throw new RespostaInesperada(campo);
  return v;
};

/** Converte a resposta de public.contas_bancarias_saldos. Forma inesperada é erro (a tela mostra falha, não zero). */
export function lerContasBancarias(dado: unknown): ContaBancaria[] {
  if (!Array.isArray(dado)) throw new RespostaInesperada("contas_bancarias_saldos");
  return dado.map((bruto) => {
    if (!ehObjeto(bruto)) throw new RespostaInesperada("conta");
    const l: Linha = bruto;
    const id = t(l, "id");
    const empresaId = t(l, "empresa_id");
    if (!ehUuid(id) || !ehUuid(empresaId)) throw new RespostaInesperada("conta");
    const c: ContaBancaria = {
      id, numero: contagem(l, "numero"), empresaId, empresa: t(l, "empresa"), apelido: t(l, "apelido"), banco: t(l, "banco"),
      agencia: textoOuNulo(l, "agencia"), conta: textoOuNulo(l, "conta"), ativa: booleano(l, "ativa"),
      saldoInicial: n(l, "saldo_inicial_centavos"), saldoInicialEm: dia(l, "saldo_inicial_em"), extratos: contagem(l, "extratos"),
      entradas: n(l, "entradas_centavos"), saidas: n(l, "saidas_centavos"), saldo: n(l, "saldo_centavos"), saldoEm: dia(l, "saldo_em"),
    };
    // O saldo fecha com as partes: o inicial, mais o que entrou, menos o que saiu.
    if (c.saldo !== c.saldoInicial + c.entradas - c.saidas || c.entradas < 0 || c.saidas < 0) throw new RespostaInesperada("saldo");
    return c;
  });
}

// ---------------------------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------------------------
export const OK_DAS_CONTAS = {
  criada: "Conta cadastrada. Ligue a ela os extratos do banco para o saldo andar.",
  atualizada: "Conta atualizada. A mudança ficou registrada com o motivo.",
  sem_mudanca: "Nada mudou: os dados já eram esses.",
  ligado: "Extrato ligado à conta. O saldo já conta as linhas dele.",
  desligado: "Extrato tirado da conta. O saldo deixou de contar as linhas dele.",
} as const;
export type OkDasContas = keyof typeof OK_DAS_CONTAS;

export const ERROS_DAS_CONTAS = {
  permissao: "Só quem concilia pela rede inteira (o dono) cadastra e muda as contas bancárias.",
  dados: "Dados inválidos: confira os campos.",
  apelido: "O apelido da conta tem de 2 a 60 letras (por exemplo, \"Itaú principal\").",
  apelido_repetido: "Já existe uma conta com este apelido. Use outro.",
  banco: "O nome do banco tem de 2 a 60 letras.",
  agencia: "A agência é só número, com o dígito depois do traço (por exemplo, 1234-5). Pode ficar em branco.",
  conta: "A conta é só número, com o dígito depois do traço (por exemplo, 12345-6). Pode ficar em branco.",
  saldo: "O saldo inicial é em reais com vírgula (por exemplo, 1.234,56 ou -50,00).",
  data: "A data do saldo inicial é de hoje ou de um dia que já passou.",
  motivo: "Informe o motivo (de 3 a 200 letras): a mudança fica registrada.",
  so_banco: "Só o extrato do banco vai para uma conta bancária (o da maquininha concilia vendas).",
  inativa: "A conta está inativa: reative-a antes de ligar um extrato.",
  cruzado: "O período deste extrato cruza com o de outro extrato da mesma conta: as linhas contariam duas vezes no saldo.",
  nao_encontrada: "Conta ou extrato não encontrado.",
  falha: "Não foi possível agora. Tente de novo em instantes.",
} as const;
export type ErroDasContas = keyof typeof ERROS_DAS_CONTAS;

/** A recusa do banco na mensagem da tela (o texto do banco não vai para a tela). */
export function erroDasContas(erro: { code?: string; message?: string } | null | undefined): ErroDasContas {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501") return "permissao";
  if (codigo === "23505") return "apelido_repetido";
  if (codigo === "OR044") return "cruzado";
  if (codigo === "P0002") return "nao_encontrada";
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDasContas][] = [
    ["apelido", "apelido"], ["banco tem", "banco"], ["agência", "agencia"], ["conta é só número", "conta"], ["saldo inicial é de", "data"],
    ["saldo inicial", "saldo"], ["motivo", "motivo"], ["inativa", "inativa"], ["só o extrato do banco", "so_banco"],
  ];
  return regras.find(([trecho]) => m.includes(trecho))?.[1] ?? "dados";
}

// ---------------------------------------------------------------------------------------------
// Os formulários
// ---------------------------------------------------------------------------------------------
type Campos = { get(nome: string): unknown };
type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroDasContas };
const limpo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const AGENCIA = /^[0-9]{1,6}(-[0-9Xx])?$/;
const CONTA = /^[0-9]{1,15}(-[0-9Xx])?$/;
const LIMITE = 100_000_000_000;

/** "1.234,56", "-50,00" ou "0": o saldo em centavos, com sinal. */
export function lerSaldo(texto: unknown): number | null {
  const v = limpo(texto).replace(/^R\$\s*/, "");
  if (v === "") return null;
  const negativo = v.startsWith("-");
  try {
    const centavos = lerReais(negativo ? v.slice(1).trim() : v);
    if (centavos > LIMITE) return null;
    return negativo ? -centavos : centavos;
  } catch {
    return null;
  }
}

export type DadosDaConta = { apelido: string; banco: string; agencia: string | null; conta: string | null; saldoInicial: number; saldoEm: string };

function lerConta(campos: Campos, hoje: string): Resultado<DadosDaConta> {
  const apelido = limpo(campos.get("apelido"));
  const banco = limpo(campos.get("banco"));
  const agencia = limpo(campos.get("agencia")) || null;
  const conta = limpo(campos.get("conta")) || null;
  const saldoInicial = lerSaldo(campos.get("saldo_inicial"));
  const saldoEm = limpo(campos.get("saldo_em"));
  if (apelido.length < 2 || apelido.length > 60) return { ok: false, erro: "apelido" };
  if (banco.length < 2 || banco.length > 60) return { ok: false, erro: "banco" };
  if (agencia !== null && !AGENCIA.test(agencia)) return { ok: false, erro: "agencia" };
  if (conta !== null && !CONTA.test(conta)) return { ok: false, erro: "conta" };
  if (saldoInicial === null) return { ok: false, erro: "saldo" };
  if (!DIA.test(saldoEm) || Number.isNaN(Date.parse(`${saldoEm}T12:00:00Z`)) || saldoEm > hoje) return { ok: false, erro: "data" };
  return { ok: true, dados: { apelido, banco, agencia, conta, saldoInicial, saldoEm } };
}

/** O formulário da conta nova: a empresa e os dados da conta. */
export function validarContaNova(campos: Campos, hoje: string): Resultado<DadosDaConta & { empresa: string }> {
  const empresa = campos.get("empresa");
  if (!ehUuid(empresa)) return { ok: false, erro: "dados" };
  const r = lerConta(campos, hoje);
  return r.ok ? { ok: true, dados: { ...r.dados, empresa } } : r;
}

/** O formulário da mudança: os mesmos dados, se continua ativa e o motivo. */
export function validarMudancaDaConta(campos: Campos, hoje: string): Resultado<DadosDaConta & { id: string; ativa: boolean; motivo: string }> {
  const id = campos.get("conta_bancaria");
  if (!ehUuid(id)) return { ok: false, erro: "dados" };
  const r = lerConta(campos, hoje);
  if (!r.ok) return r;
  const motivo = limpo(campos.get("motivo"));
  if (motivo.length < 3 || motivo.length > 200) return { ok: false, erro: "motivo" };
  return { ok: true, dados: { ...r.dados, id, ativa: campos.get("ativa") === "sim", motivo } };
}

/** "Itaú · ag. 1234-5 · c/c 12345-6": o banco e o que houver da agência e da conta. */
export const textoDaConta = (c: Pick<ContaBancaria, "banco" | "agencia" | "conta">) =>
  [c.banco, c.agencia ? `ag. ${c.agencia}` : null, c.conta ? `c/c ${c.conta}` : null].filter(Boolean).join(" · ");
