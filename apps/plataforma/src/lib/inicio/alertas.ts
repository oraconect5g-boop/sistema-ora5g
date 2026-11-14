// Alertas do Início (REPORT-007, L12f): as janelas de tempo, contadas a partir de agora. O banco conta (pelo RLS); aqui
// só se calcula o começo de cada janela.
const DIA = 86_400_000;

/** O começo das janelas dos alertas: 7 dias (caixa com diferença, ativação com falha) e um dia (nota parada). */
export function janelasDosAlertas(agora: Date = new Date()): { haSeteDias: string; haUmDia: string } {
  return { haSeteDias: new Date(agora.getTime() - 7 * DIA).toISOString(), haUmDia: new Date(agora.getTime() - DIA).toISOString() };
}
