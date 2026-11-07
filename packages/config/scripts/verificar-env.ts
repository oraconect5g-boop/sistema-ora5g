// Mostra so os NOMES das variaveis: presentes, faltando ou invalidas. Nunca os valores.
// Uso: node packages/config/scripts/verificar-env.ts <arquivo .env> [grupos separados por virgula]
// Grupos: aplicacao, supabase_publico (login), supabase_servidor (worker e migrations).
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import { GRUPOS, verificarAmbiente, type NomeGrupo } from "../src/ambiente.ts";

const [arquivo, gruposTexto = "aplicacao"] = process.argv.slice(2);
if (!arquivo) {
  console.error("Uso: verificar-env <arquivo .env> [aplicacao,supabase_publico,supabase_servidor]");
  process.exit(2);
}

const grupos = gruposTexto.split(",").map((g) => g.trim()) as NomeGrupo[];
const desconhecidos = grupos.filter((g) => !(g in GRUPOS));
if (desconhecidos.length > 0) {
  console.error(`Grupos desconhecidos: ${desconhecidos.join(", ")}. Válidos: ${Object.keys(GRUPOS).join(", ")}`);
  process.exit(2);
}

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
