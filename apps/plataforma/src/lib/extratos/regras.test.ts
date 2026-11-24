// As regras das telas dos extratos (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016).
import { describe, expect, it } from "vitest";

import {
  ERROS_DOS_EXTRATOS, MEIOS_DO_EXTRATO, NOME_DO_MEIO, erroDosExtratos, filtroDoExtrato, lerEnvioDoExtrato, lerResumoDoExtrato, paginaDoExtrato,
  textoDoProblema,
} from "./regras";

const formulario = (campos: Record<string, string | string[]>) => ({
  get: (nome: string) => { const v = campos[nome]; return Array.isArray(v) ? v[0] ?? null : v ?? null; },
  getAll: (nome: string) => { const v = campos[nome]; return Array.isArray(v) ? v : v === undefined ? [] : [v]; },
});

describe("o erro do banco vira uma mensagem do catálogo", () => {
  it("cada recusa das funções dos extratos, pelo código e pelo texto", () => {
    const casos: [{ code?: string; message?: string }, keyof typeof ERROS_DOS_EXTRATOS][] = [
      [{ code: "42501", message: "Sem permissão para conciliar pagamentos aqui" }, "permissao"],
      [{ code: "P0002", message: "Pagamento não encontrado para você" }, "permissao"],
      [{ code: "OR030", message: "Pagamento já conciliado: desfaça a conciliação antes de mudar" }, "ja_conciliado"],
      // AUD-c (F21-02): a linha que é o recebimento de um repasse não concilia venda, não sai da conta nem se desfaz pelo extrato.
      [{ code: "OR046", message: "Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse antes" }, "de_repasse"],
      [{ code: "OR046", message: "Esta linha é o recebimento de um repasse de marketplace: desfaça o repasse na tela dos repasses" }, "de_repasse"],
      // PAY-011a: o débito do extrato e o estorno da venda. Cada recusa do banco com a mensagem dela (as frases são as da
      // migration 20261124082944); as que parecem com as de antes ("outra linha", "valor", "meio") não caem nas de antes.
      [{ code: "OR046", message: "Este débito é o estorno de uma venda: ele já tem o uso dele" }, "de_estorno"],
      // FIN-006a: a linha que é o depósito de uma maquininha.
      [{ code: "OR046", message: "Esta linha é o depósito de uma maquininha: desfaça o depósito antes" }, "de_deposito"],
      [{ code: "OR046", message: "Esta linha é o depósito de uma maquininha: desfaça o depósito na tela dos depósitos" }, "de_deposito"],
      [{ code: "OR047", message: "Este débito confirmou o estorno de uma venda: a confirmação não se desfaz, e a linha fica como a prova dele" }, "estorno_fixo"],
      [{ code: "42501", message: "Confirmar o estorno é da gerência da loja da venda" }, "estorno_gerencia"],
      [{ code: "42501", message: "Estorno não encontrado para você" }, "permissao"],
      [{ code: "22023", message: "Este estorno já tem o débito dele em outra linha de extrato" }, "estorno_outro_debito"],
      [{ code: "22023", message: "O débito não tem o valor do estorno" }, "estorno_valor"],
      [{ code: "22023", message: "O meio do estorno não é deste extrato" }, "estorno_meio"],
      [{ code: "22023", message: "O débito desta linha ainda não aconteceu: ligue no dia dele" }, "estorno_futuro"],
      [{ code: "22023", message: "O débito é de antes da venda: não é o estorno dela" }, "estorno_antes"],
      [{ code: "22023", message: "Para confirmar o estorno, entre na loja da venda" }, "estorno_outra_loja"],
      [{ code: "22023", message: "Só um débito do extrato é o estorno de uma venda" }, "so_debito"],
      [{ code: "23505", message: "duplicate key" }, "instante"],
      [{ code: "22023", message: "Este arquivo já foi importado em outro lugar (outra loja ou a rede)" }, "outro_lugar"],
      [{ code: "22023", message: "Esta linha do extrato já foi decidida: desfaça antes" }, "decidida"],
      [{ code: "22023", message: "Esta linha está conciliada: desfaça antes" }, "decidida"],
      [{ code: "22023", message: "O valor da linha não é o do pagamento" }, "valor"],
      [{ code: "22023", message: "Este pagamento não é de um meio deste extrato" }, "meio"],
      [{ code: "22023", message: "Este pagamento já está conciliado com outra linha de extrato" }, "outra_linha"],
      [{ code: "22023", message: "O dinheiro desta linha ainda não caiu: concilie no dia do repasse" }, "futuro"],
      [{ code: "22023", message: "Valor líquido entre zero e o valor do pagamento" }, "liquido"],
      [{ code: "22023", message: "Informe o motivo (de 3 a 200 letras)" }, "motivo"],
      [{ code: "22023", message: "Escolha os meios de pagamento do extrato: Pix ou cartão" }, "meios"],
      [{ code: "22023", message: "O extrato leva de 1 a 5.000 linhas" }, "linhas"],
      [{ code: "22023", message: "Linha do extrato fora do formato" }, "dados"],
      [{ code: "57014", message: "canceling statement due to statement timeout" }, "falha"],
    ];
    for (const [erro, chave] of casos) expect(erroDosExtratos(erro), erro.message).toBe(chave);
    expect(erroDosExtratos(null)).toBe("falha");
  });

  it("a linha que não deu para ler, apontada; endereço adulterado não vira texto", () => {
    expect(textoDoProblema("12", "data", "32/13/2026")).toBe('Linha 12 do arquivo: não deu para ler a data (dia/mês/ano) "32/13/2026". Confira a coluna escolhida e o arquivo.');
    expect(textoDoProblema("3", "taxa", "2,49%")).toBe('Linha 3 do arquivo: não deu para ler a taxa (em reais, sem %) "2,49%". Confira a coluna escolhida e o arquivo.');
    expect(textoDoProblema("4", "referencia", "")).toBe("Linha 4 do arquivo: não deu para ler a referência (até 80 letras). Confira a coluna escolhida e o arquivo.");
    expect(textoDoProblema("x", "data", "1")).toBeNull();
    expect(textoDoProblema("1", "constructor", "1")).toBeNull();
    expect(textoDoProblema(["1"], "data", "1")).toBeNull();
  });
});

describe("o formulário de envio", () => {
  it("onde, o tipo, a fonte e os meios (sem repetir)", () => {
    expect(lerEnvioDoExtrato(formulario({ onde: "loja", tipo: "maquininha", fonte: "  PicPay   da loja ", meios: ["pix_picpay", "cartao_picpay", "pix_picpay"] })))
      .toEqual({ ok: true, envio: { onde: "loja", tipo: "maquininha", fonte: "PicPay da loja", meios: ["pix_picpay", "cartao_picpay"] } });
    expect(lerEnvioDoExtrato(formulario({ onde: "rede", tipo: "banco", fonte: "Banco", meios: "pix_direto" })))
      .toEqual({ ok: true, envio: { onde: "rede", tipo: "banco", fonte: "Banco", meios: ["pix_direto"] } });
  });

  it("recusa cada campo fora da regra, com a mensagem dele", () => {
    const certo = { onde: "loja", tipo: "maquininha", fonte: "PicPay", meios: ["pix_picpay"] };
    expect(lerEnvioDoExtrato(formulario({ ...certo, onde: "outra" }))).toEqual({ ok: false, erro: "onde" });
    expect(lerEnvioDoExtrato(formulario({ ...certo, tipo: "cartao" }))).toEqual({ ok: false, erro: "tipo" });
    expect(lerEnvioDoExtrato(formulario({ ...certo, tipo: "toString" }))).toEqual({ ok: false, erro: "tipo" });
    expect(lerEnvioDoExtrato(formulario({ ...certo, fonte: "P" }))).toEqual({ ok: false, erro: "fonte" });
    expect(lerEnvioDoExtrato(formulario({ ...certo, meios: [] }))).toEqual({ ok: false, erro: "meios" });
    expect(lerEnvioDoExtrato(formulario({ ...certo, meios: ["dinheiro"] }))).toEqual({ ok: false, erro: "meios" });
  });

  it("os meios do extrato são os que se conciliam, com o nome de cada um", () => {
    expect(MEIOS_DO_EXTRATO.map((m) => NOME_DO_MEIO[m])).toEqual(["Pix na maquininha PicPay", "Cartão na maquininha PicPay", "Cartão na maquininha PagSeguro", "Pix direto"]);
  });
});

describe("a tela do extrato", () => {
  it("o filtro e a página vêm do endereço, presos ao que existe", () => {
    expect(filtroDoExtrato("conciliada")).toBe("conciliada");
    expect(filtroDoExtrato("repasse")).toBe("repasse");
    expect(filtroDoExtrato("estorno")).toBe("estorno");
    expect(filtroDoExtrato("deposito")).toBe("deposito");
    expect(filtroDoExtrato("hasOwnProperty")).toBe("pendente");
    expect(filtroDoExtrato(undefined)).toBe("pendente");
    expect(paginaDoExtrato("3", 250)).toEqual({ pagina: 3, paginas: 3, de: 200 });
    expect(paginaDoExtrato("9", 250)).toEqual({ pagina: 3, paginas: 3, de: 200 });
    expect(paginaDoExtrato("-1", 0)).toEqual({ pagina: 1, paginas: 1, de: 0 });
  });

  it("o resumo do banco, lido com rigor", () => {
    const resumo = { creditos: 2, creditos_centavos: 15_000, debitos: 1, debitos_centavos: 3_000, taxas_centavos: 300, liquido_centavos: 11_700,
      a_cair_centavos: 4_900, pendentes: 2, conciliadas: 0, ignoradas: 1, repasses: 1, estornos: 1, depositos: 1 };
    expect(lerResumoDoExtrato({ ...resumo, extra: "x" })).toEqual(resumo);
    expect(lerResumoDoExtrato({ ...resumo, taxas_centavos: "300" })).toBeNull();
    // AUD-c: as linhas de repasse. O banco de antes da migration não manda a chave (lá elas contavam como pendentes): é
    // zero, não falha; a chave com outro tipo é falha.
    const deAntes: Record<string, number> = { ...resumo };
    delete deAntes.repasses;
    expect(lerResumoDoExtrato(deAntes)).toEqual({ ...resumo, repasses: 0 });
    expect(lerResumoDoExtrato({ ...resumo, repasses: "1" })).toBeNull();
    expect(lerResumoDoExtrato({ ...resumo, repasses: null })).toBeNull();
    // PAY-011a: os débitos de estorno, do mesmo jeito (o banco de antes não manda; outro tipo é falha).
    const semEstornos: Record<string, number> = { ...resumo };
    delete semEstornos.estornos;
    expect(lerResumoDoExtrato(semEstornos)).toEqual({ ...resumo, estornos: 0 });
    expect(lerResumoDoExtrato({ ...resumo, estornos: "1" })).toBeNull();
    // FIN-006a: os depósitos das maquininhas, do mesmo jeito.
    const semDepositos: Record<string, number> = { ...resumo };
    delete semDepositos.depositos;
    expect(lerResumoDoExtrato(semDepositos)).toEqual({ ...resumo, depositos: 0 });
    expect(lerResumoDoExtrato({ ...resumo, depositos: -1.5 })).toBeNull();
    expect(lerResumoDoExtrato([resumo])).toBeNull();
    expect(lerResumoDoExtrato(null)).toBeNull();
  });
});
