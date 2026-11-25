// O QR Code desenhado no servidor (CONNECT-l): o desenho volta a dar o mesmo texto quando lido módulo a módulo, e o
// componente é um SVG com rótulo, sem imagem de fora.
import { isValidElement } from "react";
import { encode } from "uqr";
import { describe, expect, it } from "vitest";

import { desenhoDoQr, QrCode } from "./QrCode";

// Refaz a grade a partir do caminho ("M x y h n v1 h-n z" por trecho) para comparar com a da biblioteca.
function gradeDoCaminho(lado: number, caminho: string) {
  const grade = Array.from({ length: lado }, () => Array<boolean>(lado).fill(false));
  for (const [, x, y, n] of caminho.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(n); i++) grade[Number(y)]![Number(x) + i] = true;
  }
  return grade;
}

describe("QR Code (CONNECT-l)", () => {
  it("o caminho desenha exatamente os módulos escuros, com a margem de 2", () => {
    const texto = "https://pagamento.invalid/ora/12345?x=1";
    const { lado, caminho } = desenhoDoQr(texto);
    const esperado = encode(texto, { ecc: "M", border: 2 });
    expect(lado).toBe(esperado.size);
    expect(gradeDoCaminho(lado, caminho)).toEqual(esperado.data);
    // A margem fica branca: a primeira e a última linha e coluna não têm módulo escuro.
    expect(caminho).not.toMatch(/M\d+ 0h/);
    expect(gradeDoCaminho(lado, caminho).every((linha) => !linha[0] && !linha[lado - 1])).toBe(true);
  });

  it("textos longos (o link da Nogle, até 500 caracteres) cabem", () => {
    const { lado } = desenhoDoQr(`https://pagamento.invalid/${"a".repeat(470)}`);
    expect(lado).toBeGreaterThan(40);
  });

  it("o componente é um SVG com rótulo, fundo branco e um caminho preto", () => {
    const qr = QrCode({ texto: "https://pagamento.invalid/1", rotulo: "QR Code do pagamento" });
    expect(isValidElement(qr)).toBe(true);
    const props = qr.props as { role: string; "aria-label": string; viewBox: string; children: { props: { fill: string; d?: string } }[] };
    expect(props.role).toBe("img");
    expect(props["aria-label"]).toBe("QR Code do pagamento");
    expect(props.viewBox).toMatch(/^0 0 \d+ \d+$/);
    expect(props.children.map((c) => c.props.fill)).toEqual(["#ffffff", "#000000"]);
    expect(props.children[1]?.props.d).toMatch(/^M\d+ \d+h\d+/);
  });
});
