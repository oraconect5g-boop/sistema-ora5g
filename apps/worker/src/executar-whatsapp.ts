// Uso (no servidor, pela rotina agendada, quando ela for ligada):
//   node apps/worker/src/executar-whatsapp.ts
// O envio da nota ao cliente pelo WhatsApp oficial (K1c; lote WHATS-a): pega a fila do banco
// (whatsapp_worker_reivindicar), gera o link temporário do PDF e registra a resposta (whatsapp_worker_resultado).
// Lê o .env.local da pasta do worker (ORA_PASTA_AMBIENTE muda a pasta). Sem credencial ou sem o adaptador oficial da
// Meta, fica desligado: diz o que falta, sem erro, e nada sai da fila. Log só com contagens: nada de telefone, nome,
// link ou token.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { mensagemSegura } from "./identidade.ts";
import { bancoWhatsApp, clienteAdministrativo } from "./supabase.ts";
import { oQueFaltaParaOWhatsApp } from "./whatsapp/configuracao.ts";
import { enviarPendentes, type CanalWhatsApp } from "./whatsapp/processar.ts";

const exigir = createRequire(import.meta.url);
const { loadEnvConfig } = exigir("@next/env") as { loadEnvConfig: (pasta: string, dev: boolean, log: { info: () => void; error: () => void }) => unknown };

const pasta = process.env.ORA_PASTA_AMBIENTE ?? join(dirname(fileURLToPath(import.meta.url)), "..");
Object.assign(process.env, { NODE_ENV: "production" });
loadEnvConfig(pasta, false, { info: () => {}, error: () => {} });

const ler = (nome: string) => process.env[nome]?.trim() ?? "";
const agora = new Date().toISOString();

const faltando = oQueFaltaParaOWhatsApp(ler);
if (faltando.length > 0) {
  console.log(`${agora} worker do WhatsApp desligado: falta ${faltando.join(", ")}`);
  process.exit(0);
}
if (!ler("NEXT_PUBLIC_SUPABASE_URL").startsWith("https://")) {
  console.error(`${agora} worker do WhatsApp: endereço do Supabase inválido`);
  process.exit(2);
}

try {
  const banco = bancoWhatsApp(clienteAdministrativo(ler("NEXT_PUBLIC_SUPABASE_URL"), ler("SUPABASE_SECRET_KEY")));
  // O canal é o adaptador oficial da Meta; enquanto ele não existe, nada sai (oQueFaltaParaOWhatsApp já parou antes).
  const canal: CanalWhatsApp | null = null;
  const r = await enviarPendentes(banco, canal);
  console.log(`${agora} envio: ${r.aceitos} aceitos, ${r.falhas} falhas, ${r.desconhecidos} desconhecidos, ${r.devolvidos} de volta à fila${r.bloqueado ? " (canal desligado)" : ""}`);
  process.exit(r.desconhecidos + r.devolvidos > 0 ? 1 : 0);
} catch (erro) {
  console.error(`${agora} worker do WhatsApp falhou: ${mensagemSegura(erro)}`);
  process.exit(1);
}
