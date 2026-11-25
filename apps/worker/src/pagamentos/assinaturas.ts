// A assinatura no cartão pela Asaas (lote PAY-015c; a D-062: o cartão da recorrência guardado na Asaas). Três passos por
// rodada (a situação é a do cartão no caixa: a Asaas respondendo):
//   1. criar os links recorrentes pedidos (o link só no cartão que, preenchido, cria a assinatura): depois de uma tentativa
//      sem resposta clara, procurar antes de criar de novo (pelo NOSSO identificador);
//   2. conferir: a que espera o cartão, pela primeira cobrança do link (a Asaas não tem a consulta das cobranças de um link:
//      o worker lê as cobranças de cartão desde o dia do link, uma vez por rodada, e acha a do link pelo paymentLink, que traz
//      o id da assinatura); a que já tem o id, pela própria assinatura e as cobranças dela. O banco confere de novo;
//   3. cancelar na Asaas: remover a assinatura (as cobranças futuras param) ou desativar o link que ninguém usou.
// Log só com contagens: nada de link, valor, cartão ou chave.
import type { AssinaturaDaAsaas, CicloDaAssinatura, ClienteAsaas, CobrancaDaAssinatura, CobrancaDeCartao } from "./asaas.ts";
import { diaSeguinte } from "./cartao.ts";

export type AssinaturaACriar = { id: string; numero: number; descricao: string; valor_centavos: number; ciclo: CicloDaAssinatura; tentativa: number; validade_segundos: number };
export type AssinaturaAConferir = { id: string; link_id: string; assinatura_id: string | null; situacao: string; valor_centavos: number; ciclo: string; desde: string };
/** O que o banco confere (public.assinatura_consulta_aplicar). */
export type ConsultaDaAssinatura =
  | { link_id: string; situacao: "sem_cadastro" | "desconhecida" }
  | { link_id: string; situacao: "removida"; assinatura_id: string }
  | {
    link_id: string; situacao: "assinatura"; assinatura_id: string; link_da_assinatura: string | null; status: AssinaturaDaAsaas["status"];
    valor_centavos: number; ciclo: string | null; proxima_cobranca: string | null; cartao_final: string | null; cartao_bandeira: string | null;
    cobrancas: { id: string; situacao: CobrancaDaAssinatura["situacao"]; valor_centavos: number; vencimento: string | null; pago_em: string | null }[];
  };
export type BancoDasAssinaturas = {
  assinaturasACriar(limite: number): Promise<AssinaturaACriar[]>;
  assinaturaLinkRegistrar(assinatura: string, linkId: string, url: string, expiraEm: string): Promise<string>;
  assinaturaCriacaoFalhou(assinatura: string, motivo: string, definitiva: boolean): Promise<string>;
  assinaturasAConferir(limite: number): Promise<AssinaturaAConferir[]>;
  assinaturaConsultaAplicar(assinatura: string, consulta: ConsultaDaAssinatura): Promise<string>;
  assinaturasACancelar(limite: number): Promise<{ id: string; assinatura_id: string | null; link_id: string | null }[]>;
  assinaturaCanceladaNaAsaas(assinatura: string): Promise<string>;
};
export type AsaasDasAssinaturas = Pick<ClienteAsaas, "criarLinkRecorrente" | "procurarLink" | "cobrancasDeCartaoDesde" | "assinatura"
  | "cobrancasDaAssinatura" | "removerAssinatura" | "desativarLink">;

export type ResumoDasAssinaturas = { links_criados: number; falhas: number; conferidas: number; ativadas: number; canceladas: number };
export const RESUMO_DAS_ASSINATURAS_VAZIO: ResumoDasAssinaturas = { links_criados: 0, falhas: 0, conferidas: 0, ativadas: 0, canceladas: 0 };
/** As 24 cobranças mais recentes vão ao banco (a ficha mostra as 6 últimas). */
const COBRANCAS_NA_CONSULTA = 24;

/** A assinatura da Asaas e as cobranças dela no formato que o banco confere; o cartão é o da cobrança mais recente que o traz. */
export function consultaDaAssinatura(linkId: string, a: AssinaturaDaAsaas, cobrancas: readonly CobrancaDaAssinatura[]): ConsultaDaAssinatura {
  if (a.removida) return { link_id: linkId, situacao: "removida", assinatura_id: a.id };
  if (a.valor_centavos === null) return { link_id: linkId, situacao: "desconhecida" };
  const recentes = [...cobrancas].sort((x, y) => (y.vencimento ?? "").localeCompare(x.vencimento ?? "")).slice(0, COBRANCAS_NA_CONSULTA);
  const comCartao = recentes.find((c) => c.final !== null);
  return {
    link_id: linkId, situacao: "assinatura", assinatura_id: a.id, link_da_assinatura: a.link, status: a.status, valor_centavos: a.valor_centavos,
    ciclo: a.ciclo, proxima_cobranca: a.proxima_cobranca, cartao_final: comCartao?.final ?? null, cartao_bandeira: comCartao?.bandeira ?? null,
    cobrancas: recentes.map((c) => ({ id: c.id, situacao: c.situacao, valor_centavos: c.valor_centavos, vencimento: c.vencimento, pago_em: c.pago_em })),
  };
}

/** A assinatura que a primeira cobrança do link trouxe (a do link, com o subscription). Nulo: ninguém cadastrou o cartão ainda. */
export const assinaturaDoLink = (cobrancas: readonly CobrancaDeCartao[], link: string) =>
  cobrancas.find((c) => c.link === link && c.assinatura !== null)?.assinatura ?? null;

/** Passo 1. O fim do link na Asaas é o dia seguinte ao da validade (em Brasília); a validade de verdade é a nossa. */
export async function criarLinksRecorrentes(banco: BancoDasAssinaturas, asaas: AsaasDasAssinaturas, resumo: ResumoDasAssinaturas, agora = () => Date.now(), limite = 10) {
  for (const item of await banco.assinaturasACriar(limite)) {
    const expiraEm = new Date(agora() + item.validade_segundos * 1000).toISOString();
    if (item.tentativa > 1) {
      const achado = await asaas.procurarLink(item.id);
      if (achado === "falha") {
        await banco.assinaturaCriacaoFalhou(item.id, "a Asaas não respondeu a procura do link", false);
        resumo.falhas += 1;
        continue;
      }
      if (achado) {
        await banco.assinaturaLinkRegistrar(item.id, achado.id, achado.url, expiraEm);
        resumo.links_criados += 1;
        continue;
      }
    }
    const r = await asaas.criarLinkRecorrente({
      referencia: item.id, nome: `${item.descricao} (assinatura nº ${item.numero} na Ora 5G)`.slice(0, 120), valorCentavos: item.valor_centavos,
      ciclo: item.ciclo, venceEm: diaSeguinte(agora() + item.validade_segundos * 1000),
    });
    if (r.tipo === "criado") {
      await banco.assinaturaLinkRegistrar(item.id, r.link.id, r.link.url, expiraEm);
      resumo.links_criados += 1;
    } else {
      await banco.assinaturaCriacaoFalhou(item.id, r.motivo, r.tipo === "recusado");
      resumo.falhas += 1;
    }
  }
}

/** Passo 2. Sem resposta da Asaas, a assinatura volta para a fila (o banco reserva por 1 minuto). */
export async function conferirAssinaturas(banco: BancoDasAssinaturas, asaas: AsaasDasAssinaturas, resumo: ResumoDasAssinaturas, limite = 20) {
  const lote = await banco.assinaturasAConferir(limite);
  const semId = lote.filter((x) => !x.assinatura_id);
  const desde = semId.map((x) => x.desde).sort()[0];
  const doCartao = desde ? await asaas.cobrancasDeCartaoDesde(desde) : [];
  for (const item of lote) {
    const sub = item.assinatura_id ?? (doCartao === "falha" ? undefined : assinaturaDoLink(doCartao, item.link_id));
    if (sub === undefined) continue;
    let consulta: ConsultaDaAssinatura;
    if (sub === null) {
      consulta = { link_id: item.link_id, situacao: "sem_cadastro" };
    } else {
      const a = await asaas.assinatura(sub);
      if (a === "falha") continue;
      if (a === null) {
        consulta = { link_id: item.link_id, situacao: "removida", assinatura_id: sub };
      } else {
        const cobrancas = a.removida ? [] : await asaas.cobrancasDaAssinatura(sub);
        if (cobrancas === "falha") continue;
        consulta = consultaDaAssinatura(item.link_id, a, cobrancas);
      }
    }
    resumo.conferidas += 1;
    const resultado = await banco.assinaturaConsultaAplicar(item.id, consulta);
    if (resultado === "ativada") resumo.ativadas += 1;
    // A loja desistiu e ninguém cadastrou o cartão: o link sai da Asaas agora.
    if (resultado === "pode_desativar" && (await asaas.desativarLink(item.link_id))) {
      await banco.assinaturaCanceladaNaAsaas(item.id);
      resumo.canceladas += 1;
    }
  }
}

/** Passo 3. A assinatura removida na Asaas (as cobranças futuras param) ou o link que ninguém usou desativado. */
export async function cancelarAssinaturas(banco: BancoDasAssinaturas, asaas: AsaasDasAssinaturas, resumo: ResumoDasAssinaturas, limite = 20) {
  for (const item of await banco.assinaturasACancelar(limite)) {
    const feito = item.assinatura_id ? await asaas.removerAssinatura(item.assinatura_id) : item.link_id ? await asaas.desativarLink(item.link_id) : false;
    if (feito) {
      await banco.assinaturaCanceladaNaAsaas(item.id);
      resumo.canceladas += 1;
    }
  }
}

/** Uma rodada dos três passos. */
export async function rodadaDasAssinaturas(banco: BancoDasAssinaturas, asaas: AsaasDasAssinaturas): Promise<ResumoDasAssinaturas> {
  const resumo = { ...RESUMO_DAS_ASSINATURAS_VAZIO };
  await criarLinksRecorrentes(banco, asaas, resumo);
  await conferirAssinaturas(banco, asaas, resumo);
  await cancelarAssinaturas(banco, asaas, resumo);
  return resumo;
}
