// Uso (no servidor, pela rotina agendada, quando ela for ligada):
//   node apps/worker/src/executar-avisos.ts
// O envio dos avisos no celular (lote PWA-b; ADR-014): pega um lote da fila do banco com o segredo dos avisos, manda cada
// aviso aos celulares de quem decide (Web Push, com as chaves do servidor) e registra o resultado. Lê o .env.local da
// pasta do worker (ORA_PASTA_AMBIENTE muda a pasta). Sem alguma chave, fica desligado: diz o que falta, sem erro, e nada
// sai da fila. Log só com contagens: nada de endereço de celular, chave ou texto do aviso.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { oQueFaltaParaOsAvisos } from "./avisos/configuracao.ts";
import { enviarAvisosPendentes } from "./avisos/processar.ts";
import { enviarAviso } from "./avisos/web-push.ts";
import { mensagemSegura } from "./identidade.ts";
import { bancoDosAvisos, clientePublico } from "./supabase.ts";

const exigir = createRequire(import.meta.url);
const { loadEnvConfig } = exigir("@next/env") as { loadEnvConfig: (pasta: string, dev: boolean, log: { info: () => void; error: () => void }) => unknown };

const pasta = process.env.ORA_PASTA_AMBIENTE ?? join(dirname(fileURLToPath(import.meta.url)), "..");
Object.assign(process.env, { NODE_ENV: "production" });
loadEnvConfig(pasta, false, { info: () => {}, error: () => {} });

const ler = (nome: string) => process.env[nome]?.trim() ?? "";
const agora = new Date().toISOString();

const faltando = oQueFaltaParaOsAvisos(ler);
if (faltando.length > 0) {
  console.log(`${agora} worker dos avisos desligado: falta ${faltando.join(", ")}`);
  process.exit(0);
}

try {
  const banco = bancoDosAvisos(clientePublico(ler("NEXT_PUBLIC_SUPABASE_URL"), ler("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")), ler("WEB_PUSH_SEGREDO_DA_FILA"));
  const chaves = { publica: ler("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY"), privada: ler("WEB_PUSH_PRIVATE_KEY"), contato: ler("WEB_PUSH_SUBJECT") };
  const r = await enviarAvisosPendentes(banco, (inscricao, mensagem) => enviarAviso(inscricao, mensagem, chaves));
  if (r.avisos > 0) console.log(`${agora} avisos: ${r.avisos} na vez, ${r.entregues} entregues, ${r.expiradas} celulares fora, ${r.falhas} falhas`);
  process.exit(r.falhas > 0 ? 1 : 0);
} catch (erro) {
  console.error(`${agora} worker dos avisos falhou: ${mensagemSegura(erro)}`);
  process.exit(1);
}
