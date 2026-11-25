// Lote CONNECT-n (25/11/2026): as regras puras do assistente de ativação (o formato da demonstração: um passo por vez e a
// conferência antes de enviar). Cada passo diz o que falta, em português simples, antes de avançar; o servidor (lerPedido) e o
// banco (connect_registrar) conferem tudo de novo no registro. Nada aqui fala com a Nogle.
import { cpfValido, iccidValido } from "@ora5g/dominio";

import { centavosDoBanco } from "../../../lib/dinheiro";
import { brl } from "../../../lib/formato";
import type { OpcaoDePago, PlanoDaNogle } from "../campos";

export const ETAPAS = ["Chip", "Cliente", "Plano e DDD", "Pagamento", "Conferir"] as const;

type Dados = { get: (nome: string) => unknown };
const texto = (dados: Dados, nome: string) => {
  const valor = dados.get(nome);
  return typeof valor === "string" ? valor.trim() : "";
};
const digitos = (valor: string) => valor.replace(/\D/g, "");
const ehEsim = (dados: Dados) => dados.get("esim") === "on";

/** O que falta para sair do passo (a mensagem para a pessoa), ou null quando o passo está completo. */
export function faltaNaEtapa(etapa: number, dados: Dados): string | null {
  if (etapa === 0) {
    if (ehEsim(dados)) return null;
    const iccid = digitos(texto(dados, "iccid"));
    if (!iccid) return "Digite o ICCID do chip (os números impressos nele), toque num chip vendido ou escolha eSIM.";
    return iccidValido(iccid) ? null : "Confira o ICCID: 19 ou 20 dígitos que começam com 89, como estão impressos no chip.";
  }
  if (etapa === 1) {
    if (texto(dados, "nome").length < 3) return "Informe o nome completo do cliente, como no documento.";
    const documento = digitos(texto(dados, "documento"));
    if (!(documento.length === 11 && cpfValido(documento)) && documento.length !== 14) return "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.";
    const email = texto(dados, "email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Confira o e-mail (ou deixe em branco).";
    const telefone = digitos(texto(dados, "telefone"));
    if (telefone && telefone.length !== 10 && telefone.length !== 11) return "Telefone com DDD: 10 ou 11 dígitos (ou deixe em branco).";
    if (digitos(texto(dados, "cep")).length !== 8) return "CEP com 8 dígitos (a Nogle confere o endereço).";
    if (!texto(dados, "id_cidade")) return "Escolha a cidade do endereço.";
    if (!texto(dados, "rua") || !texto(dados, "numero_endereco") || !texto(dados, "bairro")) return "Informe a rua, o número e o bairro.";
    return null;
  }
  if (etapa === 2) {
    if (!texto(dados, "plano")) return "Escolha o plano.";
    return texto(dados, "ddd") ? null : "Escolha o DDD da linha nova.";
  }
  if (etapa === 3) {
    const metodo = texto(dados, "metodo");
    if (metodo !== "LINK" && metodo !== "SALDO") return "Escolha como a Nogle é paga.";
    return metodo === "SALDO" && !texto(dados, "venda_item")
      ? "O crédito da carteira pede o serviço pago no caixa: escolha a venda, ou o Pix da Nogle."
      : null;
  }
  return null;
}

/** O primeiro passo com algo faltando (para voltar a ele no envio), ou null. */
export function primeiraEtapaIncompleta(dados: Dados): { etapa: number; falta: string } | null {
  for (let etapa = 0; etapa < ETAPAS.length - 1; etapa++) {
    const falta = faltaNaEtapa(etapa, dados);
    if (falta) return { etapa, falta };
  }
  return null;
}

/** O documento como o banco guarda: só o fim à vista (o cliente está no balcão, com a tela à frente). */
export function documentoMascarado(documento: string): string {
  const d = digitos(documento);
  if (d.length === 11) return `•••.•••.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `••.•••.•••/${d.slice(8, 12)}-${d.slice(12)}`;
  return "";
}

/** O resumo do último passo, para conferir com o cliente antes de registrar. */
export function resumoDaAtivacao(dados: Dados, listas: {
  planos: readonly PlanoDaNogle[];
  cidades: readonly { codigo: string; nome: string; uf: string | null }[];
  pagos: readonly OpcaoDePago[];
}): [string, string][] {
  const plano = listas.planos.find((p) => p.codigo === texto(dados, "plano"));
  const cidade = listas.cidades.find((c) => c.codigo === texto(dados, "id_cidade"));
  const pago = listas.pagos.find((p) => p.id === texto(dados, "venda_item"));
  const cep = digitos(texto(dados, "cep"));
  const endereco = [
    [texto(dados, "rua"), texto(dados, "numero_endereco")].filter(Boolean).join(", "), texto(dados, "complemento"), texto(dados, "bairro"),
    cidade ? `${cidade.nome}${cidade.uf ? `/${cidade.uf}` : ""}` : "", cep.length === 8 ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : "",
  ].filter(Boolean).join(" – ");
  const metodo = texto(dados, "metodo");
  const pagamento = metodo === "SALDO" ? "Crédito da carteira da Ora na Nogle"
    : pago ? "Pix da Nogle: a loja paga (o cliente já pagou no caixa)" : "Pix da Nogle: o cliente paga direto, na hora";
  return [
    ["Chip", ehEsim(dados) ? "eSIM (chip virtual)" : `ICCID ${digitos(texto(dados, "iccid"))}`],
    ["Titular", `${texto(dados, "nome")} · ${documentoMascarado(texto(dados, "documento"))}`],
    ["Endereço", endereco],
    ["Plano", plano ? `${plano.nome} · ${brl(centavosDoBanco(plano.valor_centavos ?? 0))}` : "—"],
    ["DDD", texto(dados, "ddd") || "—"],
    ["Pagamento à Nogle", pagamento],
    ["Serviço pago no caixa", pago ? pago.rotulo : "Nenhum"],
  ];
}
