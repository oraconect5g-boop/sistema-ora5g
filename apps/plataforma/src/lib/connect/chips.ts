// O estoque de chips da Nogle na tela (lote CONNECT-d; ORA-INV-011), SÓ LEITURA. O servidor (o worker) lê a Nogle a cada
// 30 minutos, das 7h às 22h, e grava no banco (connect_pdvs, connect_chips_nogle, connect_leituras_nogle); a tela lê o banco
// pela RLS. O servidor web não fala com a Nogle nem vê credencial; nada aqui transfere, ativa ou reserva chip.

export type PdvDaTela = {
  pdv_id: number;
  nome: string;
  cidade: string | null;
  uf: string | null;
  estoque_minimo: number | null;
  unidade_id: string | null;
  ativo: boolean;
  estoque_lido_em: string | null;
  fisicos: number;
  esims: number;
};
export type ChipDaTela = { iccid: string; pdv_id: number | null; tipo: string; repassado_em: string | null; lido_em: string };
export type LeituraDaTela = {
  numero: number;
  lida_em: string;
  pdvs: number;
  pdvs_lidos: number;
  mvno_fisicos: number | null;
  mvno_esims: number | null;
  falhas: number;
};

export const NOME_DO_TIPO: Record<string, string> = { fisico: "Físico", esim: "eSIM" };

export const ERROS_DOS_CHIPS = {
  ja_ligada: "Essa loja já está ligada a outro PDV da Nogle: desligue aquele antes.",
  so_loja_fisica: "Só uma loja física da rede se liga a um PDV da Nogle.",
  sem_permissao: "Ligar o PDV à loja é de quem gere a Ora Connect na rede (o dono) ou as integrações (o administrador).",
  dados: "Confira o PDV e a loja escolhidos.",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDosChips = keyof typeof ERROS_DOS_CHIPS;
export const ehErroDosChips = (v: unknown): v is ErroDosChips => typeof v === "string" && Object.hasOwn(ERROS_DOS_CHIPS, v);

/** O erro do banco na ligação (connect_ligar_pdv): OR051 = a loja já tem PDV; 22023 = não é loja física da rede. */
export function erroDosChips(erro: { code?: string } | null | undefined): ErroDosChips {
  const codigo = erro?.code;
  if (codigo === "OR051") return "ja_ligada";
  if (codigo === "22023") return "so_loja_fisica";
  if (codigo === "42501") return "sem_permissao";
  return "falha";
}

const minutosDoDia = (d: Date) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(d).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * A última leitura está em dia? Das 7h15 às 22h15 (Brasília), a leitura de 30 em 30 minutos deixa no máximo 45 minutos de
 * idade; fora desse horário, vale a última da noite (até 10 horas).
 */
export function situacaoDaLeitura(lidaEm: string | null | undefined, agora: Date): "sem_leitura" | "em_dia" | "atrasada" {
  if (!lidaEm) return "sem_leitura";
  const idade = (agora.getTime() - new Date(lidaEm).getTime()) / 60_000;
  const m = minutosDoDia(agora);
  const noHorario = m >= 7 * 60 + 15 && m <= 22 * 60 + 15;
  return idade <= (noHorario ? 45 : 10 * 60) ? "em_dia" : "atrasada";
}

/** "8955 1701 1033 5507 792": o ICCID em blocos de 4, para conferir no chip. */
export const iccidEmBlocos = (iccid: string) => iccid.replace(/(\d{4})(?=\d)/g, "$1 ");

/** A busca pelo ICCID: só os dígitos, de 4 a 20 (o fim do número basta). */
export function buscaDeIccid(valor: string | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length >= 4 && digitos.length <= 20 ? digitos : null;
}

/** Abaixo do estoque mínimo que a própria Nogle tem para o PDV (o "estoque mínimo de chips" do cadastro dela). */
export const abaixoDoMinimo = (p: Pick<PdvDaTela, "estoque_minimo" | "fisicos" | "esims">) =>
  p.estoque_minimo !== null && p.estoque_minimo > 0 && p.fisicos + p.esims < p.estoque_minimo;

/** Os PDVs ligados a uma loja (pelo nome da loja) e os outros (os ativos primeiro, pelo nome na Nogle). */
export function separarPdvs<T extends PdvDaTela>(pdvs: readonly T[], nomeDaLoja: (unidade: string) => string | undefined) {
  const comLoja = pdvs.filter((p) => p.unidade_id !== null)
    .map((p) => ({ ...p, loja: nomeDaLoja(p.unidade_id as string) ?? "Loja" }))
    .sort((a, b) => a.loja.localeCompare(b.loja, "pt-BR"));
  const outros = pdvs.filter((p) => p.unidade_id === null)
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));
  return { comLoja, outros };
}

/** A soma dos chips de uma lista de PDVs. */
export const somar = (pdvs: readonly Pick<PdvDaTela, "fisicos" | "esims">[]) =>
  pdvs.reduce((t, p) => ({ fisicos: t.fisicos + p.fisicos, esims: t.esims + p.esims }), { fisicos: 0, esims: 0 });
