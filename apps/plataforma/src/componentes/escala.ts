// Funções puras dos eixos dos gráficos (testáveis sem navegador).

/** Escala "redonda" para os eixos: 0, 5 mil, 10 mil... */
export function escala(maximo: number, divisoes = 4) {
  if (!(maximo > 0)) return { topo: 1, marcas: [0, 1] };
  const bruto = maximo / divisoes;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fracao = bruto / potencia;
  const passo = (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 2.5 ? 2.5 : fracao <= 5 ? 5 : 10) * potencia;
  const topo = Math.ceil(maximo / passo) * passo;
  const marcas: number[] = [];
  for (let i = 0; i * passo <= topo + passo / 2; i++) marcas.push(i * passo);
  return { topo, marcas };
}

/** Mostra 1 rótulo a cada `cada`, sempre o último, e esconde o vizinho do último para não encostarem. */
export const mostrarRotulo = (i: number, total: number, cada: number) =>
  i === total - 1 || (i % cada === 0 && (cada === 1 || total - 1 - i >= Math.max(2, Math.ceil(cada / 2) + 1)));

