// Formatação para a TELA, sempre em pt-BR e no fuso de São Paulo (DD/MM/AAAA, vírgula decimal).
// Regras de dinheiro (centavos inteiros, validação) ficam em @ora5g/dominio; aqui só apresentação.

import { formatarBRL } from "@ora5g/dominio";

const FUSO = "America/Sao_Paulo";
// O Intl usa espaço não separável depois de "R$"; trocamos por espaço comum, como o domínio faz.
const espacoComum = (texto: string) => texto.replace(/[  ]/g, " ");

const compacto = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Valor em centavos → "R$ 1.234,56". */
export const brl = (centavos: number) => formatarBRL(Math.round(centavos));

/** Valor em centavos → "R$ 128,4 mil" (a partir de R$ 10 mil); abaixo disso, o valor cheio. */
export function brlCompacto(centavos: number): string {
  const reais = Math.round(centavos) / 100;
  if (Math.abs(reais) < 10_000) return brl(Math.round(centavos));
  return espacoComum(compacto.format(reais));
}

const inteiro = new Intl.NumberFormat("pt-BR");
export const numero = (valor: number) => inteiro.format(valor);

const porcentagem = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
/** Fração → "12,8%" (0,128 → 12,8%). */
export const percentual = (fracao: number) => espacoComum(porcentagem.format(fracao));

/** Pontos-base (1000 = 10%) → "10%". */
export const percentualDePontosBase = (pontos: number) => percentual(pontos / 10_000);

/** Variação com sinal: "+12,8%" / "−3,1%". */
export function variacao(fracao: number): string {
  if (!Number.isFinite(fracao)) return "—";
  const texto = percentual(Math.abs(fracao));
  if (Math.abs(fracao) < 0.0005) return "0%";
  return `${fracao > 0 ? "+" : "−"}${texto}`;
}

const partesData = (instante: Date) => {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  }).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    dia: valor("day"),
    mes: valor("month"),
    ano: valor("year"),
    hora: Number(valor("hour")) % 24,
    minuto: Number(valor("minute")),
    diaDaSemana: valor("weekday"),
  };
};

/** "07/11/2026" no fuso de São Paulo. */
export function dataCurta(instante: Date): string {
  const { dia, mes, ano } = partesData(instante);
  return `${dia}/${mes}/${ano}`;
}

/** "07/11" no fuso de São Paulo. */
export function diaMes(instante: Date): string {
  const { dia, mes } = partesData(instante);
  return `${dia}/${mes}`;
}

/** "sábado, 07/11" no fuso de São Paulo. */
export function diaDaSemanaEData(instante: Date): string {
  const { diaDaSemana, dia, mes } = partesData(instante);
  return `${diaDaSemana}, ${dia}/${mes}`;
}

/** Minutos desde 00:00 em São Paulo (para comparar com turnos). */
export const minutosEmSaoPaulo = (instante: Date) => {
  const p = partesData(instante);
  return p.hora * 60 + p.minuto;
};

/** Hora cheia (0–23) em São Paulo. */
export const horaEmSaoPaulo = (instante: Date) => partesData(instante).hora;

/** "Bom dia" até 11h59, "Boa tarde" até 17h59, depois "Boa noite" (horário de São Paulo). */
export function saudacao(instante: Date): string {
  const hora = horaEmSaoPaulo(instante);
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/** Data do dia que fica `dias` antes do instante (para rótulos de gráficos). */
export const diasAntes = (instante: Date, dias: number) => new Date(instante.getTime() - dias * 86_400_000);

/** Iniciais para avatar: "Ana Souza" → "AS"; "Ana (fictícia)" → "A". */
export function iniciais(nome: string): string {
  const palavras = nome.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return palavras.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Instante atual. Em componentes do servidor é calculado a cada acesso (as telas são dinâmicas). */
export const agora = () => new Date();

/** Eixo de dinheiro curto: "R$ 0", "R$ 5 mil", "R$ 1,2 mi". */
export function brlEixo(centavos: number): string {
  const reais = centavos / 100;
  if (reais === 0) return "R$ 0";
  if (Math.abs(reais) >= 1_000_000) return `R$ ${(reais / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(reais) >= 1_000) return `R$ ${(reais / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}
