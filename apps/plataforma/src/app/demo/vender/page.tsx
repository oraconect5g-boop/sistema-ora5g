import { SemPermissao } from "../../../componentes/SemPermissao";
import { TituloPagina } from "../../../componentes/ui";
import { acessoDaPagina } from "../../../demo/sessao";
import { PDV } from "./PDV";

export default async function Vender() {
  const { perfil, permitido } = await acessoDaPagina("vender");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Vender" />;
  return (
    <>
      <TituloPagina titulo="Nova venda" subtitulo="Santa Cândida · atendimento de demonstração" />
      <PDV podeVerMargem={perfil === "dono" || perfil === "gerente"} />
    </>
  );
}
