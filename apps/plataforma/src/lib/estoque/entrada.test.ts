import { completarComDigitoVerificador } from "@ora5g/dominio";
import { describe, expect, it } from "vitest";

import { ERROS_DA_ENTRADA, detalheDoEndereco, detalheDoErro, erroDaEntrada, separarIdentificadores, validarEntrada, type ErroDaEntrada } from "./entrada";

// IMEIs e ICCIDs FICTÍCIOS com dígito verificador válido.
const IMEI_1 = completarComDigitoVerificador("35209900180001");
const IMEI_2 = completarComDigitoVerificador("35209900180002");
const ICCID_1 = completarComDigitoVerificador("895510000000000501");
const LOJA = "00000000-0000-4000-8000-000000000020";
const FORN = "00000000-0000-4000-9000-000000000060";
const APARELHO = "00000000-0000-4000-9000-000000000030";
const CHIP = "00000000-0000-4000-9000-000000000032";
const CAPA = "00000000-0000-4000-9000-000000000031";
const formulario = (campos: Record<string, unknown>) => (n: string) => (campos[n] ?? null) as unknown;
const base = (itens: object[], extra: Record<string, unknown> = {}) => formulario({
  unidade: LOJA, tipo: "compra", fornecedor: FORN, documento: "NF 1234", chave: "form:abc12345", motivo: "Pedido da semana", itens: JSON.stringify(itens), ...extra,
});

describe("entrada de mercadoria", () => {
  it("aparelho e chip pelo IMEI/ICCID (um por linha), acessório por quantidade, custo em centavos", () => {
    const r = validarEntrada(base([
      { variante: APARELHO, tipo: "aparelho", identificadores: `${IMEI_1}\n ${IMEI_2.slice(0, 2)}-${IMEI_2.slice(2)} `, custo: "1.050,00" },
      { variante: CHIP, tipo: "chip", identificadores: ICCID_1 },
      { variante: CAPA, tipo: "acessorio", quantidade: "20", custo: "17,00" },
    ]));
    expect(r).toEqual({
      ok: true,
      dados: {
        unidade: LOJA, tipo: "compra", fornecedor: FORN, documento: "NF 1234", chave: "form:abc12345", motivo: "Pedido da semana",
        itens: [
          { variante: APARELHO, identificadores: [IMEI_1, IMEI_2], condicao: "novo", custo: 105_000 },
          { variante: CHIP, identificadores: [ICCID_1], condicao: "novo" },
          { variante: CAPA, quantidade: 20, condicao: "novo", custo: 1_700 },
        ],
      },
    });
  });

  it("recusa IMEI inválido ou repetido, quantidade e custo errados, compra sem fornecedor e carga com fornecedor", () => {
    expect(validarEntrada(base([{ variante: APARELHO, tipo: "aparelho", identificadores: "352099001800001" }]))).toEqual({ ok: false, erro: "identificador" });
    expect(validarEntrada(base([{ variante: APARELHO, tipo: "aparelho", identificadores: `${IMEI_1} ${IMEI_1}` }]))).toEqual({ ok: false, erro: "identificador" });
    expect(validarEntrada(base([{ variante: APARELHO, tipo: "aparelho", identificadores: "" }]))).toEqual({ ok: false, erro: "identificador" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "0" }]))).toEqual({ ok: false, erro: "quantidade" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "2", custo: "dez" }]))).toEqual({ ok: false, erro: "custo" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "recarga", quantidade: "1" }]))).toEqual({ ok: false, erro: "linhas" });
    expect(validarEntrada(base([]))).toEqual({ ok: false, erro: "linhas" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "1" }], { fornecedor: "" }))).toEqual({ ok: false, erro: "fornecedor" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "1" }], { tipo: "carga_inicial" }))).toEqual({ ok: false, erro: "fornecedor" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "1" }], { motivo: "ok" }))).toEqual({ ok: false, erro: "motivo" });
    expect(validarEntrada(base([{ variante: CAPA, tipo: "acessorio", quantidade: "1" }], { itens: "{quebrado" }))).toEqual({ ok: false, erro: "dados" });
  });

  it("separa identificadores digitados de qualquer jeito", () => {
    expect(separarIdentificadores(" 3520-9900 ; 123,456\n\n789 ")).toEqual(["35209900", "123", "456", "789"]);
  });

  it("erros do banco viram mensagens do catálogo", () => {
    expect(erroDaEntrada({ code: "42501" })).toBe("permissao");
    expect(erroDaEntrada({ code: "OR004" })).toBe("repetida");
    expect(erroDaEntrada({ code: "OR002" })).toBe("em_uso");
    expect(erroDaEntrada({ code: "OR001" })).toBe("sem_saldo");
    expect(erroDaEntrada({ code: "23505", message: "IMEI/ICCID 35... já cadastrado" })).toBe("ja_cadastrado");
    expect(erroDaEntrada({ code: "23505", message: "Este CNPJ já está em outro fornecedor" })).toBe("cnpj");
    expect(erroDaEntrada({ code: "22023", message: "Linha 2 (APA-1): IMEI inválido: 123" })).toBe("identificador");
    expect(erroDaEntrada({ code: "22023", message: "Escolha um fornecedor ativo desta rede" })).toBe("fornecedor");
    expect(erroDaEntrada({ code: "22023", message: "Entrada só em loja física ou depósito ativos" })).toBe("loja");
    expect(erroDaEntrada({ code: "XX000" })).toBe("falha");
    expect(erroDaEntrada(null)).toBe("falha");
    expect(erroDaEntrada({ code: "40P01", message: "deadlock detected" })).toBe("concorrencia");
    expect(erroDaEntrada({ code: "40001", message: "could not serialize access" })).toBe("concorrencia");
  });
});

// Textos das recusas como o banco escreve (migrations 20261111141337 e 20261112033713). O banco prova que
// escreve estes textos em packages/banco/src/entrada-estoque.test.ts; aqui, que cada um vira o aviso certo.
describe("entrada de mercadoria: cada recusa do banco tem o próprio aviso (REV-NOV-004, REV-NOV-005)", () => {
  const duplicado = (message: string) => erroDaEntrada({ code: "23505", message });
  const invalido = (message: string) => erroDaEntrada({ code: "22023", message });

  it("identidade que já existe: o aviso diz onde ela está e o que fazer", () => {
    const casos: [string, ErroDaEntrada][] = [
      [`IMEI ${IMEI_2} é o segundo IMEI de um aparelho já cadastrado: informe o IMEI principal`, "segundo_imei"],
      [`IMEI/ICCID ${IMEI_1} já está no estoque desta loja: não precisa de entrada nova`, "no_estoque"],
      [`IMEI/ICCID ${IMEI_1} já está no estoque de outra loja: use a transferência, não uma entrada nova`, "em_outra_loja"],
      [`IMEI/ICCID ${IMEI_1} já foi vendido: a volta ao estoque é pela devolução da venda`, "vendido"],
      [`IMEI/ICCID ${IMEI_1} está em transferência: conclua o recebimento da transferência`, "em_transferencia"],
      [`IMEI/ICCID ${IMEI_1} foi baixado por ajuste ou perda: a entrada não desfaz essa baixa`, "baixado"],
      [`IMEI/ICCID ${IMEI_1} já tem histórico (ou está em contagem aberta) em outra variação: receba na variação original (SKU APA-0002)`, "outra_variacao"],
      [`IMEI/ICCID ${IMEI_1} já cadastrado: use a transferência, a devolução ou o ajuste, não uma entrada nova`, "ja_cadastrado"],
      ["Este CNPJ já está em outro fornecedor", "cnpj"],
      ["Já existe outro fornecedor com este nome", "nome_repetido"],
      ["duplicate key value violates unique constraint", "ja_cadastrado"],
    ];
    for (const [mensagem, esperado] of casos) expect(duplicado(mensagem), mensagem).toBe(esperado);
    // Cada chave tem texto próprio no catálogo: nenhuma recusa cai no aviso genérico de "já cadastrado".
    const textos = casos.map(([, chave]) => ERROS_DA_ENTRADA[chave]);
    expect(new Set(textos).size).toBe(new Set(casos.map(([, chave]) => chave)).size);
  });

  it("o SKU que vem no texto não escolhe o aviso (SKU com 'CNPJ', 'IMEI', '500', 'fornecedor')", () => {
    expect(duplicado(`IMEI/ICCID ${IMEI_1} já tem histórico (ou está em contagem aberta) em outra variação: receba na variação original (SKU CNPJ-01)`)).toBe("outra_variacao");
    expect(duplicado(`IMEI/ICCID ${IMEI_1} já tem histórico (ou está em contagem aberta) em outra variação: receba na variação original (SKU SEGUNDO IMEI)`)).toBe("outra_variacao");
    expect(invalido("Linha 1 (IMEI-500): quantidade inválida (1 a 10.000)")).toBe("quantidade");
    expect(invalido("Linha 1 (CAPA AZUL 500): quantidade inválida (1 a 10.000)")).toBe("quantidade");
    expect(invalido("Linha 4 (FORNECEDOR-X): quantidade inválida (1 a 10.000)")).toBe("quantidade");
    expect(invalido("Linha 2 (CUSTO-1): o produto está inativo no catálogo: reative antes de receber")).toBe("produto_inativo");
  });

  it("dados recusados: produto ou variação inativos, tipo, linhas, limites e identificadores", () => {
    const casos: [string, ErroDaEntrada][] = [
      ["Linha 2 (APA-0001): o produto está inativo no catálogo: reative antes de receber", "produto_inativo"],
      ["Linha 3: variação inativa ou de outra rede", "variacao_inativa"],
      ["Linha 3: variação inválida", "dados"],
      ["Linha 1 (REC-0001): este tipo de item não tem estoque", "dados"],
      ["Linha 1: condição inválida (novo, seminovo ou avariado)", "dados"],
      ["Linha 1: custo inválido", "custo"],
      ["Linha 1 (APA-0001): informe o IMEI/ICCID de cada unidade", "identificador"],
      ["Linha 1 (APA-0001): IMEI inválido: 123", "identificador"],
      ["Linha 1 (CHP-0001): ICCID inválido: 8955", "identificador"],
      [`IMEI/ICCID ${IMEI_1} repetido nesta entrada`, "identificador"],
      ["Linha 2 (ACE-0001): acessório entra por quantidade, sem IMEI/ICCID", "identificador"],
      ["Linha 2 (ACE-0001): quantidade inválida (1 a 10.000)", "quantidade"],
      ["Linha 2 (ACE-0001): acessório entra como novo (avaria vai pela perda)", "dados"],
      ["Até 500 aparelhos e chips por entrada: divida em mais de uma", "muitos"],
      ["A entrada precisa ter de 1 a 200 linhas", "linhas"],
      ["Tipo de entrada inválido: compra ou carga inicial", "tipo"],
      ["Escolha um fornecedor ativo desta rede", "fornecedor"],
      ["Carga inicial não tem fornecedor", "fornecedor"],
      ["Documento longo demais (até 60)", "documento"],
      ["Entrada só em loja física ou depósito ativos", "loja"],
      ["Chave do formulário obrigatória", "dados"],
      ["Informe o motivo", "motivo"],
      // Cadastro de fornecedor (a mesma tela): cada recusa com o próprio aviso, não o da compra sem fornecedor.
      ["Informe o nome do fornecedor (de 2 a 120 letras)", "nome"],
      ["CNPJ do fornecedor inválido", "cnpj"],
      ["Contato do fornecedor inválido (de 3 a 200 letras)", "dados"],
    ];
    for (const [mensagem, esperado] of casos) expect(invalido(mensagem), mensagem).toBe(esperado);
  });

  it("o detalhe da recusa: a linha, o SKU e o IMEI/ICCID que o banco apontou", () => {
    expect(detalheDoErro({ message: "Linha 2 (APA-0001): o produto está inativo no catálogo: reative antes de receber" })).toEqual({ linha: "2", sku: "APA-0001" });
    expect(detalheDoErro({ message: "Linha 3 (APA-0001): IMEI inválido: 123" })).toEqual({ linha: "3", id: "123", sku: "APA-0001" });
    expect(detalheDoErro({ message: "Linha 1 (CAPA AZUL 500): quantidade inválida (1 a 10.000)" })).toEqual({ linha: "1", sku: "CAPA AZUL 500" });
    expect(detalheDoErro({ message: "Linha 3: variação inativa ou de outra rede" })).toEqual({ linha: "3" });
    expect(detalheDoErro({ message: `IMEI/ICCID ${IMEI_1} já foi vendido: a volta ao estoque é pela devolução da venda` })).toEqual({ id: IMEI_1 });
    expect(detalheDoErro({ message: `IMEI ${IMEI_2} é o segundo IMEI de um aparelho já cadastrado: informe o IMEI principal` })).toEqual({ id: IMEI_2 });
    expect(detalheDoErro({ message: `IMEI/ICCID ${ICCID_1} já tem histórico (ou está em contagem aberta) em outra variação: receba na variação original (SKU APA-0002)` }))
      .toEqual({ id: ICCID_1, sku: "APA-0002" });
    // Recusas do estorno: o IMEI/ICCID que não está livre; a linha sem quantidade livre (o parêntese não é SKU).
    expect(detalheDoErro({ message: `O IMEI/ICCID ${IMEI_1} não está livre nesta loja (vendido, reservado ou transferido): o estorno não é possível` })).toEqual({ id: IMEI_1 });
    expect(detalheDoErro({ message: "Não há quantidade livre para estornar a linha 2 (já vendida, reservada ou transferida)" })).toEqual({ linha: "2" });
    for (const semDetalhe of [null, undefined, {}, { message: "Chave do formulário obrigatória" }, { message: "deadlock detected" }]) expect(detalheDoErro(semDetalhe)).toEqual({});
  });

  it("o detalhe que volta pelo endereço só passa no formato esperado", () => {
    expect(detalheDoEndereco({ linha: "2", id: IMEI_1, sku: "APA-0001" })).toEqual({ linha: "2", id: IMEI_1, sku: "APA-0001" });
    expect(detalheDoEndereco({ linha: "200", id: ICCID_1, sku: "CAPA AZUL 500" })).toEqual({ linha: "200", id: ICCID_1, sku: "CAPA AZUL 500" });
    expect(detalheDoEndereco({ sku: "Película_3D/9H+ #2.5" }).sku).toBe("Película_3D/9H+ #2.5");
    expect(detalheDoEndereco({})).toEqual({ linha: null, id: null, sku: null });
    for (const linha of ["0", "1000", "2a", "-1", " 2", ""]) expect(detalheDoEndereco({ linha }).linha, linha).toBeNull();
    for (const id of ["12a", "1".repeat(23), "12 34", "<b>1</b>", ""]) expect(detalheDoEndereco({ id }).id, id).toBeNull();
    for (const sku of ["<script>", "A".repeat(61), "a  b", " APA-1", "APA-1 ", "a\nb", "APA(1)", "x\"y", ""]) expect(detalheDoEndereco({ sku }).sku, sku).toBeNull();
  });
});
