// O que o worker dos pagamentos pelo site precisa para ligar (lote PAY-014a; ADR-025). Os nomes são os de .env.example.
// Sem algum deles, o worker fica desligado, diz o que falta (só os nomes; valores nunca aparecem) e nada sai do banco.
import { chaveDoAmbiente, ehAmbienteDaAsaas } from "./asaas.ts";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,20}$/;

/** Os nomes do que falta (ou está fora do formato), na ordem em que se resolve; vazio = pode ligar. */
export function oQueFaltaParaOsPagamentos(ler: (nome: string) => string): string[] {
  const ambiente = ler("ASAAS_AMBIENTE");
  return [
    !ler("NEXT_PUBLIC_SUPABASE_URL").startsWith("https://") && "NEXT_PUBLIC_SUPABASE_URL",
    !ler("SUPABASE_SECRET_KEY") && "SUPABASE_SECRET_KEY",
    !/^https:\/\/[^\s/]+$/.test(ler("NEXT_PUBLIC_APP_URL").replace(/\/+$/, "")) && "NEXT_PUBLIC_APP_URL",
    !ehAmbienteDaAsaas(ambiente) && "ASAAS_AMBIENTE",
    !(ehAmbienteDaAsaas(ambiente) && chaveDoAmbiente(ler("ASAAS_API_KEY"), ambiente)) && "ASAAS_API_KEY",
    !EMAIL.test(ler("ASAAS_EMAIL_DOS_AVISOS")) && "ASAAS_EMAIL_DOS_AVISOS",
  ].filter((x): x is string => typeof x === "string");
}
