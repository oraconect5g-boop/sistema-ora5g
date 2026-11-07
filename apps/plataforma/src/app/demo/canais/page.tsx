import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { CANAIS } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

export default async function Canais() {
  const { perfil, permitido } = await acessoDaPagina("canais");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Canais online" />;
  return (
    <>
      <TituloPagina titulo="Canais online e campanhas" subtitulo="Mesmo catálogo, preço e estoque do PDV; um canal nunca vende o IMEI de outro" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CANAIS.map((c) => (
          <Cartao key={c.nome} titulo={c.nome} acao={<Selo tom={c.situacao.startsWith("Não") ? "neutro" : "info"}>{c.situacao}</Selo>}>
            <p className="text-sm text-suave">Para conectar: {c.precisa}</p>
          </Cartao>
        ))}
      </div>
      <div className="mt-4">
        <Aviso titulo="Nenhum número inventado">Métricas de anúncios (custo por lead, ROAS) só aparecem quando a conta Meta estiver conectada com autorização. Até lá, esta tela mostra o que falta para ligar cada canal.</Aviso>
      </div>
    </>
  );
}
