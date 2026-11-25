// Regras da Nogle para o ADR-005, testadas com os EXEMPLOS DA PRÓPRIA DOCUMENTAÇÃO OFICIAL, lidos da
// cópia guardada (docs/integracoes/nogle/colecao-postman-2026-11-07.json): nada de resposta inventada.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  centavosDeValorNogle, diaDoRelatorio, interpretarConsulta, interpretarConsultaPagamento, interpretarEnvio, lerChips, lerPdvs, lerReferencias, lerRelatorio,
  montarConsulta, montarPedido, montarPedidoDoRelatorio, PEDIDO_DO_ESTOQUE_DA_MVNO, PEDIDO_DOS_PDVS, pedidoDoEstoqueDoPdv, tipoDeChip,
  conferirTransferencia, lerRespostaDaTransferencia, pedidoDaTransferencia,
  type ChipDaNogle, type OperacaoParaConsultar, type OperacaoParaEnviar, type TransferenciaParaEnviar,
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

describe("consulta pelo uuid (resposta da Nogle de 10/11/2026)", () => {
  const uuid = "184d26de-ba03-4abd-870c-231231221231";
  const recarga = { operacao_id: "op-1", tipo: "recarga" as const, situacao: "aguardando_operadora" as const, iccid: null, linha: "51988887777",
    linha_doadora: null, id_externo: "12345", data_cadastro_externa: "2022-01-01 14:29:35.057", metodo_pagamento: "LINK" as const, uuid_externo: uuid };

  it("o envio guarda o uuid quando vem no formato de uuid (no topo ou no objeto da operação); fora do formato, ignora", () => {
    const aceita = { retorno: true, mensagem: "", recarga: { id: 12345, data_cadastro: "2022-01-01 14:29:35.057" } };
    expect(interpretarEnvio("recarga", 200, { ...aceita, uuid })).toMatchObject({ resultado: "aceita", uuid });
    expect(interpretarEnvio("recarga", 200, { ...aceita, recarga: { ...aceita.recarga, uuid } })).toMatchObject({ uuid });
    expect(interpretarEnvio("recarga", 200, { ...aceita, uuid: "abc" })).not.toHaveProperty("uuid");
    expect(interpretarEnvio("recarga", 200, aceita)).not.toHaveProperty("uuid");
  });

  it("com a chave ligada e o uuid, consulta /consultaPagamento; sem a chave ou sem uuid, o caminho documentado", () => {
    expect(montarConsulta(recarga, { consultaPagamento: true })).toEqual({ metodo: "GET", caminho: "/consultaPagamento", corpo: { tipo: "ATIVREC", uuid } });
    expect(montarConsulta(recarga)).toMatchObject({ caminho: "/linhas/historico" });
    expect(montarConsulta({ ...recarga, uuid_externo: null }, { consultaPagamento: true })).toMatchObject({ caminho: "/linhas/historico" });
  });

  it("data_pagamento confirma com o uuid; sem data espera; status false ou HTTP de erro não confirmam; eSIM não vai para a evidência", () => {
    const pago = interpretarConsultaPagamento(recarga, 200, { status: true, data_pagamento: "2026-10-27", esim: "https://pdf", activation_code_esim: "LPA:1$x", qr_code_esim: "https://qr" });
    expect(pago).toEqual({ evidencia: "confirmada", mensagem: "Recarga paga e feita (consulta pelo uuid).", dados: { uuid, data_pagamento: "2026-10-27" } });
    expect(JSON.stringify(pago)).not.toContain("LPA:");
    expect(interpretarConsultaPagamento(recarga, 200, { status: true, data_pagamento: "" }).evidencia).toBe("em_andamento");
    expect(interpretarConsultaPagamento(recarga, 200, { status: false }).evidencia).toBe("sem_evidencia");
    expect(interpretarConsultaPagamento(recarga, 500, null).evidencia).toBe("falha_consulta");
  });
});

// CONNECT-c (ORA-CONNECT-009): os relatórios oficiais de ativações e recargas, lidos com os exemplos da própria coleção.
describe("os relatórios da Nogle para a conciliação", () => {
  it("o pedido de cada página tem só os campos do corpo do exemplo oficial, no GET com corpo da coleção", () => {
    for (const relatorio of ["ativacoes", "recargas"] as const) {
      const pedido = montarPedidoDoRelatorio(relatorio, "2026-11-01", "2026-11-18", 2);
      expect(pedido).toEqual({ metodo: "GET", caminho: `/relatorios/${relatorio}`, corpo: { data_de: "2026-11-01", data_ate: "2026-11-18", page: 2 } });
      const doExemplo = JSON.parse(rota(`/relatorios/${relatorio}`).request.body?.raw ?? "{}") as Record<string, unknown>;
      expect(Object.keys(pedido?.corpo ?? {}).sort()).toEqual(Object.keys(doExemplo).sort());
      expect(rota(`/relatorios/${relatorio}`).request.method).toBe("GET");
    }
    expect(montarPedidoDoRelatorio("ativacoes", "2026-11-18", "2026-11-01", 1)).toBeNull();
    expect(montarPedidoDoRelatorio("ativacoes", "2026-02-30", "2026-03-01", 1)).toBeNull();
    expect(montarPedidoDoRelatorio("ativacoes", "2026-11-01", "2026-11-18", 0)).toBeNull();
    expect(montarPedidoDoRelatorio("transacoes" as never, "2026-11-01", "2026-11-18", 1)).toBeNull();
  });

  it("o exemplo oficial vira uma linha com a linha, o dia, o plano e o valor; o nome do cliente não é guardado; o ICCID de exemplo não passa", () => {
    for (const relatorio of ["ativacoes", "recargas"] as const) {
      const { linhas, problema } = lerRelatorio(exemplo(`/relatorios/${relatorio}`), 5);
      expect(problema).toBeNull();
      expect(linhas).toEqual([{ ordem: 5, linha: "51900000000", iccid: null, dia: "2023-05-30", plano: "7 GB", valor_centavos: 4490, tipo_linha: "PRÉ PAGO", forma_pagto: "PIX" }]);
      expect(JSON.stringify(linhas)).not.toContain("Nome do Cliente");
    }
  });

  it("o relatório sem a lista não se entende; o dia que não existe ou noutra forma fica nulo", () => {
    expect(lerRelatorio({ mensagem: "erro" })).toEqual({ linhas: [], problema: "o relatório não trouxe a lista \"data\"" });
    expect(lerRelatorio(null).problema).not.toBeNull();
    expect(lerRelatorio({ data: [] })).toEqual({ linhas: [], problema: null });
    expect(diaDoRelatorio("2023-05-30 15:20:50.000")).toBe("2023-05-30");
    expect(diaDoRelatorio("2023-05-30")).toBe("2023-05-30");
    expect(diaDoRelatorio("2023-02-30 10:00:00")).toBeNull();
    expect(diaDoRelatorio("30/05/2023")).toBeNull();
    const { linhas } = lerRelatorio({ data: [{ linha: "(41) 99999-0000", iccid: "8955 0000 0000 0000 001", data_ativacao: "2026-11-10 10:00:00", plano_valor: "abc" }] });
    expect(linhas[0]).toMatchObject({ linha: "41999990000", iccid: "8955000000000000001", dia: "2026-11-10", valor_centavos: null, plano: null });
  });
});

// CONNECT-d (24/11/2026): o estoque de chips, só leitura. Os exemplos oficiais trazem o ICCID cortado ("895517011...."); a
// forma de verdade (conferida na API em 24/11, com o sim do proprietário) vai aqui com valores FICTÍCIOS.
describe("o estoque de chips da Nogle (CONNECT-d)", () => {
  const I1 = "8955170110000000011";
  const I2 = "8955170110000000029";
  const I3 = "8955170110000000037";
  const I4 = "8955170110000000045";

  it("os pedidos: a lista dos PDVs e o estoque da MVNO sem corpo; o do PDV com o id no corpo, campo documentado", () => {
    expect(PEDIDO_DOS_PDVS).toEqual({ metodo: "GET", caminho: "/pdv/listar", corpo: {} });
    expect(PEDIDO_DO_ESTOQUE_DA_MVNO).toEqual({ metodo: "GET", caminho: "/linhas/estoque", corpo: {} });
    expect(pedidoDoEstoqueDoPdv(5216)).toEqual({ metodo: "GET", caminho: "/pdv/estoque", corpo: { id: 5216 } });
    expect(camposDocumentados("/pdv/estoque").has("id")).toBe(true);
  });

  it("a lista dos PDVs: só o id, o nome, a cidade, a UF e o estoque mínimo", () => {
    expect(lerPdvs(exemplo("/pdv/listar"))).toEqual([
      { id: 12345, nome: "Nome do PDV", cidade: "Santa Cruz do sul", uf: "RS", estoque_minimo: null },
      { id: 99999, nome: "PDV Teste", cidade: "São Paulo", uf: "SP", estoque_minimo: null },
    ]);
    const real = {
      pdvs: [
        {
          id: "5216", nome: "LOJA  (teste)", razao_social: "Empresa (teste)", cnpj: "00000000000191", cpf: "00000000191",
          contato_email: "loja@teste.invalid", contato_celular: "41900000000", estoque_minimo_chips: "10", uf: "PR        ",
          cidade: "Curitiba", rua: "Rua (teste)", bairro: "Centro", numero: "1", cep: "80000000", complemento: "", total_ativo: 0,
          usuarios: [{ id: "1", nome: "Pessoa (teste)", email: "pessoa@teste.invalid", data_cadastro: "2025-01-01 10:00:00" }],
        },
        { id: "5216", nome: "repetido" }, { id: "0", nome: "zero" }, { nome: "sem id" }, { id: "7", nome: "   " }, "lixo",
      ],
    };
    const lidos = lerPdvs(real);
    expect(lidos).toEqual([{ id: 5216, nome: "LOJA (teste)", cidade: "Curitiba", uf: "PR", estoque_minimo: 10 }]);
    // Nada do que identifica pessoa ou empresa passa adiante.
    expect(JSON.stringify(lidos)).not.toMatch(/cnpj|cpf|email|celular|usuarios|Rua|Pessoa|00000000191/i);
    expect(lerPdvs({ mensagem: "erro" })).toBeNull();
    expect(lerPdvs([])).toBeNull();
    expect(lerPdvs({ pdvs: [] })).toEqual([]);
  });

  it("o estoque de um PDV e o da MVNO: só o ICCID, o tipo e a data do repasse; o código do eSIM fica de fora", () => {
    // Os exemplos oficiais: a forma se entende; os ICCIDs cortados ficam de fora e são contados.
    expect(lerChips(exemplo("/pdv/estoque"))).toEqual({ chips: [], ignorados: 2 });
    expect(lerChips(exemplo("/linhas/estoque"))).toEqual({ chips: [], ignorados: 2 });
    expect(lerChips({
      total: 4,
      data: [
        { id: "1", iccid: I1, data_repasse: "2022-03-21 22:31:23.580", tipo: "físico" },
        { id: "2", iccid: I2, data_repasse: "2022-02-30 10:00:00", tipo: "eSIM" },
        { id: "3", iccid: I1, data_repasse: null, tipo: "físico" },
        { id: "4", iccid: 8955170110000000000, tipo: "físico" },
      ],
    })).toEqual({
      chips: [{ iccid: I1, tipo: "fisico", repassado_em: "2022-03-21 22:31:23.580" }, { iccid: I2, tipo: "esim", repassado_em: null }],
      ignorados: 2,
    });
    const mvno = lerChips({
      retorno: true, mensagem: "", total: 2,
      data: [
        { id: "9", iccid: I3, tipo: "eSIM", pdf_esim: "JVBERi0xLjQK", activation_code_esim: "LPA:1$teste.invalid$CODIGO", qr_code_esim: "data:image/png;base64,iVBOR" },
        { id: "10", iccid: I4, tipo: "físico", pdf_esim: "", activation_code_esim: "", qr_code_esim: "" },
      ],
    });
    expect(mvno).toEqual({ chips: [{ iccid: I3, tipo: "esim", repassado_em: null }, { iccid: I4, tipo: "fisico", repassado_em: null }], ignorados: 0 });
    expect(JSON.stringify(mvno)).not.toMatch(/LPA|JVBER|base64|CODIGO/);
    // Sem a lista, com falha declarada ou com o total diferente da lista: não se entende (a anterior fica).
    expect(lerChips({ retorno: true, mensagem: "" })).toBeNull();
    expect(lerChips({ retorno: false, mensagem: "erro", data: [] })).toBeNull();
    expect(lerChips({ total: 3, data: [{ iccid: I1, tipo: "físico" }] })).toBeNull();
    expect(lerChips({ total: 0, data: [] })).toEqual({ chips: [], ignorados: 0 });
  });

  it("o tipo do chip, com ou sem acento", () => {
    expect(["físico", "fisico", "FÍSICO", " eSIM ", "esim"].map(tipoDeChip)).toEqual(["fisico", "fisico", "fisico", "esim", "esim"]);
    expect(["chip", "", null, 1].map(tipoDeChip)).toEqual([null, null, null, null]);
  });
});

// CONNECT-e (25/11/2026): a transferência de chips. Os exemplos de resposta são os da coleção oficial; a primeira de verdade
// (1 eSIM para a Santa Cândida, 25/11) respondeu como o exemplo do eSIM. ICCIDs FICTÍCIOS.
describe("a transferência de chips pela Nogle (CONNECT-e)", () => {
  const I = (n: number) => `895517011000000${String(n).padStart(3, "0")}1`;
  const base = { transferencia_id: "t", pdv_id: 5233, iccid: null, iccid_final: null } as const;
  const esim: TransferenciaParaEnviar = { ...base, tipo: "esim", quantidade: 2 };
  const unidade: TransferenciaParaEnviar = { ...base, tipo: "unidade", iccid: I(101), quantidade: 1 };
  const lote: TransferenciaParaEnviar = { ...base, tipo: "lote", iccid: I(101), iccid_final: I(104), quantidade: 4 };

  it("o pedido de cada tipo, só com os campos documentados; no lote, o ICCID sem o dígito verificador", () => {
    expect(pedidoDaTransferencia(esim)).toEqual({ metodo: "POST", caminho: "/pdv/transferir-chip-esim", corpo: { id: 5233, quantidade: 2 } });
    expect(pedidoDaTransferencia(unidade)).toEqual({ metodo: "POST", caminho: "/pdv/transferir-chip-fisico-unidade", corpo: { id: 5233, iccid: I(101) } });
    expect(pedidoDaTransferencia(lote)).toEqual({
      metodo: "POST", caminho: "/pdv/transferir-chip-fisico-lote", corpo: { id: 5233, iccid_inicial: I(101).slice(0, -1), iccid_final: I(104).slice(0, -1) },
    });
    for (const pedido of [pedidoDaTransferencia(esim), pedidoDaTransferencia(unidade), pedidoDaTransferencia(lote)]) {
      const documentados = camposDocumentados(pedido?.caminho ?? "");
      expect(Object.keys(pedido?.corpo ?? {}).filter((campo) => !documentados.has(campo)), pedido?.caminho).toEqual([]);
    }
    // Fora da forma: nada é enviado.
    expect(pedidoDaTransferencia({ ...esim, quantidade: 0 })).toBeNull();
    expect(pedidoDaTransferencia({ ...unidade, iccid: "123" })).toBeNull();
    expect(pedidoDaTransferencia({ ...lote, iccid: I(105) })).toBeNull();
    expect(pedidoDaTransferencia({ ...lote, iccid_final: `${I(104)}0` })).toBeNull();
    expect(pedidoDaTransferencia({ ...esim, pdv_id: 0 })).toBeNull();
  });

  it("a resposta: o sucesso dos exemplos oficiais é aceito (o lote com as contagens); 4xx é recusa; o resto, desconhecido", () => {
    expect(lerRespostaDaTransferencia(200, exemplo("/pdv/transferir-chip-esim"))).toEqual({ envio: "aceita", mensagem: "Sucesso.", transferidos: null, nao_transferidos: null });
    expect(lerRespostaDaTransferencia(200, exemplo("/pdv/transferir-chip-fisico-unidade"))).toMatchObject({ envio: "aceita", mensagem: "Sucesso!" });
    expect(lerRespostaDaTransferencia(200, exemplo("/pdv/transferir-chip-fisico-lote")))
      .toEqual({ envio: "aceita", mensagem: "Processamento Concluído.", transferidos: 5, nao_transferidos: 0 });
    expect(lerRespostaDaTransferencia(422, { message: "Chip não encontrado." })).toEqual({ envio: "recusada", mensagem: "Chip não encontrado.", transferidos: null, nao_transferidos: null });
    expect(lerRespostaDaTransferencia(400, null)).toMatchObject({ envio: "recusada", mensagem: "A Nogle recusou (HTTP 400)." });
    expect(lerRespostaDaTransferencia(500, {})).toMatchObject({ envio: "desconhecida" });
    expect(lerRespostaDaTransferencia(200, { message: "Recebido" })).toMatchObject({ envio: "desconhecida", mensagem: "Recebido" });
    expect(lerRespostaDaTransferencia(200, null)).toMatchObject({ envio: "desconhecida" });
  });

  it("a conferência pelo estoque do PDV: os chips do pedido que chegaram; todos, alguns ou nenhum", () => {
    const chip = (iccid: string, tipo: "fisico" | "esim"): ChipDaNogle => ({ iccid, tipo, repassado_em: null });
    const antes = [chip(I(1), "esim"), chip(I(2), "fisico")];
    expect(conferirTransferencia(esim, antes, [...antes, chip(I(3), "esim"), chip(I(4), "esim")])).toEqual({ confirmacao: "confirmada", novos: [I(3), I(4)] });
    expect(conferirTransferencia(esim, antes, [...antes, chip(I(3), "esim"), chip(I(5), "fisico")])).toEqual({ confirmacao: "parcial", novos: [I(3)] });
    expect(conferirTransferencia(esim, antes, antes)).toEqual({ confirmacao: "nao_confirmada", novos: [] });
    expect(conferirTransferencia(unidade, antes, [...antes, chip(I(101), "fisico")])).toEqual({ confirmacao: "confirmada", novos: [I(101)] });
    expect(conferirTransferencia(unidade, antes, [...antes, chip(I(102), "fisico")])).toEqual({ confirmacao: "nao_confirmada", novos: [] });
    expect(conferirTransferencia(lote, antes, [...antes, chip(I(101), "fisico"), chip(I(103), "fisico"), chip(I(200), "fisico")]))
      .toEqual({ confirmacao: "parcial", novos: [I(101), I(103)] });
    expect(conferirTransferencia(lote, antes, [...antes, ...[101, 102, 103, 104].map((n) => chip(I(n), "fisico"))]).confirmacao).toBe("confirmada");
  });
});
