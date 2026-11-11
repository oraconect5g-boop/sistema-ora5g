// Cliente compartilhado da rede (lote L5a: ORA-CRM-001, ORA-CRM-003, ORA-CRM-007). Finalidades e o que
// cada uma pede, leitura do formulário e mensagens. O banco (cliente_salvar) decide tudo de novo; aqui só
// se evita ir ao banco com o que já se sabe errado. Mensagem só por código de catálogo.
import { cnpjValido, cpfValido, normalizarTelefone } from "@ora5g/dominio";

export const FINALIDADES = {
  nota_fiscal: { nome: "Nota fiscal no nome do cliente", pede: "CPF ou CNPJ" },
  ora_connect: { nome: "Ora Connect (chip e linha)", pede: "documento, telefone e, para pessoa física, a data de nascimento" },
  financiamento: { nome: "Financiamento (PayJoy e outros)", pede: "CPF, telefone, e-mail e data de nascimento" },
  assistencia: { nome: "Assistência técnica", pede: "telefone para avisar o cliente" },
  entrega: { nome: "Entrega no endereço", pede: "endereço completo" },
} as const;
export type Finalidade = keyof typeof FINALIDADES;
export const ehFinalidade = (v: unknown): v is Finalidade => typeof v === "string" && Object.hasOwn(FINALIDADES, v);
/** Nascimento e endereço só ficam guardados quando uma destas finalidades está marcada (dados mínimos). */
export const GUARDAM_NASCIMENTO: readonly Finalidade[] = ["ora_connect", "financiamento"];
export const GUARDAM_ENDERECO: readonly Finalidade[] = ["entrega", "ora_connect", "financiamento", "nota_fiscal"];

export const CANAIS = { whatsapp: "WhatsApp", sms: "SMS", email: "E-mail", ligacao: "Ligação" } as const;
export const FINALIDADES_DE_CONTATO = { ofertas: "Ofertas e campanhas", pos_venda: "Pós-venda e pesquisa de satisfação" } as const;
export const FONTES = { loja: "Na loja", whatsapp: "Pelo WhatsApp", online: "No site", telefone: "Por telefone" } as const;
export const CRITERIOS = { documento: "CPF ou CNPJ", telefone: "Telefone", codigo: "Código do cliente", nome: "Nome" } as const;
export type Criterio = keyof typeof CRITERIOS;
export const CAMPOS_REVELAVEIS = { documento: "CPF/CNPJ", telefone: "Telefone", email: "E-mail", nascimento: "Nascimento", endereco: "Endereço" } as const;
export type CampoRevelavel = keyof typeof CAMPOS_REVELAVEIS;
const UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);

export const ERROS_DO_CLIENTE = {
  dados: "Confira os dados digitados.",
  nome: "Informe o nome (de 2 a 120 letras).",
  tipo: "Escolha pessoa física ou empresa.",
  documento: "CPF (pessoa física) ou CNPJ (empresa) inválido.",
  telefone: "Telefone inválido: use o DDD e o número completo.",
  email: "E-mail inválido.",
  nascimento: "Data de nascimento inválida.",
  endereco: "Endereço incompleto: CEP, rua, número, bairro, cidade e UF.",
  identificador: "Informe o CPF/CNPJ ou o telefone: é por eles que o cliente é encontrado.",
  finalidade: "Faltam dados para a finalidade escolhida (ao lado de cada uma está o que ela pede).",
  minimo: "Data de nascimento e endereço só ficam guardados quando uma finalidade marcada pede (dados mínimos).",
  duplicado: "Já existe cliente com este CPF/CNPJ: busque pelo documento.",
  telefone_repetido: "Este telefone já está no cadastro de outro cliente. Se for outra pessoa (da família, por exemplo), marque a confirmação.",
  limite: "Muitas consultas seguidas: aguarde alguns minutos.",
  busca: "Digite o CPF/CNPJ ou o telefone completos: a busca nunca é parcial.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  consentimento: "Cadastre o contato deste canal (telefone ou e-mail) antes de registrar o consentimento.",
  permissao: "Sem permissão para esta ação com clientes.",
  nao_encontrado: "Cliente não encontrado.",
  chave: "Este formulário já foi usado com outros dados. Recarregue a tela.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDoCliente = keyof typeof ERROS_DO_CLIENTE;

export function erroDoCliente(erro: { code?: string; message?: string } | null | undefined): ErroDoCliente {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  const porCodigo: Record<string, ErroDoCliente> = { "42501": "permissao", P0002: "nao_encontrado", OR004: "chave", OR026: "duplicado", OR027: "telefone_repetido", OR028: "limite" };
  if (Object.hasOwn(porCodigo, codigo)) return porCodigo[codigo] as ErroDoCliente;
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDoCliente][] = [
    ["informe o motivo", "motivo"], ["busca nunca é parcial", "busca"], ["informe o nome", "nome"], ["pessoa física ou empresa", "tipo"],
    ["só fica guardad", "minimo"], ["informe o cpf/cnpj ou o telefone", "identificador"], ["cpf (pessoa física)", "documento"],
    ["telefone inválido", "telefone"], ["e-mail inválido", "email"], ["nascimento inválida", "nascimento"], ["endereço incompleto", "endereco"],
    ["cadastre o contato", "consentimento"], [" pede ", "finalidade"], ["é de pessoa física", "finalidade"],
  ];
  return regras.find(([t]) => m.includes(t))?.[1] ?? "dados";
}

export type Endereco = { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string };
export type DadosDoCliente = {
  tipo?: "pessoa_fisica" | "pessoa_juridica"; nome?: string; documento?: string; telefone?: string; email?: string; nascimento?: string;
  endereco?: Endereco; finalidades?: Finalidade[]; telefone_compartilhado?: true; remover?: string[];
};
type Formulario = { get: (nome: string) => unknown; getAll: (nome: string) => unknown[] };
const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/**
 * Lê o formulário de cadastro (edicao=false) ou de correção (edicao=true: campo vazio fica como está e
 * "remover" apaga). No cadastro já confere o que cada finalidade pede; na correção, quem junta com o que
 * está guardado é o banco.
 */
export function lerCliente(dados: Formulario, edicao: boolean): { ok: true; dados: DadosDoCliente } | { ok: false; erro: ErroDoCliente } {
  const saida: DadosDoCliente = {};
  const tipo = texto(dados.get("tipo"));
  if (tipo === "pessoa_fisica" || tipo === "pessoa_juridica") saida.tipo = tipo;
  else if (!edicao || tipo !== "") return { ok: false, erro: "tipo" };
  const nome = texto(dados.get("nome"));
  if (nome !== "") {
    if (nome.length < 2 || nome.length > 120) return { ok: false, erro: "nome" };
    saida.nome = nome;
  } else if (!edicao) return { ok: false, erro: "nome" };
  const documento = texto(dados.get("documento")).replace(/\D/g, "");
  if (documento !== "") {
    const valido = saida.tipo === "pessoa_juridica" ? cnpjValido(documento) : saida.tipo === "pessoa_fisica" ? cpfValido(documento) : cpfValido(documento) || cnpjValido(documento);
    if (!valido) return { ok: false, erro: "documento" };
    saida.documento = documento;
  }
  const telefoneDigitado = texto(dados.get("telefone"));
  if (telefoneDigitado !== "") {
    const telefone = normalizarTelefone(telefoneDigitado);
    if (!telefone) return { ok: false, erro: "telefone" };
    saida.telefone = telefone;
  }
  const email = texto(dados.get("email")).toLowerCase();
  if (email !== "") {
    if (email.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: "email" };
    saida.email = email;
  }
  const nascimento = texto(dados.get("nascimento"));
  if (nascimento !== "") {
    const data = new Date(`${nascimento}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento) || Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== nascimento
        || nascimento < "1900-01-01" || data.getTime() > Date.now()) return { ok: false, erro: "nascimento" };
    saida.nascimento = nascimento;
  }
  const campos = ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf"] as const;
  const endereco = Object.fromEntries(campos.map((c) => [c, texto(dados.get(`endereco_${c}`))]));
  if (campos.some((c) => endereco[c] !== "")) {
    const cep = (endereco.cep ?? "").replace(/\D/g, "");
    const uf = (endereco.uf ?? "").toUpperCase();
    const tamanho = (v: string | undefined, min: number, max: number) => (v ?? "").length >= min && (v ?? "").length <= max;
    if (!/^\d{8}$/.test(cep) || !tamanho(endereco.logradouro, 3, 120) || !tamanho(endereco.numero, 1, 10) || !tamanho(endereco.complemento, 0, 60)
        || !tamanho(endereco.bairro, 2, 60) || !tamanho(endereco.cidade, 2, 60) || !UFS.has(uf)) return { ok: false, erro: "endereco" };
    saida.endereco = { cep, logradouro: endereco.logradouro ?? "", numero: endereco.numero ?? "", bairro: endereco.bairro ?? "", cidade: endereco.cidade ?? "", uf,
      ...(endereco.complemento ? { complemento: endereco.complemento } : {}) };
  }
  const finalidades = [...new Set(dados.getAll("finalidade").filter(ehFinalidade))].sort();
  if (!edicao || dados.get("finalidades_enviadas") === "sim") saida.finalidades = finalidades;
  if (dados.get("telefone_compartilhado") === "sim") saida.telefone_compartilhado = true;
  if (edicao) {
    const remover = [...new Set(dados.getAll("remover").filter((v): v is string => typeof v === "string" && Object.hasOwn(CAMPOS_REVELAVEIS, v)))];
    if (remover.length > 0) saida.remover = remover;
    return { ok: true, dados: saida };
  }
  // Cadastro: dados mínimos por finalidade, a mesma regra do banco.
  if (!saida.documento && !saida.telefone) return { ok: false, erro: "identificador" };
  const tem = (f: Finalidade) => finalidades.includes(f);
  const pf = saida.tipo === "pessoa_fisica";
  if ((tem("nota_fiscal") && !saida.documento)
      || (tem("ora_connect") && (!saida.documento || !saida.telefone || (pf && !saida.nascimento)))
      || (tem("financiamento") && (!pf || !saida.documento || !saida.telefone || !saida.email || !saida.nascimento))
      || (tem("assistencia") && !saida.telefone) || (tem("entrega") && !saida.endereco)) return { ok: false, erro: "finalidade" };
  if ((saida.nascimento && !GUARDAM_NASCIMENTO.some(tem)) || (saida.endereco && !GUARDAM_ENDERECO.some(tem))) return { ok: false, erro: "minimo" };
  return { ok: true, dados: saida };
}

/** Confere o que se digitou na busca antes de ir ao banco (busca inválida não gasta o limite). */
export function valorDaBusca(criterio: string, valor: string): { ok: true; criterio: Criterio; valor: string } | { ok: false } {
  const v = valor.trim().slice(0, 80);
  if (criterio === "documento") {
    const d = v.replace(/\D/g, "");
    return (d.length === 11 && cpfValido(d)) || (d.length === 14 && cnpjValido(d)) ? { ok: true, criterio, valor: d } : { ok: false };
  }
  if (criterio === "telefone") {
    const t = normalizarTelefone(v);
    return t ? { ok: true, criterio, valor: t } : { ok: false };
  }
  if (criterio === "codigo") return /^\d{1,12}$/.test(v) ? { ok: true, criterio, valor: v } : { ok: false };
  if (criterio === "nome") return v.length >= 3 ? { ok: true, criterio, valor: v } : { ok: false };
  return { ok: false };
}

/** CPF 123.456.789-09, CNPJ 11.222.333/0001-81, telefone (41) 98765-4321 (dado revelado, só para exibir). */
export function formatarRevelado(campo: CampoRevelavel, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "não informado";
  if (campo === "documento" && typeof valor === "string") {
    if (valor.length === 11) return `${valor.slice(0, 3)}.${valor.slice(3, 6)}.${valor.slice(6, 9)}-${valor.slice(9)}`;
    if (valor.length === 14) return `${valor.slice(0, 2)}.${valor.slice(2, 5)}.${valor.slice(5, 8)}/${valor.slice(8, 12)}-${valor.slice(12)}`;
  }
  if (campo === "telefone" && typeof valor === "string") return `(${valor.slice(0, 2)}) ${valor.slice(2, -4)}-${valor.slice(-4)}`;
  if (campo === "nascimento" && typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return `${valor.slice(8, 10)}/${valor.slice(5, 7)}/${valor.slice(0, 4)}`;
  if (campo === "endereco" && typeof valor === "object") {
    const e = valor as Partial<Endereco>;
    const cep = (e.cep ?? "").replace(/^(\d{5})(\d{3})$/, "$1-$2");
    return `${e.logradouro ?? ""}, ${e.numero ?? ""}${e.complemento ? ` (${e.complemento})` : ""} · ${e.bairro ?? ""} · ${e.cidade ?? ""}/${e.uf ?? ""} · CEP ${cep}`;
  }
  return String(valor);
}
