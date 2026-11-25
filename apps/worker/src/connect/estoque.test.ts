// CONNECT-d (24/11/2026; ORA-INV-011): a leitura do estoque de chips no worker, com a Nogle e o banco SIMULADOS. O caminho
// de verdade (o transporte HTTP com o GET com corpo, o token e o banco com as migrations) está em ponta-a-ponta.test.ts.
// Os ICCIDs são FICTÍCIOS.
import type { PedidoNogle } from "@ora5g/dominio/nogle";
import { describe, expect, it } from "vitest";

import type { ResultadoChamada } from "./cliente-nogle.ts";
import { lerEstoqueDeChips, type BancoConnect, type LeituraDoEstoque } from "./processar.ts";

const I1 = "8955170110000000011";
const I2 = "8955170110000000029";
const I3 = "8955170110000000037";
const ok = (corpo: unknown): ResultadoChamada => ({ tipo: "resposta", status: 200, corpo });
const PDVS = ok({ pdvs: [{ id: "5216", nome: "LOJA A (teste)", cidade: "Curitiba", uf: "PR", estoque_minimo_chips: "10", cpf: "00000000191" }, { id: "5250", nome: "REVENDA (teste)" }] });
const MVNO = ok({ retorno: true, mensagem: "", total: 1, data: [{ id: "1", iccid: I3, tipo: "eSIM", activation_code_esim: "LPA:1$teste.invalid$X", qr_code_esim: "data:x" }] });

function simulados(respostas: Record<string, ResultadoChamada | ((p: PedidoNogle) => ResultadoChamada)>) {
  const pedidos: PedidoNogle[] = [];
  const gravadas: LeituraDoEstoque[] = [];
  const banco = {
    gravarEstoque: async (leitura: LeituraDoEstoque) => {
      gravadas.push(leitura);
      return { numero: gravadas.length, pdvs: leitura.pdvs.length, pdvs_lidos: leitura.estoques.length, chips: 0, falhas: leitura.falhas };
    },
  } as unknown as BancoConnect;
  const nogle = {
    chamar: async (p: PedidoNogle): Promise<ResultadoChamada> => {
      pedidos.push(p);
      const r = respostas[p.caminho];
      if (!r) throw new Error(`rota inesperada: ${p.caminho}`);
      return typeof r === "function" ? r(p) : r;
    },
  };
  return { banco, nogle, pedidos, gravadas };
}

describe("a leitura do estoque de chips no worker (CONNECT-d)", () => {
  it("lê os PDVs, a MVNO e cada PDV só com GET; grava o que respondeu, sem o código do eSIM nem dado de pessoa", async () => {
    const s = simulados({
      "/pdv/listar": PDVS,
      "/linhas/estoque": MVNO,
      "/pdv/estoque": (p) => (p.corpo.id === 5216
        ? ok({ total: 3, data: [{ id: "1", iccid: I1, data_repasse: "2022-03-21 22:31:23.580", tipo: "físico" }, { id: "2", iccid: I2, tipo: "eSIM" }, { id: "3", iccid: "895517011....", tipo: "físico" }] })
        : { tipo: "resposta", status: 500, corpo: {} }),
    });
    const r = await lerEstoqueDeChips(s.banco, s.nogle);
    expect(r).toMatchObject({ gravada: true, ignorados: 1, leitura: { numero: 1, pdvs: 2, pdvs_lidos: 1, falhas: 1 } });
    expect(s.pedidos).toEqual([
      { metodo: "GET", caminho: "/pdv/listar", corpo: {} },
      { metodo: "GET", caminho: "/linhas/estoque", corpo: {} },
      { metodo: "GET", caminho: "/pdv/estoque", corpo: { id: 5216 } },
      { metodo: "GET", caminho: "/pdv/estoque", corpo: { id: 5250 } },
    ]);
    expect(s.gravadas).toEqual([{
      pdvs: [
        { id: 5216, nome: "LOJA A (teste)", cidade: "Curitiba", uf: "PR", estoque_minimo: 10 },
        { id: 5250, nome: "REVENDA (teste)", cidade: null, uf: null, estoque_minimo: null },
      ],
      mvno: [{ iccid: I3, tipo: "esim" }],
      estoques: [{ pdv: 5216, chips: [{ iccid: I1, tipo: "fisico", repassado_em: "2022-03-21 22:31:23.580" }, { iccid: I2, tipo: "esim", repassado_em: null }] }],
      falhas: 1,
    }]);
    expect(JSON.stringify(s.gravadas)).not.toMatch(/LPA|data:x|00000000191/);
  });

  it("sem a lista dos PDVs nada é pedido adiante nem gravado; a MVNO ou o PDV que falha só conta como falha", async () => {
    for (const [lista, motivo] of [
      [{ tipo: "resposta", status: 401, corpo: { message: "Unauthenticated." } }, "a lista dos PDVs: a Nogle respondeu HTTP 401"],
      [{ tipo: "falha", enviada: false, motivo: "sem conexão com a Nogle (ENOTFOUND)" }, "a lista dos PDVs: sem resposta da Nogle"],
      [{ tipo: "sem_acesso", motivo: "login recusado pela Nogle (HTTP 401)" }, "a lista dos PDVs: login recusado pela Nogle (HTTP 401)"],
      [ok({ mensagem: "erro" }), "a lista dos PDVs veio fora da forma"],
      [ok({ pdvs: [] }), "a lista dos PDVs veio fora da forma"],
    ] as [ResultadoChamada, string][]) {
      const s = simulados({ "/pdv/listar": lista });
      expect(await lerEstoqueDeChips(s.banco, s.nogle)).toEqual({ gravada: false, motivo });
      expect(s.pedidos).toHaveLength(1);
      expect(s.gravadas).toEqual([]);
    }
    // A MVNO fora da forma e o GET com corpo desligado no worker: grava os PDVs, sem MVNO e sem estoque de PDV.
    const s = simulados({
      "/pdv/listar": PDVS,
      "/linhas/estoque": ok({ retorno: true, mensagem: "", total: 5, data: [] }),
      "/pdv/estoque": { tipo: "bloqueada", motivo: "consulta GET com corpo desligada neste worker (NOGLE_GET_COM_CORPO)" },
    });
    expect(await lerEstoqueDeChips(s.banco, s.nogle)).toMatchObject({ gravada: true, leitura: { pdvs_lidos: 0, falhas: 3 } });
    expect(s.gravadas[0]).toMatchObject({ mvno: null, estoques: [], falhas: 3 });
  });
});
