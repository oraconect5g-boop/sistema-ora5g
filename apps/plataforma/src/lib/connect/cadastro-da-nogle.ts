// AUD-f (auditoria de e7f55b2), item 1: a busca do cadastro do cliente na Nogle pelo CPF ou CNPJ, para PREENCHER um formulário
// (a ativação, a atualização do cadastro e a compra de chip com entrega) ou AVISAR que o cadastro já existe (o cadastro novo).
// Regras puras da tela: o banco confere quem pede, a loja, a sessão, o documento e o limite; o worker lê só a /cliente/buscar
// (sem o histórico nem as linhas) e só o cadastro do mesmo documento. Aqui: o que cada resposta vira na tela e o que entra em
// cada campo. Nada é deduzido: só o campo que veio, só no campo vazio que a pessoa não mexeu, e só se couber (sem cortar).
// A cidade da Nogle é só referência (a resposta não traz o código da cidade da lista oficial). CRM e Nogle não se misturam:
// nada daqui vai para o cadastro de clientes do sistema.
import { cnpjValido, cpfValido } from "@ora5g/dominio";
import { CAMPOS_DO_CADASTRO, type CadastroParaPreencher, type CampoDoCadastro } from "@ora5g/dominio/nogle";

export { CAMPOS_DO_CADASTRO, type CampoDoCadastro };

/** O documento para buscar: o CPF (11) ou o CNPJ (14) válido, só os dígitos; o resto, nada. */
export function documentoParaBuscar(texto: unknown): string | null {
  const d = typeof texto === "string" ? texto.replace(/\D/g, "") : "";
  return (d.length === 11 && cpfValido(d)) || (d.length === 14 && cnpjValido(d)) ? d : null;
}

export const ERROS_DO_CADASTRO = {
  documento: "Digite um CPF ou CNPJ válido para buscar na Nogle.",
  limite: "Muitas buscas de cadastro na última hora: espere um pouco ou preencha à mão.",
  sem_permissao: "Seu papel não busca o cadastro na Nogle nesta loja.",
  falha: "Não foi possível buscar agora: tente de novo em instantes ou preencha à mão.",
} as const;
export type ErroDoCadastro = keyof typeof ERROS_DO_CADASTRO;
export function erroDoCadastro(erro: { code?: string } | null | undefined): ErroDoCadastro {
  return erro?.code === "OR056" ? "limite" : erro?.code === "42501" ? "sem_permissao" : erro?.code === "22023" ? "documento" : "falha";
}

/** A resposta da busca na tela. "descartada": a busca já não vale (o documento, a loja ou a sessão mudou, ou passou da hora). */
export type EstadoDoCadastro =
  | { estado: "esperando" }
  | { estado: "achado"; cadastro: CadastroParaPreencher }
  | { estado: "nao_encontrado"; mensagem: string }
  | { estado: "falhou"; mensagem: string }
  | { estado: "descartada" };

const SO_CAMPOS = new Set<string>([...CAMPOS_DO_CADASTRO, "cidade_na_nogle", "uf_na_nogle"]);
/** A resposta do banco (connect_cadastro_da_nogle) como estado da tela; só os campos conhecidos e só texto. */
export function lerRespostaDoCadastro(dados: unknown): EstadoDoCadastro {
  if (!dados || typeof dados !== "object") return { estado: "descartada" };
  const d = dados as { situacao?: unknown; mensagem?: unknown; resposta?: unknown };
  const mensagem = typeof d.mensagem === "string" ? d.mensagem.slice(0, 200) : "";
  if (d.situacao === "na_fila" || d.situacao === "consultando") return { estado: "esperando" };
  if (d.situacao === "nao_encontrada") return { estado: "nao_encontrado", mensagem: mensagem || "A Nogle não tem cadastro com este documento." };
  if (d.situacao === "respondida" && d.resposta && typeof d.resposta === "object") {
    const cadastro = Object.fromEntries(Object.entries(d.resposta as Record<string, unknown>)
      .filter(([k, v]) => SO_CAMPOS.has(k) && typeof v === "string" && v.trim() !== "")) as CadastroParaPreencher;
    return { estado: "achado", cadastro };
  }
  return { estado: "falhou", mensagem: mensagem || ERROS_DO_CADASTRO.falha };
}

/** Os nomes de cada campo do cadastro em cada formulário (o número do endereço muda de nome). */
export type CamposDoFormulario = Record<CampoDoCadastro, string>;
export const CAMPOS_DA_ATIVACAO: CamposDoFormulario = {
  nome: "nome", nascimento: "data_nascimento", email: "email", telefone: "telefone", cep: "cep", rua: "rua", numero: "numero_endereco",
  complemento: "complemento", bairro: "bairro",
};
export const CAMPOS_DAS_ACOES: CamposDoFormulario = { ...CAMPOS_DA_ATIVACAO, numero: "numero" };
export const NOMES_DOS_CAMPOS: Record<CampoDoCadastro, string> = {
  nome: "nome", nascimento: "nascimento", email: "e-mail", telefone: "telefone", cep: "CEP", rua: "rua", numero: "número",
  complemento: "complemento", bairro: "bairro",
};

/** Um campo do formulário como está agora: o valor, o limite de tamanho (-1 sem limite) e se a pessoa mexeu nele. */
export type CampoNaTela = { valor: string; maximo: number; mexido: boolean };
export type Preenchimento = {
  preencher: { nome: string; campo: CampoDoCadastro; valor: string }[];
  mantidos: CampoDoCadastro[];
  naoCouberam: CampoDoCadastro[];
  naoVieram: CampoDoCadastro[];
};

/**
 * O que entra em cada campo: só o que a Nogle mandou, só no campo vazio que a pessoa não mexeu desde a busca (o que ela
 * digitou fica), e só se couber no campo (o texto maior fica de fora, sem cortar). O que não veio fica como está.
 */
export function planoDePreenchimento(cadastro: CadastroParaPreencher, campos: CamposDoFormulario, tela: (nome: string) => CampoNaTela | null): Preenchimento {
  const plano: Preenchimento = { preencher: [], mantidos: [], naoCouberam: [], naoVieram: [] };
  for (const campo of CAMPOS_DO_CADASTRO) {
    const valor = cadastro[campo];
    const nome = campos[campo];
    const agora = tela(nome);
    if (!agora) continue;
    if (!valor) { plano.naoVieram.push(campo); continue; }
    if (agora.mexido || agora.valor.trim() !== "") { plano.mantidos.push(campo); continue; }
    if (agora.maximo >= 0 && valor.length > agora.maximo) { plano.naoCouberam.push(campo); continue; }
    plano.preencher.push({ nome, campo, valor });
  }
  return plano;
}

/** A cidade da Nogle, só como referência (a pessoa escolhe a cidade na lista oficial). */
export function cidadeDeReferencia(cadastro: CadastroParaPreencher): string | null {
  if (!cadastro.cidade_na_nogle) return null;
  return cadastro.uf_na_nogle ? `${cadastro.cidade_na_nogle} (${cadastro.uf_na_nogle})` : cadastro.cidade_na_nogle;
}

/** Uma lista em português: "nome, CEP e rua". */
export function listaDosCampos(campos: readonly CampoDoCadastro[]): string {
  const nomes = campos.map((c) => NOMES_DOS_CAMPOS[c]);
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}
