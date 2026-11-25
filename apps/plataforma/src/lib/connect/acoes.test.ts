// As ações que mudam algo na Nogle, na tela (lote CONNECT-j): o formulário de cada uma, as mensagens e a descrição do pedido e
// do resultado. Dados FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { descricaoDaAcao, erroDaAcao, lerPedidoDeAcao, resultadoDaAcao } from "./acoes";

const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });
const base = { chave: "k", motivo: "Pedido do cliente (teste)" };

describe("o formulário das ações na Nogle (CONNECT-j)", () => {
  it("cada ação leva o que pede: a linha e o motivo do bloqueio; o cliente nos dados; a senha só nos dados", () => {
    expect(lerPedidoDeAcao(formulario({ ...base, tipo: "linha_bloquear", linha: "(41) 99999-8888", motivo_bloqueio: "ROUBO" })))
      .toEqual({ ok: true, pedido: { ...base, tipo: "linha_bloquear", parametros: { linha: "41999998888", motivo_bloqueio: "ROUBO" }, dados: null } });
    const compra = lerPedidoDeAcao(formulario({ ...base, tipo: "compra_chip", plano: "88888", quantidade: "2", metodo: "LINK", nome: "Cliente Fictício",
      documento: "123.456.789-09", cep: "80000-000", rua: "Rua Fictícia", numero: "1", bairro: "Centro", id_cidade: "7703" }));
    expect(compra).toEqual({ ok: true, pedido: { ...base, tipo: "compra_chip", parametros: { plano: "88888", quantidade: "2", metodo: "LINK" },
      dados: { nome: "Cliente Fictício", cpf: "12345678909", endereco: { rua: "Rua Fictícia", numero: "1", bairro: "Centro", cep: "80000000", id_cidade: "7703" } } } });
    const usuario = lerPedidoDeAcao(formulario({ ...base, tipo: "pdv_usuario", pdv: "7101", usuario_nome: "Pessoa", usuario_email: "p@teste.invalid", usuario_senha: "senha-1234" }));
    expect(usuario).toMatchObject({ ok: true, pedido: { parametros: { pdv: "7101" }, dados: { senha: "senha-1234" } } });
    expect(JSON.stringify((usuario as { pedido: { parametros: object } }).pedido.parametros)).not.toContain("senha");
  });

  it("o motivo é obrigatório; a inativação do PDV pede a confirmação; tipo desconhecido não passa", () => {
    expect(lerPedidoDeAcao(formulario({ chave: "k", motivo: "x", tipo: "linha_desbloquear", linha: "41999998888" }))).toEqual({ ok: false, erro: "motivo" });
    expect(lerPedidoDeAcao(formulario({ ...base, tipo: "pdv_inativar", pdv: "7101" }))).toEqual({ ok: false, erro: "confirmacao" });
    expect(lerPedidoDeAcao(formulario({ ...base, tipo: "pdv_inativar", pdv: "7101", confirmo: "sim" }))).toMatchObject({ ok: true });
    expect(lerPedidoDeAcao(formulario({ ...base, tipo: "apagar_tudo" }))).toEqual({ ok: false, erro: "falha" });
    expect(erroDaAcao({ code: "OR057" })).toBe("ja_saiu");
    expect(erroDaAcao({ code: "P0002" })).toBe("plano");
    expect(erroDaAcao({ code: "42501" })).toBe("sem_permissao");
  });

  it("descreve o pedido e o resultado que a Nogle deu", () => {
    expect(descricaoDaAcao({ tipo: "linha_bloquear", alvo: "41999998888", parametros: { linha: "41999998888", motivo_bloqueio: "ROUBO" } }))
      .toBe("Bloquear a linha · (41) 99999-8888 · motivo ROUBO");
    expect(descricaoDaAcao({ tipo: "compra_chip", alvo: "•••.•••.789-09", parametros: { plano: "88888", quantidade: 2, metodo: "LINK" } }))
      .toBe("Comprar chip com entrega · •••.•••.789-09 · só o chip · 2 chips · pago por LINK");
    expect(resultadoDaAcao({ situacao: "feita", resultado: { pedido: 9172, link_pagamento: "https://pagamento.invalid/x" } }))
      .toEqual(["Pedido nº 9172 na Nogle (o rastreio, em Consultar linha)", "Link para o cliente pagar: https://pagamento.invalid/x"]);
    expect(resultadoDaAcao({ situacao: "feita", resultado: { proxima_recarga: "2026-12-25" } })).toEqual(["Próxima recarga em 25/12/2026"]);
    expect(resultadoDaAcao({ situacao: "recusada", resultado: {} })).toEqual([]);
  });
});
