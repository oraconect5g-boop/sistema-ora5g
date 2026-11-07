// Sem configuração completa, o processo encerra com erro (em vez de ficar no ar sem atender)
// para o systemd, o cron de reinício e o deploy perceberem.
export async function validarAmbienteOuEncerrar() {
  const { carregarAmbiente } = await import("@ora5g/config/ambiente");
  try {
    carregarAmbiente(process.env, ["aplicacao"]);
  } catch (erro) {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exit(1);
  }
}
