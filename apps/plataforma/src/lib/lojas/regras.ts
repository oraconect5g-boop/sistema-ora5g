// Lojas da rede (lote L2: ORA-ORG-001, ORA-ORG-008). Confere o formulário antes de chamar o banco,
// que confere tudo de novo (permissão, CNPJ da raiz, pendências) e grava a auditoria com o motivo.
import { cnpjValido, formatarCnpj, normalizarTelefone } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";

export { formatarCnpj };

export const TIPOS_DE_LOJA = {
  loja_fisica: "Loja física",
  online: "Loja online",
  assistencia: "Assistência técnica",
  deposito: "Depósito",
  excecao: "Local de exceção (não vende)",
} as const;
export type TipoDeLoja = keyof typeof TIPOS_DE_LOJA;
export const ehTipoDeLoja = (valor: unknown): valor is TipoDeLoja => typeof valor === "string" && Object.hasOwn(TIPOS_DE_LOJA, valor);

export const DIAS_DA_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export type Horario = { dia: number; abre: string; fecha: string };

export const ERROS_DE_LOJAS = {
  dados: "Dados inválidos: confira os campos.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  codigo: "Código inválido: use letras minúsculas, números e hífen (2 a 40), por exemplo santa-candida.",
  nome: "Informe o nome da loja (até 80 letras).",
  tipo: "Escolha o tipo da loja.",
  uf: "UF inválida: use a sigla de duas letras, por exemplo PR.",
  cidade: "Cidade muito longa (até 80 letras).",
  cnpj: "CNPJ inválido: confira os 14 dígitos.",
  cnpj_apagar: "A loja já tem o CNPJ da filial: ele pode ser trocado, mas não apagado.",
  cnpj_raiz: "Este CNPJ não é da empresa escolhida (a raiz, os 8 primeiros dígitos, é de outra).",
  cnpj_repetido: "Este CNPJ já está em outra loja.",
  codigo_repetido: "Já existe uma loja com este código.",
  emissora: "Loja online precisa de CNPJ próprio ou de uma loja com CNPJ que emita as notas por ela.",
  telefone: "Telefone inválido: DDD e número (10 ou 11 dígitos).",
  cep: "CEP inválido (8 dígitos).",
  endereco: "Endereço inválido: confira rua (até 120), número (até 15), complemento (até 60) e bairro (até 80).",
  inscricao_estadual: "Inscrição estadual inválida: só números, ou ISENTO.",
  inscricao_municipal: "Inscrição municipal inválida (até 20 letras e números).",
  horarios: "Horários inválidos: em cada dia aberto, a abertura vem antes do fechamento (HH:MM).",
  vigencia: "A nova configuração vale de agora em diante ou de uma data futura: o passado não é reescrito.",
  vigencia_repetida: "Já existe outra versão começando nesse mesmo horário: escolha outro.",
  pendencias: "A loja ainda tem movimento em aberto e continua ativa.",
  inativa: "Loja inativa: reative a loja antes de registrar movimento nela.",
  regiao_nome: "Informe o nome da região (de 2 a 60 letras).",
  regiao_repetida: "Já existe outra região com este nome.",
  regiao_com_loja: "A região ainda tem loja ativa: mude a região das lojas antes de inativar.",
  regiao_inativa: "Região inativa: reative a região antes de pôr loja nela.",
  permissao: "Sem permissão para esta loja.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDeLojas = keyof typeof ERROS_DE_LOJAS;

// O que impede inativar (as mesmas palavras da mensagem OR019 do banco) e como resolver.
export const PENDENCIAS = {
  caixa_aberto: { texto: "caixa aberto", resolver: "Feche o caixa da loja." },
  caixa_sem_conferencia: { texto: "caixa fechado sem conferência", resolver: "Confira os caixas já fechados." },
  saldo: { texto: "saldo em estoque", resolver: "Transfira o estoque para outra loja ou registre a baixa." },
  aparelhos: { texto: "aparelho ou chip na loja", resolver: "Transfira os aparelhos e chips (IMEI/ICCID) para outra loja." },
  reservas: { texto: "reserva ativa", resolver: "Libere ou conclua as reservas." },
  transferencias: { texto: "transferência pendente", resolver: "Conclua, recuse ou cancele as transferências." },
  vendas: { texto: "venda em aberto", resolver: "Conclua ou cancele as vendas em aberto." },
  notas: { texto: "nota fiscal pendente", resolver: "Resolva os pedidos de nota fiscal." },
} as const;
export type Pendencia = keyof typeof PENDENCIAS;
export const ehPendencia = (valor: string): valor is Pendencia => Object.hasOwn(PENDENCIAS, valor);

export function pendenciasDaMensagem(mensagem: string | null | undefined): Pendencia[] {
  const texto = mensagem ?? "";
  return (Object.keys(PENDENCIAS) as Pendencia[]).filter((p) => texto.includes(PENDENCIAS[p].texto));
}

// Erro do banco → chave do catálogo (a tela nunca mostra o texto cru do banco).
/**
 * Por que o local não vende (nulo quando vende), no selo da tela Lojas: a loja física sem o CNPJ da filial (ORG-a, OR038
 * no banco), o depósito (D-043, padrão do CD-a, OR043) e o local de exceção, DEFEITOS (ADR-007). A loja online e a
 * assistência seguem as próprias regras.
 */
export function porQueNaoVende(l: { tipo: string; cnpj: string | null }): string | null {
  if (l.tipo === "excecao") return "não vende: local de exceção";
  if (l.tipo === "deposito") return "não vende: depósito";
  if (l.tipo === "loja_fisica" && l.cnpj === null) return "não vende: falta o CNPJ";
  return null;
}
/** O local vende? */
export const vendeNaLoja = (l: { tipo: string; cnpj: string | null }) => porQueNaoVende(l) === null;

export function erroDeLojas(erro: { code?: string; message?: string } | null | undefined): ErroDeLojas {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "OR019") return m.includes("reative") ? "inativa" : "pendencias";
  if (codigo === "42501" || codigo === "P0002") return "permissao";
  if (codigo === "OR020") return "regiao_com_loja";
  if (codigo === "23505") return m.includes("região") ? "regiao_repetida" : m.includes("cnpj") ? "cnpj_repetido" : m.includes("vigência") ? "vigencia_repetida" : "codigo_repetido";
  if (codigo === "23514") return m.includes("emissora") ? "emissora" : m.includes("cnpj") ? "cnpj_raiz" : "dados";
  if (codigo === "22023") {
    const regras: [string, ErroDeLojas][] = [
      ["informe o motivo", "motivo"], ["nome da região", "regiao_nome"], ["região inativa", "regiao_inativa"],
      ["código inválido", "codigo"], ["nome da loja", "nome"], ["tipo de loja", "tipo"],
      ["uf inválida", "uf"], ["cidade", "cidade"], ["cnpj da filial", "cnpj_apagar"], ["loja online", "emissora"],
      ["cnpj", "cnpj"], ["telefone", "telefone"], ["cep", "cep"], ["endereço", "endereco"],
      ["inscrição estadual", "inscricao_estadual"], ["inscrição municipal", "inscricao_municipal"], ["horários", "horarios"],
      ["vigência", "vigencia"],
    ];
    return regras.find(([trecho]) => m.includes(trecho))?.[1] ?? "dados";
  }
  return "falha";
}

type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroDeLojas };
const falha = <T>(erro: ErroDeLojas): Resultado<T> => ({ ok: false, erro });
const texto = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");
export const motivoDeLojas = (valor: unknown) => {
  const t = texto(valor);
  return t.length >= 3 && t.length <= 200 ? t : null;
};

// CNPJ digitado: vazio → null; com letras ou dígito verificador errado → inválido.
function lerCnpj(valor: unknown): { cnpj: string | null } | null {
  const bruto = texto(valor);
  if (!bruto) return { cnpj: null };
  if (!/^[\d\s./-]+$/.test(bruto)) return null;
  const digitos = bruto.replace(/\D/g, "");
  return cnpjValido(digitos) ? { cnpj: digitos } : null;
}
function lerUfECidade(uf: unknown, cidade: unknown): { uf: string | null; cidade: string | null } | ErroDeLojas {
  const sigla = texto(uf).toUpperCase() || null;
  if (sigla && !/^[A-Z]{2}$/.test(sigla)) return "uf";
  const nomeDaCidade = texto(cidade) || null;
  if (nomeDaCidade && nomeDaCidade.length > 80) return "cidade";
  return { uf: sigla, cidade: nomeDaCidade };
}

export type NovaLoja = {
  empresa: string; codigo: string; nome: string; tipo: TipoDeLoja; cnpj: string | null; uf: string | null;
  cidade: string | null; emissora: string | null; motivo: string;
};
export function validarNovaLoja(c: Record<string, unknown>): Resultado<NovaLoja> {
  if (!ehUuid(c.empresa)) return falha("dados");
  const codigo = texto(c.codigo).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(codigo)) return falha("codigo");
  const nome = texto(c.nome);
  if (!nome || nome.length > 80) return falha("nome");
  if (!ehTipoDeLoja(c.tipo)) return falha("tipo");
  const lido = lerCnpj(c.cnpj);
  if (!lido) return falha("cnpj");
  // Desde o ORG-a (17/11), a loja física pode entrar sem o CNPJ (o cadastro operacional): ela só não vende até ele chegar.
  const emissora = c.tipo === "online" && ehUuid(c.emissora) ? c.emissora : null;
  if (c.tipo === "online" && !lido.cnpj && !emissora) return falha("emissora");
  const lugar = lerUfECidade(c.uf, c.cidade);
  if (typeof lugar === "string") return falha(lugar);
  const motivo = motivoDeLojas(c.motivo);
  if (!motivo) return falha("motivo");
  return { ok: true, dados: { empresa: c.empresa, codigo, nome, tipo: c.tipo, cnpj: lido.cnpj, ...lugar, emissora, motivo } };
}

export type EdicaoDeLoja = { unidade: string; nome: string; cnpj: string | null; uf: string | null; cidade: string | null; motivo: string };
export function validarEdicao(c: Record<string, unknown>): Resultado<EdicaoDeLoja> {
  if (!ehUuid(c.unidade)) return falha("dados");
  const nome = texto(c.nome);
  if (!nome || nome.length > 80) return falha("nome");
  const lido = lerCnpj(c.cnpj);
  if (!lido) return falha("cnpj");
  // Apagar o CNPJ de uma loja que já o tem: quem decide é o banco, que conhece a loja (ORG-a).
  const lugar = lerUfECidade(c.uf, c.cidade);
  if (typeof lugar === "string") return falha(lugar);
  const motivo = motivoDeLojas(c.motivo);
  if (!motivo) return falha("motivo");
  return { ok: true, dados: { unidade: c.unidade, nome, cnpj: lido.cnpj, ...lugar, motivo } };
}

// ---------------------------------------------------------------------------------------------
// Configuração com vigência
// ---------------------------------------------------------------------------------------------
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Deslocamento de São Paulo, em minutos, no instante dado (hoje −180; o cálculo não supõe isso). */
function deslocamentoDeSaoPaulo(instante: Date): number {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", timeZoneName: "longOffset" })
    .formatToParts(instante).find((p) => p.type === "timeZoneName")?.value ?? "GMT-03:00";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(nome);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** "2026-11-12T08:00" (campo datetime-local, hora de São Paulo) → instante ISO; inválido → null. */
export function horaDeSaoPauloParaIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [ano, mes, dia, hora, minuto] = m.slice(1).map(Number) as [number, number, number, number, number];
  const comoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const conferida = new Date(comoUtc);
  if (conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) return null;
  return new Date(comoUtc - deslocamentoDeSaoPaulo(conferida) * 60_000).toISOString();
}

/** Instante ISO → "2026-11-12T08:00" para preencher o campo datetime-local (hora de São Paulo). */
export function isoParaHoraDeSaoPaulo(iso: string): string {
  const instante = new Date(iso);
  return new Date(instante.getTime() + deslocamentoDeSaoPaulo(instante) * 60_000).toISOString().slice(0, 16);
}

export type DadosDaConfiguracao = {
  telefone: string | null; cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; inscricao_estadual: string | null; inscricao_municipal: string | null; horarios: Horario[];
};
export type NovaConfiguracao = { unidade: string; dados: DadosDaConfiguracao; vigenteDesde: string | null; motivo: string };

export function validarConfiguracao(campo: (nome: string) => unknown, agora: Date = new Date()): Resultado<NovaConfiguracao> {
  const unidade = campo("unidade");
  if (!ehUuid(unidade)) return falha("dados");
  const telefoneDigitado = texto(campo("telefone"));
  const telefone = telefoneDigitado ? normalizarTelefone(telefoneDigitado) : null;
  if (telefoneDigitado && !telefone) return falha("telefone");
  const cepDigitado = texto(campo("cep"));
  const cep = cepDigitado ? cepDigitado.replace(/\D/g, "") : null;
  if (cepDigitado && (!/^[\d\s.-]+$/.test(cepDigitado) || !/^\d{8}$/.test(cep ?? ""))) return falha("cep");
  const logradouro = texto(campo("logradouro")) || null;
  const numero = texto(campo("numero")) || null;
  const complemento = texto(campo("complemento")) || null;
  const bairro = texto(campo("bairro")) || null;
  if ((logradouro && (logradouro.length < 2 || logradouro.length > 120)) || (numero && numero.length > 15)
      || (complemento && complemento.length > 60) || (bairro && (bairro.length < 2 || bairro.length > 80))) return falha("endereco");
  const ieDigitada = texto(campo("inscricao_estadual")).replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (ieDigitada && !/^(\d{2,14}|ISENTO)$/.test(ieDigitada)) return falha("inscricao_estadual");
  const im = texto(campo("inscricao_municipal")) || null;
  if (im && !/^[0-9A-Za-z./-]{1,20}$/.test(im)) return falha("inscricao_municipal");

  const horarios: Horario[] = [];
  for (let dia = 0; dia < 7; dia++) {
    if (campo(`aberto_${dia}`) !== "on") continue;
    const abre = texto(campo(`abre_${dia}`));
    const fecha = texto(campo(`fecha_${dia}`));
    if (!HORA.test(abre) || !HORA.test(fecha) || abre >= fecha) return falha("horarios");
    horarios.push({ dia, abre, fecha });
  }

  let vigenteDesde: string | null = null;
  if (campo("quando") === "data") {
    vigenteDesde = horaDeSaoPauloParaIso(texto(campo("vigencia")));
    if (!vigenteDesde || new Date(vigenteDesde).getTime() <= agora.getTime()) return falha("vigencia");
  }
  const motivo = motivoDeLojas(campo("motivo"));
  if (!motivo) return falha("motivo");
  return {
    ok: true,
    dados: {
      unidade,
      dados: { telefone, cep, logradouro, numero, complemento, bairro, inscricao_estadual: ieDigitada || null, inscricao_municipal: im, horarios },
      vigenteDesde,
      motivo,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------------------------
/** Horários agrupados: dias seguidos com o mesmo horário viram "Seg a Sex 09:00–18:00". */
export function textoDosHorarios(horarios: readonly Horario[] | null | undefined): string {
  const ordenados = [...(horarios ?? [])].sort((a, b) => a.dia - b.dia);
  if (ordenados.length === 0) return "sem horário cadastrado";
  const grupos: { de: number; ate: number; abre: string; fecha: string }[] = [];
  for (const h of ordenados) {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.ate === h.dia - 1 && ultimo.abre === h.abre && ultimo.fecha === h.fecha) ultimo.ate = h.dia;
    else grupos.push({ de: h.dia, ate: h.dia, abre: h.abre, fecha: h.fecha });
  }
  return grupos
    .map((g) => `${DIAS_CURTOS[g.de]}${g.ate > g.de ? `${g.ate === g.de + 1 ? " e " : " a "}${DIAS_CURTOS[g.ate]}` : ""} ${g.abre}–${g.fecha}`)
    .join(" · ");
}

export function formatarTelefone(digitos: string | null | undefined): string {
  if (!digitos) return "";
  if (digitos.length === 11) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  if (digitos.length === 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return digitos;
}

export const formatarCep = (digitos: string | null | undefined) => (digitos && digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos ?? "");

/** "Rua X, 100 – Sala 2 – Centro – 80010-000"; partes vazias saem. */
export function textoDoEndereco(c: { logradouro?: string | null; numero?: string | null; complemento?: string | null; bairro?: string | null; cep?: string | null }) {
  const rua = [c.logradouro, c.numero].filter(Boolean).join(", ");
  return [rua, c.complemento, c.bairro, formatarCep(c.cep)].filter(Boolean).join(" – ");
}

/** O que falta na configuração de uma loja ativa que vende (para o resumo do topo). */
export function lacunasDaLoja(l: { tipo: string; status: string; cnpj?: string | null; telefone: string | null; logradouro: string | null; horarios: unknown }) {
  if (l.status !== "ativa" || l.tipo === "excecao" || l.tipo === "deposito") return [];
  const faltas: string[] = [];
  // ORG-a: a loja física sem o CNPJ da filial existe, mas não vende até ele chegar.
  if (l.tipo === "loja_fisica" && l.cnpj === null) faltas.push("CNPJ (sem ele, a loja não vende)");
  if (!l.telefone) faltas.push("telefone");
  if (l.tipo !== "online" && !l.logradouro) faltas.push("endereço");
  if (!Array.isArray(l.horarios) || l.horarios.length === 0) faltas.push("horário");
  return faltas;
}

// ORG-009: o formulário da região (o banco confere de novo a permissão, o nome repetido e a loja ativa nela).
export type DadosDaRegiao = { id: string | null; nome: string; ativa: boolean | null; motivo: string };
export function validarRegiao(c: Record<string, unknown>): Resultado<DadosDaRegiao> {
  const id = c.id === undefined || c.id === null || c.id === "" ? null : c.id;
  if (id !== null && !ehUuid(id)) return falha("dados");
  const nome = texto(c.nome).replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 60) return falha("regiao_nome");
  const motivo = motivoDeLojas(c.motivo);
  if (!motivo) return falha("motivo");
  // Caixa "ativa": marcada → true; desmarcada → false; sem o campo (região nova) → null (o banco mantém).
  const ativa = c.tem_ativa === "1" ? c.ativa === "on" : null;
  return { ok: true, dados: { id: id as string | null, nome, ativa, motivo } };
}
