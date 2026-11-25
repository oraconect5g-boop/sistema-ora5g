import { encode } from "uqr";

// O QR Code desenhado no servidor (lote CONNECT-l): um SVG com um caminho só, pela biblioteca uqr (MIT, sem
// dependências). Nada de imagem de fora nem de script no navegador. Preto no branco também no tema escuro: a câmera do
// celular precisa do contraste.

/** O desenho do QR: o lado (em módulos, com a margem de 2) e um retângulo por trecho escuro de cada linha. */
export function desenhoDoQr(texto: string): { lado: number; caminho: string } {
  const qr = encode(texto, { ecc: "M", border: 2 });
  let caminho = "";
  qr.data.forEach((linha, y) => {
    for (let x = 0; x < linha.length; x++) {
      if (!linha[x]) continue;
      const inicio = x;
      while (x + 1 < linha.length && linha[x + 1]) x++;
      caminho += `M${inicio} ${y}h${x - inicio + 1}v1h-${x - inicio + 1}z`;
    }
  });
  return { lado: qr.size, caminho };
}

export function QrCode({ texto, rotulo, className = "size-40" }: { texto: string; rotulo: string; className?: string }) {
  const { lado, caminho } = desenhoDoQr(texto);
  return (
    <svg role="img" aria-label={rotulo} viewBox={`0 0 ${lado} ${lado}`} shapeRendering="crispEdges" className={className}>
      <rect width={lado} height={lado} fill="#ffffff" />
      <path d={caminho} fill="#000000" />
    </svg>
  );
}
