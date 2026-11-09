// Uso (no servidor, pela rotina agendada): node apps/worker/src/executar-identidade.ts
// Lê a configuração do .env.local da pasta do worker (ORA_PASTA_AMBIENTE muda a pasta), com o
// mesmo leitor do Next. Sem a chave secreta, o worker fica desligado e diz isso, sem erro.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { aplicarBloqueios, mensagemSegura, processarConvites } from "./identidade.ts";
import { clienteAdministrativo, servicoSupabase } from "./supabase.ts";

const exigir = createRequire(import.meta.url);
const { loadEnvConfig } = exigir("@next/env") as { loadEnvConfig: (pasta: string, dev: boolean, log: { info: () => void; error: () => void }) => unknown };

const pasta = process.env.ORA_PASTA_AMBIENTE ?? join(dirname(fileURLToPath(import.meta.url)), "..");
Object.assign(process.env, { NODE_ENV: "production" });
loadEnvConfig(pasta, false, { info: () => {}, error: () => {} });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const chave = process.env.SUPABASE_SECRET_KEY?.trim();
const app = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
const agora = new Date().toISOString();

if (!url || !chave || !app) {
  console.log(`${agora} worker de identidade desligado: falta ${[!url && "NEXT_PUBLIC_SUPABASE_URL", !chave && "SUPABASE_SECRET_KEY", !app && "NEXT_PUBLIC_APP_URL"].filter(Boolean).join(", ")}`);
  process.exit(0);
}
if (!url.startsWith("https://") || !app.startsWith("https://") && !app.startsWith("http://127.0.0.1")) {
  console.error(`${agora} worker de identidade: endereço do Supabase ou do aplicativo inválido`);
  process.exit(2);
}

try {
  const servico = servicoSupabase(clienteAdministrativo(url, chave), app);
  const convites = await processarConvites(servico);
  const bloqueios = await aplicarBloqueios(servico);
  console.log(`${agora} convites: ${convites.enviados} enviados, ${convites.vinculados} vinculados, ${convites.recusados} recusados, ${convites.falhas} falhas; bloqueios: ${bloqueios.aplicados} aplicados, ${bloqueios.falhas} falhas`);
  process.exit(convites.falhas + bloqueios.falhas > 0 ? 1 : 0);
} catch (erro) {
  console.error(`${agora} worker de identidade falhou: ${mensagemSegura(erro)}`);
  process.exit(1);
}
