// Uso (no servidor, pela rotina agendada, quando o proprietário autorizar):
//   node apps/worker/src/executar-pagamentos.ts
// O pagamento pelo site pela Asaas (lote PAY-014a; ADR-025): registra o aviso na Asaas (uma vez, ou quando o ambiente
// muda), cria os links dos pagamentos pedidos, confere os avisos com a Asaas e desativa os links que não servem mais.
// PAY-015a: o Pix pela Asaas no caixa: confere a chave Pix da conta, cria os QR pedidos no caixa, confere o pagamento a
// cada rodada (sem depender do aviso) e exclui os QR cancelados e vencidos. Sem o aviso registrado, o caixa segue.
// Roda por uns 50 segundos, com uma rodada a cada 3 segundos, para o link sair logo depois de o cliente pedir. Lê o
// .env.local da pasta do worker (ORA_PASTA_AMBIENTE muda a pasta). Sem alguma chave, fica desligado: diz o que falta,
// sem erro. Log só com contagens: nada de link, valor, token ou chave.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { transporteHttp } from "./connect/transporte.ts";
import { mensagemSegura } from "./identidade.ts";
import { ClienteAsaas, ENDERECOS_DA_ASAAS, type AmbienteDaAsaas } from "./pagamentos/asaas.ts";
import { oQueFaltaParaOsPagamentos } from "./pagamentos/configuracao.ts";
import { conferirChavePix, rodadaDoCaixa, RESUMO_DO_CAIXA_VAZIO, type ResumoDoCaixa } from "./pagamentos/caixa.ts";
import { ligarSeFaltar, rodada, RESUMO_VAZIO, type ResumoDosPagamentos } from "./pagamentos/processar.ts";
import { bancoDosPagamentos, clienteAdministrativo } from "./supabase.ts";

const exigir = createRequire(import.meta.url);
const { loadEnvConfig } = exigir("@next/env") as { loadEnvConfig: (pasta: string, dev: boolean, log: { info: () => void; error: () => void }) => unknown };

const pasta = process.env.ORA_PASTA_AMBIENTE ?? join(dirname(fileURLToPath(import.meta.url)), "..");
Object.assign(process.env, { NODE_ENV: "production" });
loadEnvConfig(pasta, false, { info: () => {}, error: () => {} });

const ler = (nome: string) => process.env[nome]?.trim() ?? "";
const agora = () => new Date().toISOString();

const faltando = oQueFaltaParaOsPagamentos(ler);
if (faltando.length > 0) {
  console.log(`${agora()} worker dos pagamentos desligado: falta ${faltando.join(", ")}`);
  process.exit(0);
}

const DURACAO_MS = 50_000;
const INTERVALO_MS = 3_000;
const esperar = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms));

try {
  const ambiente = ler("ASAAS_AMBIENTE") as AmbienteDaAsaas;
  const site = ler("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "");
  const banco = bancoDosPagamentos(clienteAdministrativo(ler("NEXT_PUBLIC_SUPABASE_URL"), ler("SUPABASE_SECRET_KEY")));
  const asaas = new ClienteAsaas(transporteHttp(ENDERECOS_DA_ASAAS[ambiente], 20_000, "Asaas"), ler("ASAAS_API_KEY"));
  const ligado = await ligarSeFaltar(banco, asaas, { ambiente, urlDoAviso: `${site}/api/pagamentos/asaas`, email: ler("ASAAS_EMAIL_DOS_AVISOS") });
  // Sem o aviso registrado, o pagamento pelo site espera (ele depende do aviso); o Pix do caixa segue (ele confere sozinho).
  const siteLigado = typeof ligado !== "object";
  if (!siteLigado) console.error(`${agora()} pagamentos: não deu para registrar o aviso na Asaas (${ligado.falha})`);
  if (ligado === "ligado") console.log(`${agora()} pagamentos: aviso registrado na Asaas (${ambiente})`);
  // PAY-015a: a chave Pix da conta, uma vez por execução (o banco desliga o Pix no caixa sem ela).
  const chavePix = await conferirChavePix(banco, asaas);
  const total: ResumoDosPagamentos = { ...RESUMO_VAZIO };
  const doCaixa: ResumoDoCaixa = { ...RESUMO_DO_CAIXA_VAZIO };
  const fim = Date.now() + DURACAO_MS;
  while (Date.now() < fim) {
    if (siteLigado) {
      const r = await rodada(banco, asaas, site);
      for (const k of Object.keys(total) as (keyof ResumoDosPagamentos)[]) total[k] += r[k];
    }
    if (chavePix) {
      const c = await rodadaDoCaixa(banco, asaas, chavePix);
      for (const k of Object.keys(doCaixa) as (keyof ResumoDoCaixa)[]) doCaixa[k] += c[k];
    }
    await esperar(INTERVALO_MS);
  }
  if (Object.values(total).some((n) => n > 0)) {
    console.log(`${agora()} pagamentos: ${total.criados} links criados, ${total.achados} achados de novo, ${total.recusados} recusados, ${total.falhas} falhas, ${total.avisos} avisos, ${total.confirmados} confirmados, ${total.desativados} desativados`);
  }
  if (doCaixa.qr_criados + doCaixa.qr_falhas + doCaixa.qr_pagos + doCaixa.qr_excluidos > 0) {
    console.log(`${agora()} Pix do caixa: ${doCaixa.qr_criados} QR criados, ${doCaixa.qr_falhas} falhas, ${doCaixa.qr_pagos} pagos, ${doCaixa.qr_excluidos} excluídos`);
  }
  process.exit(siteLigado ? 0 : 1);
} catch (erro) {
  console.error(`${agora()} worker dos pagamentos falhou: ${mensagemSegura(erro)}`);
  process.exit(1);
}
