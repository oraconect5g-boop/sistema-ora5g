// O cartão pela Asaas no caixa (lote PAY-015b; a D-062: "pagamento oficial da loja será a asaas"). Quatro passos:
//   1. a situação (uma vez por execução): a mesma resposta da conferência da chave Pix diz se a Asaas está respondendo;
//      sem resposta, o banco desliga o cartão no caixa, com o motivo;
//   2. criar os links pedidos no caixa (o link de pagamento só no cartão, uma venda só): depois de uma tentativa sem
//      resposta clara, procurar antes de criar de novo (pelo NOSSO identificador);
//   3. conferir os links que esperam, os que a venda desistiu (antes de desativar) e os pagos de venda aberta (o estorno):
//      a Asaas não tem a consulta das cobranças de um link, então o worker lê as cobranças de cartão desde o dia do link
//      mais antigo do lote (uma leitura por rodada) e acha a de cada link pelo paymentLink; o banco confere de novo;
//   4. desativar na Asaas os links cancelados e os vencidos.
// Log só com contagens: nada de link, valor, cartão ou chave.
import type { ClienteAsaas, CobrancaDeCartao, ConsultaDoCartao } from "./asaas.ts";

export type LinkDoCartaoACriar = { id: string; valor_centavos: number; tentativa: number; venda_numero: number; validade_segundos: number };
export type LinkDoCartaoAConferir = { id: string; link_id: string; valor_centavos: number; situacao: string; desde: string };
export type BancoDoCartao = {
  cartaoSituacao(pronto: boolean, motivo: string | null): Promise<boolean>;
  cartaoACriar(limite: number): Promise<LinkDoCartaoACriar[]>;
  cartaoLinkRegistrar(cartao: string, linkId: string, url: string, expiraEm: string): Promise<string>;
  cartaoCriacaoFalhou(cartao: string, motivo: string, definitiva: boolean): Promise<string>;
  cartaoAConferir(limite: number): Promise<LinkDoCartaoAConferir[]>;
  cartaoConsultaAplicar(cartao: string, consulta: { link_id: string } & ConsultaDoCartao): Promise<string>;
  cartaoADesativar(limite: number): Promise<{ id: string; link_id: string }[]>;
  cartaoLinkDesativado(cartao: string): Promise<string>;
};
export type AsaasDoCartao = Pick<ClienteAsaas, "criarLinkDoCartao" | "procurarLink" | "cobrancasDeCartaoDesde" | "desativarLink">;

export type ResumoDoCartao = { links_criados: number; links_falhas: number; links_conferidos: number; links_pagos: number; links_desativados: number };
export const RESUMO_DO_CARTAO_VAZIO: ResumoDoCartao = { links_criados: 0, links_falhas: 0, links_conferidos: 0, links_pagos: 0, links_desativados: 0 };

/** Passo 1. A Asaas respondeu (a conferência da chave Pix, a mesma chamada)? O banco fica sabendo se o cartão está pronto. */
export async function situacaoDoCartao(banco: BancoDoCartao, respondeu: boolean): Promise<boolean> {
  await banco.cartaoSituacao(respondeu, respondeu ? null : "a Asaas não respondeu");
  return respondeu;
}

/** As cobranças do link no formato que o banco confere: nenhuma (ou só pendente); uma paga ou estornada; o resto, desconhecida. */
export function consultaDoLink(cobrancas: readonly CobrancaDeCartao[], link: string): ConsultaDoCartao {
  const contam = cobrancas.filter((c) => c.link === link && c.situacao !== "pendente");
  if (contam.length === 0) return { situacao: "nenhum" };
  const [unica] = contam;
  if (contam.length > 1 || !unica || (unica.situacao !== "pago" && unica.situacao !== "estornado") || unica.valor_centavos === null) {
    return { situacao: "desconhecida" };
  }
  return { situacao: unica.situacao, id_no_provedor: unica.id, valor_centavos: unica.valor_centavos, cartao_final: unica.final, cartao_bandeira: unica.bandeira };
}

/** O dia seguinte em Brasília (AAAA-MM-DD): o fim do link na Asaas, que só aceita um dia. */
export const diaSeguinte = (agora: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora + 86_400_000));

/** Passo 2. A validade do link conta do nosso relógio. */
export async function criarLinksDoCartao(banco: BancoDoCartao, asaas: AsaasDoCartao, resumo: ResumoDoCartao, agora = () => Date.now(), limite = 10) {
  for (const item of await banco.cartaoACriar(limite)) {
    const expiraEm = new Date(agora() + item.validade_segundos * 1000).toISOString();
    // Depois de uma tentativa sem resposta clara, o link pode ter sido criado: procura antes de criar de novo.
    if (item.tentativa > 1) {
      const achado = await asaas.procurarLink(item.id);
      if (achado === "falha") {
        await banco.cartaoCriacaoFalhou(item.id, "a Asaas não respondeu a procura do link", false);
        resumo.links_falhas += 1;
        continue;
      }
      if (achado) {
        await banco.cartaoLinkRegistrar(item.id, achado.id, achado.url, expiraEm);
        resumo.links_criados += 1;
        continue;
      }
    }
    const r = await asaas.criarLinkDoCartao({
      referencia: item.id, nome: `Venda nº ${item.venda_numero} na Ora 5G`, valorCentavos: item.valor_centavos, venceEm: diaSeguinte(agora()),
    });
    if (r.tipo === "criado") {
      await banco.cartaoLinkRegistrar(item.id, r.link.id, r.link.url, expiraEm);
      resumo.links_criados += 1;
    } else {
      await banco.cartaoCriacaoFalhou(item.id, r.motivo, r.tipo === "recusado");
      resumo.links_falhas += 1;
    }
  }
}

/** Passo 3. Sem resposta da Asaas, o lote volta para a fila (o banco reserva por 30 segundos). */
export async function conferirLinksDoCartao(banco: BancoDoCartao, asaas: AsaasDoCartao, resumo: ResumoDoCartao, limite = 20) {
  const lote = await banco.cartaoAConferir(limite);
  const desde = lote.map((x) => x.desde).sort()[0];
  if (!desde) return;
  const cobrancas = await asaas.cobrancasDeCartaoDesde(desde);
  if (cobrancas === "falha") return;
  for (const item of lote) {
    resumo.links_conferidos += 1;
    const resultado = await banco.cartaoConsultaAplicar(item.id, { link_id: item.link_id, ...consultaDoLink(cobrancas, item.link_id) });
    if (resultado === "confirmado") resumo.links_pagos += 1;
    // A venda desistiu e ninguém pagou: o link sai da Asaas agora.
    if (resultado === "pode_desativar" && (await asaas.desativarLink(item.link_id))) {
      await banco.cartaoLinkDesativado(item.id);
      resumo.links_desativados += 1;
    }
  }
}

/** Passo 4. O link que não saiu fica para a próxima rodada. */
export async function desativarLinksDoCartao(banco: BancoDoCartao, asaas: AsaasDoCartao, resumo: ResumoDoCartao, limite = 20) {
  for (const item of await banco.cartaoADesativar(limite)) {
    if (await asaas.desativarLink(item.link_id)) {
      await banco.cartaoLinkDesativado(item.id);
      resumo.links_desativados += 1;
    }
  }
}

/** Uma rodada dos passos 2 a 4 (o passo 1 é uma vez por execução). */
export async function rodadaDoCartao(banco: BancoDoCartao, asaas: AsaasDoCartao): Promise<ResumoDoCartao> {
  const resumo = { ...RESUMO_DO_CARTAO_VAZIO };
  await criarLinksDoCartao(banco, asaas, resumo);
  await conferirLinksDoCartao(banco, asaas, resumo);
  await desativarLinksDoCartao(banco, asaas, resumo);
  return resumo;
}
