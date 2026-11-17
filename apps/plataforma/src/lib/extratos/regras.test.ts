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
    expect(filtroDoExtrato("hasOwnProperty")).toBe("pendente");
    expect(filtroDoExtrato(undefined)).toBe("pendente");
    expect(paginaDoExtrato("3", 250)).toEqual({ pagina: 3, paginas: 3, de: 200 });
    expect(paginaDoExtrato("9", 250)).toEqual({ pagina: 3, paginas: 3, de: 200 });
    expect(paginaDoExtrato("-1", 0)).toEqual({ pagina: 1, paginas: 1, de: 0 });
  });

  it("o resumo do banco, lido com rigor", () => {
    const resumo = { creditos: 2, creditos_centavos: 15_000, debitos: 1, debitos_centavos: 3_000, taxas_centavos: 300, liquido_centavos: 11_700,
      a_cair_centavos: 4_900, pendentes: 2, conciliadas: 0, ignoradas: 1 };
    expect(lerResumoDoExtrato({ ...resumo, extra: "x" })).toEqual(resumo);
    expect(lerResumoDoExtrato({ ...resumo, taxas_centavos: "300" })).toBeNull();
    expect(lerResumoDoExtrato([resumo])).toBeNull();
    expect(lerResumoDoExtrato(null)).toBeNull();
  });
});
