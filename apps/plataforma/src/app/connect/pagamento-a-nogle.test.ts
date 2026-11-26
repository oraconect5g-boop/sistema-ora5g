// O pagamento à Nogle no formulário (AUD-f): sem plano escolhido, nenhuma venda paga é oferecida (só "Nenhum"); o desenho
// inicial (no servidor) mostra o Pix da Nogle marcado e o aviso para escolher o plano. Dados FICTÍCIOS.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PagamentoANogle } from "./PagamentoANogle";

describe("o pagamento à Nogle (AUD-f)", () => {
  it("antes de escolher o plano, só o Nenhum; o Pix da Nogle é o padrão", () => {
    const html = renderToStaticMarkup(createElement(PagamentoANogle, { pagos: [
      { id: "00000000-0000-4000-8000-000000000001", rotulo: "Venda nº 12 · ATV-10 GB · R$ 54,90", plano: "1718" },
    ] }));
    expect(html.match(/<option /g)).toHaveLength(1);
    expect(html).toContain("Nenhum: o cliente paga o Pix da Nogle direto");
    expect(html).not.toContain("Venda nº 12");
    expect(html).toContain("Escolha o plano para ver as vendas pagas dele no caixa.");
    expect(html.match(/<input[^>]*value="LINK"[^>]*>/)?.[0]).toContain('checked=""');
    expect(html.match(/<input[^>]*value="SALDO"[^>]*>/)?.[0]).not.toContain("checked");
  });
});
