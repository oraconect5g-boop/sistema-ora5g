import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SemPermissao } from "../../../../componentes/SemPermissao";
import { Aviso, Selo, TituloPagina } from "../../../../componentes/ui";
import { CARGA_DEMO } from "../../../../demo/dados";
import { acessoDaPagina } from "../../../../demo/sessao";
import { DecidirCarga } from "./DecidirCarga";

export const metadata: Metadata = { title: "Carga do estoque" };

// A carga do estoque pelo relatório de produtos da Rein na demonstração (DEMO-b; a tela real é /estoque/carga, dos lotes
// REIN-b, REIN-c e AUD-b), com um arquivo e uma loja FICTÍCIOS. Só quem importa a planilha (o dono e o administrador).
export default async function CargaDaDemonstracao() {
  const contexto = await acessoDaPagina("importacao");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Carga do estoque" />;
  return (
    <>
      <Link href="/demo/estoque" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft className="size-4" aria-hidden />Estoque e IMEI</Link>
      <TituloPagina titulo={`Carga nº ${CARGA_DEMO.numero} · ${CARGA_DEMO.loja}`} subtitulo={`${CARGA_DEMO.arquivo} · posição de ${CARGA_DEMO.corte} · dados fictícios`}
        acao={<Selo tom="aviso">prévia</Selo>} />
      <Aviso tom="info" className="mt-4" titulo="Como a carga funciona">
        O relatório de produtos da Rein, com a quantidade de cada local, vira uma prévia por loja. Nada entra no estoque antes de
        aplicar, e cada linha entra pelo livro uma vez. {CARGA_DEMO.rodape}
      </Aviso>
      <DecidirCarga carga={CARGA_DEMO} />
    </>
  );
}
