import type { Instrumentation } from "next";

// Roda uma vez quando o servidor inicia (ORA-003). A parte que usa APIs do Node fica em
// arquivo separado, carregado só no runtime Node (padrão recomendado pelo Next.js).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { manterConexaoComOBanco, validarAmbienteOuEncerrar } = await import("./instrumentacao-node");
    await validarAmbienteOuEncerrar();
    // Só depois de o ambiente estar conferido: com configuração errada o processo já encerrou na linha de cima.
    await manterConexaoComOBanco();
  }
}

// Cada erro do servidor que vira a página de erro ou uma resposta 500 (lote OBS-a: ORA-QUAL-006 e ORA-QUAL-013): uma
// linha no log e a lista da Saúde da operação, sem o texto do erro e sem os valores do endereço
// (lib/saude/erros-do-servidor.ts).
export const onRequestError: Instrumentation.onRequestError = async (erro, pedido, contexto) => {
  const { registrarErroDoServidor } = await import("./lib/saude/erros-do-servidor");
  registrarErroDoServidor(erro, pedido, contexto);
};
