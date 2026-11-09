// Uso (no servidor, pela rotina agendada):
//   node apps/worker/src/executar-connect.ts            → envia as operações registradas e consulta as pendentes
//   node apps/worker/src/executar-connect.ts --listas   → atualiza planos, DDDs, operadoras e cidades (CONNECT_UFS)
// Lê o .env.local da pasta do worker (ORA_PASTA_AMBIENTE muda a pasta). Sem credencial ou sem
// operação habilitada, fica desligado e diz isso, sem erro. Log só com contagens (ADR-005).
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ehTipoOperacao, type TipoOperacao } from "@ora5g/dominio/nogle";

import { ClienteNogle, ehTipoDeChave } from "./connect/cliente-nogle.ts";
import { consultarPendentes, enviarPendentes, mensagemSegura, sincronizarReferencias } from "./connect/processar.ts";
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
  !listas && tipos.length === 0 && "NOGLE_OPERACOES_HABILITADAS",
].filter(Boolean);

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
    // "documentado" só depois de a Nogle confirmar que aceita corpo em GET (pergunta 2).
    { getComCorpo: ler("NOGLE_GET_COM_CORPO") === "documentado" },
  );
  if (listas) {
    const r = await sincronizarReferencias(banco, nogle, ler("CONNECT_UFS").split(",").map((u) => u.trim().toUpperCase()).filter(Boolean));
    console.log(`${agora} listas da Nogle: ${r.listas} atualizadas, ${r.itens} itens, ${r.falhas} falhas`);
    process.exit(r.falhas > 0 ? 1 : 0);
  }
  const envio = await enviarPendentes(banco, nogle, tipos);
  const consulta = await consultarPendentes(banco, nogle, tipos);
  console.log(`${agora} envio: ${envio.aceitas} aceitas, ${envio.recusadas} recusadas, ${envio.desconhecidas} desconhecidas, ${envio.devolvidas} de volta à fila; ` +
    `consulta: ${consulta.consultadas} consultadas, ${consulta.confirmadas} confirmadas, ${consulta.bloqueadas} bloqueadas, ${consulta.falhas} falhas`);
  process.exit(envio.devolvidas + envio.desconhecidas + consulta.falhas > 0 ? 1 : 0);
} catch (erro) {
  console.error(`${agora} worker da Ora Connect falhou: ${mensagemSegura(erro)}`);
  process.exit(1);
}
