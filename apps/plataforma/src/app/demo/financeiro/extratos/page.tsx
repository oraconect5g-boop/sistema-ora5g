import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SemPermissao } from "../../../../componentes/SemPermissao";
import { Aviso, TituloPagina } from "../../../../componentes/ui";
import { EXTRATOS_DEMO } from "../../../../demo/dados";
import { acessoDaPagina } from "../../../../demo/sessao";
import { ConciliarExtrato } from "./ConciliarExtrato";

export const metadata: Metadata = { title: "Extratos" };

// Os extratos da maquininha e do banco na demonstração (DEMO-b; a tela real é /pagamentos/extratos, do lote EXT-a), com
// linhas FICTÍCIAS. Mesma regra da tela real: o sistema sugere, a gerência concilia, e venda não é dinheiro recebido.
export default async function ExtratosDaDemonstracao() {
  const contexto = await acessoDaPagina("financeiro");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Extratos" />;
  return (
    <>
      <Link href="/demo/financeiro" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Caixa e financeiro</Link>
      <TituloPagina titulo="Extratos da maquininha e do banco"
        subtitulo="O extrato por arquivo: o sistema sugere a venda de cada linha, e a gerência concilia ou tira da conta com o motivo. Venda não é dinheiro recebido." />
      <div className="mt-4 space-y-4">
        {EXTRATOS_DEMO.map((e) => <ConciliarExtrato key={e.id} extrato={e} />)}
      </div>
      <Aviso className="mt-4" titulo="Na demonstração nada é gravado">
        No sistema real, a gerência importa o extrato em Pagamentos → Extratos: o relatório baixado no site ou no app da maquininha,
        ou o arquivo OFX do banco. Cada conciliação fica registrada com quem fez. As linhas e as vendas daqui são fictícias.
      </Aviso>
    </>
  );
}
