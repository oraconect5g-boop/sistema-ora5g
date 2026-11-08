#!/usr/bin/env node
// Gera apps/plataforma/src/integracoes/nogle/catalogo.ts a partir da cópia da coleção oficial da API NOGLE
// (docs/integracoes/nogle/colecao-postman-*.json, baixada de https://docs.nogle.tech/).
// Uso: node scripts/gerar-catalogo-nogle.mjs            (gera)
//      node scripts/gerar-catalogo-nogle.mjs --conferir (falha se o arquivo gerado estiver desatualizado)
import { readFileSync, writeFileSync } from "node:fs";

const COLECAO = "docs/integracoes/nogle/colecao-postman-2026-11-07.json";
const DESTINO = "apps/plataforma/src/integracoes/nogle/catalogo.ts";
const BASE = "https://api.conteltelecom.com.br";

// PROPOSTA da Ora (não vem da documentação): em que aba da tela cada função aparece, quem usa e o efeito.
const USO = {
  "/auth/token": ["integracao", "sistema", "sessao"],
  "/ddds": ["ativar", "loja", "leitura"], "/planos": ["ativar", "loja", "leitura"], "/planosCampanhas": ["recarga", "loja", "leitura"],
  "/estados": ["ativar", "loja", "leitura"], "/cidades/UF": ["ativar", "loja", "leitura"], "/logistica": ["chips", "loja", "leitura"],
  "/cliente/criar": ["ativar", "loja", "escrita"], "/cliente/atualizar": ["ativar", "loja", "escrita"], "/cliente/buscar": ["ativar", "loja", "leitura"],
  "/cliente/linhas": ["linha", "loja", "leitura"], "/cliente/listar": ["carteira", "gestao", "leitura"],
  "/linhas/detalhes": ["linha", "loja", "leitura"], "/linhas/saldo": ["linha", "loja", "leitura"], "/linhas/historico": ["linha", "loja", "leitura"],
  "/linhas/verificaExistencia": ["linha", "loja", "leitura"], "/linhas/numeroPeloIccid": ["linha", "loja", "leitura"], "/linhas/validaTitularidade": ["linha", "loja", "leitura"],
  "/linhas/listar": ["carteira", "gestao", "leitura"], "/linhas/estoque": ["chips", "loja", "leitura"], "/linhas/cobrancasGeradas": ["linha", "loja", "leitura"],
  "/linhas/atualizar": ["linha", "loja", "escrita"],
  "/linhas/consumo/dados": ["linha", "loja", "leitura"], "/linhas/consumo/voz": ["linha", "loja", "leitura"], "/linhas/consumo/sms": ["linha", "loja", "leitura"],
  "/ativacao/solicitar": ["ativar", "loja", "escrita"], "/ativacao/detalhar": ["ativar", "loja", "leitura"], "/ativacao/verificaPlanoPago": ["ativar", "loja", "leitura"],
  "/ativacao/validaIccid": ["ativar", "loja", "leitura"],
  "/recarga/solicitar": ["recarga", "loja", "escrita"], "/recarga/alterarStatusRecargaAutomatica": ["recarga", "gestao", "escrita"], "/recarga/saldo/adicionar": ["recarga", "gestao", "escrita"],
  "/portabilidade/solicitar": ["portabilidade", "loja", "escrita"], "/portabilidade/status": ["portabilidade", "loja", "leitura"],
  "/portabilidade/operadorasDisponiveis": ["portabilidade", "loja", "leitura"], "/portabilidade/reenviarsms": ["portabilidade", "loja", "escrita"],
  "/compra/solicitar": ["chips", "loja", "escrita"], "/compra/rastrear": ["chips", "loja", "leitura"],
  "/atendimento/bloqueio": ["atendimento", "gestao", "escrita"], "/atendimento/desbloqueio": ["atendimento", "gestao", "escrita"],
  "/portabilidade/listar": ["carteira", "gestao", "leitura"], "/relatorios/ativacoes": ["carteira", "gestao", "leitura"],
  "/relatorios/recargas": ["carteira", "gestao", "leitura"], "/relatorios/transacoes": ["carteira", "gestao", "leitura"],
  "/faq/categorias": ["atendimento", "loja", "leitura"], "/faq/categoria/X": ["atendimento", "loja", "leitura"],
  "/validar/cep": ["ativar", "loja", "leitura"], "/validar/cpf": ["ativar", "loja", "leitura"], "/validar/cnpj": ["ativar", "loja", "leitura"],
  "/pagamento": ["recarga", "loja", "leitura"],
  "/saldo/saldo": ["carteira", "gestao", "leitura"], "/saldo/extrato": ["carteira", "gestao", "leitura"], "/saldo/programado": ["carteira", "gestao", "leitura"],
  "/pdv/cadastrar": ["integracao", "administracao", "escrita"], "/pdv/usuario": ["integracao", "administracao", "escrita"],
  "/pdv/inativar": ["integracao", "administracao", "escrita"], "/pdv/atualizar": ["integracao", "administracao", "escrita"],
  "/pdv/estoque": ["chips", "loja", "leitura"], "/pdv/listar": ["integracao", "administracao", "leitura"],
  "/pdv/transferir-chip-fisico-unidade": ["chips", "gestao", "escrita"], "/pdv/transferir-chip-fisico-lote": ["chips", "gestao", "escrita"],
  "/pdv/transferir-chip-esim": ["chips", "gestao", "escrita"],
};

// Sem proteção contra duplicidade documentada: o que consultar antes de reenviar depois de falha ou tempo esgotado.
const RECONSULTA = {
  "/ativacao/solicitar": ["/ativacao/validaIccid", "/ativacao/detalhar"],
  "/recarga/solicitar": ["/linhas/historico", "/linhas/cobrancasGeradas"],
  "/portabilidade/solicitar": ["/portabilidade/status"],
  "/compra/solicitar": ["/pagamento"],
  "/atendimento/bloqueio": ["/linhas/detalhes"],
  "/atendimento/desbloqueio": ["/linhas/detalhes"],
};

const texto = (v) => (typeof v === "object" && v !== null ? v.content ?? "" : v ?? "");
const semTags = (t) => t.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function primeiraFrase(descricao) {
  const limpo = semTags(texto(descricao)).replace(/StartFragment/g, "").replace(/\s+/g, " ").trim();
  const m = limpo.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : limpo).slice(0, 180);
}

function obrigatorios(descricao) {
  const campos = [];
  for (const [, linha] of texto(descricao).matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const celulas = [...linha.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, c]) => semTags(c).trim());
    if (celulas.length >= 4 && celulas[3] && !campos.includes(celulas[0])) campos.push(celulas[0]);
  }
  return campos;
}

const colecao = JSON.parse(readFileSync(COLECAO, "utf8"));
const funcoes = [];
(function andar(nos, grupo) {
  for (const no of nos) {
    if (no.item) { andar(no.item, no.name); continue; }
    const r = no.request;
    const url = typeof r.url === "object" ? r.url.raw : r.url;
    const caminho = url.replace(BASE, "");
    const uso = USO[caminho];
    if (!uso) throw new Error(`Função nova na documentação sem uso definido: ${r.method} ${caminho}`);
    const [aba, quem, efeito] = uso;
    const corpo = (r.body?.raw ?? "").trim();
    funcoes.push({
      grupo, nome: no.name, metodo: r.method, caminho, descricao: primeiraFrase(r.description), aba, quem, efeito,
      corpoEmGet: r.method === "GET" && corpo !== "", obrigatorios: obrigatorios(r.description), reconsultar: RECONSULTA[caminho] ?? [],
    });
  }
})(colecao.item);
if (funcoes.length !== Object.keys(USO).length) throw new Error(`Funções na coleção: ${funcoes.length}; com uso definido: ${Object.keys(USO).length}`);

const conteudo = `// GERADO por scripts/gerar-catalogo-nogle.mjs a partir da coleção oficial da API NOGLE (Contel Telecom),
// publicada em https://docs.nogle.tech/. Cópia lida em 07/11/2026: ${COLECAO}. Não editar à mão.
// "aba", "quem" e "reconsultar" são PROPOSTA da Ora (validar com o proprietário e a Contel), não vêm da documentação.

export type AbaConnect = "operacoes" | "ativar" | "linha" | "recarga" | "portabilidade" | "atendimento" | "chips" | "carteira" | "integracao";
export type QuemUsa = "loja" | "gestao" | "administracao" | "sistema";

export type FuncaoNogle = {
  grupo: string;
  nome: string;
  metodo: "GET" | "POST" | "PUT" | "DELETE";
  caminho: string;
  descricao: string;
  aba: AbaConnect;
  quem: QuemUsa;
  efeito: "leitura" | "escrita" | "sessao";
  /** GET que a documentação manda com corpo JSON: navegador e fetch não enviam; confirmar com a Contel. */
  corpoEmGet: boolean;
  obrigatorios: readonly string[];
  /** Sem proteção contra duplicidade documentada: o que consultar antes de reenviar depois de uma falha. */
  reconsultar: readonly string[];
};

export const FUNCOES_NOGLE: readonly FuncaoNogle[] = ${JSON.stringify(funcoes, null, 2)};
`;

if (process.argv.includes("--conferir")) {
  const atual = readFileSync(DESTINO, "utf8");
  if (atual !== conteudo) {
    console.error(`${DESTINO} está desatualizado: rode node scripts/gerar-catalogo-nogle.mjs`);
    process.exit(1);
  }
  console.log(`Catálogo da Nogle em dia: ${funcoes.length} funções.`);
} else {
  writeFileSync(DESTINO, conteudo);
  console.log(`Gerado ${DESTINO}: ${funcoes.length} funções, ${funcoes.filter((f) => f.corpoEmGet).length} GET com corpo.`);
}
