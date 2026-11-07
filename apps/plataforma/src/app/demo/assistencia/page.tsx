import { formatarBRL } from "@ora5g/dominio";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Progresso, Selo, TituloPagina } from "../../../componentes/ui";
import { ETAPAS_OS, ORDENS_SERVICO } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

export default async function Assistencia() {
  const { perfil, permitido } = await acessoDaPagina("assistencia");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Assistência" />;
  return (
    <>
      <TituloPagina titulo="Assistência técnica (Ordem de Serviço)" subtitulo="Substitui a folha de papel e o grupo de WhatsApp" />
      <div className="grid gap-4 lg:grid-cols-2">
        {ORDENS_SERVICO.map((os) => (
          <Cartao key={os.numero} titulo={`${os.numero} · ${os.aparelho}`} subtitulo={`${os.cliente} · ${os.defeito}`} acao={os.dias >= 5 ? <Selo tom="perigo">Parada há {os.dias} dias</Selo> : <Selo tom="info">Etapa {os.etapa + 1} de {ETAPAS_OS.length}</Selo>}>
            <Progresso valor={((os.etapa + 1) / ETAPAS_OS.length) * 100} rotulo={`Andamento da ${os.numero}`} />
            <p className="mt-2 text-sm"><strong>{ETAPAS_OS[os.etapa]}</strong>{os.valor > 0 && ` · orçamento ${formatarBRL(os.valor)}`}</p>
            <ol className="mt-3 grid grid-cols-2 gap-1 text-xs text-suave sm:grid-cols-4">
              {ETAPAS_OS.map((e, i) => <li key={e} className={i <= os.etapa ? "font-semibold text-acao" : ""}>{i + 1}. {e}</li>)}
            </ol>
          </Cartao>
        ))}
      </div>
      <div className="mt-4">
        <Aviso titulo="Como o sistema evita o serviço feito por fora">OS obrigatória até para limpeza; cliente recebe a OS por WhatsApp; peça só sai do estoque com OS; assistência registrada conta na comissão do vendedor. Envio automático depende da API oficial do WhatsApp.</Aviso>
      </div>
    </>
  );
}
