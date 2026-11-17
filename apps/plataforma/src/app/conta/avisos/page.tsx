import { BellRing } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Marca } from "../../../componentes/Marca";
import { Aviso, Cartao, Selo } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { AvisosNoCelular } from "./AvisosNoCelular";

export const metadata: Metadata = { title: "Avisos no celular" };
export const dynamic = "force-dynamic";

type Celular = { dispositivo: string | null; criada_em: string; ultimo_aviso_em: string | null };
type Minhas = { celulares: Celular[]; recebe: { desconto: boolean; nota: boolean; saida_caixa: boolean } };

const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** A resposta de public.aviso_minhas_inscricoes, conferida; forma inesperada é falha, não lista vazia. */
function lerMinhas(dado: unknown): Minhas | null {
  if (typeof dado !== "object" || dado === null) return null;
  const d = dado as { celulares?: unknown; recebe?: Record<string, unknown> };
  if (!Array.isArray(d.celulares) || typeof d.recebe !== "object" || d.recebe === null) return null;
  const recebe = { desconto: d.recebe.desconto === true, nota: d.recebe.nota === true, saida_caixa: d.recebe.saida_caixa === true };
  const celulares = d.celulares.filter((c): c is Celular => typeof c === "object" && c !== null && typeof (c as Celular).criada_em === "string");
  return celulares.length === d.celulares.length ? { celulares, recebe } : null;
}

// Lote PWA-b (plano de 16/11, Onda 1, item 7, segunda parte; ADR-014): a pessoa liga os avisos no próprio celular. O
// aviso chega quando um desconto, uma nota ou uma saída de caixa espera a decisão dela (pelas permissões dela), e o toque
// abre a tela da aprovação. A chave pública do servidor vai ao navegador; a privada fica só com o programa de envio.
export default async function AvisosNoCelularDaConta() {
  const { supabase, usuario } = await obterSessao({ exigirLoja: true });
  const lidas = await supabase.rpc("aviso_minhas_inscricoes");
  const chavePublica = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim() ?? "";
  const cartao = { titulo: "Avisos no celular", subtitulo: usuario.email, icone: BellRing, className: "mt-6" };
  if (lidas.error && FUNCAO_AUSENTE.has(lidas.error.code)) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <Marca tamanho="text-2xl" />
        <Cartao {...cartao}><Aviso tom="aviso">Os avisos no celular ainda não estão disponíveis neste ambiente: chegam com a atualização do banco.</Aviso></Cartao>
      </main>
    );
  }
  if (lidas.error) throw new FalhaDoServico("aviso_minhas_inscricoes");
  const minhas = lerMinhas(lidas.data);
  if (!minhas) throw new FalhaDoServico("aviso_minhas_inscricoes");
  const tipos = [
    minhas.recebe.desconto && "um desconto para aprovar",
    minhas.recebe.nota && "uma nota para aprovar",
    minhas.recebe.saida_caixa && "uma saída de caixa para autorizar",
  ].filter((t): t is string => typeof t === "string");

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Marca tamanho="text-2xl" />
      <Cartao {...cartao} acao={<Selo tom={minhas.celulares.length > 0 ? "sucesso" : "neutro"} ponto>{minhas.celulares.length > 0 ? "avisos ligados" : "avisos desligados"}</Selo>}>
        {tipos.length > 0 ? (
          <p className="text-sm">O aviso chega no celular quando houver {tipos.join(", ").replace(/, ([^,]*)$/, " ou $1")} numa loja sua. Tocar no aviso abre a tela da aprovação.</p>
        ) : (
          <p className="text-sm">Pelas suas permissões, nenhum pedido de aprovação chega para você. O aviso de teste funciona do mesmo jeito.</p>
        )}
        <p className="mt-2 text-sm text-suave">Quem pediu não recebe o aviso do próprio pedido. O aviso não leva nome de cliente.</p>
        {chavePublica
          ? <AvisosNoCelular chavePublica={chavePublica} />
          : <Aviso tom="aviso" className="mt-4">Os avisos ainda não estão ligados neste ambiente.</Aviso>}
        <h2 className="mt-6 text-sm font-semibold">Celulares que recebem os seus avisos</h2>
        {minhas.celulares.length === 0 ? (
          <p className="mt-2 text-sm text-suave">Nenhum ainda.</p>
        ) : (
          <ul className="mt-2 divide-y divide-borda text-sm">
            {minhas.celulares.map((c) => (
              <li key={c.criada_em + (c.dispositivo ?? "")} className="py-2">
                <span className="font-medium">{c.dispositivo ?? "Aparelho"}</span>
                <span className="block text-xs text-suave">Ligado em {quando(c.criada_em)} · {c.ultimo_aviso_em ? `último aviso em ${quando(c.ultimo_aviso_em)}` : "nenhum aviso ainda"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-sm"><Link href="/conta" className="font-semibold text-acao hover:underline">Voltar para Minha conta</Link></p>
      </Cartao>
    </main>
  );
}
