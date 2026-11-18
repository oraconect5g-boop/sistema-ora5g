// Os eventos de conversão para a Meta (lote ADAPT-a; ORA-META-005; ADR-020). Mandar à Meta que um contato virou venda só com
// base legal e consentimento (D-048), e sem repetir o mesmo evento. Aqui fica o que o envio vai precisar quando houver a
// conta, a autorização e a base legal: a interface, o formato comum do evento e a regra de quais eventos podem sair. Nenhum
// endereço, campo ou formato da Meta é suposto: os nomes das variáveis são os de docs/integracoes/VARIAVEIS_DE_AMBIENTE.md.

/** O adaptador oficial da Meta (Conversions API), com o contrato e a base legal confirmados. Não está pronto. */
export const ADAPTADOR_DE_CONVERSOES_PRONTO = false;

/** O que falta para ligar; vazio = pode ligar. Só nomes: valores nunca aparecem. */
export function oQueFaltaParaAsConversoes(ler: (nome: string) => string): string[] {
  return [
    ...["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "META_APP_ID", "META_SYSTEM_USER_TOKEN", "META_PIXEL_ID"].filter((nome) => !ler(nome)),
    ...(ADAPTADOR_DE_CONVERSOES_PRONTO ? [] : ["a base legal e o consentimento do cliente para mandar a conversão (D-048) e o adaptador oficial da Meta"]),
  ];
}

/** O evento no formato comum: o identificador é nosso (o mesmo evento nunca sai duas vezes); nada que identifique o cliente aqui. */
export type EventoDeConversao = { idDoEvento: string; tipo: "contato" | "venda"; quando: string; valor?: number; campanha?: string; consentiu: boolean };

export interface AdaptadorDeConversoes {
  enviar(eventos: readonly EventoDeConversao[]): Promise<{ aceitos: number; recusados: number }>;
}

/**
 * Os eventos que podem sair: só com o consentimento do cliente, sem repetir o identificador (nem os já enviados, nem dentro
 * da mesma leva). O resto fica de fora e é contado.
 */
export function eventosQuePodemSair(eventos: readonly EventoDeConversao[], jaEnviados: ReadonlySet<string>) {
  const vistos = new Set(jaEnviados);
  const sair: EventoDeConversao[] = [];
  let semConsentimento = 0;
  let repetidos = 0;
  for (const e of eventos) {
    if (vistos.has(e.idDoEvento)) { repetidos += 1; continue; }
    vistos.add(e.idDoEvento);
    if (!e.consentiu) { semConsentimento += 1; continue; }
    sair.push(e);
  }
  return { sair, semConsentimento, repetidos };
}
