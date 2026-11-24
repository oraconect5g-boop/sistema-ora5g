// Os repasses atrasados das financeiras (lote FIN-007a: ORA-FIN-007, a primeira parte, e o vencimento do ORA-FIN-003).
// Leitura estrita de public.repasses_atrasados, a leitura dos dois formulários (o prazo de cada financeira, que o dono
// define, e a cobrança feita à financeira) e as mensagens. A regra está no banco
// (packages/banco/src/repasses-atrasados.test.ts); aqui só se evita ir até ele com o que já se sabe errado. Nenhum prazo é
// inventado: sem o prazo definido, nenhuma conta é chamada de atrasada.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { booleano, contagem, ehObjeto, inteiro, lista, objeto, texto, type Leitura, type Linha } from "../leitura-do-banco";
import { FINANCEIRAS, type Financeira } from "./financeiras";

export const CANAIS_DA_COBRANCA = {
  telefone: "Telefone", email: "E-mail", portal: "Portal da financeira", whatsapp: "WhatsApp", presencial: "Pessoalmente", outro: "Outro",
} as const;
export type CanalDaCobranca = keyof typeof CANAIS_DA_COBRANCA;
const ehCanal = (v: unknown): v is CanalDaCobranca => typeof v === "string" && Object.hasOwn(CANAIS_DA_COBRANCA, v);
const ehFinanceira = (v: unknown): v is Financeira => typeof v === "string" && Object.hasOwn(FINANCEIRAS, v);

export type CobrancaDeRepasse = { id: string; quando: string; canal: CanalDaCobranca; resumo: string; protocolo: string | null; retornarEm: string | null; por: string | null };
export type EstadoDoRepasse = "atrasada" | "no_prazo" | "sem_prazo";
export type RepasseEmAberto = {
  id: string; vendaId: string; vendaNumero: number; unidadeId: string; unidadeNome: string; devedor: Financeira; valor: number; concluidaEm: string;
  /** Dias corridos desde a venda. */
  dias: number;
  /** O prazo em vigor da financeira (nulo: o dono ainda não definiu) e o vencimento que ele dá à conta. */
  prazo: number | null; vencimento: string | null;
  /** Dias de atraso (zero no prazo; nulo sem prazo). */
  atraso: number | null; estado: EstadoDoRepasse;
  cobrancas: number; historico: CobrancaDeRepasse[];
};
export type PrazoDeRepasse = { devedor: Financeira; dias: number | null; definidoEm: string | null };
export type RepassesAtrasados = {
  hoje: string; prazos: PrazoDeRepasse[]; podeDefinirPrazo: boolean;
  totais: { atrasadas: number; valorAtrasado: number; noPrazo: number; valorNoPrazo: number; semPrazo: number; valorSemPrazo: number; maiorAtraso: number };
  porLoja: { unidadeId: string; nome: string; abertas: number; atrasadas: number; valorAtrasado: number }[];
  contas: RepasseEmAberto[];
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const textoOuNulo = (l: Linha, campo: string) => (l[campo] === null ? null : texto(l, campo));
const diaOuNulo = (l: Linha, campo: string) => {
  const v = textoOuNulo(l, campo);
  if (v !== null && !DIA.test(v)) throw new RespostaInesperada(campo);
  return v;
};
const contagemOuNula = (l: Linha, campo: string) => (l[campo] === null ? null : contagem(l, campo));
function financeira(l: Linha): Financeira {
  if (!ehFinanceira(l.devedor)) throw new RespostaInesperada("devedor");
  return l.devedor;
}

/** Converte a resposta de public.repasses_atrasados. O que não fecha (estado sem o vencimento, total que não soma) é falha. */
export function lerRepassesAtrasados(dado: unknown): RepassesAtrasados {
  if (!ehObjeto(dado)) throw new RespostaInesperada("repasses_atrasados");
  const hoje = texto(dado, "hoje");
  if (!DIA.test(hoje)) throw new RespostaInesperada("hoje");
  const prazos = lista(dado, "prazos").map((l): PrazoDeRepasse => {
    const dias = contagemOuNula(l, "dias");
    const definidoEm = textoOuNulo(l, "definido_em");
    if ((dias === null) !== (definidoEm === null) || (dias !== null && (dias < 1 || dias > 180))) throw new RespostaInesperada("prazos");
    return { devedor: financeira(l), dias, definidoEm };
  });
  const contas = lista(dado, "contas").map((l): RepasseEmAberto => {
    const id = texto(l, "id");
    const vendaId = texto(l, "venda_id");
    const unidadeId = texto(l, "unidade_id");
    if (!ehUuid(id) || !ehUuid(vendaId) || !ehUuid(unidadeId)) throw new RespostaInesperada("id");
    const estado = l.estado;
    if (estado !== "atrasada" && estado !== "no_prazo" && estado !== "sem_prazo") throw new RespostaInesperada("estado");
    const prazo = contagemOuNula(l, "prazo");
    const vencimento = diaOuNulo(l, "vencimento");
    const atraso = contagemOuNula(l, "atraso");
    // Sem prazo não há vencimento nem atraso; com prazo há os dois, e o atraso diz o estado.
    const semPrazo = prazo === null && vencimento === null && atraso === null;
    const comPrazo = prazo !== null && vencimento !== null && atraso !== null;
    if (estado === "sem_prazo" ? !semPrazo : !comPrazo || (estado === "atrasada") !== ((atraso ?? 0) > 0) || (estado === "atrasada") !== ((vencimento ?? "") < hoje)) {
      throw new RespostaInesperada("vencimento");
    }
    const historico = lista(l, "historico").map((h): CobrancaDeRepasse => {
      if (!ehCanal(h.canal)) throw new RespostaInesperada("canal");
      return { id: texto(h, "id"), quando: texto(h, "quando"), canal: h.canal, resumo: texto(h, "resumo"), protocolo: textoOuNulo(h, "protocolo"), retornarEm: diaOuNulo(h, "retornar_em"), por: textoOuNulo(h, "por") };
    });
    const cobrancas = contagem(l, "cobrancas");
    if (cobrancas !== historico.length) throw new RespostaInesperada("cobrancas");
    const valor = inteiro(l, "valor");
    if (valor <= 0) throw new RespostaInesperada("valor");
    return {
      id, vendaId, vendaNumero: contagem(l, "venda_numero"), unidadeId, unidadeNome: texto(l, "unidade_nome"), devedor: financeira(l), valor,
      concluidaEm: texto(l, "concluida_em"), dias: contagem(l, "dias"), prazo, vencimento, atraso, estado, cobrancas, historico,
    };
  });
  const t = objeto(dado, "totais");
  const totais = {
    atrasadas: contagem(t, "atrasadas"), valorAtrasado: inteiro(t, "valor_atrasado"), noPrazo: contagem(t, "no_prazo"), valorNoPrazo: inteiro(t, "valor_no_prazo"),
    semPrazo: contagem(t, "sem_prazo"), valorSemPrazo: inteiro(t, "valor_sem_prazo"), maiorAtraso: contagem(t, "maior_atraso"),
  };
  // Os totais são a soma das contas da própria resposta: se não fecham, a leitura não vale.
  const soma = (estado: EstadoDoRepasse) => contas.filter((c) => c.estado === estado).reduce((s, c) => ({ n: s.n + 1, valor: s.valor + c.valor }), { n: 0, valor: 0 });
  const [atrasadas, noPrazo, semPrazo] = [soma("atrasada"), soma("no_prazo"), soma("sem_prazo")];
  if (totais.atrasadas !== atrasadas.n || totais.valorAtrasado !== atrasadas.valor || totais.noPrazo !== noPrazo.n || totais.valorNoPrazo !== noPrazo.valor
    || totais.semPrazo !== semPrazo.n || totais.valorSemPrazo !== semPrazo.valor) throw new RespostaInesperada("totais");
  const porLoja = lista(dado, "por_loja").map((l) => {
    const unidadeId = texto(l, "unidade_id");
    if (!ehUuid(unidadeId)) throw new RespostaInesperada("por_loja");
    return { unidadeId, nome: texto(l, "nome"), abertas: contagem(l, "abertas"), atrasadas: contagem(l, "atrasadas"), valorAtrasado: inteiro(l, "valor_atrasado") };
  });
  return { hoje, prazos, podeDefinirPrazo: booleano(dado, "pode_definir_prazo"), totais, porLoja, contas };
}

const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** O selo de uma conta em aberto: atrasada há N dias, vence hoje, vence em dd/mm/aaaa ou sem prazo definido. */
export function situacaoDoRepasse(c: Pick<RepasseEmAberto, "estado" | "atraso" | "vencimento">, hoje: string): { rotulo: string; tom: "perigo" | "aviso" | "info" | "neutro" } {
  if (c.estado === "atrasada") return { rotulo: `atrasada há ${c.atraso} ${c.atraso === 1 ? "dia" : "dias"}`, tom: "perigo" };
  if (c.estado === "sem_prazo" || c.vencimento === null) return { rotulo: "sem prazo definido", tom: "neutro" };
  return c.vencimento === hoje ? { rotulo: "vence hoje", tom: "aviso" } : { rotulo: `vence em ${dataCurta(c.vencimento)}`, tom: "info" };
}

/**
 * FIN-007b: o dia combinado para voltar ao assunto, quando ele já chegou. Vale a cobrança mais recente da conta (a
 * primeira do histórico): registrar outra cobrança tira o lembrete da anterior. É a mesma regra da contagem do banco
 * (public.pendencias_da_loja, cobrancas_a_retomar). Nulo: nada a retomar hoje.
 */
export function cobrancaARetomar(conta: Pick<RepasseEmAberto, "historico">, hoje: string): string | null {
  const dia = conta.historico[0]?.retornarEm ?? null;
  return dia !== null && dia <= hoje ? dia : null;
}

/** As faixas da idade do atraso (até quantos dias de atraso entram em cada uma; a última não tem teto). */
export const FAIXAS_DO_ATRASO = [{ ate: 7, rotulo: "até 7 dias" }, { ate: 30, rotulo: "de 8 a 30 dias" }, { ate: null, rotulo: "mais de 30 dias" }] as const;
export type FaixaDoAtraso = { rotulo: string; contas: number; valor: number };

/** As contas atrasadas por idade do atraso: quantas e quanto em cada faixa. As que estão no prazo ou sem prazo não entram. */
export function faixasDoAtraso(contas: readonly Pick<RepasseEmAberto, "estado" | "atraso" | "valor">[]): FaixaDoAtraso[] {
  const faixas: FaixaDoAtraso[] = FAIXAS_DO_ATRASO.map((f) => ({ rotulo: f.rotulo, contas: 0, valor: 0 }));
  for (const c of contas) {
    const atraso = c.atraso;
    if (c.estado !== "atrasada" || atraso === null) continue;
    const faixa = faixas[FAIXAS_DO_ATRASO.findIndex((f) => f.ate === null || atraso <= f.ate)] as FaixaDoAtraso;
    faixa.contas += 1;
    faixa.valor += c.valor;
  }
  return faixas;
}

// ---------------------------------------------------------------------------------------------
// Os formulários e as mensagens
// ---------------------------------------------------------------------------------------------
export const ERROS_DOS_ATRASADOS = {
  prazo_dados: "Confira o prazo: a financeira e de 1 a 180 dias corridos (ou em branco, para retirar o prazo).",
  prazo_motivo: "Diga de onde veio o prazo (de 3 a 200 letras): o contrato, o e-mail da financeira. Fica na auditoria.",
  prazo_permissao: "O prazo de repasse vale para a rede inteira: quem define é quem concilia pela rede (o dono).",
  cobranca_dados: "Confira a cobrança: por onde foi feita e o que foi combinado (de 3 a 500 letras).",
  cobranca_protocolo: "O protocolo tem até 80 letras.",
  cobranca_data: "A data para voltar ao assunto vai de hoje a um ano.",
  cobranca_fechada: "Só se cobra conta em aberto: esta já foi recebida ou cancelada.",
  cobranca_repetida: "Esta cobrança já tinha sido enviada com outro texto. Abra a tela de novo e registre outra vez.",
  cobranca_conta: "Conta não encontrada (ou não é desta loja).",
  atrasados_falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDosAtrasados = keyof typeof ERROS_DOS_ATRASADOS;

type Formulario = { get: (nome: string) => unknown };
const textoDo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/** O prazo de uma financeira: os dias (em branco retira o prazo) e o motivo. */
export function lerPrazo(dados: Formulario): { ok: true; devedor: Financeira; dias: number | null; motivo: string } | { ok: false; erro: ErroDosAtrasados } {
  const devedor = dados.get("devedor");
  if (!ehFinanceira(devedor)) return { ok: false, erro: "prazo_dados" };
  const bruto = textoDo(dados.get("dias"));
  if (bruto !== "" && !/^\d{1,3}$/.test(bruto)) return { ok: false, erro: "prazo_dados" };
  const dias = bruto === "" ? null : Number(bruto);
  if (dias !== null && (dias < 1 || dias > 180)) return { ok: false, erro: "prazo_dados" };
  const motivo = textoDo(dados.get("motivo"));
  if (motivo.length < 3 || motivo.length > 200) return { ok: false, erro: "prazo_motivo" };
  return { ok: true, devedor, dias, motivo };
}

/** A cobrança de uma conta: o canal, o resumo, o protocolo e a data para voltar ao assunto (os dois últimos opcionais). */
export function lerCobranca(dados: Formulario, hoje: string): {
  ok: true; conta: string; canal: CanalDaCobranca; resumo: string; protocolo: string | null; retornarEm: string | null; chave: string;
} | { ok: false; erro: ErroDosAtrasados } {
  const conta = dados.get("conta");
  const canal = dados.get("canal");
  const chave = textoDo(dados.get("chave"));
  if (!ehUuid(conta) || !ehCanal(canal) || chave.length < 1 || chave.length > 200) return { ok: false, erro: "cobranca_dados" };
  const resumo = textoDo(dados.get("resumo"));
  if (resumo.length < 3 || resumo.length > 500) return { ok: false, erro: "cobranca_dados" };
  const protocolo = textoDo(dados.get("protocolo"));
  if (protocolo.length > 80) return { ok: false, erro: "cobranca_protocolo" };
  const retornarEm = textoDo(dados.get("retornar_em"));
  if (retornarEm !== "") {
    const limite = new Date(new Date(`${hoje}T12:00:00Z`).getTime() + 365 * 86_400_000).toISOString().slice(0, 10);
    if (!DIA.test(retornarEm) || Number.isNaN(new Date(`${retornarEm}T12:00:00Z`).getTime()) || retornarEm < hoje || retornarEm > limite) return { ok: false, erro: "cobranca_data" };
  }
  return { ok: true, conta, canal, resumo, protocolo: protocolo === "" ? null : protocolo, retornarEm: retornarEm === "" ? null : retornarEm, chave };
}

/** O erro do banco ao definir o prazo → a mensagem da tela (a tela nunca repete o texto do banco). */
export function erroDoPrazo(erro: { code?: string } | null | undefined): ErroDosAtrasados {
  if (erro?.code === "42501") return "prazo_permissao";
  return erro?.code === "22023" ? "prazo_dados" : "atrasados_falha";
}

/** O erro do banco ao registrar a cobrança → a mensagem da tela. */
export function erroDaCobranca(erro: { code?: string; message?: string } | null | undefined): ErroDosAtrasados {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "P0002" || codigo === "42501") return "cobranca_conta";
  if (codigo === "OR004") return "cobranca_repetida";
  if (codigo !== "22023") return "atrasados_falha";
  if (m.includes("conta em aberto")) return "cobranca_fechada";
  if (m.includes("protocolo")) return "cobranca_protocolo";
  return m.includes("voltar ao assunto") ? "cobranca_data" : "cobranca_dados";
}

// ---------------------------------------------------------------------------------------------
// Consulta: nulo sem a função no banco (a tela segue como antes); falha nunca vira "nada atrasado"
// ---------------------------------------------------------------------------------------------
type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export async function consultarRepassesAtrasados(supabase: Cliente, unidade: string | null): Promise<Leitura<RepassesAtrasados> | null> {
  const r = await supabase.rpc("repasses_atrasados", unidade ? { p_unidade: unidade } : {});
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return null;
    console.error("pagamentos: falha ao consultar repasses_atrasados", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerRepassesAtrasados(r.data) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("pagamentos: resposta inesperada de repasses_atrasados", { campo: erro.message });
    return { estado: "falha" };
  }
}
