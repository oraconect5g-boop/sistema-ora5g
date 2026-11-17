// O que o worker do WhatsApp precisa para ligar (lote WHATS-a; plano de 16/11/2026, onda 0, item 4). Os nomes são os de
// .env.example e de docs/integracoes/VARIAVEIS_DE_AMBIENTE.md: nada é inventado aqui. Sem eles, ou sem o adaptador
// oficial da Meta (que espera o contrato verificado: o número habilitado, o token e o modelo de mensagem de utilidade
// aprovado para mandar o documento), o worker fica desligado, diz o que falta e nada sai da fila.

/** O adaptador da WhatsApp Business Platform (Cloud API). Só entra com o contrato verificado (Onda 3, F1). */
export const ADAPTADOR_DA_META_PRONTO = false;

/** Os nomes do que falta, na ordem em que se resolve; vazio = pode ligar. Valores nunca aparecem. */
export function oQueFaltaParaOWhatsApp(ler: (nome: string) => string): string[] {
  return [
    !ler("NEXT_PUBLIC_SUPABASE_URL") && "NEXT_PUBLIC_SUPABASE_URL",
    !ler("SUPABASE_SECRET_KEY") && "SUPABASE_SECRET_KEY",
    !ler("WHATSAPP_GRAPH_API_VERSION") && "WHATSAPP_GRAPH_API_VERSION",
    !ler("WHATSAPP_PHONE_NUMBER_ID") && "WHATSAPP_PHONE_NUMBER_ID",
    !ler("WHATSAPP_ACCESS_TOKEN") && "WHATSAPP_ACCESS_TOKEN",
    !ADAPTADOR_DA_META_PRONTO && "o adaptador oficial da Meta (espera o contrato verificado e o modelo de mensagem aprovado)",
  ].filter((x): x is string => typeof x === "string");
}
