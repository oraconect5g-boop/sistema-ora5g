// Gera docs/alinhamento/RASTREABILIDADE.md a partir do backlog.json (172 requisitos)
// e de docs/alinhamento/status-requisitos.json (status real). Sem dependências.
// Uso: node scripts/gerar-rastreabilidade.mjs [--conferir]
import { readFileSync, writeFileSync } from "node:fs";

const backlog = JSON.parse(readFileSync("backlog.json", "utf8"));
const status = JSON.parse(readFileSync("docs/alinhamento/status-requisitos.json", "utf8"));
const validos = Object.keys(status._status_validos);

// Recorte do piloto (Marco A) proposto em docs/etapa-0/ETAPA_0_BASE_CONSOLIDADA.md §5
const PILOTO = {
  ORG: [1, 6], QUAL: [1, 9], CAT: [1, 6], INV: [1, 6], CRM: [1, 3], POS: [1, 11], PAY: [1, 8],
  FIN: [1, 1], PERF: [1, 5], FISC: [1, 6], CONNECT: [1, 3], REPORT: [1, 5],
};
const noPiloto = (id) => {
  const [, dominio, numero] = id.split("-");
  const faixa = PILOTO[dominio];
  const n = Number(numero);
  return Boolean(faixa && n >= faixa[0] && n <= faixa[1]) || id === "ORA-INV-011";
};

const ids = new Set(backlog.items.map((i) => i.id));
for (const id of Object.keys(status.requisitos)) {
  if (!ids.has(id)) throw new Error(`status-requisitos.json cita ${id}, que não existe no backlog.json`);
  if (!validos.includes(status.requisitos[id].status)) throw new Error(`${id}: status inválido`);
}

const ROTULO = { feito: "✅ feito", parcial: "🟡 parcial", demonstracao: "🖼️ demonstração", respeitado: "✔️ respeitado", bloqueado: "⛔ bloqueado", nao_iniciado: "⬜ não iniciado" };
const linhas = backlog.items.map((i) => {
  const s = status.requisitos[i.id] ?? { status: "nao_iniciado", nota: "", evidencia: "" };
  return { ...i, st: s.status, nota: s.nota ?? "", evidencia: s.evidencia ?? "", piloto: noPiloto(i.id) };
});

const dominios = [...new Set(linhas.map((l) => l.domain))];
const contar = (lista, st) => lista.filter((l) => l.st === st).length;
const celula = (t) => String(t).replaceAll("|", "\\|").replaceAll("\n", " ");

let md = `# Rastreabilidade dos 172 requisitos\n\n`;
md += `> Arquivo GERADO por \`node scripts/gerar-rastreabilidade.mjs\` a partir de \`backlog.json\` e \`docs/alinhamento/status-requisitos.json\` (atualizado em ${status.atualizado_em}). Não edite à mão.\n\n`;
md += `"Feito" significa implementado e testado **em desenvolvimento**; nada foi homologado nem aceito pelo proprietário ainda. "Demonstração" é só tela com dados fictícios.\n\n`;
md += `## Resumo por domínio\n\n| Domínio | Total | P0 | No piloto | Feito | Parcial | Demonstração | Respeitado | Bloqueado | Não iniciado |\n|---|---|---|---|---|---|---|---|---|---|\n`;
for (const d of dominios) {
  const l = linhas.filter((x) => x.domain === d);
  md += `| ${d} | ${l.length} | ${l.filter((x) => x.priority === "P0").length} | ${l.filter((x) => x.piloto).length} | ${contar(l, "feito")} | ${contar(l, "parcial")} | ${contar(l, "demonstracao")} | ${contar(l, "respeitado")} | ${contar(l, "bloqueado")} | ${contar(l, "nao_iniciado")} |\n`;
}
md += `| **Total** | **${linhas.length}** | **${linhas.filter((x) => x.priority === "P0").length}** | **${linhas.filter((x) => x.piloto).length}** | **${contar(linhas, "feito")}** | **${contar(linhas, "parcial")}** | **${contar(linhas, "demonstracao")}** | **${contar(linhas, "respeitado")}** | **${contar(linhas, "bloqueado")}** | **${contar(linhas, "nao_iniciado")}** |\n\n`;

for (const d of dominios) {
  const l = linhas.filter((x) => x.domain === d);
  md += `## ${d} — ${celula(l[0].module)}\n\n| ID | Prio. | Piloto | Requisito | Aceite | Status | Nota e evidência |\n|---|---|---|---|---|---|---|\n`;
  for (const x of l) {
    const nota = [x.nota, x.evidencia && `Evidência: \`${x.evidencia}\``].filter(Boolean).join(" ");
    md += `| ${x.id} | ${x.priority} | ${x.piloto ? "sim" : "—"} | ${celula(x.requirement)} | ${celula(x.acceptance)} | ${ROTULO[x.st]} | ${celula(nota)} |\n`;
  }
  md += "\n";
}

const destino = "docs/alinhamento/RASTREABILIDADE.md";
if (process.argv.includes("--conferir")) {
  if (readFileSync(destino, "utf8") !== md) {
    console.error(`${destino} está desatualizado. Rode: node scripts/gerar-rastreabilidade.mjs`);
    process.exit(1);
  }
  console.log("Rastreabilidade em dia.");
} else {
  writeFileSync(destino, md);
  console.log(`Gerado ${destino}: ${linhas.length} requisitos, ${linhas.filter((x) => x.piloto).length} no piloto.`);
}
