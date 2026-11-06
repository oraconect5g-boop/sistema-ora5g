import pacote from "../../package.json";

export type EstadoSaude = {
  status: "ok";
  servico: string;
  versao: string;
  verificadoEm: string;
};

const FUSO_DO_NEGOCIO = "America/Sao_Paulo";

export function obterEstadoSaude(agora: Date = new Date()): EstadoSaude {
  return {
    status: "ok",
    servico: "plataforma",
    versao: pacote.version,
    verificadoEm: agora.toISOString(),
  };
}

export function formatarHorario(instanteIso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: FUSO_DO_NEGOCIO,
  }).format(new Date(instanteIso));
}
