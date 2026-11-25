// CONNECT-g (25/11/2026; ORA-CONNECT-007): as consultas que só leem, no worker, com a Nogle e o banco SIMULADOS e o relógio
// de mentira. O caminho de verdade (o transporte HTTP, o GET com corpo e o banco com as migrations) está em
// ponta-a-ponta.test.ts. Linhas e ICCIDs FICTÍCIOS.
import type { AcaoParaEnviar, PedidoNogle, RespostaDaConsulta, ResultadoDaAcao } from "@ora5g/dominio/nogle";
import { describe, expect, it } from "vitest";

import type { ResultadoChamada } from "./cliente-nogle.ts";
import { enviarAcoes, responderConsultas, type BancoConnect, type ConsultaParaFazer } from "./processar.ts";

const LINHA = "51900000000";
const ICCID = "8955170110000000016";
const ok = (corpo: unknown): ResultadoChamada => ({ tipo: "resposta", status: 200, corpo });

function simulados(filas: ConsultaParaFazer[][], respostas: Record<string, ResultadoChamada>) {
  const gravadas: [string, RespostaDaConsulta][] = [];
  const pedidos: PedidoNogle[] = [];
  let vezes = 0;
  const banco = {
    consultasAFazer: async () => filas[vezes++] ?? [],
    registrarRespostaDaConsulta: async (id: string, r: RespostaDaConsulta) => { gravadas.push([id, r]); return r.situacao; },
  } as unknown as BancoConnect;
  const nogle = {
    chamar: async (p: PedidoNogle) => {
      pedidos.push(p);
      const r = respostas[p.caminho];
      if (!r) throw new Error(`rota inesperada: ${p.caminho}`);
      return r;
    },
  };
  let relogio = 0;
  const opcoes = { duracaoMs: 10, esperaMs: 4, relogio: () => relogio, esperar: async (ms: number) => { relogio += ms; } };
  return { banco, nogle, gravadas, pedidos, opcoes, vezes: () => vezes };
}

describe("as consultas que só leem, no worker (CONNECT-g)", () => {
  it("responde a fila (a linha, o chip e a carteira) só com GET e grava a resposta limpa", async () => {
    const s = simulados([[
      { consulta_id: "c1", tipo: "linha_saldo", parametro: LINHA },
      { consulta_id: "c2", tipo: "iccid_numero", parametro: ICCID },
      { consulta_id: "c3", tipo: "carteira_saldo", parametro: null },
    ]], {
      "/linhas/saldo": ok({ retorno: true, mensagem: "", data: { restante_dados: 1024.5, restante_minutos: 1000, restante_sms: 0 } }),
      "/linhas/numeroPeloIccid": ok({ retorno: true, mensagem: "", numero: LINHA }),
      "/saldo/saldo": ok({ saldo: "1234.56" }),
    });
    expect(await responderConsultas(s.banco, s.nogle, s.opcoes)).toEqual({ respondidas: 3, nao_encontradas: 0, falhas: 0 });
    expect(s.pedidos.every((p) => p.metodo === "GET")).toBe(true);
    expect(s.gravadas).toEqual([
      ["c1", { situacao: "respondida", mensagem: "", resposta: { dados_mb: 1024.5, minutos: 1000, minutos_ilimitados: true, sms: 0 } }],
      ["c2", { situacao: "respondida", mensagem: "", resposta: { numero: LINHA } }],
      ["c3", { situacao: "respondida", mensagem: "", resposta: { saldo_centavos: 123456 } }],
    ]);
  });

  it("sem conexão, com a consulta desligada ou o login recusado: falha com o aviso; a consulta fora da forma nem chama a Nogle", async () => {
    const s = simulados([[
      { consulta_id: "f1", tipo: "linha_detalhes", parametro: LINHA },
      { consulta_id: "f2", tipo: "linha_historico", parametro: LINHA },
      { consulta_id: "f3", tipo: "carteira_saldo", parametro: null },
      { consulta_id: "f4", tipo: "outra_coisa", parametro: LINHA },
      { consulta_id: "f5", tipo: "linha_saldo", parametro: "123" },
    ]], {
      "/linhas/detalhes": { tipo: "falha", enviada: false, motivo: "sem conexão com a Nogle (ENOTFOUND)" },
      "/linhas/historico": { tipo: "bloqueada", motivo: "consulta GET com corpo desligada neste worker (NOGLE_GET_COM_CORPO)" },
      "/saldo/saldo": { tipo: "sem_acesso", motivo: "login recusado pela Nogle (HTTP 401)" },
    });
    expect(await responderConsultas(s.banco, s.nogle, s.opcoes)).toEqual({ respondidas: 0, nao_encontradas: 0, falhas: 5 });
    expect(s.pedidos.map((p) => p.caminho)).toEqual(["/linhas/detalhes", "/linhas/historico", "/saldo/saldo"]);
    expect(s.gravadas.map(([id, r]) => [id, r.mensagem])).toEqual([
      ["f1", "Sem conexão com a Nogle agora: tente de novo em instantes."],
      ["f2", "A consulta com corpo está desligada neste servidor (NOGLE_GET_COM_CORPO)."],
      ["f3", "O login na Nogle foi recusado: avise o administrador."],
      ["f4", "Consulta fora da forma."],
      ["f5", "Consulta fora da forma."],
    ]);
  });

  it("sem nada na fila, espera e olha de novo até o fim do tempo", async () => {
    const s = simulados([], {});
    expect(await responderConsultas(s.banco, s.nogle, s.opcoes)).toEqual({ respondidas: 0, nao_encontradas: 0, falhas: 0 });
    // 10 ms de duração, 4 ms de espera: olha em 0, 4 e 8.
    expect(s.vezes()).toBe(3);
    expect(s.pedidos).toEqual([]);
  });
});

// CONNECT-h (25/11/2026): os relatórios do número e do cliente, montados em partes pelo worker.
describe("os relatórios do número e do cliente, no worker (CONNECT-h)", () => {
  const ICCID_DA_LINHA = "8955170110000000016";
  const DETALHES = ok({ retorno: true, mensagem: "", detalhes: {
    linha: LINHA, iccid: ICCID_DA_LINHA, titular: "Cliente Fictício", documento_titular: "12345678909", status: "ATIVO", plano: "7 GB",
    portin: "SIM", portabilidade_linha_doadora: "51911112222", esim_pdf: "https://pdf.invalid/x", bloqueada: "NÃO",
  } });

  it("o número: os detalhes primeiro, depois cada parte; a parte que falha fica marcada sem derrubar o relatório", async () => {
    const s = simulados([[{ consulta_id: "r1", tipo: "linha_completa", parametro: LINHA }]], {
      "/linhas/detalhes": DETALHES,
      "/linhas/saldo": ok({ retorno: true, mensagem: "", data: { restante_dados: 100, restante_minutos: 10, restante_sms: 5 } }),
      "/linhas/historico": ok({ retorno: true, mensagem: "", historico: [] }),
      "/linhas/cobrancasGeradas": { tipo: "resposta", status: 502, corpo: null },
      "/linhas/consumo/dados": ok({ retorno: true, mensagem: "", data: [] }),
      "/linhas/consumo/voz": ok({ retorno: true, mensagem: "", data: [{ qtUsado: 60, dtConsumo: "2026-11-01T03:00:00.000Z" }] }),
      "/linhas/consumo/sms": ok({ retorno: true, mensagem: "", data: [] }),
      "/portabilidade/status": ok({ retorno: true, mensagem: "", status: { status: "Sucesso", data_sucesso: "2026-11-10" } }),
      "/ativacao/detalhar": ok({ retorno: true, mensagem: "", info: { data_ativacao: "2026-11-01 10:00:00.000", plano_nome: "7 GB", numero_ativado: LINHA, forma_pagamento: "SALDO" } }),
      "/relatorios/transacoes": ok({ data: [{ data_ativacao: "2026-11-01 10:00:00.000", tipo_transacao: "ATIVAÇÃO", plano_atual: "7 GB", plano_valor: "44.90", forma_pagto: "SALDO" }] }),
    });
    expect(await responderConsultas(s.banco, s.nogle, { ...s.opcoes, agora: () => new Date("2026-11-25T15:00:00Z") })).toEqual({ respondidas: 1, nao_encontradas: 0, falhas: 0 });
    expect(s.pedidos.map((p) => `${p.metodo} ${p.caminho}`)).toEqual([
      "GET /linhas/detalhes", "GET /linhas/saldo", "GET /linhas/historico", "GET /linhas/cobrancasGeradas", "GET /linhas/consumo/dados",
      "GET /linhas/consumo/voz", "GET /linhas/consumo/sms", "GET /portabilidade/status", "GET /ativacao/detalhar", "GET /relatorios/transacoes",
    ]);
    expect(s.pedidos.find((p) => p.caminho === "/portabilidade/status")?.corpo).toEqual({ linha: LINHA, linha_doadora: "51911112222" });
    const [id, r] = s.gravadas[0] ?? [];
    expect(id).toBe("r1");
    const partes = (r?.resposta as { partes: Record<string, RespostaDaConsulta> }).partes;
    expect(Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, v.situacao]))).toEqual({
      detalhes: "respondida", linha_saldo: "respondida", linha_historico: "respondida", linha_cobrancas: "falhou", linha_consumo: "respondida",
      linha_consumo_voz: "respondida", linha_consumo_sms: "respondida", portabilidade: "respondida", ativacao: "respondida", transacoes: "respondida",
    });
    expect(partes.detalhes?.resposta).toMatchObject({ titular: "Cliente Fictício", documento: "•••.•••.789-09", portada: true });
    expect(JSON.stringify(r)).not.toMatch(/12345678909|pdf\.invalid/);
  });

  it("o número que a Nogle não acha: o relatório para nos detalhes, com o aviso dela", async () => {
    const s = simulados([[{ consulta_id: "r2", tipo: "linha_completa", parametro: LINHA }]], {
      "/linhas/detalhes": ok({ retorno: false, mensagem: "Linha não encontrada.", detalhes: [] }),
    });
    expect(await responderConsultas(s.banco, s.nogle, s.opcoes)).toEqual({ respondidas: 0, nao_encontradas: 1, falhas: 0 });
    expect(s.pedidos).toHaveLength(1);
    expect(s.gravadas).toEqual([["r2", { situacao: "nao_encontrada", mensagem: "Linha não encontrada." }]]);
  });

  it("o cliente: o cadastro, as linhas e a situação de cada uma (as ativas primeiro); sem o cadastro, para aí", async () => {
    const CPF = "12345678909";
    const s = simulados([[{ consulta_id: "c1", tipo: "cliente_completo", parametro: CPF }, { consulta_id: "c2", tipo: "cliente_completo", parametro: "11122233344" }]], {
      "/cliente/buscar": { tipo: "resposta", status: 200, corpo: null },
      "/cliente/linhas": ok({ retorno: true, mensagem: "", linhas: [{ linha: "51988887777", iccid: "8955", status: "CANCELADA" }, { linha: LINHA, iccid: "8955", status: "ATIVA" },
        { linha: "51011111111", iccid: "8955", status: "ATIVA" }] }),
      "/linhas/detalhes": DETALHES,
    });
    let consulta = 0;
    const nogle = {
      chamar: async (p: PedidoNogle) => {
        if (p.caminho === "/cliente/buscar") {
          consulta += 1;
          // O primeiro cliente existe; o segundo, não.
          return consulta === 1
            ? ok({ retorno: true, mensagem: "", cliente: { nome: "Cliente Fictício", cpf: CPF, endereco: { rua: "Rua Fictícia", municipio: "Curitiba", uf: "PR" } } })
            : ok({ retorno: false, mensagem: "Cliente não encontrado", cliente: [] });
        }
        return s.nogle.chamar(p);
      },
    };
    expect(await responderConsultas(s.banco, nogle, s.opcoes)).toEqual({ respondidas: 1, nao_encontradas: 1, falhas: 0 });
    // A linha ativa é consultada primeiro; a cancelada também entra; o número fora da forma de celular (o do exemplo oficial) não.
    expect(s.pedidos.filter((p) => p.caminho === "/linhas/detalhes").map((p) => p.corpo.numero)).toEqual([LINHA, "51988887777"]);
    const partes = (s.gravadas[0]?.[1].resposta as { partes: Record<string, unknown> }).partes;
    expect(partes.cliente).toMatchObject({ situacao: "respondida", resposta: { nome: "Cliente Fictício", documento: "•••.•••.789-09", cidade: "Curitiba" } });
    expect(Object.keys(partes.situacoes as object)).toEqual([LINHA, "51988887777"]);
    expect(JSON.stringify(s.gravadas[0])).not.toMatch(/Rua Fictícia|12345678909/);
    expect(s.gravadas[1]).toEqual(["c2", { situacao: "nao_encontrada", mensagem: "Cliente não encontrado" }]);
  });
});

// CONNECT-j (25/11/2026; a D-061): as ações que mudam algo na Nogle, enviadas uma vez pelo worker.

describe("as ações que mudam algo na Nogle, no worker (CONNECT-j)", () => {
  function comAcoes(fila: AcaoParaEnviar[], respostas: Record<string, ResultadoChamada>) {
    const gravadas: [string, ResultadoDaAcao | { envio: "nao_enviada"; mensagem: string }][] = [];
    const pedidos: PedidoNogle[] = [];
    const banco = {
      acoesAEnviar: async () => fila,
      registrarAcao: async (id: string, r: ResultadoDaAcao | { envio: "nao_enviada"; mensagem: string }) => { gravadas.push([id, r]); return r.envio; },
    } as unknown as BancoConnect;
    const nogle = { chamar: async (p: PedidoNogle) => { pedidos.push(p); return respostas[p.caminho] ?? { tipo: "resposta" as const, status: 404, corpo: { erro: "Endpoint inexistente" } }; } };
    return { banco, nogle, gravadas, pedidos };
  }
  const acao = (acao_id: string, tipo: string, parametros: Record<string, unknown>, dados: Record<string, unknown> | null = null): AcaoParaEnviar => ({ acao_id, tipo, parametros, dados });

  it("cada ação sai uma vez: feita, recusada ou desconhecida; a fora da forma nem sai", async () => {
    const s = comAcoes([
      acao("a1", "linha_bloquear", { linha: LINHA, motivo_bloqueio: "ROUBO" }),
      acao("a2", "linha_desbloquear", { linha: LINHA }),
      acao("a3", "pdv_inativar", { pdv: 7101 }),
      acao("a4", "linha_bloquear", { linha: LINHA }),
    ], {
      "/atendimento/bloqueio": ok({ status: true, mensagem: "Bloqueio realizado com sucesso.", data: "2026-11-25 14:00:00" }),
      "/atendimento/desbloqueio": ok({ status: false, mensagem: "Linha não encontrada", data: null }),
      "/pdv/inativar": { tipo: "resposta", status: 502, corpo: null },
    });
    expect(await enviarAcoes(s.banco, s.nogle)).toEqual({ feitas: 1, recusadas: 2, desconhecidas: 1, devolvidas: 0 });
    expect(s.pedidos.map((p) => `${p.metodo} ${p.caminho}`)).toEqual(["POST /atendimento/bloqueio", "POST /atendimento/desbloqueio", "DELETE /pdv/inativar"]);
    expect(s.gravadas.map(([id, r]) => [id, r.envio])).toEqual([["a1", "feita"], ["a2", "recusada"], ["a3", "desconhecida"], ["a4", "recusada"]]);
  });

  it("sem conexão: volta para a fila e o ciclo para; enviada sem resposta: desconhecida, nunca reenviada", async () => {
    const s = comAcoes([acao("b1", "linha_apelido", { linha: LINHA, apelido: "Casa" }), acao("b2", "linha_desbloquear", { linha: LINHA })], {
      "/linhas/atualizar": { tipo: "falha", enviada: true, motivo: "tempo esgotado depois do envio" },
      "/atendimento/desbloqueio": { tipo: "falha", enviada: false, motivo: "sem conexão com a Nogle (ENOTFOUND)" },
    });
    expect(await enviarAcoes(s.banco, s.nogle)).toEqual({ feitas: 0, recusadas: 0, desconhecidas: 1, devolvidas: 1 });
    expect(s.gravadas).toEqual([
      ["b1", { envio: "desconhecida", mensagem: "A Nogle não respondeu depois do envio: confira no painel da Nogle antes de pedir de novo." }],
      ["b2", { envio: "nao_enviada", mensagem: "Sem conexão com a Nogle: o pedido volta para a fila." }],
    ]);
  });
});
