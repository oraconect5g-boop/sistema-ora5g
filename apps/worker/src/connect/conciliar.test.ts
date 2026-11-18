// CONNECT-c (ORA-CONNECT-009): as regras da leitura dos relatórios no worker, com a Nogle e o banco SIMULADOS. O caminho
// de verdade (o transporte HTTP, o token e o banco com as migrations) está em ponta-a-ponta.test.ts.
import type { LinhaDoRelatorio, PedidoNogle, RelatorioDaConciliacao } from "@ora5g/dominio/nogle";
import { describe, expect, it } from "vitest";

import type { ResultadoChamada } from "./cliente-nogle.ts";
import { conciliarRelatorios, type BancoConnect } from "./processar.ts";

const linha = (n: number) => ({ linha: `5191111${String(n).padStart(4, "0")}`, data_ativacao: "2026-11-10 10:00:00", plano_ativacao: "7 GB", plano_valor: "44.90" });
function simulados(paginas: Record<RelatorioDaConciliacao, ResultadoChamada[]>) {
  const registrados: { relatorio: RelatorioDaConciliacao; linhas: LinhaDoRelatorio[] }[] = [];
  const pedidos: PedidoNogle[] = [];
  const banco = {
    registrarConciliacao: async (relatorio: RelatorioDaConciliacao, _de: string, _ate: string, linhas: LinhaDoRelatorio[]) => {
      registrados.push({ relatorio, linhas });
      return { numero: registrados.length, totais: { linhas: linhas.length } };
    },
  } as unknown as BancoConnect;
  const nogle = {
    chamar: async (p: PedidoNogle): Promise<ResultadoChamada> => {
      pedidos.push(p);
      const relatorio = p.caminho.replace("/relatorios/", "") as RelatorioDaConciliacao;
      return paginas[relatorio].shift() ?? { tipo: "resposta", status: 200, corpo: { data: [] } };
    },
  };
  return { banco, nogle, registrados, pedidos };
}
const pagina = (...ns: number[]): ResultadoChamada => ({ tipo: "resposta", status: 200, corpo: { data: ns.map(linha) } });

describe("a conciliação no worker (CONNECT-c)", () => {
  it("junta as páginas na ordem, numera as linhas em sequência e grava cada relatório uma vez", async () => {
    const s = simulados({ ativacoes: [pagina(1, 2), pagina(3)], recargas: [] });
    const r = await conciliarRelatorios(s.banco, s.nogle, "2026-11-10", "2026-11-11");
    expect(r).toMatchObject({ conciliadas: 2, linhas: 3, falhas: 0 });
    expect(s.registrados.map((x) => [x.relatorio, x.linhas.map((l) => l.ordem)])).toEqual([["ativacoes", [1, 2, 3]], ["recargas", []]]);
    expect(s.pedidos.filter((p) => p.caminho === "/relatorios/ativacoes").map((p) => p.corpo.page)).toEqual([1, 2, 3]);
  });

  it("uma página que falha, que não se entende ou o relatório sem fim: nada daquele relatório é gravado; o outro segue", async () => {
    for (const [falha, esperado] of [
      [{ tipo: "falha", enviada: true, motivo: "tempo esgotado" }, "sem resposta da Nogle"],
      [{ tipo: "resposta", status: 500, corpo: {} }, "HTTP 500"],
      [{ tipo: "resposta", status: 200, corpo: { mensagem: "erro" } }, "não trouxe a lista"],
      [{ tipo: "bloqueada", motivo: "consulta GET com corpo desligada neste worker (NOGLE_GET_COM_CORPO)" }, "NOGLE_GET_COM_CORPO"],
    ] as [ResultadoChamada, string][]) {
      const s = simulados({ ativacoes: [pagina(1), falha], recargas: [pagina(9)] });
      const r = await conciliarRelatorios(s.banco, s.nogle, "2026-11-10", "2026-11-11");
      expect(r).toMatchObject({ conciliadas: 1, falhas: 1 });
      expect(r.detalhes[0]?.falha).toContain(esperado);
      expect(r.detalhes[0]?.falha).toContain("nada gravado");
      expect(s.registrados.map((x) => x.relatorio)).toEqual(["recargas"]);
    }
    const semFim = simulados({ ativacoes: Array.from({ length: 5 }, (_, i) => pagina(i + 1)), recargas: [] });
    const r = await conciliarRelatorios(semFim.banco, semFim.nogle, "2026-11-10", "2026-11-11", { relatorios: ["ativacoes"], paginas: 3 });
    expect(r).toMatchObject({ conciliadas: 0, falhas: 1 });
    expect(r.detalhes[0]?.falha).toBe("o relatório passou de 3 páginas: nada gravado");
    expect(semFim.registrados).toEqual([]);
  });

  it("o período inválido não chama a Nogle", async () => {
    const s = simulados({ ativacoes: [], recargas: [] });
    const r = await conciliarRelatorios(s.banco, s.nogle, "2026-11-12", "2026-11-11");
    expect(r).toMatchObject({ conciliadas: 0, falhas: 2 });
    expect(s.pedidos).toEqual([]);
  });
});
