// O worker dos pagamentos pelo site (lote PAY-014a; ADR-025; a regra do PAY-b). Quatro passos, nesta ordem:
//   1. ligar: se o banco ainda não tem o aviso registrado (ou o ambiente mudou), gera um token, registra o webhook na
//      Asaas e grava no banco só a impressão digital do token (o token não fica em lugar nenhum daqui);
//   2. criar os links dos pagamentos pedidos: na segunda tentativa em diante, procura antes pelo identificador (a criação
//      anterior pode ter dado certo sem resposta), e nunca cria às cegas;
//   3. conferir os avisos: o aviso nunca confirma; o worker pergunta à Asaas pelo pagamento e o banco confere de novo o
//      link, o valor e a passagem da situação;
//   4. desativar os links dos pedidos cancelados, atendidos ou vencidos sem pagamento.
// Log só com contagens: nada de link, valor, token ou chave.
import { createHash, randomBytes } from "node:crypto";

import type { AmbienteDaAsaas, ClienteAsaas, ConsultaDaAsaas } from "./asaas.ts";

export type ConfiguracaoDoPagamento = { ligado: boolean; ambiente: string | null; webhook_id: string | null };
export type PagamentoACriar = { id: string; valor_centavos: number; tentativa: number; codigo: string; vence_em: string };
export type AvisoAProcessar = {
  aviso: string; evento: string; id_no_provedor: string | null; link: string | null; valor_centavos: number | null;
  pagamento: { id: string; valor_centavos: number; situacao: string; link: string } | null;
};
export type BancoDosPagamentos = {
  configuracao(): Promise<ConfiguracaoDoPagamento>;
  ligar(ambiente: AmbienteDaAsaas, webhookId: string, impressao: string): Promise<void>;
  aCriar(limite: number): Promise<PagamentoACriar[]>;
  linkRegistrado(pagamento: string, linkId: string, url: string): Promise<string>;
  criacaoFalhou(pagamento: string, motivo: string, definitiva: boolean): Promise<string>;
  avisosAProcessar(limite: number): Promise<AvisoAProcessar[]>;
  avisoConcluir(aviso: string, resultado: string): Promise<boolean>;
  consultaAplicar(aviso: string, consulta: ConsultaDaAsaas): Promise<string>;
  aDesativar(limite: number): Promise<{ id: string; link: string }[]>;
  linkDesativado(pagamento: string): Promise<boolean>;
};
export type Asaas = Pick<ClienteAsaas, "criarLink" | "procurarLink" | "desativarLink" | "consultarPagamento" | "registrarAviso">;

/** O token do aviso: 48 letras (A-Z, a-z, 0-9, - e _), sem espaço; a Asaas aceita de 32 a 255. */
export const gerarToken = () => randomBytes(36).toString("base64url");
export const impressaoDo = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

/** Passo 1. Devolve o que aconteceu (para o log). */
export async function ligarSeFaltar(banco: BancoDosPagamentos, asaas: Asaas, p: { ambiente: AmbienteDaAsaas; urlDoAviso: string; email: string; token?: () => string }) {
  const atual = await banco.configuracao();
  if (atual.ligado && atual.ambiente === p.ambiente) return "ja_ligado" as const;
  const token = (p.token ?? gerarToken)();
  const r = await asaas.registrarAviso({ url: p.urlDoAviso, token, email: p.email });
  if ("falha" in r) return { falha: r.falha };
  await banco.ligar(p.ambiente, r.id, impressaoDo(token));
  return "ligado" as const;
}

export type ResumoDosPagamentos = { criados: number; achados: number; falhas: number; recusados: number; avisos: number; confirmados: number; desativados: number };
export const RESUMO_VAZIO: ResumoDosPagamentos = { criados: 0, achados: 0, falhas: 0, recusados: 0, avisos: 0, confirmados: 0, desativados: 0 };

/** Passo 2. O nome do link mostra só o código do pedido; o retorno leva o código à página do pedido (sem o WhatsApp). */
export async function criarLinks(banco: BancoDosPagamentos, asaas: Asaas, enderecoDoSite: string, resumo: ResumoDosPagamentos, limite = 10) {
  for (const item of await banco.aCriar(limite)) {
    if (item.tentativa > 1) {
      const achado = await asaas.procurarLink(item.id);
      if (achado === "falha") {
        await banco.criacaoFalhou(item.id, "a Asaas não respondeu a procura do link", false);
        resumo.falhas += 1;
        continue;
      }
      if (achado) {
        await banco.linkRegistrado(item.id, achado.id, achado.url);
        resumo.achados += 1;
        continue;
      }
    }
    const r = await asaas.criarLink({
      referencia: item.id, nome: `Pedido ${item.codigo} na Ora 5G`, valorCentavos: item.valor_centavos, venceEm: item.vence_em,
      retorno: `${enderecoDoSite}/loja/pedido?codigo=${item.codigo}`,
    });
    if (r.tipo === "criado") {
      await banco.linkRegistrado(item.id, r.link.id, r.link.url);
      resumo.criados += 1;
    } else if (r.tipo === "recusado") {
      await banco.criacaoFalhou(item.id, r.motivo, true);
      resumo.recusados += 1;
    } else {
      await banco.criacaoFalhou(item.id, r.motivo, false);
      resumo.falhas += 1;
    }
  }
}

/** Passo 3. O aviso só faz perguntar; sem resposta da Asaas, o aviso volta para a fila (o banco reserva por 2 minutos). */
export async function processarAvisos(banco: BancoDosPagamentos, asaas: Asaas, resumo: ResumoDosPagamentos, limite = 20) {
  for (const a of await banco.avisosAProcessar(limite)) {
    resumo.avisos += 1;
    if (!a.pagamento) {
      await banco.avisoConcluir(a.aviso, a.link ? "link_desconhecido" : "sem_link");
      continue;
    }
    if (!a.id_no_provedor) {
      await banco.avisoConcluir(a.aviso, "sem_pagamento");
      continue;
    }
    const consulta = await asaas.consultarPagamento(a.id_no_provedor);
    if (consulta === "falha") continue;
    if (consulta === null) {
      await banco.avisoConcluir(a.aviso, "pagamento_desconhecido");
      continue;
    }
    if ((await banco.consultaAplicar(a.aviso, consulta)) === "confirmado") resumo.confirmados += 1;
  }
}

/** Passo 4. O link que não desativou fica para a próxima rodada. */
export async function desativarLinks(banco: BancoDosPagamentos, asaas: Asaas, resumo: ResumoDosPagamentos, limite = 20) {
  for (const x of await banco.aDesativar(limite)) {
    if (await asaas.desativarLink(x.link)) {
      if (await banco.linkDesativado(x.id)) resumo.desativados += 1;
    }
  }
}

/** Uma rodada dos passos 2 a 4. */
export async function rodada(banco: BancoDosPagamentos, asaas: Asaas, enderecoDoSite: string): Promise<ResumoDosPagamentos> {
  const resumo = { ...RESUMO_VAZIO };
  await criarLinks(banco, asaas, enderecoDoSite, resumo);
  await processarAvisos(banco, asaas, resumo);
  await desativarLinks(banco, asaas, resumo);
  return resumo;
}
