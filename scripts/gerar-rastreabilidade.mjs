// Gera docs/alinhamento/RASTREABILIDADE.md a partir do backlog.json (total dinâmico)
// e de docs/alinhamento/status-requisitos.json (status real). Sem dependências.
// Também mantém o estado de cada requisito em docs/alinhamento/execucao-integral-status.json igual ao de
// status-requisitos.json (a fonte; quem não está lá é "nao_iniciado"), com a contagem dos estados (lote R3, 14/11).
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
  return Boolean(faixa && n >= faixa[0] && n <= faixa[1]) || id === "ORA-INV-011" || id === "ORA-CAT-011";
};

const ids = new Set(backlog.items.map((i) => i.id));
for (const id of Object.keys(status.requisitos)) {
  if (!ids.has(id)) throw new Error(`status-requisitos.json cita ${id}, que não existe no backlog.json`);
  if (!validos.includes(status.requisitos[id].status)) throw new Error(`${id}: status inválido`);
}

const ROTULO = { homologado: "✅ homologado", testado: "🧪 testado", parcial: "🟡 parcial", demonstracao: "🖼️ demonstração", respeitado: "✔️ respeitado", bloqueado: "⛔ bloqueado", nao_iniciado: "⬜ não iniciado" };
const linhas = backlog.items.map((i) => {
  const s = status.requisitos[i.id] ?? { status: "nao_iniciado", nota: "", evidencia: "" };
  return { ...i, st: s.status, nota: s.nota ?? "", evidencia: s.evidencia ?? "", piloto: noPiloto(i.id) };
});

const dominios = [...new Set(linhas.map((l) => l.domain))];
const contar = (lista, st) => lista.filter((l) => l.st === st).length;
const celula = (t) => String(t).replaceAll("|", "\\|").replaceAll("\n", " ");

let md = `# Rastreabilidade dos ${backlog.items.length} requisitos\n\n`;
md += `> Arquivo GERADO por \`node scripts/gerar-rastreabilidade.mjs\` a partir de \`backlog.json\` e \`docs/alinhamento/status-requisitos.json\` (atualizado em ${status.atualizado_em}). Não edite à mão.\n\n`;
md += `"Testado" = implementado e testado em desenvolvimento, aguardando revisão do Codex e homologação. "Homologado" = aceito pelo proprietário em homologação (nenhum ainda). "Demonstração" é só tela com dados fictícios.\n\n`;
md += `## Resumo por domínio\n\n| Domínio | Total | P0 | No piloto | Homologado | Testado | Parcial | Demonstração | Respeitado | Bloqueado | Não iniciado |\n|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const d of dominios) {
  const l = linhas.filter((x) => x.domain === d);
  md += `| ${d} | ${l.length} | ${l.filter((x) => x.priority === "P0").length} | ${l.filter((x) => x.piloto).length} | ${contar(l, "homologado")} | ${contar(l, "testado")} | ${contar(l, "parcial")} | ${contar(l, "demonstracao")} | ${contar(l, "respeitado")} | ${contar(l, "bloqueado")} | ${contar(l, "nao_iniciado")} |\n`;
}
md += `| **Total** | **${linhas.length}** | **${linhas.filter((x) => x.priority === "P0").length}** | **${linhas.filter((x) => x.piloto).length}** | **${contar(linhas, "homologado")}** | **${contar(linhas, "testado")}** | **${contar(linhas, "parcial")}** | **${contar(linhas, "demonstracao")}** | **${contar(linhas, "respeitado")}** | **${contar(linhas, "bloqueado")}** | **${contar(linhas, "nao_iniciado")}** |\n\n`;

for (const d of dominios) {
  const l = linhas.filter((x) => x.domain === d);
  md += `## ${d} — ${celula(l[0].module)}\n\n| ID | Prio. | Piloto | Requisito | Aceite | Status | Nota e evidência |\n|---|---|---|---|---|---|---|\n`;
  for (const x of l) {
    const nota = [x.nota, x.evidencia && `Evidência: \`${x.evidencia}\``].filter(Boolean).join(" ");
    md += `| ${x.id} | ${x.priority} | ${x.piloto ? "sim" : "—"} | ${celula(x.requirement)} | ${celula(x.acceptance)} | ${ROTULO[x.st]} | ${celula(nota)} |\n`;
  }
  md += "\n";
}

// O checkpoint da execução integral repete o estado de cada requisito: tem de ser o mesmo da fonte.
const caminhoExecucao = "docs/alinhamento/execucao-integral-status.json";
const textoExecucao = readFileSync(caminhoExecucao, "utf8");
const execucao = JSON.parse(textoExecucao);
const naExecucao = new Set(Object.keys(execucao.requisitos));
const faltando = [...ids].filter((id) => !naExecucao.has(id));
const sobrando = [...naExecucao].filter((id) => !ids.has(id));
if (faltando.length || sobrando.length) {
  throw new Error(`${caminhoExecucao}: requisitos fora do backlog.json (${sobrando.join(", ") || "nenhum"}) ou faltando (${faltando.join(", ") || "nenhum"})`);
}
const divergentes = [];
for (const [id, r] of Object.entries(execucao.requisitos)) {
  const fonte = status.requisitos[id]?.status ?? "nao_iniciado";
  if (r.estado !== fonte) {
    divergentes.push(`${id} (${r.estado} → ${fonte})`);
    r.estado = fonte;
  }
}
const contagem = {};
for (const estado of Object.keys(execucao.contagem_dos_estados)) contagem[estado] = 0;
for (const r of Object.values(execucao.requisitos)) contagem[r.estado] = (contagem[r.estado] ?? 0) + 1;
execucao.contagem_dos_estados = contagem;
const textoExecucaoNovo = `${JSON.stringify(execucao, null, 2)}\n`;

// A tela de entregas da plataforma (lote ENTREGAS-a; aceite A18 do adendo do Codex de 16/11): os lotes com roteiro de
// aceite e a contagem dos requisitos saem do checkpoint, daqui, e nunca são escritos à mão.
const caminhoEntregas = "apps/plataforma/src/lib/entregas/dados.json";
const entregas = {
  _leia: "Gerado por scripts/gerar-rastreabilidade.mjs a partir de docs/alinhamento/execucao-integral-status.json; não editar à mão.",
  atualizado_em: execucao.atualizado_em,
  total: Object.keys(execucao.requisitos).length,
  homologados: Object.values(execucao.requisitos).filter((r) => r.homologado === true).length,
  contagem: execucao.contagem_dos_estados,
  lotes: Object.entries(execucao.aceites ?? {}).map(([lote, a]) => ({
    lote, roteiro: a.roteiro, requisitos: a.requisitos, entrega: a.entrega, commit: a.commit ?? null,
    publicado_em: a.publicado_em ?? null, pedido_em: a.pedido_em ?? null, resposta: a.resposta ?? null, respondido_em: a.respondido_em ?? null,
  })),
};
const textoEntregas = `${JSON.stringify(entregas, null, 2)}\n`;
const lerOuVazio = (caminho) => { try { return readFileSync(caminho, "utf8"); } catch { return ""; } };

const destino = "docs/alinhamento/RASTREABILIDADE.md";
if (process.argv.includes("--conferir")) {
  if (readFileSync(destino, "utf8") !== md) {
    console.error(`${destino} está desatualizado. Rode: node scripts/gerar-rastreabilidade.mjs`);
    process.exit(1);
  }
  if (textoExecucao !== textoExecucaoNovo) {
    console.error(`${caminhoExecucao} diverge de status-requisitos.json${divergentes.length ? `: ${divergentes.join("; ")}` : " (contagem dos estados)"}. Rode: node scripts/gerar-rastreabilidade.mjs`);
    process.exit(1);
  }
  if (lerOuVazio(caminhoEntregas) !== textoEntregas) {
    console.error(`${caminhoEntregas} está desatualizado. Rode: node scripts/gerar-rastreabilidade.mjs`);
    process.exit(1);
  }
  console.log("Rastreabilidade em dia.");
} else {
  writeFileSync(destino, md);
  console.log(`Gerado ${destino}: ${linhas.length} requisitos, ${linhas.filter((x) => x.piloto).length} no piloto.`);
  if (textoExecucao !== textoExecucaoNovo) {
    writeFileSync(caminhoExecucao, textoExecucaoNovo);
    console.log(`Atualizado ${caminhoExecucao}: ${divergentes.length ? divergentes.join("; ") : "contagem dos estados"}.`);
  }
  if (lerOuVazio(caminhoEntregas) !== textoEntregas) {
    writeFileSync(caminhoEntregas, textoEntregas);
    console.log(`Gerado ${caminhoEntregas}: ${entregas.lotes.length} lotes com roteiro de aceite.`);
  }
}
