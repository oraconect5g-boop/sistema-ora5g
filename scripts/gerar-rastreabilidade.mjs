// Gera docs/alinhamento/RASTREABILIDADE.md a partir do backlog.json (total dinâmico)
// e de docs/alinhamento/status-requisitos.json (status real). Sem dependências.
// Também mantém o estado de cada requisito em docs/alinhamento/execucao-integral-status.json igual ao de
// status-requisitos.json (a fonte; quem não está lá é "nao_iniciado"), com a contagem dos estados (lote R3, 14/11).
// AUD-e (24/11): também o placar da fila integral, a contagem dos aceites da lista única e docs/aceite/JORNADAS.md (os
// roteiros por jornada, pelo mapa docs/aceite/jornadas.json).
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

// AUD-e (24/11; o achado F24-05 da revisão do Codex de 24/11): o placar da fila e a contagem dos aceites da lista única
// saem daqui, da fonte, e nunca mais à mão; os roteiros de aceite agrupados por jornada também. O --conferir reprova o
// documento desatualizado e o lote com roteiro sem jornada em docs/aceite/jornadas.json.
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const trocarEntre = (texto, inicio, fim, novo, onde) => {
  const i = texto.indexOf(inicio);
  const j = texto.indexOf(fim, i);
  if (i < 0 || j < 0) throw new Error(`${onde}: os marcadores do trecho gerado não foram achados`);
  return `${texto.slice(0, i + inicio.length)}\n${novo}\n${texto.slice(j)}`;
};
const contagemDosEstados = execucao.contagem_dos_estados;
const homologadosAgora = Object.values(execucao.requisitos).filter((r) => r.homologado === true).length;
const placar = `Dos ${Object.keys(execucao.requisitos).length} requisitos: **${plural(contagemDosEstados.testado ?? 0, "testado", "testados")}**, `
  + `${plural(contagemDosEstados.parcial ?? 0, "parcial", "parciais")}, ${plural(contagemDosEstados.nao_iniciado ?? 0, "não iniciado", "não iniciados")}, `
  + `${plural(contagemDosEstados.bloqueado ?? 0, "bloqueado", "bloqueados")} e ${plural(contagemDosEstados.respeitado ?? 0, "restrição respeitada", "restrições respeitadas")}. `
  + `${homologadosAgora ? plural(homologadosAgora, "homologado", "homologados") : "Nenhum homologado"}: o aceite do proprietário e a revisão do Codex vêm depois de `
  + "cada lote. Parcial não conta como pronto.";
const caminhoFila = "docs/alinhamento/FILA_INTEGRAL_2026-11-23.md";
const textoFila = readFileSync(caminhoFila, "utf8");
const textoFilaNovo = trocarEntre(textoFila, "<!-- placar: gerado por scripts/gerar-rastreabilidade.mjs a partir de status-requisitos.json; não editar à mão -->",
  "<!-- fim do placar -->", placar, caminhoFila);

const aceitesDosLotes = Object.entries(execucao.aceites ?? {});
const aceitos = aceitesDosLotes.filter(([, a]) => a.resposta === "aceito").map(([lote]) => lote);
const semResposta = aceitesDosLotes.filter(([, a]) => !a.resposta).length;
const linhaDosAceites = `| ${plural(aceitos.length, "aceito", "aceitos")}${aceitos.length ? ` (${aceitos.join(", ")})` : ""} | ${semResposta} roteiros sem resposta |`;
const caminhoPendencias = "docs/PENDENCIAS_DO_PROPRIETARIO.md";
const textoPendencias = readFileSync(caminhoPendencias, "utf8");
const padraoDosAceites = /\| \d+ aceitos?(?: \([^)]*\))? \| \d+ roteiros sem resposta \|/g;
if ((textoPendencias.match(padraoDosAceites) ?? []).length !== 1) throw new Error(`${caminhoPendencias}: a linha da contagem dos aceites não foi achada uma vez`);
const textoPendenciasNovo = textoPendencias.replace(padraoDosAceites, linhaDosAceites);

const caminhoMapa = "docs/aceite/jornadas.json";
const mapa = JSON.parse(readFileSync(caminhoMapa, "utf8"));
const semJornada = aceitesDosLotes.map(([lote]) => lote).filter((lote) => !mapa.lotes[lote]?.length);
const lotesSobrando = Object.keys(mapa.lotes).filter((lote) => !execucao.aceites?.[lote]);
const jornadaDesconhecida = Object.entries(mapa.lotes).flatMap(([lote, js]) => js.filter((j) => !mapa.jornadas[j]).map((j) => `${lote} → ${j}`));
if (semJornada.length || lotesSobrando.length || jornadaDesconhecida.length) {
  console.error(`${caminhoMapa}: ${[semJornada.length && `lote sem jornada: ${semJornada.join(", ")}`, lotesSobrando.length && `lote que não existe nos aceites: ${lotesSobrando.join(", ")}`,
    jornadaDesconhecida.length && `jornada desconhecida: ${jornadaDesconhecida.join(", ")}`].filter(Boolean).join("; ")}. Acerte o mapa e rode de novo.`);
  process.exit(1);
}
const estadoDe = (id) => ROTULO[status.requisitos[id]?.status ?? "nao_iniciado"];
let jornadasMd = "# Os aceites por jornada\n\n";
jornadasMd += `> Arquivo GERADO por \`node scripts/gerar-rastreabilidade.mjs\` a partir de \`docs/aceite/jornadas.json\` (o mapa lote → jornada) e de \`docs/alinhamento/execucao-integral-status.json\` (os roteiros, os requisitos, a publicação e a resposta). Não edite à mão.\n\n`;
jornadasMd += "Em vez de responder roteiro por roteiro, percorra **uma jornada por vez**: o caminho dela, com os roteiros listados como apoio. "
  + "Responda **\"J04 aceito\"** ou **\"J04 não aceito: o passo e o que aconteceu\"**; a resposta vale para os roteiros da jornada (o Claude Code registra em cada lote). "
  + "Um lote pode aparecer em mais de uma jornada. Requisito parcial continua parcial depois do aceite: o aceite diz que o que foi entregue funciona, não que o requisito acabou. "
  + "As jornadas são as da matriz J01 a J15 da revisão do Codex de 24/11 (`FLUXOS_E_ACEITE.md`, na branch `docs/revisao-visual-fluxos-20261124`).\n\n";
jornadasMd += "| Jornada | Roteiros | Aceitos | Sem resposta | Requisitos (testados / parciais / outros) |\n|---|---|---|---|---|\n";
const porJornada = Object.entries(mapa.jornadas).map(([id, j]) => {
  const lotes = aceitesDosLotes.filter(([lote]) => mapa.lotes[lote].includes(id));
  const requisitos = [...new Set(lotes.flatMap(([, a]) => a.requisitos ?? []))].sort();
  return { id, j, lotes, requisitos };
});
for (const { id, j, lotes, requisitos } of porJornada) {
  const st = (s) => requisitos.filter((r) => (status.requisitos[r]?.status ?? "nao_iniciado") === s).length;
  jornadasMd += `| [${id} — ${j.nome}](#${id.toLowerCase()}) | ${lotes.length} | ${lotes.filter(([, a]) => a.resposta === "aceito").length} | ${lotes.filter(([, a]) => !a.resposta).length} | `
    + `${requisitos.length} (${st("testado")} / ${st("parcial")} / ${requisitos.length - st("testado") - st("parcial")}) |\n`;
}
for (const { id, j, lotes, requisitos } of porJornada) {
  jornadasMd += `\n## ${id}\n\n**${j.nome}.** O caminho: ${j.caminho}.\n\n`;
  jornadasMd += requisitos.length ? `**Os requisitos que os roteiros cobrem:** ${requisitos.map((r) => `${r} (${estadoDe(r)})`).join(", ")}.\n\n` : "**Os requisitos:** nenhum roteiro ainda.\n\n";
  if (!lotes.length) { jornadasMd += "Nenhum roteiro de aceite nesta jornada ainda.\n"; continue; }
  jornadasMd += "| Lote | O que entrega | Roteiro | No ar | Resposta |\n|---|---|---|---|---|\n";
  for (const [lote, a] of lotes) {
    const arquivo = String(a.roteiro ?? "").split("/").pop();
    jornadasMd += `| ${lote} | ${celula(a.entrega ?? "")} | ${arquivo ? `[${arquivo}](${arquivo})` : "—"} | ${a.commit ? `\`${a.commit}\` (${a.publicado_em ?? "—"})` : "a publicar"} | ${a.resposta ? celula(a.resposta) : "—"} |\n`;
  }
}
const caminhoJornadas = "docs/aceite/JORNADAS.md";

const destino = "docs/alinhamento/RASTREABILIDADE.md";
if (process.argv.includes("--conferir")) {
  for (const [caminho, atual, novo] of [[caminhoFila, textoFila, textoFilaNovo], [caminhoPendencias, textoPendencias, textoPendenciasNovo],
    [caminhoJornadas, lerOuVazio(caminhoJornadas), jornadasMd]]) {
    if (atual !== novo) {
      console.error(`${caminho} está desatualizado (o placar, a contagem dos aceites ou as jornadas). Rode: node scripts/gerar-rastreabilidade.mjs`);
      process.exit(1);
    }
  }
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
  if (textoFila !== textoFilaNovo) { writeFileSync(caminhoFila, textoFilaNovo); console.log(`Atualizado o placar de ${caminhoFila}.`); }
  if (textoPendencias !== textoPendenciasNovo) { writeFileSync(caminhoPendencias, textoPendenciasNovo); console.log(`Atualizada a contagem dos aceites de ${caminhoPendencias}.`); }
  if (lerOuVazio(caminhoJornadas) !== jornadasMd) { writeFileSync(caminhoJornadas, jornadasMd); console.log(`Gerado ${caminhoJornadas}: ${porJornada.length} jornadas.`); }
}
