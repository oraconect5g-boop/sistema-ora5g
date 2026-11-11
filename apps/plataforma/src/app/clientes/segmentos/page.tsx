import { ArrowLeft, PieChart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Cartao, Selo, Tabela, Celula, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { SEGMENTOS, ehSegmento } from "../../../lib/clientes/regras";
import { brl } from "../../../lib/formato";

export const metadata: Metadata = { title: "Segmentos de clientes" };
export const dynamic = "force-dynamic";

type Linha = { segmento: string; clientes: number; alto_valor: number; liquido_12m: number; aceitam_ofertas: { whatsapp: number; sms: number; email: number; ligacao: number } };

// Segmentos de clientes (lote L5c: ORA-CRM-010), só para o dono. Regra simples e explicável (compras de cada
// cliente, sem dado novo); "alto valor" é o décimo de maior gasto líquido em 12 meses. A coluna de ofertas
// conta só quem deu o "sim" naquele canal: é o público possível de uma campanha.
export default async function Segmentos() {
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const pode = await supabase.rpc("tem_permissao", { p_permissao: "cliente.exportar", p_unidade: situacao.unidade_id as string });
  if (pode.error) throw new FalhaDoServico("tem_permissao");
  if (!pode.data) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Os segmentos da rede são do dono.</Aviso></MoldeReal>;
  const resposta = await supabase.rpc("clientes_segmentos");
  if (resposta.error) throw new FalhaDoServico("clientes_segmentos");
  const { corte_alto_valor: corte, segmentos } = resposta.data as unknown as { corte_alto_valor: number | null; segmentos: Linha[] };
  const total = segmentos.reduce((s, l) => s + l.clientes, 0);

  return (
    <MoldeReal sessao={sessao}>
      <Link href="/clientes" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Clientes</Link>
      <TituloPagina titulo="Segmentos de clientes" subtitulo={`${total} cliente(s) ativo(s). Alto valor: gasto líquido em 12 meses a partir de ${corte ? brl(corte) : "—"} (o décimo que mais comprou).`} />
      <Cartao className="mt-4" titulo="Clientes por segmento" icone={PieChart}>
        <Tabela legenda="Clientes por segmento" colunas={["Segmento", "Clientes", "Alto valor", "Líquido 12 meses", "Aceitam ofertas por WhatsApp", "SMS", "E-mail", "Ligação"]} alinharDireita={[1, 2, 3, 4, 5, 6, 7]} minimo="min-w-[46rem]">
          {segmentos.map((l) => (
            <tr key={l.segmento}>
              <Celula>{ehSegmento(l.segmento) ? <Selo tom={SEGMENTOS[l.segmento].tom}>{SEGMENTOS[l.segmento].nome}</Selo> : l.segmento}</Celula>
              <Celula className="numeros text-right">{l.clientes}</Celula>
              <Celula className="numeros text-right">{l.alto_valor}</Celula>
              <Celula className="numeros text-right">{brl(l.liquido_12m)}</Celula>
              <Celula className="numeros text-right">{l.aceitam_ofertas.whatsapp}</Celula>
              <Celula className="numeros text-right">{l.aceitam_ofertas.sms}</Celula>
              <Celula className="numeros text-right">{l.aceitam_ofertas.email}</Celula>
              <Celula className="numeros text-right">{l.aceitam_ofertas.ligacao}</Celula>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <Cartao className="mt-4" titulo="Como cada segmento é definido">
        <ul className="space-y-1 text-sm">
          {Object.values(SEGMENTOS).map((s) => <li key={s.nome}><strong>{s.nome}:</strong> {s.regra}.</li>)}
        </ul>
        <p className="mt-2 text-xs text-suave">Conta só compras concluídas ligadas ao cadastro, menos as devoluções. Nenhum dado novo é guardado: o segmento é recalculado a cada consulta.</p>
      </Cartao>
    </MoldeReal>
  );
}
