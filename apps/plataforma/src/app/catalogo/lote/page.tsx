import { ArrowLeft, Images, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Cartao, TituloPagina } from "../../../componentes/ui";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { MAXIMO_DO_LOTE } from "../../../lib/catalogo/lote-de-fotos";
import { configuracaoSupabase } from "../../../lib/supabase/configuracao";
import { FotosEmLote } from "./FotosEmLote";

export const metadata: Metadata = { title: "Fotos em lote" };
export const dynamic = "force-dynamic";

// Fotos em lote (lote CAT-010: ORA-CAT-010). Para quem envia fotos do catálogo (catalogo.fotos na loja do turno, a
// mesma permissão da foto avulsa): escolher várias fotos de uma vez, com o nome de cada arquivo igual ao SKU. A tela
// mostra para onde cada uma vai e envia uma a uma; o banco confere cada registro de novo.
export default async function FotosEmLotePagina() {
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const pode = await supabase.rpc("tem_permissao", { p_permissao: "catalogo.fotos", p_unidade: situacao.unidade_id as string });
  if (pode.error) throw new FalhaDoServico("tem_permissao");
  const voltar = <Link href="/catalogo" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Catálogo e fotos</Link>;
  if (!pode.data) {
    return (
      <MoldeReal sessao={sessao}>
        {voltar}
        <Cartao className="mt-2" titulo="Sem permissão" icone={ShieldAlert}>
          <p className="text-sm text-suave">Só quem gere o catálogo envia fotos.</p>
        </Cartao>
      </MoldeReal>
    );
  }
  const configuracao = configuracaoSupabase();
  return (
    <MoldeReal sessao={sessao}>
      {voltar}
      <TituloPagina titulo="Fotos em lote" subtitulo="Várias fotos de uma vez: o nome de cada arquivo é o SKU da variação." />
      <Cartao className="mt-4" titulo="Como funciona" icone={Images}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Dê a cada foto o nome do SKU, como <span className="numeros font-semibold">ACE-0001.jpg</span> (maiúsculas ou minúsculas tanto faz).</li>
          <li>Se o produto tem cores diferentes, a foto vai para a cor daquele SKU; senão, vira a foto do produto.</li>
          <li>{`Até ${MAXIMO_DO_LOTE} fotos por vez, em JPEG, PNG ou WebP. Cada uma é reduzida no próprio aparelho antes de enviar, e a foto anterior só deixa de valer quando a nova fica registrada.`}</li>
        </ul>
      </Cartao>
      <Cartao className="mt-4" titulo="Escolher e enviar">
        {configuracao
          ? <FotosEmLote supabaseUrl={configuracao.url} chavePublica={configuracao.chavePublica} />
          : <Aviso tom="aviso">O envio de fotos não está configurado neste ambiente.</Aviso>}
      </Cartao>
    </MoldeReal>
  );
}
