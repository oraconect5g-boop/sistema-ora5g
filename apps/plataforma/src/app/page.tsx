import { ArrowRight, ChartColumn, MessageCircle, Package, ShoppingBag, ShoppingCart, Signal, Target, Wallet, Wrench } from "lucide-react";

import { Marca } from "../componentes/Marca";
import { BotaoLink } from "../componentes/ui";

// Calculada a cada acesso: o ambiente (desenvolvimento, homologação, produção) vem do servidor.
export const dynamic = "force-dynamic";

const MODULOS = [
  { icone: ShoppingCart, titulo: "Vendas e PDV", texto: "Venda pelo celular, com IMEI, desconto dentro da regra e pagamento misto." },
  { icone: Package, titulo: "Estoque e IMEI", texto: "Cada aparelho rastreado por loja, com reserva, transferência e contagem." },
  { icone: Signal, titulo: "Ora Connect", texto: "Chips, ativações, portabilidades e recargas por vendedor." },
  { icone: Wallet, titulo: "Caixa e financeiro", texto: "Recebimentos por meio, conciliação, financeiras e notas." },
  { icone: Target, titulo: "Metas e desempenho", texto: "Produção de cada vendedor, metas do dia e da loja." },
  { icone: MessageCircle, titulo: "Clientes e WhatsApp", texto: "Busca exata, histórico e atendimento com IA supervisionada." },
  { icone: Wrench, titulo: "Assistência técnica", texto: "Ordens de serviço com etapas, orçamento e entrega." },
  { icone: ChartColumn, titulo: "Relatórios", texto: "Painéis da rede, da loja e do vendedor, com gráficos." },
];

const AMBIENTES: Record<string, string> = { development: "desenvolvimento", homologacao: "homologação", producao: "produção" };

export default function Inicio() {
  const ambiente = process.env.APP_ENV;
  // A demonstração fica no ar em todo ambiente, isolada (DEMO-a, ADR-022); ORA_DEMO_DESLIGADA=1 a tira do ar.
  const demonstracao = process.env.ORA_DEMO_DESLIGADA !== "1";
  return (
    <main className="relative min-h-dvh overflow-hidden bg-navegacao text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_80%_-10%,rgba(19,217,199,0.18),transparent),radial-gradient(40rem_30rem_at_0%_110%,rgba(42,120,214,0.18),transparent)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-3">
          <Marca claro tamanho="text-2xl" />
          {/* A01 (adendo do Codex de 16/11): quem compra vai à loja online; a equipe entra na plataforma, separado. */}
          <nav aria-label="Acesso" className="flex items-center gap-2">
            <BotaoLink href="/loja" tamanho="sm" className="bg-destaque text-navegacao shadow-none hover:bg-teal-300"><ShoppingBag aria-hidden className="size-4" /> Comprar</BotaoLink>
            <BotaoLink href="/entrar" variante="claro" tamanho="sm">Entrar</BotaoLink>
          </nav>
        </header>

        <section className="flex flex-1 flex-col justify-center py-14 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-destaque">Plataforma própria · 11 lojas</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
            Plataforma de gestão integrada
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            Vendas, estoque, clientes, financeiro e Ora Connect em um só lugar, do celular do vendedor ao painel da diretoria.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <BotaoLink href="/entrar" tamanho="lg" className="bg-destaque text-navegacao shadow-none hover:bg-teal-300">Entrar na plataforma <ArrowRight aria-hidden className="size-5" /></BotaoLink>
            {demonstracao && <BotaoLink href="/demo" tamanho="lg" variante="claro">Ver demonstração (dados fictícios)</BotaoLink>}
          </div>
        </section>

        <ul className="grid gap-3 pb-10 sm:grid-cols-2 lg:grid-cols-4">
          {MODULOS.map((m) => (
            <li key={m.titulo} className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/10 backdrop-blur">
              <span className="grid size-9 place-items-center rounded-xl bg-destaque/15 text-destaque"><m.icone aria-hidden className="size-[18px]" /></span>
              <p className="mt-3 font-semibold">{m.titulo}</p>
              <p className="mt-1 text-sm text-slate-400">{m.texto}</p>
            </li>
          ))}
        </ul>

        <footer className="border-t border-white/10 pt-4 text-xs text-slate-500">
          Sistema em desenvolvimento · ambiente {ambiente ? (AMBIENTES[ambiente] ?? ambiente) : "não configurado"}
        </footer>
      </div>
    </main>
  );
}
