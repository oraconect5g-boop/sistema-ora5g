// Regras da Nogle para o ADR-005, testadas com os EXEMPLOS DA PRÓPRIA DOCUMENTAÇÃO OFICIAL, lidos da
// cópia guardada (docs/integracoes/nogle/colecao-postman-2026-11-07.json): nada de resposta inventada.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  centavosDeValorNogle, interpretarConsulta, interpretarEnvio, lerReferencias, montarConsulta, montarPedido,
  type OperacaoParaConsultar, type OperacaoParaEnviar,
} from "./nogle";

type Resposta = { name?: string; code?: number; body?: string };
type Funcao = { name: string; request: { method: string; url: string | { raw?: string }; body?: { raw?: string }; description?: string | { content?: string } }; response?: Resposta[] };
type Grupo = { item?: (Grupo | Funcao)[] };

const COLECAO = JSON.parse(readFileSync(fileURLToPath(new URL("../../../docs/integracoes/nogle/colecao-postman-2026-11-07.json", import.meta.url)), "utf8")) as Grupo;
const todas = (g: Grupo): Funcao[] => (g.item ?? []).flatMap((i) => ("item" in i ? todas(i as Grupo) : [i as Funcao]));
const caminhoDe = (f: Funcao) => (typeof f.request.url === "string" ? f.request.url : f.request.url.raw ?? "").replace("https://api.conteltelecom.com.br", "").split("?")[0];
const rota = (caminho: string) => {
  const f = todas(COLECAO).find((x) => caminhoDe(x) === caminho);
  if (!f) throw new Error(`rota fora da documentação: ${caminho}`);
  return f;
};
const exemplo = (caminho: string, indice = 0) => JSON.parse(rota(caminho).response?.[indice]?.body ?? "null") as unknown;

// Campos documentados de uma rota: 1ª coluna das tabelas, chaves do corpo de exemplo e chaves citadas no texto.
function camposDocumentados(caminho: string): Set<string> {
  const f = rota(caminho);
  const texto = typeof f.request.description === "string" ? f.request.description : f.request.description?.content ?? "";
  const campos = new Set<string>();
  for (const [, celula] of texto.matchAll(/<tr>\s*<td>([^<]+)<\/td>/g)) if (celula) campos.add(celula.trim());
  for (const [, chave] of texto.matchAll(/"([a-z_]+)":\s*"/g)) if (chave) campos.add(chave);
  const corpo = f.request.body?.raw ? (JSON.parse(f.request.body.raw) as unknown) : null;
  for (const c of caminhosDasChaves(corpo)) campos.add(c);
  return campos;
}
function caminhosDasChaves(valor: unknown, prefixo = ""): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v) => caminhosDasChaves(v, prefixo));
  if (typeof valor !== "object" || valor === null) return prefixo ? [prefixo] : [];
  return Object.entries(valor).flatMap(([k, v]) => {
    const caminho = prefixo ? `${prefixo}.${k}` : k;
    return typeof v === "object" && v !== null ? caminhosDasChaves(v, caminho) : [caminho];
  });
}
const ultimoNome = (caminho: string) => caminho.split(".").at(-1) ?? caminho;

const DADOS = {
  nome: "Cliente Fictício da Silva", cpf: "12345678909", email: "cliente@exemplo.com", telefone: "51999990000", data_nascimento: "1990-05-20",
  endereco: { rua: "Rua Exemplo", numero: "123", complemento: "Sala 3", bairro: "Centro", cep: "90000000", id_cidade: 7703 },
};
const op = (extra: Partial<OperacaoParaEnviar>): OperacaoParaEnviar => ({
  operacao_id: "op", tipo: "ativacao", metodo_pagamento: "LINK", iccid: "8955100000000000013", esim: false, ddd: 51, linha: null,
  linha_doadora: null, operadora_doadora_id: null, plano_id: 99999, dados: DADOS, ...extra,
});
const consulta = (extra: Partial<OperacaoParaConsultar>): OperacaoParaConsultar => ({
  operacao_id: "op", tipo: "ativacao", situacao: "aguardando_operadora", iccid: "8955100000000000013", linha: null, linha_doadora: null,
  id_externo: "99999", data_cadastro_externa: null, metodo_pagamento: "LINK", ...extra,
});

describe("pedido montado só com campos da documentação", () => {
  const casos: [string, OperacaoParaEnviar][] = [
    ["ativação de chip físico", op({})],
    ["ativação de eSIM", op({ esim: true, iccid: null })],
    ["recarga", op({ tipo: "recarga", iccid: null, ddd: null, linha: "51988887777", dados: null })],
    ["portabilidade", op({ tipo: "portabilidade", metodo_pagamento: null, iccid: null, ddd: null, plano_id: null, linha: "51900000001", linha_doadora: "51911112222", operadora_doadora_id: 41, dados: null })],
  ];
  for (const [nome, operacao] of casos) {
    it(nome, () => {
      const pedido = montarPedido(operacao);
      expect(pedido.metodo).toBe(rota(pedido.caminho).request.method);
      const documentados = camposDocumentados(pedido.caminho);
      for (const campo of caminhosDasChaves(pedido.corpo)) {
        expect(documentados.has(campo) || documentados.has(ultimoNome(campo)), `${pedido.caminho}: ${campo}`).toBe(true);
      }
    });
  }

  it("eSIM vai sem ICCID e com esim=SIM; recarga no formato de lista que a validação da API cobra", () => {
    expect(montarPedido(op({ esim: true, iccid: null })).corpo.chips).toEqual([{ esim: "SIM", id_plano: 99999, ddd: 51 }]);
    expect(JSON.stringify(exemplo("/recarga/solicitar", 1))).toContain("numeros.0.numero");
    expect(montarPedido(op({ tipo: "recarga", iccid: null, ddd: null, linha: "51988887777", dados: null })).corpo)
      .toEqual({ metodo_pagamento: "LINK", sms: "N", numeros: [{ numero: "51988887777", id_plano: 99999 }], sistema_origem: "Ora 5G" });
  });

  it("pedido incompleto não sai", () => {
    expect(() => montarPedido(op({ dados: null }))).toThrow();
    expect(() => montarPedido(op({ iccid: null }))).toThrow();
    expect(() => montarPedido(op({ tipo: "recarga", linha: null }))).toThrow();
  });
});

describe("resposta do envio (exemplos oficiais)", () => {
  it("ativação aceita traz o id, a data e o link; sem dado pessoal no registro", () => {
    const r = interpretarEnvio("ativacao", 200, exemplo("/ativacao/solicitar", 0));
    expect(r).toMatchObject({ resultado: "aceita", id_externo: "99999", data_cadastro: "2022-09-09 16:53:38.753", link_pagamento: "link de pagamento" });
    expect(r.dados).toEqual({ id: "99999", id_cliente: "99999", data_cadastro: "2022-09-09 16:53:38.753" });
  });

  it("ativação: só {mensagem} é ambíguo (desconhecida); erro de campo é recusa", () => {
    expect(interpretarEnvio("ativacao", 200, exemplo("/ativacao/solicitar", 1))).toMatchObject({ resultado: "desconhecida" });
    expect(interpretarEnvio("ativacao", 200, exemplo("/ativacao/solicitar", 2)))
      .toMatchObject({ resultado: "recusada", mensagem: "Você precisa especificar um método de pagamento válido." });
    expect(interpretarEnvio("ativacao", 200, exemplo("/ativacao/solicitar", 3))).toMatchObject({ resultado: "recusada", mensagem: "ID do plano informado não existe." });
  });

  it("recarga: aceita com id e data de cadastro; erro de campo e retorno=false são recusa", () => {
    expect(interpretarEnvio("recarga", 200, exemplo("/recarga/solicitar", 0)))
      .toMatchObject({ resultado: "aceita", id_externo: "12345", data_cadastro: "2022-01-01 14:29:35.057", link_pagamento: "link" });
    expect(interpretarEnvio("recarga", 200, exemplo("/recarga/solicitar", 1))).toMatchObject({ resultado: "recusada" });
    expect(interpretarEnvio("recarga", 200, exemplo("/recarga/solicitar", 2))).toMatchObject({ resultado: "recusada", mensagem: "Cliente não encontrado." });
  });

  it("portabilidade: o exemplo de sucesso com retorno=false fica desconhecido (pergunta 7); 'Chip não encontrado' é recusa", () => {
    expect(interpretarEnvio("portabilidade", 200, exemplo("/portabilidade/solicitar", 0))).toMatchObject({ resultado: "desconhecida", id_externo: "12345" });
    expect(interpretarEnvio("portabilidade", 200, exemplo("/portabilidade/solicitar", 1))).toMatchObject({ resultado: "recusada", mensagem: "Chip não encontrado." });
    expect(interpretarEnvio("portabilidade", 200, { retorno: true, mensagem: "", portabilidade: { id: 7, data_cadastro: "2022-01-01T19:02:49Z" } }))
      .toMatchObject({ resultado: "aceita", id_externo: "7" });
  });

  it("servidor fora, limite e credencial", () => {
    expect(interpretarEnvio("recarga", 502, null).resultado).toBe("desconhecida");
    expect(interpretarEnvio("recarga", 429, null).resultado).toBe("nao_enviada");
    expect(interpretarEnvio("recarga", 401, null).resultado).toBe("nao_enviada");
    expect(interpretarEnvio("recarga", 404, exemplo("/ddds", 1))).toMatchObject({ resultado: "recusada", mensagem: "Endpoint inexistente ou recurso não encontrato." });
  });
});

describe("consulta como evidência (exemplos oficiais)", () => {
  it("ativação pelo validaIccid: 88 não prova; 11 com linha confirma; 33 em andamento; 22 erro", () => {
    const base = exemplo("/ativacao/validaIccid") as Record<string, unknown>;
    expect(montarConsulta(consulta({}))).toEqual({ metodo: "POST", caminho: "/ativacao/validaIccid", corpo: { iccid: "8955100000000000013" } });
    expect(montarConsulta(consulta({ iccid: null }))).toBeNull();
    expect(interpretarConsulta(consulta({}), 200, base).evidencia).toBe("sem_evidencia");
    expect(interpretarConsulta(consulta({}), 200, { ...base, codigo: 11, info: "ICCID ativo.", linha: "51900000000" })).toMatchObject({ evidencia: "confirmada", numero: "51900000000" });
    expect(interpretarConsulta(consulta({}), 200, { ...base, codigo: 11, linha: "" }).evidencia).toBe("sem_evidencia");
    expect(interpretarConsulta(consulta({}), 200, { ...base, codigo: "33" }).evidencia).toBe("em_andamento");
    expect(interpretarConsulta(consulta({}), 200, { ...base, codigo: 22 }).evidencia).toBe("erro_operadora");
    expect(interpretarConsulta(consulta({}), 200, { ...base, codigo: 55 }).evidencia).toBe("falha_consulta");
    expect(interpretarConsulta(consulta({}), 500, null).evidencia).toBe("falha_consulta");
  });

  it("recarga pelo histórico: só casa a mesma data de cadastro; o débito da carteira só no SALDO", () => {
    const historico = exemplo("/linhas/historico");
    const recarga = consulta({ tipo: "recarga", iccid: null, linha: "51988887777", data_cadastro_externa: "2022-06-15 11:59:34.553", metodo_pagamento: "SALDO" });
    expect(montarConsulta(recarga)).toEqual({ metodo: "GET", caminho: "/linhas/historico", corpo: { numero: "51988887777" } });
    expect(interpretarConsulta(recarga, 200, historico)).toMatchObject({ evidencia: "confirmada", valor_debitado_centavos: 4490 });
    expect(interpretarConsulta({ ...recarga, metodo_pagamento: "LINK" }, 200, historico)).not.toHaveProperty("valor_debitado_centavos");
    expect(interpretarConsulta({ ...recarga, data_cadastro_externa: "2022-06-15 11:59:34.554" }, 200, historico).evidencia).toBe("sem_evidencia");
    expect(interpretarConsulta({ ...recarga, data_cadastro_externa: null }, 200, historico).evidencia).toBe("sem_evidencia");
  });

  it("duas recargas com a mesma data de cadastro no histórico são ambíguas e não confirmam (#59)", () => {
    const historico = exemplo("/linhas/historico") as { historico: Record<string, unknown>[] };
    const recarga = consulta({ tipo: "recarga", iccid: null, linha: "51988887777", data_cadastro_externa: "2022-06-15 11:59:34.553", metodo_pagamento: "LINK" });
    const repetida = historico.historico.find((h) => h.data_cadastro === "2022-06-15 11:59:34.553");
    expect(repetida).toBeDefined();
    const ambiguo = { ...historico, historico: [...historico.historico, { ...repetida, data_recarga: "2022-06-15 12:30:00" }] };
    expect(interpretarConsulta(recarga, 200, ambiguo)).toMatchObject({ evidencia: "ambigua", dados: { ocorrencias: 2 } });
    expect(interpretarConsulta(recarga, 200, historico).evidencia).toBe("confirmada");
  });

  it("portabilidade pelo status: Sucesso confirma, negada nega, as demais esperam", () => {
    // O exemplo oficial do status tem um erro de digitação (faltam dois-pontos em "termo"); corrigido só isso.
    const texto = (rota("/portabilidade/status").response?.[0]?.body ?? "").replace(/"termo" "/g, '"termo": "').replace(/"termo_assinado" "/g, '"termo_assinado": "');
    const status = JSON.parse(texto) as { status: Record<string, unknown> };
    const porta = consulta({ tipo: "portabilidade", iccid: null, linha: "51900000001", linha_doadora: "51911112222" });
    expect(interpretarConsulta(porta, 200, status).evidencia).toBe("confirmada");
    expect(interpretarConsulta(porta, 200, { ...status, status: { ...status.status, status: "Portabilidade negada" } }).evidencia).toBe("negada");
    expect(interpretarConsulta(porta, 200, { ...status, status: { ...status.status, status: "Aguardando confirmação" } }).evidencia).toBe("em_andamento");
    expect(interpretarConsulta(porta, 200, { ...status, status: { status: "Outro" } }).evidencia).toBe("falha_consulta");
  });
});

describe("listas oficiais e dinheiro", () => {
  it("planos, cidades, DDDs e operadoras no formato documentado", () => {
    expect(lerReferencias("plano", exemplo("/planos"))).toEqual([
      { codigo: "99999", nome: "7 GB", valor_centavos: 4490, dados: { ligacoes: "ligações ilimitadas", sms: "100 SMS", internet: "6 GB", detalhamento: "6 GB + 1 GB" } },
    ]);
    expect(lerReferencias("cidade", exemplo("/cidades/UF")).map((c) => [c.codigo, c.uf])).toEqual([["7703", "RS"], ["7704", "RS"], ["7705", "RS"], ["7706", "RS"]]);
    expect(lerReferencias("ddd", exemplo("/ddds")).slice(0, 2)).toEqual([{ codigo: "11", nome: "11", uf: "SP" }, { codigo: "12", nome: "12", uf: "SP" }]);
    expect(lerReferencias("operadora", exemplo("/portabilidade/operadorasDisponiveis")).map((o) => o.nome)).toEqual(["CLARO", "NEXTEL", "OI", "SURF TELECOM", "TIM", "VIVO"]);
    expect(lerReferencias("plano", { data: [{ id: 1, plano: "X", valor: "abc" }, { id: "x", plano: "Y", valor: 1 }, null] })).toEqual([]);
    expect(lerReferencias("plano", null)).toEqual([]);
  });

  it("valor da Nogle em centavos sem arredondar", () => {
    expect(centavosDeValorNogle(44.9)).toBe(4490);
    expect(centavosDeValorNogle("44.90")).toBe(4490);
    expect(centavosDeValorNogle("39.9")).toBe(3990);
    expect(centavosDeValorNogle(0)).toBe(0);
    for (const ruim of ["-1", "1e3", "44.905", Number.NaN, "", null, "1.000,00"]) expect(centavosDeValorNogle(ruim)).toBeNull();
  });
});
