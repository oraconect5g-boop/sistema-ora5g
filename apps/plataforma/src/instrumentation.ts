// Roda uma vez quando o servidor inicia (ORA-003). A parte que usa APIs do Node fica em
// arquivo separado, carregado só no runtime Node (padrão recomendado pelo Next.js).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validarAmbienteOuEncerrar } = await import("./instrumentacao-node");
    await validarAmbienteOuEncerrar();
  }
}
