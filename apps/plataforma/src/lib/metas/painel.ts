// Metas mensais (lote G4b; decisão do proprietário de 13/11/2026, D-014 em parte): leitura de
// public.metas_painel e public.metas_equipe, o ritmo do mês e a validação do formulário. A soma no
// banco está provada em packages/banco/src/metas.test.ts; aqui não há acesso a dados.
//   * A meta é do mês, com o ritmo esperado do dia: meta × dias decorridos ÷ dias do mês (hoje conta).
//   * Quatro medidas, pela regra de contagem 1 (a única que a tela sabe explicar): valor vendido
//     líquido, aparelhos, acessórios e Ora Connect confirmado.
//   * Têm meta a loja e cada vendedor. Meta não definida é ausência ("meta não definida"), nunca zero.
//   * Bonificação e comissão continuam fora (D-014 e P8).
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";
import { RespostaInesperada, type Janela } from "../financeiro/painel";
import { brl, numero } from "../formato";
import { ehObjeto, inteiro as n, lista, objeto, texto as t, type Linha } from "../leitura-do-banco";

export type Medida = "vendido_liquido" | "aparelhos" | "acessorios" | "connect";
type DescricaoDaMedida = {
  nome: string;
  curto: string;
  /** Valor em centavos (true) ou contagem de unidades (false). */
  dinheiro: boolean;
  /** Como a regra de contagem 1 conta, em uma frase. */
  conta: string;
  /** Rótulo do campo do formulário, com a unidade. */
  campo: string;
  /** Singular e plural da contagem ("aparelho", "aparelhos"); dinheiro não tem. */
  unidade?: readonly [string, string];
};
export const MEDIDAS: Record<Medida, DescricaoDaMedida> = {
  vendido_liquido: {
    nome: "Valor vendido líquido", curto: "Vendido líquido", dinheiro: true, campo: "Vendido líquido (R$)",
    conta: "Vendas concluídas no mês, menos as canceladas e as devoluções feitas no mês, na loja da venda.",
  },
  aparelhos: {
    nome: "Aparelhos", curto: "Aparelhos", dinheiro: false, campo: "Aparelhos (unidades)", unidade: ["aparelho", "aparelhos"],
    conta: "Unidades de aparelho vendidas no mês, menos as devolvidas e as das vendas canceladas no mês.",
  },
  acessorios: {
    nome: "Acessórios", curto: "Acessórios", dinheiro: true, campo: "Acessórios (R$)",
    conta: "Valor dos acessórios vendidos no mês (com o desconto do item), menos os devolvidos e cancelados no mês.",
  },
  connect: {
    nome: "Ora Connect confirmado", curto: "Ora Connect", dinheiro: false, campo: "Ora Connect (operações)", unidade: ["operação", "operações"],
    conta: "Ativações, portabilidades e recargas confirmadas no mês, do vendedor de origem. Registrada não conta.",
  },
};
export const ORDEM_DAS_MEDIDAS: readonly Medida[] = ["vendido_liquido", "aparelhos", "acessorios", "connect"];
export const ehMedida = (v: unknown): v is Medida => typeof v === "string" && Object.hasOwn(MEDIDAS, v);
export const formatarMedida = (medida: Medida, valor: number) => (MEDIDAS[medida].dinheiro ? brl(valor) : numero(valor));
/** Para frases: "R$ 1.234,00", "3 aparelhos", "1 operação". */
export function comUnidade(medida: Medida, valor: number): string {
  const unidade = MEDIDAS[medida].unidade;
  return unidade ? `${numero(valor)} ${valor === 1 ? unidade[0] : unidade[1]}` : brl(valor);
}

// ---------------------------------------------------------------------------------------------
// Leitura estrita: forma inesperada é erro (a tela mostra falha), nunca zero
// ---------------------------------------------------------------------------------------------
export type Realizado = Record<Medida, number>;
export type MetasDoAlvo = Partial<Record<Medida, number>>;
export type MetasDoBanco = {
  /** "2026-11-01". */
  mes: string;
  diasNoMes: number;
  /** Dias do mês já começados em São Paulo (hoje conta); 0 no mês que ainda não começou. */
  diasDecorridos: number;
  /** A loja inteira: só para quem lê as vendas da loja. */
  loja: { metas: MetasDoAlvo; realizado: Realizado } | null;
  /** Quem tem meta ou fato no mês; o vendedor recebe só a própria linha. */
  vendedores: { vendedorId: string; metas: MetasDoAlvo; realizado: Realizado }[];
};
const MES = /^\d{4}-(0[1-9]|1[0-2])-01$/;

function metasDoAlvo(l: Linha): MetasDoAlvo {
  const m = objeto(l, "metas");
  const metas: MetasDoAlvo = {};
  for (const chave of Object.keys(m)) {
    if (!ehMedida(chave)) throw new RespostaInesperada("medida");
    const valor = n(m, chave);
    if (valor < 1) throw new RespostaInesperada("meta");
    metas[chave] = valor;
  }
  return metas;
}
function realizadoDoAlvo(l: Linha): Realizado {
  const r = objeto(l, "realizado");
  const realizado = { vendido_liquido: n(r, "vendido_liquido"), aparelhos: n(r, "aparelhos"), acessorios: n(r, "acessorios"), connect: n(r, "connect") };
  // Devolução no mês de venda de outro mês pode deixar o líquido negativo; operação confirmada, nunca.
  if (realizado.connect < 0) throw new RespostaInesperada("connect");
  return realizado;
}

/** O cabeçalho comum das respostas de metas: o mês, os dias e a regra de contagem. */
function cabecalho(dado: Linha) {
  // Outra regra de contagem seria um número que a tela não sabe explicar: falha, não número.
  if (dado.regra_contagem !== 1) throw new RespostaInesperada("regra_contagem");
  const mes = t(dado, "mes");
  if (!MES.test(mes)) throw new RespostaInesperada("mes");
  const diasNoMes = n(dado, "dias_no_mes");
  const diasDecorridos = n(dado, "dias_decorridos");
  if (diasNoMes < 28 || diasNoMes > 31 || diasDecorridos < 0 || diasDecorridos > diasNoMes) throw new RespostaInesperada("dias");
  return { mes, diasNoMes, diasDecorridos };
}

/** Converte a resposta de public.metas_painel. */
export function lerMetas(dado: unknown): MetasDoBanco {
  if (!ehObjeto(dado)) throw new RespostaInesperada("metas_painel");
  const { mes, diasNoMes, diasDecorridos } = cabecalho(dado);
  let loja: MetasDoBanco["loja"] = null;
  if (dado.loja !== null) {
    const l = objeto(dado, "loja");
    loja = { metas: metasDoAlvo(l), realizado: realizadoDoAlvo(l) };
  }
  const vendedores = lista(dado, "vendedores").map((l) => {
    const vendedorId = t(l, "vendedor_id");
    if (!ehUuid(vendedorId)) throw new RespostaInesperada("vendedor_id");
    return { vendedorId, metas: metasDoAlvo(l), realizado: realizadoDoAlvo(l) };
  });
  return { mes, diasNoMes, diasDecorridos, loja, vendedores };
}

export type MetasDasLojas = {
  mes: string;
  diasNoMes: number;
  diasDecorridos: number;
  /** Cada loja em que quem pede lê as vendas e acompanha as metas; sem meta, `metas` vazio. */
  lojas: { unidadeId: string; metas: MetasDoAlvo; realizado: Realizado }[];
};
/** Converte a resposta de public.metas_lojas (G4c). */
export function lerMetasDasLojas(dado: unknown): MetasDasLojas {
  if (!ehObjeto(dado)) throw new RespostaInesperada("metas_lojas");
  const lojas = lista(dado, "lojas").map((l) => {
    const unidadeId = t(l, "unidade_id");
    if (!ehUuid(unidadeId)) throw new RespostaInesperada("unidade_id");
    return { unidadeId, metas: metasDoAlvo(l), realizado: realizadoDoAlvo(l) };
  });
  if (new Set(lojas.map((l) => l.unidadeId)).size !== lojas.length) throw new RespostaInesperada("loja repetida");
  return { ...cabecalho(dado), lojas };
}

export type PessoaDasMetas = { id: string; nome: string; naEquipe: boolean };
/** Converte a resposta de public.metas_equipe: a equipe atual (pode receber meta) e quem tem meta ou fato no mês. */
export function lerEquipe(dado: unknown): PessoaDasMetas[] {
  if (!Array.isArray(dado) || !dado.every(ehObjeto)) throw new RespostaInesperada("metas_equipe");
  return dado.map((l) => {
    const id = t(l, "usuario_id");
    if (!ehUuid(id) || typeof l.na_equipe !== "boolean") throw new RespostaInesperada("pessoa");
    return { id, nome: t(l, "nome"), naEquipe: l.na_equipe };
  });
}

// ---------------------------------------------------------------------------------------------
// O mês: endereço, nome, fase e a janela das vendas (São Paulo, UTC−3 desde 2019)
// ---------------------------------------------------------------------------------------------
const NOMES_DOS_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const diaDeSaoPaulo = (agora: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);

/** O mês de hoje em São Paulo, "2026-11-01". */
export const mesDeHoje = (agora: Date = new Date()) => `${diaDeSaoPaulo(agora).slice(0, 7)}-01`;
export function somarMeses(mes: string, quantos: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + quantos;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}
/** "2026-11" do endereço → "2026-11-01", de 12 meses atrás até 12 à frente; inválido ou fora disso → null (a tela usa o mês de hoje). */
export function mesDoEndereco(valor: string | undefined, agora: Date = new Date()): string | null {
  if (!valor || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return null;
  const mes = `${valor}-01`;
  const hoje = mesDeHoje(agora);
  return mes >= somarMeses(hoje, -12) && mes <= somarMeses(hoje, 12) ? mes : null;
}
/** "novembro de 2026". */
export const nomeDoMes = (mes: string) => `${NOMES_DOS_MESES[Number(mes.slice(5, 7)) - 1] ?? ""} de ${mes.slice(0, 4)}`;
const maiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

export type FaseDoMes = "passado" | "atual" | "futuro";
export function faseDoMes(mes: string, agora: Date = new Date()): FaseDoMes {
  const hoje = mesDeHoje(agora);
  return mes < hoje ? "passado" : mes > hoje ? "futuro" : "atual";
}
/** Opções do filtro: dois meses atrás, o mês passado, este ("Este mês", curto para caber no celular) e o próximo (e o escolhido, se for outro). */
export function opcoesDeMes(escolhido: string, agora: Date = new Date()): { mes: string; rotulo: string }[] {
  const hoje = mesDeHoje(agora);
  const meses = [...new Set([somarMeses(hoje, -2), somarMeses(hoje, -1), hoje, somarMeses(hoje, 1), escolhido])].sort();
  return meses.map((mes) => ({
    mes,
    rotulo: mes === hoje ? "Este mês" : `${maiuscula(NOMES_DOS_MESES[Number(mes.slice(5, 7)) - 1] ?? "")}${mes.slice(0, 4) === hoje.slice(0, 4) ? "" : ` de ${mes.slice(0, 4)}`}`,
  }));
}
/** Os meses (de São Paulo) que uma janela toca: um ou dois nos períodos dos relatórios. */
export function mesesDaJanela(janela: Janela): string[] {
  const meses = [mesDeHoje(janela.inicio)];
  for (let mes = meses[0] ?? ""; mes < mesDeHoje(janela.fim); ) {
    mes = somarMeses(mes, 1);
    meses.push(mes);
  }
  return meses;
}
/** As vendas do mês: do primeiro dia até agora, ou até o fim do mês que já terminou; o mês que não começou não tem janela. */
export function janelaDoMes(mes: string, agora: Date = new Date()): Janela | null {
  const fase = faseDoMes(mes, agora);
  if (fase === "futuro") return null;
  return { inicio: new Date(`${mes}T00:00:00-03:00`), fim: fase === "atual" ? agora : new Date(`${somarMeses(mes, 1)}T00:00:00-03:00`) };
}

// ---------------------------------------------------------------------------------------------
// Ritmo e situação de uma meta
// ---------------------------------------------------------------------------------------------
export type SituacaoDaMeta = "sem_meta" | "nao_comecou" | "batida" | "no_ritmo" | "abaixo" | "nao_batida";
export const SITUACOES: Record<SituacaoDaMeta, { rotulo: string; tom: "neutro" | "info" | "sucesso" | "aviso" | "perigo" }> = {
  sem_meta: { rotulo: "Meta não definida", tom: "neutro" },
  nao_comecou: { rotulo: "O mês ainda não começou", tom: "neutro" },
  batida: { rotulo: "Meta batida", tom: "sucesso" },
  no_ritmo: { rotulo: "No ritmo", tom: "info" },
  abaixo: { rotulo: "Abaixo do ritmo", tom: "aviso" },
  nao_batida: { rotulo: "Meta não batida", tom: "perigo" },
};

export type Progresso = {
  medida: Medida;
  realizado: number;
  meta: number | null;
  /** Fração da meta (0,42 = 42%); nula sem meta. */
  atingido: number | null;
  /** Quanto a meta pede até hoje (meta × dias decorridos ÷ dias do mês); nulo sem meta. */
  esperado: number | null;
  /** O que falta para a meta (zero quando batida); nulo sem meta. */
  falta: number | null;
  /** Dias que restam, contando hoje (0 no mês que terminou). */
  restam: number;
  /** O que falta dividido pelos dias que restam, arredondado para cima; nulo quando não falta ou o mês terminou. */
  porDia: number | null;
  situacao: SituacaoDaMeta;
};

export function progresso(medida: Medida, realizado: number, meta: number | undefined, dias: { diasNoMes: number; diasDecorridos: number }, fase: FaseDoMes): Progresso {
  const restam = fase === "passado" ? 0 : fase === "futuro" ? dias.diasNoMes : dias.diasNoMes - dias.diasDecorridos + 1;
  if (meta === undefined) return { medida, realizado, meta: null, atingido: null, esperado: null, falta: null, restam, porDia: null, situacao: "sem_meta" };
  const esperado = Math.round((meta * dias.diasDecorridos) / dias.diasNoMes);
  const falta = Math.max(0, meta - realizado);
  const situacao: SituacaoDaMeta = realizado >= meta ? "batida"
    : fase === "passado" ? "nao_batida"
      : fase === "futuro" ? "nao_comecou"
        : realizado >= esperado ? "no_ritmo" : "abaixo";
  return { medida, realizado, meta, atingido: realizado / meta, esperado, falta, restam, porDia: falta > 0 && restam > 0 ? Math.ceil(falta / restam) : null, situacao };
}

/** As quatro medidas de um alvo, na ordem da tela. */
export const progressoDoAlvo = (alvo: { metas: MetasDoAlvo; realizado: Realizado }, dias: { diasNoMes: number; diasDecorridos: number }, fase: FaseDoMes) =>
  ORDEM_DAS_MEDIDAS.map((m) => progresso(m, alvo.realizado[m], alvo.metas[m], dias, fase));

export const REALIZADO_ZERO: Realizado = { vendido_liquido: 0, aparelhos: 0, acessorios: 0, connect: 0 };

// ---------------------------------------------------------------------------------------------
// Formulário: definir (ou retirar) as metas de um alvo no mês; o banco confere tudo de novo
// ---------------------------------------------------------------------------------------------
export const OK_DAS_METAS = {
  salvas: "Metas salvas. Cada mudança fica no histórico, com quem fez e o motivo.",
  sem_mudanca: "Nada mudou: os valores enviados já eram os vigentes.",
} as const;
export const ERROS_DAS_METAS = {
  dados: "Dados inválidos: confira os campos.",
  valor: "Meta inválida: em reais com vírgula (ex.: 50.000,00) ou em unidades inteiras, maior que zero. Deixe vazio para ficar sem meta.",
  motivo: "Para mudar ou retirar uma meta já definida, diga o motivo (de 3 a 300 letras); ele fica na auditoria.",
  mes: "Só dá para definir as metas deste mês ou dos próximos 12: o mês que já terminou não muda.",
  pessoa: "Meta nova só para quem vende nesta loja e não está bloqueado. A meta de quem saiu pode ser retirada.",
  permissao: "Sem permissão para definir metas nesta loja (o dono define em todas; o gerente, na loja dele).",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDasMetas = keyof typeof ERROS_DAS_METAS;

export function erroDasMetas(erro: { code?: string; message?: string } | null | undefined): ErroDasMetas {
  const codigo = erro?.code ?? "";
  const mensagem = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501") return "permissao";
  if (codigo === "22023") {
    const regras: [string, ErroDasMetas][] = [["motivo", "motivo"], ["mês", "mes"], ["não vende", "pessoa"], ["número inteiro", "valor"], ["medida", "valor"]];
    return regras.find(([trecho]) => mensagem.includes(trecho))?.[1] ?? "dados";
  }
  return "falha";
}

const LIMITE = 100_000_000_000;
/** O que foi digitado numa medida: vazio = sem meta (retira a que houver); reais para dinheiro, unidades inteiras para contagem. Inválido → undefined. */
export function valorDigitado(medida: Medida, bruto: unknown): number | null | undefined {
  const texto = typeof bruto === "string" ? bruto.trim() : "";
  if (texto === "") return null;
  let valor: number;
  if (MEDIDAS[medida].dinheiro) {
    try {
      valor = lerReais(texto);
    } catch {
      return undefined;
    }
  } else {
    if (!/^(\d{1,3}(\.\d{3})+|\d+)$/.test(texto)) return undefined;
    valor = Number(texto.replaceAll(".", ""));
  }
  return Number.isSafeInteger(valor) && valor >= 1 && valor <= LIMITE ? valor : undefined;
}
/** O valor vigente no campo: reais com vírgula ("50.000,00") para dinheiro, unidades para contagem; sem meta, vazio. */
export function valorNoCampo(medida: Medida, valor: number | undefined): string {
  if (valor === undefined) return "";
  return MEDIDAS[medida].dinheiro ? brl(valor).replace(/^R\$\s?/, "") : String(valor);
}

export type DefinicaoDeMetas = { unidade: string; vendedor: string | null; mes: string; valores: Record<Medida, number | null>; motivo: string | null };
type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroDasMetas };

/** Confere o formulário de um alvo ("loja" ou o id do vendedor): as quatro medidas vão sempre; a que não mudou não vira versão. */
export function validarDefinicao(campo: (nome: string) => unknown): Resultado<DefinicaoDeMetas> {
  const unidade = campo("unidade");
  const alvo = campo("alvo");
  const mes = campo("mes");
  if (!ehUuid(unidade) || (alvo !== "loja" && !ehUuid(alvo)) || typeof mes !== "string" || !MES.test(mes)) return { ok: false, erro: "dados" };
  const valores = {} as Record<Medida, number | null>;
  for (const medida of ORDEM_DAS_MEDIDAS) {
    const valor = valorDigitado(medida, campo(`meta_${medida}`));
    if (valor === undefined) return { ok: false, erro: "valor" };
    valores[medida] = valor;
  }
  const bruto = campo("motivo");
  const motivo = typeof bruto === "string" ? bruto.trim().replace(/\s+/g, " ") : "";
  if (motivo !== "" && (motivo.length < 3 || motivo.length > 300)) return { ok: false, erro: "motivo" };
  return { ok: true, dados: { unidade, vendedor: alvo === "loja" ? null : alvo, mes, valores, motivo: motivo === "" ? null : motivo } };
}

// ---------------------------------------------------------------------------------------------
// A equipe na tela da gestão
// ---------------------------------------------------------------------------------------------
export type LinhaDaEquipe = { pessoa: PessoaDasMetas; metas: MetasDoAlvo; progresso: Progresso[] };

/**
 * Uma linha por pessoa: quem tem meta ou fato no mês (do painel) e quem está na equipe atual sem
 * nada ainda (com zero e "meta não definida"). Em ordem de nome. Id do painel sem nome lido fica com
 * um rótulo neutro, nunca some.
 */
export function linhasDaEquipe(dados: MetasDoBanco, pessoas: readonly PessoaDasMetas[], fase: FaseDoMes): LinhaDaEquipe[] {
  const porId = new Map(pessoas.map((p) => [p.id, p] as const));
  const doPainel = new Map(dados.vendedores.map((v) => [v.vendedorId, v] as const));
  const ids = [...new Set([...dados.vendedores.map((v) => v.vendedorId), ...pessoas.filter((p) => p.naEquipe).map((p) => p.id)])];
  return ids
    .map((id) => {
      const alvo = doPainel.get(id) ?? { metas: {}, realizado: REALIZADO_ZERO };
      return { pessoa: porId.get(id) ?? { id, nome: "Pessoa sem nome lido", naEquipe: false }, metas: alvo.metas, progresso: progressoDoAlvo(alvo, dados, fase) };
    })
    .sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome, "pt-BR") || a.pessoa.id.localeCompare(b.pessoa.id));
}

/** O gráfico de uma medida: quem tem meta (do maior atingimento ao menor) e depois quem só tem realizado; quem não tem nada fica fora. */
export function ordemNoGrafico(linhas: readonly LinhaDaEquipe[], medida: Medida) {
  return linhas
    .map((l) => ({ pessoa: l.pessoa, progresso: l.progresso.find((p) => p.medida === medida) as Progresso }))
    .filter((x) => x.progresso.meta !== null || x.progresso.realizado !== 0)
    .sort((a, b) => {
      const pa = a.progresso;
      const pb = b.progresso;
      if ((pa.atingido === null) !== (pb.atingido === null)) return pa.atingido === null ? 1 : -1;
      if (pa.atingido !== null && pb.atingido !== null && pa.atingido !== pb.atingido) return pb.atingido - pa.atingido;
      return pb.realizado - pa.realizado || a.pessoa.nome.localeCompare(b.pessoa.nome, "pt-BR");
    });
}

/** As metas vigentes de um alvo, em uma linha: "Vendido líquido: R$ 50.000,00 · Aparelhos: 20". */
export function resumoDasMetas(metas: MetasDoAlvo): string {
  const partes = ORDEM_DAS_MEDIDAS.filter((m) => metas[m] !== undefined).map((m) => `${MEDIDAS[m].curto}: ${formatarMedida(m, metas[m] as number)}`);
  return partes.length > 0 ? partes.join(" · ") : "Sem metas definidas";
}

// ---------------------------------------------------------------------------------------------
// As lojas no Início e nos Relatórios (G4c)
// ---------------------------------------------------------------------------------------------
export type SomaDasLojas = {
  /** Soma das metas das lojas que têm meta nesta medida; ausente quando nenhuma tem. */
  meta: number | undefined;
  /** Realizado só dessas lojas: a loja sem meta fica fora da conta, para a comparação ser justa. */
  realizado: number;
  comMeta: number;
  total: number;
};
export function somaDasLojas(d: MetasDasLojas, medida: Medida): SomaDasLojas {
  const comMeta = d.lojas.filter((l) => l.metas[medida] !== undefined);
  return {
    meta: comMeta.length > 0 ? comMeta.reduce((soma, l) => soma + (l.metas[medida] ?? 0), 0) : undefined,
    realizado: comMeta.reduce((soma, l) => soma + l.realizado[medida], 0),
    comMeta: comMeta.length,
    total: d.lojas.length,
  };
}
/** As quatro medidas de uma loja, ou da soma das lojas com meta (a rede), com o ritmo do mês. */
export function progressoDasLojas(d: MetasDasLojas, fase: FaseDoMes) {
  return ORDEM_DAS_MEDIDAS.map((m) => {
    const soma = somaDasLojas(d, m);
    // Sem meta, o realizado é o de todas as lojas (é só o que aconteceu); com meta, só o das lojas com meta.
    const realizado = soma.meta === undefined ? d.lojas.reduce((total, l) => total + l.realizado[m], 0) : soma.realizado;
    return { ...progresso(m, realizado, soma.meta, d, fase), comMeta: soma.comMeta, total: soma.total };
  });
}

/**
 * A meta do dia do valor vendido líquido, para a linha dos Relatórios: a meta do mês (de uma loja,
 * ou a soma das lojas da rede) dividida pelos dias do mês. Na rede, só quando todas as lojas lidas têm
 * meta no mês: faltando uma, a linha compararia a venda de todas com a meta de algumas. Dia de mês
 * sem meta (ou não lido) fica sem valor, e a linha se interrompe ali.
 */
export function metaDoDiaPorMes(meses: readonly MetasDasLojas[]): { porDia: (chave: string) => number | null; aviso: string | null } {
  const porMes = new Map<string, number | null>();
  const faltas: string[] = [];
  for (const d of meses) {
    const comMeta = d.lojas.filter((l) => l.metas.vendido_liquido !== undefined);
    const todas = d.lojas.length > 0 && comMeta.length === d.lojas.length;
    if (!todas && comMeta.length > 0) faltas.push(`em ${nomeDoMes(d.mes)}, ${comMeta.length} de ${d.lojas.length} lojas têm`);
    porMes.set(d.mes, todas ? Math.round(comMeta.reduce((soma, l) => soma + (l.metas.vendido_liquido ?? 0), 0) / d.diasNoMes) : null);
  }
  return {
    porDia: (chave) => porMes.get(`${chave.slice(0, 7)}-01`) ?? null,
    aviso: faltas.length > 0 ? `A meta da rede só aparece quando todas as lojas têm meta do vendido líquido no mês: ${faltas.join("; ")}.` : null,
  };
}
