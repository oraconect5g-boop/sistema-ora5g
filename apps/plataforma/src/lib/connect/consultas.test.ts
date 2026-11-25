// As consultas da Nogle que só leem, na tela (lote CONNECT-g): o formulário, as mensagens e cada resposta em português. As
// respostas são as que o domínio guarda a partir dos exemplos oficiais (packages/dominio/src/nogle.test.ts). FICTÍCIAS.
import { describe, expect, it } from "vitest";

import { bytes, erroDaConsulta, lerPedidoDeConsulta, linhasDaResposta, megabytes, tituloDaConsulta } from "./consultas";

const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });
const respondida = (tipo: string, resposta: Record<string, unknown>) => ({ tipo, resposta, situacao: "respondida", resposta_apagada_em: null });

describe("o formulário das consultas (CONNECT-g)", () => {
  it("cada consulta pede o seu: o número com DDD, o ICCID ou nada (a carteira)", () => {
    expect(lerPedidoDeConsulta(formulario({ tipo: "linha_saldo", parametro: "(41) 99999-8888", chave: "k" })))
      .toEqual({ ok: true, pedido: { tipo: "linha_saldo", parametro: "41999998888", chave: "k" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "iccid_numero", parametro: "8955 1701 1000 0000 016", chave: "k" })))
      .toEqual({ ok: true, pedido: { tipo: "iccid_numero", parametro: "8955170110000000016", chave: "k" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "carteira_saldo", parametro: "qualquer", chave: "k" })))
      .toEqual({ ok: true, pedido: { tipo: "carteira_saldo", parametro: null, chave: "k" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "linha_detalhes", parametro: "8955170110000000016", chave: "k" }))).toEqual({ ok: false, erro: "linha" });
    expect(lerPedidoDeConsulta(formulario({ tipo: "iccid_ativacao", parametro: "41999998888", chave: "k" }))).toEqual({ ok: false, erro: "iccid" });
    expect(lerPedidoDeConsulta(formulario({ tipo: "bloquear_linha", parametro: "41999998888", chave: "k" }))).toEqual({ ok: false, erro: "tipo" });
    expect(lerPedidoDeConsulta(formulario({ tipo: "linha_saldo", parametro: "41999998888" }))).toEqual({ ok: false, erro: "falha" });
  });

  it("o erro do banco vira a mensagem", () => {
    expect(erroDaConsulta({ code: "OR056" })).toBe("limite");
    expect(erroDaConsulta({ code: "42501" })).toBe("sem_permissao");
    expect(erroDaConsulta({ code: "22023" })).toBe("dados");
    expect(erroDaConsulta({ code: "XX000" })).toBe("falha");
    expect(erroDaConsulta(null)).toBe("falha");
  });
});

describe("cada resposta em português (CONNECT-g)", () => {
  it("a situação da linha, com o titular mascarado, as datas e os avisos", () => {
    expect(linhasDaResposta(respondida("linha_detalhes", {
      linha: "51900000000", status: "ATIVO", bloqueada: true, plano: "7 GB", tipo_linha: "PRÉ PAGO", esim: false, portada: true,
      titular: "Cliente Fictício", documento: "•••.•••.000-00", data_ativacao: "2023-05-30", data_fim_plano: "2023-06-30",
      data_perda_numero: "2023-09-13", recarga_automatica: true, recarga_automatica_plano: "7 GB", data_cancelamento: null, motivo_cancelamento: null,
    }))).toEqual([
      "Linha (51) 90000-0000 · ATIVO · BLOQUEADA",
      "Plano 7 GB · PRÉ PAGO · portada",
      "Titular: Cliente Fictício (•••.•••.000-00)",
      "Ativada em 30/05/2023, o plano vai até 30/06/2023.",
      "Sem recarga, o cliente perde o número em 13/09/2023.",
      "Recarga automática ativa (7 GB).",
    ]);
    expect(linhasDaResposta(respondida("linha_detalhes", { linha: "51900000000", status: "CANCELADO", data_cancelamento: "2024-01-10", motivo_cancelamento: "EX" })))
      .toContain("Cancelada em 10/01/2024: Expirou: 75 dias sem recarga depois do fim do plano.");
  });

  it("o saldo, as recargas, o consumo, o número e a ativação do chip e a carteira", () => {
    expect(linhasDaResposta(respondida("linha_saldo", { dados_mb: 2395.226721, minutos: 1000, minutos_ilimitados: true, sms: 60 }))).toEqual([
      "Internet: 2,34 GB", "Minutos: ilimitados", "SMS: 60", "A Nogle atualiza o saldo a cada 30 minutos, mais ou menos.",
    ]);
    expect(linhasDaResposta(respondida("linha_historico", { recargas: [{ quando: "2022-06-15 11:59", plano: "7 GB", valor_centavos: 4490, forma: "LINK" }] })))
      .toEqual(["15/06/2022 às 11:59 · 7 GB · R$ 44,90 · LINK"]);
    expect(linhasDaResposta(respondida("linha_historico", { recargas: [] }))).toEqual(["Nenhuma recarga nesta linha."]);
    expect(linhasDaResposta(respondida("linha_consumo", { total_bytes: 3 * 1024 ** 3, dias: [{ dia: "2026-11-01", bytes: 1024 ** 3 }, { dia: "2026-11-02", bytes: 0 }, { dia: "2026-11-03", bytes: 2 * 1024 ** 3 }] })))
      .toEqual(["No mês: 3 GB", "01/11/2026: 1 GB", "03/11/2026: 2 GB"]);
    expect(linhasDaResposta(respondida("iccid_numero", { numero: "41999998888" }))).toEqual(["Número da linha: (41) 99999-8888"]);
    expect(linhasDaResposta(respondida("iccid_ativacao", {
      cliente: "Cliente Fictício", plano: "4 GB", numero_ativado: "11000000000", numero_portado: null, forma_pagamento: "SALDO",
      data_solicitacao: "2021-12-03 14:36", data_ativacao: "2021-12-03 14:36",
    }))).toEqual(["Ativado em 03/12/2021 às 14:36 · número (11) 00000-0000", "Plano 4 GB · pago por SALDO", "Cliente: Cliente Fictício"]);
    expect(linhasDaResposta(respondida("carteira_saldo", { saldo_centavos: 50000 }))).toEqual(["Saldo: R$ 500,00"]);
  });

  it("sem resposta guardada (apagada em 24 h ou não respondida), nada inventado", () => {
    expect(linhasDaResposta({ tipo: "linha_saldo", resposta: null, situacao: "respondida", resposta_apagada_em: "2026-11-24T10:00:00Z" }))
      .toEqual(["A resposta foi apagada depois de 24 horas (ela pode ter o nome do titular)."]);
    expect(linhasDaResposta({ tipo: "linha_saldo", resposta: null, situacao: "falhou", resposta_apagada_em: null })).toEqual([]);
    expect(tituloDaConsulta({ tipo: "linha_saldo", parametro: "41999998888" })).toBe("Saldo da linha · (41) 99999-8888");
    expect(tituloDaConsulta({ tipo: "carteira_saldo", parametro: null })).toBe("Saldo da carteira da Ora");
    expect(megabytes(512)).toBe("512 MB");
    expect(bytes(1536 * 1024 * 1024)).toBe("1,5 GB");
  });
});

describe("as consultas novas em português (CONNECT-h)", () => {
  it("as cobranças em aberto, as ligações, os SMS, a existência, o plano pago e a situação do chip", () => {
    expect(linhasDaResposta(respondida("linha_cobrancas", { cobrancas: [{ quando: "2026-11-20 10:00", valor_centavos: 5490, forma: "LINK" }] }))).toEqual([
      "20/11/2026 às 10:00 · R$ 54,90 · LINK", "Cobrança em aberto não obriga o cliente a pagar: é o link que ele pediu e não pagou.",
    ]);
    expect(linhasDaResposta(respondida("linha_cobrancas", { cobrancas: [] }))).toEqual(["Nenhuma cobrança de recarga em aberto."]);
    expect(linhasDaResposta(respondida("linha_consumo_voz", { total: 600, dias: [{ dia: "2026-11-01", quantidade: 600 }], unidade: "segundos" })))
      .toEqual(["No mês: 10 min", "01/11/2026: 10 min"]);
    expect(linhasDaResposta(respondida("linha_consumo_sms", { total: 0, dias: [], unidade: "sms" }))).toEqual(["Nenhum SMS neste mês."]);
    expect(linhasDaResposta(respondida("linha_existe", { existe: false, explicacao: "Linha não encontrada." }))).toEqual(["Não: Linha não encontrada."]);
    expect(linhasDaResposta(respondida("linha_existe", { existe: true, explicacao: null }))).toEqual(["Sim: o número existe na Nogle."]);
    expect(linhasDaResposta(respondida("iccid_plano_pago", { plano_pago: "1718" }), (c) => (c === "1718" ? "10 GB" : undefined)))
      .toEqual(["O chip já tem plano pago: 10 GB."]);
    expect(linhasDaResposta(respondida("iccid_plano_pago", { plano_pago: null }))).toEqual(["O chip não tem plano pago."]);
    expect(linhasDaResposta(respondida("iccid_situacao", { codigo: 11, situacao: "Chip já ativo", orientacao: "Já tem linha: consulte a linha em vez de ativar de novo.", linha: "41999998888" })))
      .toEqual(["Chip já ativo · linha (41) 99999-8888", "Já tem linha: consulte a linha em vez de ativar de novo."]);
  });

  it("o formulário do relatório do cliente pede um CPF ou CNPJ válido", () => {
    expect(lerPedidoDeConsulta(formulario({ tipo: "cliente_completo", parametro: "123.456.789-09", chave: "k" })))
      .toEqual({ ok: true, pedido: { tipo: "cliente_completo", parametro: "12345678909", chave: "k" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "cliente_completo", parametro: "41999998888", chave: "k" }))).toEqual({ ok: false, erro: "documento" });
  });
});

// CONNECT-i (25/11/2026): as consultas que faltavam, em português: o resumo na lista e a lista inteira na página do relatório.
describe("as outras consultas em português (CONNECT-i)", () => {
  it("o formulário confere cada parâmetro novo e junta a linha com o documento na titularidade", () => {
    expect(lerPedidoDeConsulta(formulario({ tipo: "titularidade_da_linha", parametro: "(41) 99999-8888", documento: "11.222.333/0001-81", chave: "k" })))
      .toEqual({ ok: true, pedido: { tipo: "titularidade_da_linha", parametro: "4199999888811222333000181", chave: "k" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "estados", parametro: "123", chave: "k" }))).toEqual({ ok: true, pedido: { tipo: "estados", parametro: null, chave: "k" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "validar_cep", parametro: "80010-000", chave: "k" }))).toMatchObject({ ok: true, pedido: { parametro: "80010000" } });
    expect(lerPedidoDeConsulta(formulario({ tipo: "faq_perguntas", parametro: "", chave: "k" }))).toEqual({ ok: false, erro: "categoria" });
    expect(lerPedidoDeConsulta(formulario({ tipo: "carteira_programadas", parametro: "91", chave: "k" }))).toEqual({ ok: false, erro: "dias" });
    expect(lerPedidoDeConsulta(formulario({ tipo: "lista_de_clientes", parametro: "10000", chave: "k" }))).toEqual({ ok: false, erro: "pagina" });
  });

  it("as informações da Nogle, a logística e as validações", () => {
    expect(linhasDaResposta(respondida("planos_campanhas", { planos: [{ codigo: "99999", nome: "7 GB", valor_centavos: 4490, internet: "6 GB + 1 GB",
      ligacoes: "ligações ilimitadas", sms: "100 SMS" }] }))).toEqual(["7 GB · R$ 44,90 · 6 GB + 1 GB · ligações ilimitadas · 100 SMS · código 99999"]);
    expect(linhasDaResposta(respondida("estados", { estados: [{ uf: "PR", nome: "Paraná" }, { uf: "SC", nome: "Santa Catarina" }] }))).toEqual(["2 estados: PR, SC"]);
    expect(linhasDaResposta(respondida("logistica", { frete_centavos: 490, chip_centavos: 1000 })))
      .toEqual(["Chip: R$ 10,00 · Frete: R$ 4,90", "O custo da Nogle para a Ora (não é o preço de venda)."]);
    expect(linhasDaResposta(respondida("validar_cep", { valido: true, rua: "Avenida Independência", numero: "2293", bairro: "Universitário", cidade: "Santa Cruz do Sul", uf: "RS" })))
      .toEqual(["CEP válido: Avenida Independência, 2293 · Universitário · Santa Cruz do Sul-RS"]);
    expect(linhasDaResposta(respondida("validar_cep", { valido: false }))).toEqual(["CEP não encontrado."]);
    expect(linhasDaResposta(respondida("validar_cpf", { valido: true, titular: "Cliente Fictício", nascimento: "2002-01-01", idade: 24 })))
      .toEqual(["CPF válido: Cliente Fictício", "Nascimento: 01/01/2002 (24 anos)"]);
    expect(linhasDaResposta(respondida("validar_cnpj", { valido: true, razao_social: "Empresa Fictícia LTDA", nome_fantasia: "Fictícia" })))
      .toEqual(["CNPJ válido: Empresa Fictícia LTDA", "Nome fantasia: Fictícia"]);
    expect(linhasDaResposta(respondida("compra_rastreio", { pedido: 9172, data_pedido: "2026-11-20 10:00", cliente: null,
      eventos: [{ quando: "2026-11-21 08:30", status: "EM ROTA" }] }))).toEqual(["Pedido nº 9172 · feito em 20/11/2026 às 10:00", "21/11/2026 às 08:30 · EM ROTA"]);
    expect(linhasDaResposta(respondida("compra_rastreio", { pedido: 9172, data_pedido: null, cliente: null, eventos: [] }))).toEqual(["Pedido nº 9172", "Ainda sem rastreio."]);
    expect(linhasDaResposta(respondida("titularidade_da_linha", { titular: true, operadora: null }))).toEqual(["Sim: o CPF/CNPJ é o do titular da linha."]);
  });

  it("as dúvidas e as listas: o resumo na lista, cada item na página do relatório, e o aviso do que não coube", () => {
    const perguntas = respondida("faq_perguntas", { perguntas: [{ pergunta: "Quanto tempo leva?", resposta: "Até 3 dias úteis." }], fora: 0 });
    expect(linhasDaResposta(perguntas)).toEqual(["1 pergunta com a resposta.", "Abra a página para ver tudo."]);
    expect(linhasDaResposta(perguntas, undefined, { completo: true })).toEqual(["P: Quanto tempo leva?", "R: Até 3 dias úteis."]);
    const linhas = respondida("lista_de_linhas", { linhas: [{ linha: "41999998888", apelido: "Loja", status: "ATIVO", plano: "10 GB", titular: "Cliente Fictício",
      documento: "•••.•••.789-09", fim_do_plano: "2026-12-10", bloqueada: true, esim: true, portada: false }], fora: 5, total: 6 });
    expect(linhasDaResposta(linhas)).toEqual(["6 linhas nesta página.", "Abra a página para ver tudo."]);
    expect(linhasDaResposta(linhas, undefined, { completo: true })).toEqual([
      "(41) 99999-8888 (Loja) · ATIVO · BLOQUEADA · 10 GB · Cliente Fictício •••.•••.789-09 · plano até 10/12/2026 · eSIM",
      "E mais 5 que não couberam aqui (a Nogle tem a lista inteira).",
    ]);
    expect(linhasDaResposta(respondida("lista_de_clientes", { clientes: [{ nome: "Cliente Fictício", apelido: null, tipo: "PF", documento: "•••.•••.789-09",
      cidade: "Curitiba", uf: "PR" }], fora: 0, total: 1 }), undefined, { completo: true })).toEqual(["Cliente Fictício · PF •••.•••.789-09 · Curitiba-PR"]);
    expect(linhasDaResposta(respondida("relatorio_portabilidades", { portabilidades: [{ quando: "2026-11-20 09:00", linha: "41999998888", linha_doadora: "41988887777",
      operadora: "TIM", status: "Portabilidade em andamento", cliente: "Cliente Fictício", documento: "•••.•••.789-09", agendada: "2026-11-23 22:00", sucesso: null }],
    fora: 0, total: 1, por_status: { "Portabilidade em andamento": 1 } }), undefined, { completo: true })).toEqual([
      "1 portabilidade: 1 Portabilidade em andamento",
      "20/11/2026 às 09:00 · (41) 99999-8888 ← (41) 98888-7777 (TIM) · Portabilidade em andamento · Cliente Fictício •••.•••.789-09 · agendada para 23/11/2026 às 22:00",
    ]);
    expect(linhasDaResposta(respondida("carteira_programadas", { recargas: [], fora: 0, total: 0, soma_centavos: 0 }))).toEqual(["Nenhuma recarga programada no período."]);
  });

  it("o título de cada uma: o documento sempre mascarado (também depois de 24 horas), o CEP, o pedido, os dias e a página", () => {
    expect(tituloDaConsulta({ tipo: "validar_cpf", parametro: null, parametro_mascarado: "•••.•••.789-09" })).toBe("Conferir o CPF · •••.•••.789-09");
    expect(tituloDaConsulta({ tipo: "titularidade_da_linha", parametro: "4199999888812345678909", parametro_mascarado: "(41) 99999-8888 · •••.•••.789-09" }))
      .toBe("O titular da linha · (41) 99999-8888 · •••.•••.789-09");
    expect(tituloDaConsulta({ tipo: "validar_cep", parametro: "80010000" })).toBe("Conferir o CEP · 80010-000");
    expect(tituloDaConsulta({ tipo: "compra_rastreio", parametro: "9172" })).toBe("Rastreio da compra de chip · pedido nº 9172");
    expect(tituloDaConsulta({ tipo: "faq_perguntas", parametro: "6" })).toBe("Perguntas e respostas · categoria 6");
    expect(tituloDaConsulta({ tipo: "relatorio_portabilidades", parametro: "366" })).toBe("Portabilidades da rede · últimos 366 dias");
    expect(tituloDaConsulta({ tipo: "lista_de_clientes", parametro: "2" })).toBe("Clientes da Ora na Nogle · página 2");
    expect(tituloDaConsulta({ tipo: "faq_categorias", parametro: null })).toBe("Dúvidas frequentes");
  });

  it("o pagamento de uma solicitação (os meios de pagar, para reenviar ao cliente) e o extrato da carteira", () => {
    expect(linhasDaResposta(respondida("pagamento_da_solicitacao", { quando: "2026-11-20 10:00", valor_centavos: 5490, cliente: "Cliente Fictício", operadora: "CONTEL",
      iccid: null, linha: "41999998888", link_pagamento: "https://pagamento.invalid/x", boleto_link: null, boleto_codigo_barras: null, pix_copia_cola: "000201PIX" })))
      .toEqual(["R$ 54,90 · pedido em 20/11/2026 às 10:00 · CONTEL", "Cliente: Cliente Fictício · linha (41) 99999-8888",
        "Link para o cliente pagar: https://pagamento.invalid/x", "Pix copia e cola: 000201PIX"]);
    const extrato = respondida("carteira_extrato_saidas", { movimentos: [{ quando: "2026-11-20 10:15", tipo: "SAÍDA", valor_centavos: 3550, cliente: "Cliente Fictício",
      linha: "41999998888", iccid: null, plano: "10 GB", plano_valor_centavos: 5490 }], fora: 0, total: 1, soma_centavos: 3550 });
    expect(linhasDaResposta(extrato)).toEqual(["1 movimento · R$ 35,50", "Abra a página para ver tudo."]);
    expect(linhasDaResposta(extrato, undefined, { completo: true }))
      .toEqual(["1 movimento · R$ 35,50", "20/11/2026 às 10:15 · SAÍDA · R$ 35,50 · 10 GB (R$ 54,90) · (41) 99999-8888 · Cliente Fictício"]);
    expect(tituloDaConsulta({ tipo: "pagamento_da_solicitacao", parametro: "39172" })).toBe("Pagamento de uma solicitação · compra nº 9172");
    expect(tituloDaConsulta({ tipo: "carteira_extrato_entradas", parametro: "90" })).toBe("Extrato da carteira: entradas · últimos 90 dias");
    expect(lerPedidoDeConsulta(formulario({ tipo: "pagamento_da_solicitacao", solicitacao: "1", parametro: "123", chave: "k" })))
      .toEqual({ ok: true, pedido: { tipo: "pagamento_da_solicitacao", parametro: "1123", chave: "k" } });
  });
});
