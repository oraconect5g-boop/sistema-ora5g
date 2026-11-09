// Regras puras da tela da Ora Connect (ADR-005): ler o formulário e escolher a mensagem. O banco
// valida tudo de novo; o servidor web nunca fala com a Contel (só o worker do servidor).
import { cpfValido } from "@ora5g/dominio";
import { linhaValida, type TipoOperacao } from "@ora5g/dominio/nogle";

export const ERROS_DO_CONNECT = {
  nao_habilitada: "Esta operação ainda não foi liberada: falta a homologação com a Contel.",
  chip_no_estoque: "Este chip ainda está no estoque: venda o chip no PDV antes de ativar.",
  em_andamento: "Já existe operação em andamento (ou feita) para este chip, linha ou serviço pago.",
  chave: "Essa ação já foi feita com outro conteúdo. Recarregue a tela.",
  sem_permissao: "Você não tem permissão para isso (quem registrou não resolve a própria operação).",
  nao_encontrado: "Não encontrado: plano fora da lista da Contel, serviço não pago nesta loja ou operação já alterada.",
  dados: "Confira os dados digitados.",
  documento: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.",
  linha: "Linha com DDD: 11 dígitos (ex.: 51 99999-9999).",
  motivo: "Informe o motivo (fica na auditoria).",
  evidencia: "Descreva a evidência com pelo menos 10 caracteres (fica na auditoria).",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDoConnect = keyof typeof ERROS_DO_CONNECT;

const DO_BANCO: Record<string, ErroDoConnect> = {
  OR004: "chave", OR011: "chip_no_estoque", OR012: "nao_habilitada", OR013: "em_andamento",
  "42501": "sem_permissao", P0002: "nao_encontrado", "22023": "dados",
};
export function erroDoConnect(erro: { code?: string } | null | undefined): ErroDoConnect {
  const codigo = erro?.code;
  return codigo && Object.hasOwn(DO_BANCO, codigo) ? (DO_BANCO[codigo] as ErroDoConnect) : "falha";
}

type Formulario = { get: (nome: string) => unknown };
const texto = (dados: Formulario, nome: string, maximo = 120) => {
  const valor = dados.get(nome);
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
};
const digitos = (valor: string) => valor.replace(/\D/g, "");
const ehUuid = (valor: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(valor);

export type Pedido = Record<string, unknown>;

/**
 * Pedido no formato de connect_registrar. Plano, DDD, cidade e operadora são códigos das listas
 * oficiais (o valor nunca vem da tela). O serviço pago (SALDO) é o item da venda concluída.
 */
export function lerPedido(tipo: TipoOperacao, dados: Formulario): { ok: true; pedido: Pedido } | { ok: false; erro: ErroDoConnect } {
  const vendaItem = texto(dados, "venda_item", 36);
  if (vendaItem && !ehUuid(vendaItem)) return { ok: false, erro: "dados" };
  const comItem = vendaItem ? { venda_item: vendaItem } : {};
  if (tipo === "portabilidade") {
    const linha = digitos(texto(dados, "linha"));
    const doadora = digitos(texto(dados, "linha_doadora"));
    if (!linhaValida(linha) || !linhaValida(doadora)) return { ok: false, erro: "linha" };
    const operadora = texto(dados, "operadora", 9);
    if (!/^\d{1,9}$/.test(operadora)) return { ok: false, erro: "dados" };
    return { ok: true, pedido: { linha, linha_doadora: doadora, operadora: Number(operadora), ...comItem } };
  }
  const metodo = texto(dados, "metodo", 5);
  const plano = texto(dados, "plano", 9);
  if ((metodo !== "LINK" && metodo !== "SALDO") || !/^\d{1,9}$/.test(plano)) return { ok: false, erro: "dados" };
  if (tipo === "recarga") {
    const linha = digitos(texto(dados, "linha"));
    if (!linhaValida(linha)) return { ok: false, erro: "linha" };
    return { ok: true, pedido: { metodo, plano: Number(plano), linha, ...comItem } };
  }
  const esim = dados.get("esim") === "on";
  const iccid = digitos(texto(dados, "iccid", 30));
  const ddd = texto(dados, "ddd", 2);
  const documento = digitos(texto(dados, "documento", 20));
  if (!/^[1-9]{2}$/.test(ddd) || (!esim && !iccid)) return { ok: false, erro: "dados" };
  if (!(documento.length === 11 && cpfValido(documento)) && documento.length !== 14) return { ok: false, erro: "documento" };
  const opcional = (nome: string, maximo = 120) => texto(dados, nome, maximo) || undefined;
  const cidade = texto(dados, "id_cidade", 9);
  const cliente = {
    nome: texto(dados, "nome"),
    ...(documento.length === 11 ? { cpf: documento, data_nascimento: opcional("data_nascimento", 10) } : { cnpj: documento }),
    email: opcional("email", 200),
    telefone: digitos(texto(dados, "telefone", 20)) || undefined,
    endereco: {
      rua: texto(dados, "rua"), numero: texto(dados, "numero_endereco", 20), complemento: opcional("complemento"),
      bairro: texto(dados, "bairro"), cep: digitos(texto(dados, "cep", 10)), id_cidade: /^\d{1,9}$/.test(cidade) ? Number(cidade) : undefined,
    },
  };
  return { ok: true, pedido: { metodo, plano: Number(plano), ddd: Number(ddd), ...(esim ? { esim: true } : { iccid }), cliente, ...comItem } };
}
