// Funil de oportunidades e agenda (lote L5b: ORA-CRM-004, ORA-CRM-005). Catálogos, leitura dos formulários
// e mensagens. O banco decide tudo de novo; aqui só se evita ir até ele com o que já se sabe errado.

export const ETAPAS = {
  novo: { nome: "Novo", tom: "info" },
  contato: { nome: "Em contato", tom: "info" },
  proposta: { nome: "Proposta", tom: "aviso" },
  negociacao: { nome: "Negociação", tom: "aviso" },
  ganha: { nome: "Ganha", tom: "sucesso" },
  perdida: { nome: "Perdida", tom: "perigo" },
} as const;
export type Etapa = keyof typeof ETAPAS;
export const ETAPAS_ABERTAS: readonly Etapa[] = ["novo", "contato", "proposta", "negociacao"];
export const ehEtapa = (v: unknown): v is Etapa => typeof v === "string" && Object.hasOwn(ETAPAS, v);

export const ORIGENS = {
  loja: "Na loja", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", google: "Google", site: "Site", indicacao: "Indicação",
  telefone: "Telefone", outro: "Outro",
} as const;
export const MOTIVOS_DE_PERDA = {
  preco: "Preço", sem_estoque: "Sem o produto", concorrencia: "Comprou em outro lugar", credito_negado: "Crédito negado",
  sem_resposta: "Parou de responder", desistiu: "Desistiu", outro: "Outro (explique)",
} as const;
export const TIPOS_DE_ATIVIDADE = { ligacao: "Ligação", mensagem: "Mensagem", visita: "Visita", tarefa: "Tarefa" } as const;

export const ERROS_DO_CRM = {
  dados: "Confira os dados digitados.",
  cliente: "Escolha o cliente pela busca (CPF ou telefone completos).",
  origem: "Escolha de onde veio o contato.",
  interesse: "Descreva o interesse (de 3 a 200 letras), por exemplo \"Galaxy A15 e chip\".",
  valor: "Valor estimado inválido. Use, por exemplo, 1.299,90.",
  proximo_passo: "Informe o próximo passo e quando (os dois), de hoje até um ano.",
  motivo_perda: "Escolha o motivo da perda; em \"outro\", explique na observação.",
  venda: "A venda precisa estar concluída e ligada ao mesmo cliente.",
  encerrada: "Oportunidade encerrada: a gerência reabre, com motivo.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica no histórico.",
  responsavel: "O responsável precisa atender nesta loja.",
  nota: "Escreva a anotação (de 3 a 500 letras).",
  atividade: "Escolha o tipo, descreva a atividade (de 3 a 200 letras) e o vencimento (de hoje até um ano).",
  resultado: "Conte o resultado (de 3 a 300 letras).",
  atividade_encerrada: "Esta atividade já foi encerrada.",
  permissao: "Sem permissão para esta ação.",
  nao_encontrada: "Não encontrada (ou não é sua).",
  chave: "Este formulário já foi usado com outros dados. Recarregue a tela.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDoCrm = keyof typeof ERROS_DO_CRM;

export function erroDoCrm(erro: { code?: string; message?: string } | null | undefined): ErroDoCrm {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501") return m.includes("reabrir") ? "encerrada" : "permissao";
  if (codigo === "P0002") return m.includes("cliente") ? "cliente" : "nao_encontrada";
  if (codigo === "OR004") return "chave";
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDoCrm][] = [
    ["atividade já encerrada", "atividade_encerrada"], ["origem", "origem"], ["interesse", "interesse"], ["valor estimado", "valor"], ["próximo passo", "proximo_passo"], ["motivo da perda", "motivo_perda"],
    ["outro", "motivo_perda"], ["venda", "venda"], ["encerrada", "encerrada"], ["informe o motivo", "motivo"], ["responsável", "responsavel"],
    ["anotação", "nota"], ["resultado", "resultado"], ["atividade", "atividade"], ["vencimento", "atividade"], ["tipo", "atividade"],
  ];
  return regras.find(([t]) => m.includes(t))?.[1] ?? "dados";
}

type Formulario = { get: (nome: string) => unknown };
const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/**
 * "2026-11-12T14:30" (campo datetime-local) no horário de Brasília → instante com fuso (-03:00; o Brasil não
 * tem horário de verão desde 2019). Vazio → null; inválido → undefined.
 */
export function dataLocalParaIso(valor: unknown): string | null | undefined {
  const v = texto(valor);
  if (v === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return undefined;
  const iso = `${v}:00-03:00`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

/** Instante → "2026-11-12T14:30" no horário de Brasília, para preencher um campo datetime-local. */
export function paraCampoLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(data).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

/** Reais digitados ("1.299,90") → centavos; vazio → null; inválido → undefined. */
export function centavosDigitados(valor: unknown): number | null | undefined {
  const v = texto(valor);
  if (v === "") return null;
  if (!/^\d{1,3}(\.?\d{3})*(,\d{1,2})?$/.test(v)) return undefined;
  const [inteiro, decimal = ""] = v.replace(/\./g, "").split(",");
  return Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
}

export type ProximoPasso = { proximo_passo?: string; proximo_passo_em?: string };
export function lerProximoPasso(dados: Formulario): { ok: true; passo: ProximoPasso } | { ok: false; erro: ErroDoCrm } {
  const passo = texto(dados.get("proximo_passo"));
  const quando = dataLocalParaIso(dados.get("proximo_passo_em"));
  if (quando === undefined || (passo === "") !== (quando === null) || (passo !== "" && (passo.length < 3 || passo.length > 200))) return { ok: false, erro: "proximo_passo" };
  return { ok: true, passo: passo ? { proximo_passo: passo, proximo_passo_em: quando as string } : {} };
}

export type DadosDaOportunidade = { origem: string; campanha?: string; interesse: string; valor_estimado?: number } & ProximoPasso;
export function lerOportunidade(dados: Formulario): { ok: true; dados: DadosDaOportunidade } | { ok: false; erro: ErroDoCrm } {
  const origem = texto(dados.get("origem"));
  if (!Object.hasOwn(ORIGENS, origem)) return { ok: false, erro: "origem" };
  const interesse = texto(dados.get("interesse"));
  if (interesse.length < 3 || interesse.length > 200) return { ok: false, erro: "interesse" };
  const campanha = texto(dados.get("campanha"));
  if (campanha && (campanha.length < 2 || campanha.length > 120)) return { ok: false, erro: "dados" };
  const valor = centavosDigitados(dados.get("valor_estimado"));
  if (valor === undefined || (valor !== null && valor > 100_000_000)) return { ok: false, erro: "valor" };
  const passo = lerProximoPasso(dados);
  if (!passo.ok) return passo;
  return { ok: true, dados: { origem, interesse, ...(campanha ? { campanha } : {}), ...(valor !== null ? { valor_estimado: valor } : {}), ...passo.passo } };
}

export type DadosDaAtividade = { tipo: string; descricao: string; vence_em: string };
export function lerAtividade(dados: Formulario): { ok: true; dados: DadosDaAtividade } | { ok: false; erro: ErroDoCrm } {
  const tipo = texto(dados.get("tipo"));
  const descricao = texto(dados.get("descricao"));
  const vence = dataLocalParaIso(dados.get("vence_em"));
  if (!Object.hasOwn(TIPOS_DE_ATIVIDADE, tipo) || descricao.length < 3 || descricao.length > 200 || !vence) return { ok: false, erro: "atividade" };
  return { ok: true, dados: { tipo, descricao, vence_em: vence } };
}
