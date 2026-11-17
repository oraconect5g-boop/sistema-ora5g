// O que o worker dos avisos no celular precisa para ligar (lote PWA-b; ADR-014). Os nomes são os de .env.example. Não
// precisa da chave secreta do Supabase: lê a fila com a chave pública e o segredo dos avisos, que só abre a fila deles.
// Sem algum deles, o worker fica desligado, diz o que falta e nada sai da fila.

/** Os nomes do que falta (ou está fora do formato), na ordem em que se resolve; vazio = pode ligar. Valores nunca aparecem. */
export function oQueFaltaParaOsAvisos(ler: (nome: string) => string): string[] {
  const base64url = (nome: string, bytes: number) => {
    const valor = ler(nome);
    return /^[A-Za-z0-9_-]+$/.test(valor) && Buffer.from(valor, "base64url").length === bytes;
  };
  return [
    !ler("NEXT_PUBLIC_SUPABASE_URL").startsWith("https://") && "NEXT_PUBLIC_SUPABASE_URL",
    !ler("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    !base64url("NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY", 65) && "NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY",
    !base64url("WEB_PUSH_PRIVATE_KEY", 32) && "WEB_PUSH_PRIVATE_KEY",
    !/^(https:\/\/|mailto:)\S+$/.test(ler("WEB_PUSH_SUBJECT")) && "WEB_PUSH_SUBJECT",
    ler("WEB_PUSH_SEGREDO_DA_FILA").length < 32 && "WEB_PUSH_SEGREDO_DA_FILA",
  ].filter((x): x is string => typeof x === "string");
}
