import type { Metadata } from "next";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, TituloPagina } from "../../../componentes/ui";
import { ETAPAS_OS, nomeDaLoja, nomeDaPessoa, ORDENS_SERVICO } from "../../../demo/dados";
import { REDE } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { Ordens } from "./Ordens";

export const metadata: Metadata = { title: "Assistência técnica" };

export default async function Assistencia() {
  const contexto = await acessoDaPagina("assistencia");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Assistência" />;
  const tecnico = contexto.perfil === "tecnico";
  const ordens = ORDENS_SERVICO
    .filter((os) => tecnico ? os.tecnico === contexto.pessoaId : contexto.loja === REDE || os.loja === contexto.loja)
    .map((os) => ({ numero: os.numero, loja: nomeDaLoja(os.loja), cliente: os.cliente, aparelho: os.aparelho, defeito: os.defeito, etapa: os.etapa, valor: os.valor, dias: os.dias, abertaPor: nomeDaPessoa(os.abertaPor) }));

  return (
    <>
      <TituloPagina
        sobretitulo={tecnico ? "Técnico central" : contexto.loja === REDE ? "Rede inteira" : nomeDaLoja(contexto.loja)}
        titulo="Assistência técnica (ordens de serviço)"
        subtitulo="Substitui a folha de papel e o grupo de WhatsApp: cada etapa tem dono e horário"
      />
      <Ordens ordens={ordens} etapas={ETAPAS_OS} ehTecnico={tecnico} podeAbrir={!tecnico && contexto.loja !== REDE} lojaDaSessao={nomeDaLoja(contexto.loja)} />
      <Aviso className="mt-4" titulo="Como o sistema evita o serviço feito por fora">OS obrigatória até para limpeza; cliente recebe a OS por WhatsApp; peça só sai do estoque com OS; assistência registrada conta na produção do vendedor. O envio automático depende da API oficial do WhatsApp.</Aviso>
    </>
  );
}
