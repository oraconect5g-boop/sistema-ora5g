// Mostra so os NOMES das variaveis: presentes, faltando ou invalidas. Nunca os valores.
// Uso: node packages/config/scripts/verificar-env.ts <arquivo .env> [grupos separados por virgula]
// Grupos: aplicacao, supabase_publico (login), supabase_servidor (worker e migrations).
// O antigo grupo "supabase" foi dividido (CONFIG-001): o comando explica qual usar.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { GRUPOS, lerGrupos, verificarAmbiente } from "../src/ambiente.ts";

const [arquivo, gruposTexto = "aplicacao"] = process.argv.slice(2);
if (!arquivo) {
  console.error("Uso: verificar-env <arquivo .env> [aplicacao,supabase_publico,supabase_servidor]");
  process.exit(2);
}

const leitura = lerGrupos(gruposTexto);
if (!leitura.ok) {
  for (const erro of leitura.erros) console.error(erro);
  console.error(`Grupos válidos: ${Object.keys(GRUPOS).join(", ")}`);
  process.exit(2);
}
const grupos = leitura.grupos;

const variaveis = parseEnv(readFileSync(arquivo, "utf8"));
const resultado = verificarAmbiente(variaveis, grupos);

for (const grupo of grupos) {
  console.log(`[${grupo}]`);
  for (const nome of Object.keys(GRUPOS[grupo].shape)) {
    const problema = resultado.ok ? undefined : resultado.problemas.find((p) => p.variavel === nome);
    const definida = (variaveis[nome] ?? "").trim() !== "";
    console.log(`  ${problema ? "ERRO" : definida ? "ok  " : "padrão"}  ${nome}${problema ? ` — ${problema.motivo}` : ""}`);
  }
}
process.exit(resultado.ok ? 0 : 1);
