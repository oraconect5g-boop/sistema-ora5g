// Regras da Nogle para o ADR-005, testadas com os EXEMPLOS DA PRÓPRIA DOCUMENTAÇÃO OFICIAL, lidos da
// cópia guardada (docs/integracoes/nogle/colecao-postman-2026-11-07.json): nada de resposta inventada.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  centavosDeValorNogle, diaDoRelatorio, interpretarConsulta, interpretarConsultaPagamento, interpretarEnvio, lerChips, lerPdvs, lerReferencias, lerRelatorio,
  montarConsulta, montarPedido, montarPedidoDoRelatorio, PEDIDO_DO_ESTOQUE_DA_MVNO, PEDIDO_DOS_PDVS, pedidoDoEstoqueDoPdv, tipoDeChip,
  conferirTransferencia, lerRespostaDaTransferencia, pedidoDaTransferencia,
  documentoMascarado, lerRespostaDaConsulta, pedidoDaConsulta, TIPOS_DE_CONSULTA,
  ehConsultaComposta, lerParteDoRelatorio, PARAMETRO_DA_CONSULTA, lerRespostaDaAcao, pedidoDaAcao, TIPOS_DE_ACAO, type AcaoParaEnviar, pedidoDaPortabilidade, pedidoDasLinhasDoCliente, pedidoDasTransacoesDaLinha, pedidoDoCliente,
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

// CONNECT-g (25/11/2026): as consultas que só leem, com os pedidos e as respostas da coleção oficial.
describe("as consultas da Nogle que só leem (CONNECT-g)", () => {
  const AGORA = new Date("2026-11-25T15:00:00Z");
  const LINHA = "51900000000";
  const ICCID = "8955170110000000016";

  it("cada consulta pede a rota e os campos da coleção oficial (GET com o corpo); fora da forma, nada", () => {
    for (const tipo of TIPOS_DE_CONSULTA) {
      const pede = PARAMETRO_DA_CONSULTA[tipo];
      const parametro = pede === "linha" ? LINHA : pede === "iccid" ? ICCID : pede === "documento" ? "12345678909" : null;
      const pedido = pedidoDaConsulta(tipo, parametro, AGORA);
      // Os relatórios (CONNECT-h) não têm um pedido só: o worker monta em partes.
      if (ehConsultaComposta(tipo)) {
        expect(pedido, tipo).toBeNull();
        continue;
      }
      const documentada = rota(pedido?.caminho ?? "");
      expect(pedido?.metodo, tipo).toBe(documentada.request.method);
      const chaves = Object.keys(JSON.parse(documentada.request.body?.raw?.trim() || "{}") as object);
      expect(Object.keys(pedido?.corpo ?? {}).every((k) => chaves.includes(k)), `${tipo}: ${Object.keys(pedido?.corpo ?? {}).join(",")}`).toBe(true);
    }
    expect(pedidoDaConsulta("linha_detalhes", "(51) 90000-0000", AGORA)).toEqual({ metodo: "GET", caminho: "/linhas/detalhes", corpo: { numero: LINHA } });
    expect(pedidoDaConsulta("linha_saldo", LINHA, AGORA)?.corpo).toEqual({ linha: LINHA });
    // O consumo vai com o mês corrente em Brasília (às 23h de 30/11 ainda é novembro lá).
    expect(pedidoDaConsulta("linha_consumo", LINHA, new Date("2026-12-01T02:00:00Z"))?.corpo).toEqual({ linha: LINHA, mes: "11", ano: "2026" });
    expect(pedidoDaConsulta("iccid_ativacao", ICCID, AGORA)).toEqual({ metodo: "GET", caminho: "/ativacao/detalhar", corpo: { iccid: ICCID } });
    expect(pedidoDaConsulta("carteira_saldo", null, AGORA)).toEqual({ metodo: "GET", caminho: "/saldo/saldo", corpo: {} });
    expect(pedidoDaConsulta("linha_saldo", "5190000", AGORA)).toBeNull();
    expect(pedidoDaConsulta("iccid_numero", "123", AGORA)).toBeNull();
  });

  it("lê as respostas oficiais e guarda só o que a tela mostra (nada do PDF do eSIM, do documento inteiro nem de quem pediu)", () => {
    const detalhes = lerRespostaDaConsulta("linha_detalhes", 200, exemplo("/linhas/detalhes"));
    expect(detalhes).toMatchObject({ situacao: "respondida", resposta: {
      linha: LINHA, status: "ATIVO", tipo_linha: "PRÉ PAGO", plano: "7 GB", titular: "Contel Telecom", documento: "•••.•••.000-00",
      data_ativacao: "2023-05-30", data_fim_plano: "2023-06-30", data_perda_numero: "2023-09-13", bloqueada: false, esim: false,
      portada: false, recarga_automatica: false,
    } });
    const guardado = JSON.stringify(detalhes.resposta);
    for (const fora of ["esim_pdf", "00000000000", "titular_apelido", "cor_app", "emoji", "id_linha"]) expect(guardado).not.toContain(fora);
    // CONNECT-h: o apelido que a Ora dá à linha (linha_apelido) entra no relatório do número.
    expect(detalhes.resposta?.linha_apelido).toBe("Escritório");
    expect(lerRespostaDaConsulta("linha_detalhes", 200, exemplo("/linhas/detalhes", 1))).toEqual({ situacao: "nao_encontrada", mensagem: "Linha não encontrada." });

    expect(lerRespostaDaConsulta("linha_saldo", 200, exemplo("/linhas/saldo")).resposta)
      .toEqual({ dados_mb: 2395.226721, minutos: 60, minutos_ilimitados: false, sms: 60 });
    const historico = lerRespostaDaConsulta("linha_historico", 200, exemplo("/linhas/historico"));
    // CONNECT-h: o valor é o "valor" (o pago); o "valor_pago" é o que a Ora pagou à Nogle, e fica fora (o primeiro exemplo só traz ele).
    expect(historico.resposta).toEqual({ recargas: [
      { quando: "2022-06-15 11:59", plano: "7 GB", valor_centavos: null, forma: "LINK" },
      { quando: "2022-05-12 19:21", plano: "7 GB", valor_centavos: 4490, forma: "LINK" },
    ] });
    expect(JSON.stringify(historico)).not.toContain("solicitado_por");
    const consumo = lerRespostaDaConsulta("linha_consumo", 200, exemplo("/linhas/consumo/dados"));
    const dias = (consumo.resposta?.dias ?? []) as { dia: string; bytes: number }[];
    expect(dias[0]).toEqual({ dia: "2022-06-01", bytes: 129598970 });
    expect(consumo.resposta?.total_bytes).toBe(dias.reduce((s, d) => s + d.bytes, 0));
    expect(lerRespostaDaConsulta("iccid_numero", 200, exemplo("/linhas/numeroPeloIccid")).resposta).toEqual({ numero: LINHA });
    expect(lerRespostaDaConsulta("iccid_ativacao", 200, exemplo("/ativacao/detalhar")).resposta).toEqual({
      cliente: "Fulano da Silva", plano: "4 GB", numero_ativado: "11000000000", numero_portado: null, forma_pagamento: "LINK",
      data_solicitacao: "2021-12-03 14:36", data_ativacao: "2021-12-03 14:36",
    });
    expect(lerRespostaDaConsulta("iccid_ativacao", 422, exemplo("/ativacao/detalhar", 1))).toEqual({ situacao: "nao_encontrada", mensagem: "ICCID informado não existe." });
    expect(lerRespostaDaConsulta("carteira_saldo", 200, exemplo("/saldo/saldo"))).toEqual({ situacao: "respondida", mensagem: "", resposta: { saldo_centavos: 50000 } });
  });

  it("a falta de resposta, o acesso recusado e a resposta fora da forma falham, sem inventar nada", () => {
    expect(lerRespostaDaConsulta("linha_saldo", 502, null)).toMatchObject({ situacao: "falhou" });
    expect(lerRespostaDaConsulta("linha_saldo", 401, { message: "Unauthenticated." })).toEqual({ situacao: "falhou", mensagem: "A Nogle recusou o acesso (HTTP 401)." });
    expect(lerRespostaDaConsulta("linha_saldo", 200, { retorno: true, mensagem: "", data: {} })).toEqual({ situacao: "falhou", mensagem: "A resposta da Nogle veio fora da forma documentada." });
    expect(lerRespostaDaConsulta("carteira_saldo", 200, { saldo: "muito" })).toMatchObject({ situacao: "falhou" });
    expect(lerRespostaDaConsulta("iccid_numero", 200, { retorno: true, mensagem: "", numero: "123" })).toMatchObject({ situacao: "falhou" });
    expect(lerRespostaDaConsulta("linha_historico", 404, { erro: "Endpoint inexistente ou recurso não encontrato." }))
      .toEqual({ situacao: "nao_encontrada", mensagem: "Endpoint inexistente ou recurso não encontrato." });
    expect(documentoMascarado("12345678909")).toBe("•••.•••.789-09");
    expect(documentoMascarado("11222333000181")).toBe("••.•••.•••/0001-81");
    expect(documentoMascarado("123")).toBeNull();
  });
});

// CONNECT-h (25/11/2026): as consultas que faltavam e as partes dos relatórios do número e do cliente, com os exemplos oficiais.
describe("a consulta completa: as consultas novas e as partes dos relatórios (CONNECT-h)", () => {
  const AGORA = new Date("2026-11-25T15:00:00Z");
  const LINHA = "51900000000";
  const chavesDocumentadas = (caminho: string) => Object.keys(JSON.parse(rota(caminho).request.body?.raw?.trim() || "{}") as object);

  it("as consultas novas leem os exemplos oficiais, sem os links de pagamento", () => {
    const cobrancas = lerRespostaDaConsulta("linha_cobrancas", 200, exemplo("/linhas/cobrancasGeradas"));
    expect(cobrancas.resposta).toEqual({ cobrancas: [{ quando: "2024-01-10 11:08", valor_centavos: 3990, forma: "LINK" }] });
    expect(JSON.stringify(cobrancas)).not.toContain("link_url");
    expect(lerRespostaDaConsulta("linha_consumo_voz", 200, exemplo("/linhas/consumo/voz")).resposta).toEqual({
      dias: [{ dia: "2022-01-01", quantidade: 30 }, { dia: "2022-01-02", quantidade: 10 }], total: 40, unidade: "segundos",
    });
    expect(lerRespostaDaConsulta("linha_consumo_sms", 200, exemplo("/linhas/consumo/sms")).resposta).toMatchObject({ total: 1, unidade: "sms" });
    // A existência vem com "retorno": false quando a linha não existe: mesmo assim é uma resposta.
    expect(lerRespostaDaConsulta("linha_existe", 200, exemplo("/linhas/verificaExistencia")))
      .toEqual({ situacao: "respondida", mensagem: "", resposta: { existe: false, explicacao: "Linha não encontrada." } });
    expect(lerRespostaDaConsulta("iccid_plano_pago", 200, exemplo("/ativacao/verificaPlanoPago")).resposta).toEqual({ plano_pago: "99999" });
    expect(lerRespostaDaConsulta("iccid_plano_pago", 200, { retorno: true, mensagem: "", plano: null }).resposta).toEqual({ plano_pago: null });
    expect(lerRespostaDaConsulta("iccid_situacao", 200, exemplo("/ativacao/validaIccid")).resposta)
      .toEqual({ codigo: 88, situacao: "Chip virgem", orientacao: "Pode ativar.", linha: null });
  });

  it("as partes do relatório do número: a portabilidade (sem o termo) e as transações da linha (sem o cliente)", () => {
    expect(pedidoDaPortabilidade(LINHA, "51911111111")).toEqual({ metodo: "GET", caminho: "/portabilidade/status", corpo: { linha: LINHA, linha_doadora: "51911111111" } });
    expect(Object.keys(pedidoDaPortabilidade(LINHA, "51911111111").corpo).every((k) => chavesDocumentadas("/portabilidade/status").includes(k))).toBe(true);
    const transacoes = pedidoDasTransacoesDaLinha(LINHA, AGORA);
    expect(transacoes).toEqual({ metodo: "GET", caminho: "/relatorios/transacoes", corpo: { data_de: "2025-11-25", data_ate: "2026-11-25", page: 1, linha: LINHA } });
    expect(Object.keys(transacoes.corpo).every((k) => chavesDocumentadas("/relatorios/transacoes").includes(k))).toBe(true);
    // O exemplo oficial do status tem JSON quebrado (faltam os dois-pontos no termo): o corpo aqui é o mesmo, consertado.
    const portabilidade = lerParteDoRelatorio("portabilidade", 200, { retorno: true, mensagem: "", status: {
      status: "Sucesso", data_aceite: "2022-06-02 15:49:08.520", data_sucesso: "2022-06-08", data_agendamento: "2022-06-07 22:00:00.000",
      termo: "link_do_termo", termo_assinado: "link_do_termo_assinado_pelo_cliente" } });
    expect(portabilidade.resposta).toEqual({ status: "Sucesso", data_aceite: "2022-06-02 15:49", data_agendamento: "2022-06-07 22:00", data_sucesso: "2022-06-08" });
    expect(JSON.stringify(portabilidade)).not.toContain("termo");
    const lidas = lerParteDoRelatorio("transacoes", 200, exemplo("/relatorios/transacoes"));
    expect(lidas.resposta).toEqual({ transacoes: [{ quando: "2023-05-30 15:20", tipo: null, plano: "7 GB", valor_centavos: 4490, forma: "PIX" }] });
    expect(JSON.stringify(lidas)).not.toContain("Nome do Cliente");
  });

  it("as partes do relatório do cliente: o cadastro (o documento mascarado, sem a rua) e as linhas dele", () => {
    expect(pedidoDoCliente("12345678909")).toEqual({ metodo: "GET", caminho: "/cliente/buscar", corpo: { documento: "12345678909" } });
    expect(pedidoDasLinhasDoCliente("12345678909")).toEqual({ metodo: "GET", caminho: "/cliente/linhas", corpo: { documento: "12345678909" } });
    const cliente = lerParteDoRelatorio("cliente", 200, exemplo("/cliente/buscar"));
    expect(cliente.resposta).toEqual({
      nome: "Fulano da Silva", apelido: null, documento: "•••.•••.000-00", nascimento: "1990-10-10", email: "fulano@email.com",
      telefone: "51999999999", cidade: "São Paulo", uf: "SP", cliente_desde: "2022-01-01",
    });
    expect(JSON.stringify(cliente)).not.toMatch(/Rua Exemplo|00000000000/);
    expect(lerParteDoRelatorio("cliente", 200, exemplo("/cliente/buscar", 1))).toEqual({ situacao: "nao_encontrada", mensagem: "Cliente não encontrado" });
    expect(lerParteDoRelatorio("linhas_do_cliente", 200, exemplo("/cliente/linhas")).resposta).toEqual({ linhas: [
      { linha: "51900000000", iccid: "8955", status: "ATIVA" }, { linha: "51011111111", iccid: "8955", status: "CANCELADA" },
    ] });
    expect(lerParteDoRelatorio("linhas_do_cliente", 502, null)).toMatchObject({ situacao: "falhou" });
  });
});

// CONNECT-j (25/11/2026; a D-061): as funções que mudam algo na Nogle, com os pedidos e as respostas da coleção oficial.
describe("as funções que mudam algo na Nogle (CONNECT-j)", () => {
  const LINHA = "41999998888";
  const CLIENTE = { nome: "Cliente Fictício", cpf: "12345678909", email: "cliente@teste.invalid", telefone: "41999990000", data_nascimento: "1990-05-20",
    apelido: "Cli", endereco: { rua: "Rua Fictícia", numero: "123", bairro: "Centro", cep: "80000000", id_cidade: 7703 } };
  const acao = (tipo: string, parametros: Record<string, unknown>, dados: Record<string, unknown> | null = null): AcaoParaEnviar => ({ acao_id: "a1", tipo, parametros, dados });
  const EXEMPLOS: Record<string, AcaoParaEnviar> = {
    linha_bloquear: acao("linha_bloquear", { linha: LINHA, motivo_bloqueio: "ROUBO" }),
    linha_desbloquear: acao("linha_desbloquear", { linha: LINHA }),
    recarga_automatica_bloquear: acao("recarga_automatica_bloquear", { linha: LINHA }),
    recarga_automatica_desbloquear: acao("recarga_automatica_desbloquear", { linha: LINHA }),
    linha_apelido: acao("linha_apelido", { linha: LINHA, apelido: "Trabalho" }),
    portabilidade_reenviar_sms: acao("portabilidade_reenviar_sms", { linha: LINHA, linha_doadora: "41911112222" }),
    recarga_programar: acao("recarga_programar", { linha: LINHA, plano: "1718", quantidade: 12 }),
    compra_chip: acao("compra_chip", { plano: "88888", quantidade: 2, metodo: "LINK" }, CLIENTE),
    cliente_cadastrar: acao("cliente_cadastrar", {}, CLIENTE),
    cliente_atualizar: acao("cliente_atualizar", {}, CLIENTE),
    pdv_cadastrar: acao("pdv_cadastrar", { nome: "Loja nova (fictícia)", uf: "PR", cidade: "Curitiba" },
      { contato_celular: "41999990000", endereco: { rua: "Rua Fictícia", cep: "80000000" }, usuario: { nome: "Gerente (fictício)", email: "g@teste.invalid", senha: "senha-1234" } }),
    pdv_atualizar: acao("pdv_atualizar", { pdv: 7101 }, { nome: "PDV novo nome (fictício)", contato_email: "pdv@teste.invalid" }),
    pdv_inativar: acao("pdv_inativar", { pdv: 7101 }),
    pdv_usuario: acao("pdv_usuario", { pdv: 7101 }, { nome: "Pessoa (fictícia)", email: "p@teste.invalid", senha: "senha-1234" }),
  };
  // Os campos que a coleção oficial documenta em cada rota: as chaves do exemplo e as linhas da tabela de envio.
  const documentados = (caminho: string) => {
    const f = rota(caminho);
    const tabela = (typeof f.request.description === "string" ? f.request.description : f.request.description?.content ?? "");
    const linhas = [...tabela.matchAll(/<td>([a-z_]+)(?:\.[a-z_]+)?<\/td>/gi)].map((m) => m[1] ?? "");
    return new Set([...Object.keys(JSON.parse(f.request.body?.raw?.trim() || "{}") as object), ...linhas]);
  };

  it("cada ação vai à rota e com o método da coleção oficial, só com campos documentados", () => {
    expect(Object.keys(EXEMPLOS).sort()).toEqual([...TIPOS_DE_ACAO].sort());
    for (const [tipo, a] of Object.entries(EXEMPLOS)) {
      const pedido = pedidoDaAcao(a);
      expect(pedido, tipo).not.toBeNull();
      const f = rota(pedido?.caminho ?? "");
      expect(pedido?.metodo, tipo).toBe(f.request.method);
      const aceitos = documentados(pedido?.caminho ?? "");
      expect(Object.keys(pedido?.corpo ?? {}).filter((k) => !aceitos.has(k)), tipo).toEqual([]);
    }
    expect(pedidoDaAcao(EXEMPLOS.linha_bloquear as AcaoParaEnviar)?.corpo).toEqual({ numero: LINHA, motivo: "ROUBO", observacoes: "Pedido no sistema Ora 5G" });
    expect(pedidoDaAcao(EXEMPLOS.portabilidade_reenviar_sms as AcaoParaEnviar)?.corpo)
      .toEqual({ linha: LINHA, linha_doadora: "41911112222", numero_contel: LINHA, doador_numero: "41911112222" });
    expect(pedidoDaAcao(EXEMPLOS.recarga_programar as AcaoParaEnviar)?.corpo).toEqual({ linha: LINHA, plano: 1718, quantidade_recargas: 12 });
    const compra = pedidoDaAcao(EXEMPLOS.compra_chip as AcaoParaEnviar)?.corpo ?? {};
    expect(compra).toMatchObject({ metodo_pagamento: "LINK", id_plano: 88888, quantidade: 2, cpf: "12345678909", endereco: { cep: "80000000", id_cidade: 7703 } });
    expect(compra).not.toHaveProperty("apelido");
    expect(pedidoDaAcao(EXEMPLOS.pdv_cadastrar as AcaoParaEnviar)?.corpo).toMatchObject({
      nome: "Loja nova (fictícia)", endereco: [{ uf: "PR", cidade: "Curitiba", rua: "Rua Fictícia", cep: "80000000" }],
      usuario: [{ nome: "Gerente (fictício)", email: "g@teste.invalid", senha: "senha-1234" }],
    });
    expect(pedidoDaAcao(EXEMPLOS.pdv_inativar as AcaoParaEnviar)).toEqual({ metodo: "DELETE", caminho: "/pdv/inativar", corpo: { id: 7101 } });
    expect(pedidoDaAcao(acao("linha_bloquear", { linha: LINHA }))).toBeNull();
    expect(pedidoDaAcao(acao("compra_chip", { plano: "1718", metodo: "LINK" }))).toBeNull();
    expect(pedidoDaAcao(acao("qualquer_coisa", {}))).toBeNull();
  });

  it("lê as respostas oficiais: feita, recusada (nada foi feito) ou resultado desconhecido (nunca reenviado)", () => {
    expect(lerRespostaDaAcao("linha_bloquear", 200, exemplo("/atendimento/bloqueio")))
      .toEqual({ envio: "feita", mensagem: "Bloqueio realizado com sucesso.", resultado: { quando: "2023-06-04 20:01" } });
    expect(lerRespostaDaAcao("linha_bloquear", 200, exemplo("/atendimento/bloqueio", 1))).toEqual({ envio: "recusada", mensagem: "Motivo de bloqueio não encontrado" });
    expect(lerRespostaDaAcao("linha_desbloquear", 200, exemplo("/atendimento/desbloqueio", 1))).toEqual({ envio: "recusada", mensagem: "Linha não encontrada" });
    expect(lerRespostaDaAcao("linha_apelido", 200, exemplo("/linhas/atualizar"))).toEqual({ envio: "feita", mensagem: "Linha atualizada com sucesso." });
    expect(lerRespostaDaAcao("compra_chip", 200, exemplo("/compra/solicitar")))
      .toEqual({ envio: "feita", mensagem: "", resultado: { pedido: 9172, link_pagamento: "link de pagamento" } });
    // O plano que não existe vem com "retorno": true e a mensagem, sem o id: nada foi comprado.
    expect(lerRespostaDaAcao("compra_chip", 200, exemplo("/compra/solicitar", 1))).toEqual({ envio: "recusada", mensagem: "Plano não encontrado." });
    expect(lerRespostaDaAcao("cliente_cadastrar", 200, exemplo("/cliente/criar"))).toEqual({ envio: "feita", mensagem: "", resultado: { cliente: 99999 } });
    expect(lerRespostaDaAcao("cliente_cadastrar", 422, exemplo("/cliente/criar", 1))).toEqual({ envio: "recusada", mensagem: "Já existe uma conta utilizando este CPF." });
    expect(lerRespostaDaAcao("pdv_cadastrar", 200, exemplo("/pdv/cadastrar"))).toEqual({ envio: "feita", mensagem: "Sucesso!", resultado: { pdv: 3968 } });
    expect(lerRespostaDaAcao("pdv_inativar", 200, exemplo("/pdv/inativar"))).toEqual({ envio: "feita", mensagem: "Sucesso." });
    expect(lerRespostaDaAcao("pdv_atualizar", 200, exemplo("/pdv/atualizar"))).toEqual({ envio: "feita", mensagem: "Sucesso.", resultado: { campos: ["nome"] } });
    // As rotas sem exemplo de resposta na coleção: a forma da tabela.
    expect(lerRespostaDaAcao("recarga_programar", 200, { retorno: true, mensagem: "", proxima_recarga: "2026-12-25" }))
      .toEqual({ envio: "feita", mensagem: "", resultado: { proxima_recarga: "2026-12-25" } });
    expect(lerRespostaDaAcao("recarga_automatica_bloquear", 200, { retorno: true, mensagem: "" })).toEqual({ envio: "feita", mensagem: "" });
    expect(lerRespostaDaAcao("pdv_usuario", 200, { message: "Sucesso!", usuario: 55 })).toEqual({ envio: "feita", mensagem: "Sucesso!", resultado: { usuario: 55 } });
    // Sem clareza: resultado desconhecido.
    expect(lerRespostaDaAcao("linha_apelido", 200, { mensagem: "Processando." })).toMatchObject({ envio: "desconhecida" });
    expect(lerRespostaDaAcao("pdv_inativar", 502, null)).toMatchObject({ envio: "desconhecida" });
    expect(lerRespostaDaAcao("linha_desbloquear", 404, { erro: "Endpoint inexistente ou recurso não encontrato." }))
      .toEqual({ envio: "recusada", mensagem: "Endpoint inexistente ou recurso não encontrato." });
  });
});
