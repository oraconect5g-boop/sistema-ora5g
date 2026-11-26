// O assistente de ativação (lote CONNECT-n): as regras de cada passo, o resumo da conferência e o desenho inicial. Dados
// FICTÍCIOS (ICCID e CPF gerados com o dígito verificador; nenhum de cliente). O envio de verdade passa pela ação
// registrarOperacao (testada em ../abas.test.ts) e pelo banco (packages/banco).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { completarComDigitoVerificador, cpfValido } from "@ora5g/dominio";

vi.mock("../acoes", () => ({
  registrarOperacao: async () => undefined, pedirCadastroDaNogle: async () => ({ ok: false, erro: "falha" }),
  lerCadastroDaNogle: async () => ({ estado: "descartada" }), descartarCadastroDaNogle: async () => undefined,
}));

import { AssistenteDeAtivacao } from "./AssistenteDeAtivacao";
import { documentoMascarado, ETAPAS, faltaNaEtapa, primeiraEtapaIncompleta, resumoDaAtivacao } from "./etapas";

const ICCID = completarComDigitoVerificador("895517011000000001");
const CPF = "52998224725";
const dados = (campos: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(campos)) d.set(k, v);
  return d;
};
const CLIENTE = { nome: "Cliente Fictício", documento: CPF, cep: "80000-000", id_cidade: "4106902", rua: "Rua Fictícia", numero_endereco: "100", bairro: "Centro" };
const COMPLETO = { iccid: ICCID, ...CLIENTE, plano: "1718", ddd: "41", metodo: "LINK", venda_item: "" };
const LISTAS = {
  planos: [{ codigo: "1718", nome: "10 GB", valor_centavos: 5_490 }],
  cidades: [{ codigo: "4106902", nome: "Curitiba", uf: "PR" }],
  pagos: [{ id: "00000000-0000-4000-8000-000000000001", rotulo: "Venda nº 12 · ATV-10 GB · R$ 54,90", plano: "1718" }],
};

describe("os passos do assistente", () => {
  it("os dados fictícios valem (o ICCID e o CPF têm o dígito verificador)", () => {
    expect(ICCID).toMatch(/^89\d{17}$/);
    expect(cpfValido(CPF)).toBe(true);
    expect(ETAPAS).toEqual(["Chip", "Cliente", "Plano e DDD", "Pagamento", "Conferir"]);
  });

  it("o chip: o ICCID com o dígito verificador, ou o eSIM sem ICCID", () => {
    expect(faltaNaEtapa(0, dados({}))).toMatch(/^Digite o ICCID/);
    expect(faltaNaEtapa(0, dados({ iccid: ICCID.slice(0, -1) + ((Number(ICCID.at(-1)) + 1) % 10) }))).toMatch(/^Confira o ICCID/);
    expect(faltaNaEtapa(0, dados({ iccid: ICCID.replace(/(\d{4})/g, "$1 ") }))).toBeNull();
    expect(faltaNaEtapa(0, dados({ esim: "on" }))).toBeNull();
  });

  it("o cliente: o nome, o CPF ou o CNPJ, o contato (se houver) e o endereço", () => {
    expect(faltaNaEtapa(1, dados(CLIENTE))).toBeNull();
    expect(faltaNaEtapa(1, dados({ ...CLIENTE, nome: "Jo" }))).toMatch(/nome completo/);
    expect(faltaNaEtapa(1, dados({ ...CLIENTE, documento: "52998224724" }))).toMatch(/CPF \(11 dígitos\) ou CNPJ/);
    expect(faltaNaEtapa(1, dados({ ...CLIENTE, documento: "12.345.678/0001-90" }))).toBeNull();
    expect(faltaNaEtapa(1, dados({ ...CLIENTE, email: "sem-arroba" }))).toMatch(/e-mail/);
    expect(faltaNaEtapa(1, dados({ ...CLIENTE, telefone: "9999" }))).toMatch(/Telefone/);
    expect(faltaNaEtapa(1, dados({ ...CLIENTE, cep: "8000" }))).toMatch(/CEP/);
    expect(faltaNaEtapa(1, dados({ ...CLIENTE, id_cidade: "" }))).toMatch(/cidade/);
    expect(faltaNaEtapa(1, dados({ ...CLIENTE, bairro: " " }))).toMatch(/rua, o número e o bairro/);
  });

  it("o plano e o DDD; o pagamento (o crédito da carteira só com o serviço pago no caixa)", () => {
    expect(faltaNaEtapa(2, dados({ ddd: "41" }))).toBe("Escolha o plano.");
    expect(faltaNaEtapa(2, dados({ plano: "1718" }))).toBe("Escolha o DDD da linha nova.");
    expect(faltaNaEtapa(3, dados({ metodo: "LINK" }))).toBeNull();
    expect(faltaNaEtapa(3, dados({ metodo: "SALDO" }))).toMatch(/serviço pago no caixa/);
    expect(faltaNaEtapa(3, dados({ metodo: "SALDO", venda_item: LISTAS.pagos[0]?.id ?? "" }))).toBeNull();
    expect(faltaNaEtapa(3, dados({}))).toBe("Escolha como a Nogle é paga.");
  });

  it("no envio, o primeiro passo que falta", () => {
    expect(primeiraEtapaIncompleta(dados(COMPLETO))).toBeNull();
    expect(primeiraEtapaIncompleta(dados({ ...COMPLETO, ddd: "" }))).toEqual({ etapa: 2, falta: "Escolha o DDD da linha nova." });
    expect(primeiraEtapaIncompleta(dados({ ...COMPLETO, iccid: "" }))?.etapa).toBe(0);
  });
});

describe("a conferência", () => {
  it("o resumo para conferir com o cliente, com o documento só pelo fim", () => {
    expect(resumoDaAtivacao(dados(COMPLETO), LISTAS)).toEqual([
      ["Chip", `ICCID ${ICCID}`],
      ["Titular", "Cliente Fictício · •••.•••.247-25"],
      ["Endereço", "Rua Fictícia, 100 – Centro – Curitiba/PR – CEP 80000-000"],
      ["Plano", expect.stringMatching(/^10 GB · R\$\s54,90$/)],
      ["DDD", "41"],
      ["Pagamento à Nogle", "Pix da Nogle: o cliente paga direto, na hora"],
      ["Serviço pago no caixa", "Nenhum"],
    ]);
    const comPago = resumoDaAtivacao(dados({ ...COMPLETO, esim: "on", iccid: "", venda_item: LISTAS.pagos[0]?.id ?? "" }), LISTAS);
    expect(comPago).toContainEqual(["Chip", "eSIM (chip virtual)"]);
    expect(comPago).toContainEqual(["Pagamento à Nogle", "Pix da Nogle: a loja paga (o cliente já pagou no caixa)"]);
    expect(comPago).toContainEqual(["Serviço pago no caixa", "Venda nº 12 · ATV-10 GB · R$ 54,90"]);
    expect(resumoDaAtivacao(dados({ ...COMPLETO, metodo: "SALDO" }), LISTAS)).toContainEqual(["Pagamento à Nogle", "Crédito da carteira da Ora na Nogle"]);
    expect([documentoMascarado("12345678000190"), documentoMascarado("123")]).toEqual(["••.•••.•••/0001-90", ""]);
  });
});

describe("o desenho inicial", () => {
  const html = renderToStaticMarkup(createElement(AssistenteDeAtivacao, {
    chave: "00000000-0000-4000-8000-000000000009", planos: LISTAS.planos, ddds: [{ codigo: "41", uf: "PR" }], cidades: LISTAS.cidades,
    pagos: LISTAS.pagos, chips: [{ iccid: ICCID, venda: 7 }],
  }));
  const blocos = [...html.matchAll(/<div( hidden="")? class="(space-y-4|grid gap-4 sm:grid-cols-2|space-y-3)?"?>/g)];

  it("um formulário só, com o tipo e a chave da operação, sem onSubmit e sem enviar fora do passo final", () => {
    expect(html.match(/<form/g)).toHaveLength(1);
    expect(html).toContain('<input type="hidden" name="tipo" value="ativacao"/>');
    expect(html).toContain('<input type="hidden" name="chave" value="00000000-0000-4000-8000-000000000009"/>');
    expect(html).not.toContain('name="esim"');
    expect(html).not.toContain('type="submit"');
    expect(html).toContain("Etapa 1 de 5: Chip");
  });

  it("só o passo do chip à vista; os outros passos estão no formulário, escondidos", () => {
    expect(blocos.length).toBeGreaterThanOrEqual(3);
    expect(html).toMatch(/<div class="space-y-4"><fieldset><legend class="sr-only">Tipo de chip<\/legend>/);
    for (const campo of ["nome", "documento", "cep", "id_cidade", "plano", "ddd", "metodo", "venda_item"]) expect(html).toContain(`name="${campo}"`);
    // AUD-f: o passo do cliente começa pelo documento, com a busca do cadastro na Nogle logo abaixo.
    expect(html).toMatch(/<div hidden="" class="grid gap-4 sm:grid-cols-2"><label class="block text-sm font-medium">CPF ou CNPJ<input [^>]*name="documento"/);
  });

  it("AUD-f: a busca do cadastro na Nogle é um botão comum (o toque e o Enter nele não registram) e só depois do documento vêm os outros campos", () => {
    const passo = html.slice(html.indexOf('name="documento"'), html.indexOf('name="nome"'));
    expect(passo).toMatch(/<button type="button"[^>]*>.*Buscar o cadastro na Nogle<\/button>/);
    expect(passo).toContain("Comece pelo documento: a Nogle pode preencher o resto, e você confere com o cliente.");
    expect(passo).toContain('aria-live="polite"');
    expect(html).not.toContain('type="submit"');
  });

  it("os chips vendidos na loja, para tocar, só pelo fim do ICCID", () => {
    expect(html).toContain(`•••• ${ICCID.slice(-6)} · venda nº 7`);
    expect(html).not.toContain(`>${ICCID}<`);
  });
});
