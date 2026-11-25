// Uso (no servidor, pela rotina agendada):
//   node apps/worker/src/executar-connect.ts            → envia as operações registradas e consulta as pendentes
//   node apps/worker/src/executar-connect.ts --listas   → atualiza planos, DDDs, operadoras e cidades (CONNECT_UFS); com os
//        planos em dia, o caixa vende cada plano (recarga e ativação) pelo valor de face (CONNECT-f)
//   node apps/worker/src/executar-connect.ts --estoque  → lê o estoque de chips da Nogle (os PDVs, a MVNO e cada PDV), SÓ
//        LEITURA (CONNECT-d; o sim do proprietário de 24/11); pede o GET com corpo (NOGLE_GET_COM_CORPO=documentado); os
//        chips físicos do PDV de cada loja ligada entram no estoque dela pelo ICCID (CONNECT-f; o sim de 25/11)
//   node apps/worker/src/executar-connect.ts --transferencias → envia os pedidos de transferência de chips do dono, UMA vez
//        cada, e confirma pelo estoque do PDV (CONNECT-e); só com NOGLE_TRANSFERENCIAS=habilitada; depois, lê o estoque de novo
//   node apps/worker/src/executar-connect.ts --conciliar [--de AAAA-MM-DD --ate AAAA-MM-DD]
//        → concilia a produção com os relatórios oficiais de ativações e recargas (CONNECT-c; ORA-CONNECT-009); sem o
//          período, os 7 dias até ontem, no horário de Brasília. Pede o GET com corpo (NOGLE_GET_COM_CORPO=documentado)
// Lê o .env.local da pasta do worker (ORA_PASTA_AMBIENTE muda a pasta). Sem credencial ou sem
// operação habilitada, fica desligado e diz isso, sem erro. Log só com contagens (ADR-005).
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ehTipoOperacao, type TipoOperacao } from "@ora5g/dominio/nogle";

import { ClienteNogle, ehTipoDeChave } from "./connect/cliente-nogle.ts";
import {
  conciliarRelatorios, consultarPendentes, enviarPendentes, enviarTransferencias, lerEstoqueDeChips, mensagemSegura, sincronizarReferencias,
} from "./connect/processar.ts";
import { transporteHttp } from "./connect/transporte.ts";
import { bancoConnect, clienteAdministrativo } from "./supabase.ts";

const exigir = createRequire(import.meta.url);
const { loadEnvConfig } = exigir("@next/env") as { loadEnvConfig: (pasta: string, dev: boolean, log: { info: () => void; error: () => void }) => unknown };

const pasta = process.env.ORA_PASTA_AMBIENTE ?? join(dirname(fileURLToPath(import.meta.url)), "..");
Object.assign(process.env, { NODE_ENV: "production" });
loadEnvConfig(pasta, false, { info: () => {}, error: () => {} });

const ler = (nome: string) => process.env[nome]?.trim() ?? "";
const agora = new Date().toISOString();
const listas = process.argv.includes("--listas");
const conciliar = process.argv.includes("--conciliar");
const estoque = process.argv.includes("--estoque");
const transferencias = process.argv.includes("--transferencias");
const argumento = (nome: string) => { const i = process.argv.indexOf(nome); return i > 0 ? process.argv[i + 1] ?? "" : ""; };
/** O dia em Brasília, deslocado em dias (AAAA-MM-DD). */
const diaEmBrasilia = (dias: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + dias * 86_400_000));
const tipos = ler("NOGLE_OPERACOES_HABILITADAS").split(",").map((t) => t.trim()).filter(ehTipoOperacao) as TipoOperacao[];
const tipoDaChave = ler("NOGLE_AUTH_KEY_TYPE");
const faltando = [
  !ler("NEXT_PUBLIC_SUPABASE_URL") && "NEXT_PUBLIC_SUPABASE_URL",
  !ler("SUPABASE_SECRET_KEY") && "SUPABASE_SECRET_KEY",
  !/^[0-9a-f-]{36}$/.test(ler("ORA_ORGANIZACAO_ID")) && "ORA_ORGANIZACAO_ID",
  !ler("NOGLE_API_BASE_URL") && "NOGLE_API_BASE_URL",
  !ehTipoDeChave(tipoDaChave) && "NOGLE_AUTH_KEY_TYPE",
  !ler("NOGLE_ACCESS_KEY") && "NOGLE_ACCESS_KEY",
  tipoDaChave !== "marca" && !ler("NOGLE_SECONDARY_KEY") && "NOGLE_SECONDARY_KEY",
  !listas && !conciliar && !estoque && !transferencias && tipos.length === 0 && "NOGLE_OPERACOES_HABILITADAS",
].filter(Boolean);

if (transferencias && ler("NOGLE_TRANSFERENCIAS") !== "habilitada") {
  console.log(`${agora} transferências de chips desligadas (NOGLE_TRANSFERENCIAS)`);
  process.exit(0);
}
if (faltando.length > 0) {
  console.log(`${agora} worker da Ora Connect desligado: falta ${faltando.join(", ")}`);
  process.exit(0);
}
if (!ler("NEXT_PUBLIC_SUPABASE_URL").startsWith("https://")) {
  console.error(`${agora} worker da Ora Connect: endereço do Supabase inválido`);
  process.exit(2);
}

try {
  const banco = bancoConnect(clienteAdministrativo(ler("NEXT_PUBLIC_SUPABASE_URL"), ler("SUPABASE_SECRET_KEY")), ler("ORA_ORGANIZACAO_ID"));
  const nogle = new ClienteNogle(
    { tipo: tipoDaChave as "franquia" | "marca" | "pdv", chaveAcesso: ler("NOGLE_ACCESS_KEY"), chaveSecundaria: ler("NOGLE_SECONDARY_KEY") || undefined },
    transporteHttp(ler("NOGLE_API_BASE_URL")),
    // GET com corpo: a Nogle confirmou em 10/11/2026 (o próprio /pdv/estoque e o /consultaPagamento
    // levam o corpo). Liga com "documentado" no ambiente do worker.
    { getComCorpo: ler("NOGLE_GET_COM_CORPO") === "documentado" },
  );
  if (listas) {
    const r = await sincronizarReferencias(banco, nogle, ler("CONNECT_UFS").split(",").map((u) => u.trim().toUpperCase()).filter(Boolean));
    const c = r.caixa;
    console.log(`${agora} listas da Nogle: ${r.listas} atualizadas, ${r.itens} itens, ${r.falhas} falhas` +
      (c ? `; no caixa: ${c.criadas} serviços novos, ${c.precos} preços novos, ${c.desativadas} desativados` : ""));
    process.exit(r.falhas > 0 ? 1 : 0);
  }
  if (conciliar) {
    const de = argumento("--de") || diaEmBrasilia(-7);
    const ate = argumento("--ate") || diaEmBrasilia(-1);
    const r = await conciliarRelatorios(banco, nogle, de, ate);
    const falhas = r.detalhes.filter((d) => d.falha).map((d) => `; ${d.relatorio}: ${d.falha}`).join("");
    console.log(`${agora} conciliação com a Nogle de ${de} a ${ate}: ${r.conciliadas} relatórios, ${r.linhas} linhas, ${r.falhas} falhas${falhas}`);
    process.exit(r.falhas > 0 ? 1 : 0);
  }
  if (transferencias) {
    const t = await enviarTransferencias(banco, nogle);
    if (t.enviadas + t.devolvidas + t.recusadas === 0) process.exit(0);
    console.log(`${agora} transferências de chips: ${t.enviadas} enviadas (${t.confirmadas} confirmadas, ${t.parciais} parciais, ${t.desconhecidas} desconhecidas), ${t.recusadas} recusadas, ${t.devolvidas} de volta à fila`);
    // Depois de enviar, o estoque lido de novo: a tela mostra os chips no PDV novo.
    if (t.enviadas > 0) {
      const e = await lerEstoqueDeChips(banco, nogle);
      console.log(e.gravada
        ? `${agora} estoque de chips relido: leitura nº ${e.leitura.numero}, ${e.leitura.falhas} falhas, ${e.noEstoque.entraram} chips entraram no estoque das lojas`
        : `${agora} estoque de chips: nada gravado (${e.motivo})`);
    }
    process.exit(t.desconhecidas + t.devolvidas > 0 ? 1 : 0);
  }
  if (estoque) {
    const r = await lerEstoqueDeChips(banco, nogle);
    if (!r.gravada) {
      console.log(`${agora} estoque de chips da Nogle: nada gravado (${r.motivo})`);
      process.exit(1);
    }
    const l = r.leitura;
    const n = r.noEstoque;
    console.log(`${agora} estoque de chips da Nogle: leitura nº ${l.numero}, ${l.pdvs} PDVs (${l.pdvs_lidos} lidos), ${l.chips} chips, ${l.falhas} falhas, ${r.ignorados} fora da forma; ` +
      `no estoque das lojas: ${n.entraram} chips entraram, ${n.fora_da_forma} com o ICCID fora da forma, ${n.divergentes} divergências`);
    process.exit(l.falhas > 0 ? 1 : 0);
  }
  const envio = await enviarPendentes(banco, nogle, tipos);
  // Consulta pelo uuid (GET /consultaPagamento): só depois de ver a primeira resposta real com uuid.
  const consulta = await consultarPendentes(banco, nogle, tipos, 10, { consultaPagamento: ler("NOGLE_CONSULTA_PAGAMENTO") === "habilitada" });
  console.log(`${agora} envio: ${envio.aceitas} aceitas, ${envio.recusadas} recusadas, ${envio.desconhecidas} desconhecidas, ${envio.devolvidas} de volta à fila; ` +
    `consulta: ${consulta.consultadas} consultadas, ${consulta.confirmadas} confirmadas, ${consulta.bloqueadas} bloqueadas, ${consulta.falhas} falhas`);
  process.exit(envio.devolvidas + envio.desconhecidas + consulta.falhas > 0 ? 1 : 0);
} catch (erro) {
  console.error(`${agora} worker da Ora Connect falhou: ${mensagemSegura(erro)}`);
  process.exit(1);
}
