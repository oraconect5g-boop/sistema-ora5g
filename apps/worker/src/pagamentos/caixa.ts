// O Pix pela Asaas no caixa (lote PAY-015a; a D-062: "pagamento oficial da loja será a asaas"). Quatro passos:
//   1. conferir a chave Pix ativa da conta (uma vez por execução): sem ela, o banco desliga o Pix no caixa, com o motivo;
//   2. criar os QR pedidos no caixa (o QR estático com o valor, um pagamento só e a validade): a criação sem resposta clara
//      pede outro QR (o que ficou sem resposta ninguém viu, e vence sozinho);
//   3. conferir os QR que esperam (a cada poucos segundos), os que a venda desistiu (antes de excluir) e os pagos de venda
//      aberta (o estorno): só a consulta na Asaas confirma, e o banco confere de novo o QR, o valor e a passagem;
//   4. excluir na Asaas os QR cancelados e os vencidos.
// Log só com contagens: nada de QR, copia e cola, valor ou chave.
import type { ClienteAsaas, ConsultaDoQr } from "./asaas.ts";

export type QrACriar = { id: string; valor_centavos: number; tentativa: number; venda_numero: number; validade_segundos: number };
export type QrAConferir = { id: string; qr_id: string; valor_centavos: number; situacao: string };
export type BancoDoCaixa = {
  caixaSituacao(pronto: boolean, motivo: string | null): Promise<boolean>;
  caixaACriar(limite: number): Promise<QrACriar[]>;
  caixaQrRegistrar(pix: string, qrId: string, copiaECola: string, imagem: string, expiraEm: string): Promise<string>;
  caixaCriacaoFalhou(pix: string, motivo: string, definitiva: boolean): Promise<string>;
  caixaAConferir(limite: number): Promise<QrAConferir[]>;
  caixaConsultaAplicar(pix: string, consulta: { qr_id: string } & ConsultaDoQr): Promise<string>;
  caixaAExcluir(limite: number): Promise<{ id: string; qr_id: string }[]>;
  caixaQrExcluido(pix: string): Promise<string>;
};
export type AsaasDoCaixa = Pick<ClienteAsaas, "chavePixAtiva" | "criarQrEstatico" | "cobrancasDoQr" | "excluirQr">;

export type ResumoDoCaixa = { qr_criados: number; qr_falhas: number; qr_conferidos: number; qr_pagos: number; qr_excluidos: number };
export const RESUMO_DO_CAIXA_VAZIO: ResumoDoCaixa = { qr_criados: 0, qr_falhas: 0, qr_conferidos: 0, qr_pagos: 0, qr_excluidos: 0 };

/** Passo 1. A chave Pix ativa da conta (para criar os QR) ou nulo; o banco fica sabendo se o Pix no caixa está pronto. */
export async function conferirChavePix(banco: BancoDoCaixa, asaas: AsaasDoCaixa): Promise<string | null> {
  const chave = await asaas.chavePixAtiva();
  if (chave === "falha") {
    await banco.caixaSituacao(false, "a Asaas não respondeu a conferência da chave Pix");
    return null;
  }
  if (chave === null) {
    await banco.caixaSituacao(false, "a conta da Asaas não tem chave Pix ativa");
    return null;
  }
  await banco.caixaSituacao(true, null);
  return chave;
}

/** Passo 2. A validade do QR conta do nosso relógio (a data da Asaas não diz o fuso). */
export async function criarQrs(banco: BancoDoCaixa, asaas: AsaasDoCaixa, chavePix: string, resumo: ResumoDoCaixa, agora = () => Date.now(), limite = 10) {
  for (const item of await banco.caixaACriar(limite)) {
    const r = await asaas.criarQrEstatico({
      referencia: item.id, chavePix, valorCentavos: item.valor_centavos, descricao: `Venda nº ${item.venda_numero} na Ora 5G`,
      validadeSegundos: item.validade_segundos,
    });
    if (r.tipo === "criado") {
      const expiraEm = new Date(agora() + item.validade_segundos * 1000).toISOString();
      await banco.caixaQrRegistrar(item.id, r.qr.id, r.qr.copiaECola, r.qr.imagem, expiraEm);
      resumo.qr_criados += 1;
    } else {
      await banco.caixaCriacaoFalhou(item.id, r.motivo, r.tipo === "recusado");
      resumo.qr_falhas += 1;
    }
  }
}

/** Passo 3. Sem resposta da Asaas, o QR volta para a fila (o banco reserva por 30 segundos). */
export async function conferirQrs(banco: BancoDoCaixa, asaas: AsaasDoCaixa, resumo: ResumoDoCaixa, limite = 20) {
  for (const item of await banco.caixaAConferir(limite)) {
    const consulta = await asaas.cobrancasDoQr(item.qr_id);
    if (consulta === "falha") continue;
    resumo.qr_conferidos += 1;
    const resultado = await banco.caixaConsultaAplicar(item.id, { qr_id: item.qr_id, ...consulta });
    if (resultado === "confirmado") resumo.qr_pagos += 1;
    // A venda desistiu e ninguém pagou: o QR sai da Asaas agora.
    if (resultado === "pode_excluir" && (await asaas.excluirQr(item.qr_id))) {
      await banco.caixaQrExcluido(item.id);
      resumo.qr_excluidos += 1;
    }
  }
}

/** Passo 4. O QR que não saiu fica para a próxima rodada. */
export async function excluirQrs(banco: BancoDoCaixa, asaas: AsaasDoCaixa, resumo: ResumoDoCaixa, limite = 20) {
  for (const item of await banco.caixaAExcluir(limite)) {
    if (await asaas.excluirQr(item.qr_id)) {
      await banco.caixaQrExcluido(item.id);
      resumo.qr_excluidos += 1;
    }
  }
}

/** Uma rodada dos passos 2 a 4 (o passo 1 é uma vez por execução). */
export async function rodadaDoCaixa(banco: BancoDoCaixa, asaas: AsaasDoCaixa, chavePix: string): Promise<ResumoDoCaixa> {
  const resumo = { ...RESUMO_DO_CAIXA_VAZIO };
  await criarQrs(banco, asaas, chavePix, resumo);
  await conferirQrs(banco, asaas, resumo);
  await excluirQrs(banco, asaas, resumo);
  return resumo;
}
