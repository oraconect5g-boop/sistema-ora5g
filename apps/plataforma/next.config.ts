import type { NextConfig } from "next";

const configuracao: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@ora5g/config", "@ora5g/dominio"],
  // Atrás do Apache do cPanel, o pedido da raiz chega como o arquivo de índice que o Apache
  // procura (index.php, index.html, default.htm...). A reescrita só olha o caminho, então
  // funciona com os cabeçalhos X-Forwarded-* do proxy (reescrever no proxy.ts não funcionava).
  async rewrites() {
    return {
      beforeFiles: [{ source: "/:indice((?:index|default|home|Default|Home|INDEX)\\.[a-zA-Z0-9]{1,6})", destination: "/" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default configuracao;
