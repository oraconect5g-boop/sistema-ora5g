// Regras puras da tela da Ora Connect (ADR-005): ler o formulário e escolher a mensagem. O banco
// valida tudo de novo; o servidor web nunca fala com a Nogle (só o worker do servidor).
import { cpfValido } from "@ora5g/dominio";
import { linhaValida, type TipoOperacao } from "@ora5g/dominio/nogle";

export const ERROS_DO_CONNECT = {
  nao_habilitada: "Esta operação ainda não foi liberada: falta a homologação com a Nogle.",
  chip_no_estoque: "Este chip ainda está no estoque: venda o chip no PDV antes de ativar.",
  em_andamento: "Já existe operação em andamento (ou feita) para este chip, linha ou serviço pago.",
  chave: "Essa ação já foi feita com outro conteúdo. Recarregue a tela.",
  sem_permissao: "Você não tem permissão para isso (quem registrou não resolve a própria operação).",
  nao_encontrado: "Não encontrado: plano fora da lista da Nogle, serviço não pago nesta loja ou operação já alterada.",
  dados: "Confira os dados digitados.",
  documento: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.",
  linha: "Linha com DDD: 11 dígitos (ex.: 51 99999-9999).",
  motivo: "Informe o motivo (fica na auditoria).",
  evidencia: "Descreva a evidência com pelo menos 10 caracteres (fica na auditoria).",
  sem_servico_pago: "O crédito da carteira (SALDO) pede o serviço pago no caixa: venda a ativação ou a recarga no PDV antes, ou escolha o Pix da Nogle.",
  outro_plano: "O serviço pago no caixa é de outro plano: escolha a venda do plano pedido, ou venda no caixa o serviço do plano certo.",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDoConnect = keyof typeof ERROS_DO_CONNECT;

const DO_BANCO: Record<string, ErroDoConnect> = {
  OR004: "chave", OR011: "chip_no_estoque", OR012: "nao_habilitada", OR013: "em_andamento", OR055: "outro_plano",
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
 * oficiais (o valor nunca vem da tela). O serviço pago no caixa é o item da venda concluída (obrigatório no SALDO;
 * no Pix da Nogle, diz que quem paga o link é a loja).
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
  // D-062 (o proprietário, 25/11: "não com o crédito da Nogle"): o Pix da Nogle (LINK) é o padrão, com o serviço recebido
  // no caixa (quem paga o link é a loja, com o dinheiro do cliente) ou sem ele (o cliente paga direto à Nogle, na hora).
  // O crédito da carteira (SALDO) segue pedindo o serviço pago no caixa; o banco confere tudo de novo.
  if (metodo === "SALDO" && !vendaItem) return { ok: false, erro: "sem_servico_pago" };
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

/** Início de uma janela de N dias até agora (ISO), para filtrar os serviços pagos recentes. */
export const inicioDaJanela = (dias: number, agora: Date = new Date()) => new Date(agora.getTime() - dias * 86_400_000).toISOString();

/**
 * O link de pagamento da Nogle (o Pix da Nogle; CONNECT-l) que a tela mostra no QR Code e no botão: só https, sem
 * espaço nem aspas, até 500 caracteres (o tamanho que o banco guarda). Fora disso, a tela não mostra.
 */
export const linkDePagamento = (link: string | null | undefined): string | null =>
  typeof link === "string" && link.length <= 500 && /^https:\/\/[^\s"'<>\\]+$/.test(link) ? link : null;

/** Quem paga o Pix da Nogle: com o serviço recebido no caixa, a loja (o cliente já pagou); sem ele, o cliente. */
export const quemPagaOPix = (vendaItem: string | null | undefined): "loja" | "cliente" => (vendaItem ? "loja" : "cliente");

/**
 * AUD-f (auditoria de e7f55b2): o plano de um serviço pago no caixa, pelo código do produto, com a mesma regra do banco (o
 * connect_registrar recusa com OR055 a venda de outro plano): a ativação é ATV-<plano> e a recarga é REC-<plano>. Outro tipo
 * (a portabilidade não tem plano) ou outro código: nenhum plano.
 */
export function planoDoServico(tipo: TipoOperacao, sku: string | null | undefined): string | null {
  const prefixo = tipo === "ativacao" ? "ATV-" : tipo === "recarga" ? "REC-" : null;
  if (!prefixo || typeof sku !== "string" || !sku.startsWith(prefixo)) return null;
  const codigo = sku.slice(prefixo.length);
  return /^\d{1,9}$/.test(codigo) ? codigo : null;
}
