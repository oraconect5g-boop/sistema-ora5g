import { mascararIdentificador } from "@ora5g/dominio";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Celula, Indicador, Selo, Tabela, TituloPagina, type Tom } from "../../../componentes/ui";
import { PRODUTOS, SALDOS_ACESSORIOS, UNIDADES_ESTOQUE, type SituacaoUnidade } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

const TOM: Record<SituacaoUnidade, Tom> = { Disponível: "sucesso", Conferido: "sucesso", Reservado: "aviso", Vendido: "neutro", "Em trânsito": "info" };
const nome = (sku: string) => PRODUTOS.find((p) => p.sku === sku)?.nome ?? sku;

export default async function Estoque() {
  const { perfil, permitido } = await acessoDaPagina("estoque");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Estoque" />;
  const verOutrasLojas = perfil === "dono" || perfil === "administrador";
  const unidades = verOutrasLojas ? UNIDADES_ESTOQUE : UNIDADES_ESTOQUE.filter((u) => u.loja === "Santa Cândida");
  return (
    <>
      <TituloPagina titulo="Estoque e rastreio por IMEI" subtitulo={verOutrasLojas ? "Todas as lojas" : "Santa Cândida · outras lojas só por consulta, sem custo"} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Aparelhos disponíveis" valor={String(unidades.filter((u) => u.situacao === "Disponível" || u.situacao === "Conferido").length)} />
        <Indicador rotulo="Reservados em venda" valor={String(unidades.filter((u) => u.situacao === "Reservado").length)} detalhe="Expiram se a venda não concluir" />
        <Indicador rotulo="Em trânsito" valor={String(unidades.filter((u) => u.situacao === "Em trânsito").length)} detalhe="Não podem ser vendidos" tom="atencao" />
        <Indicador rotulo="Conferência física" valor="1 de 5" detalhe="IMEIs conferidos na loja" tom="atencao" />
      </div>
      <Cartao titulo="Aparelhos (um por IMEI)" subtitulo="Cada movimento fica num livro só de inserção: entrada, reserva, venda, transferência" className="mt-4">
        <Tabela colunas={["Produto", "IMEI", "Loja", "Situação", "Origem"]} legenda="Aparelhos por IMEI">
          {unidades.map((u) => (
            <tr key={u.imei}>
              <Celula>{nome(u.sku)}<span className="block text-xs text-suave">{u.sku}</span></Celula>
              <Celula className="font-mono">{mascararIdentificador(u.imei)}</Celula>
              <Celula>{u.loja}</Celula>
              <Celula><Selo tom={TOM[u.situacao]}>{u.situacao}</Selo></Celula>
              <Celula className="text-suave">{u.entrada}</Celula>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <Cartao titulo="Acessórios e chips (por quantidade)" subtitulo="Santa Cândida" className="mt-4">
        <Tabela colunas={["Produto", "SKU", "Saldo"]} legenda="Saldos por quantidade">
          {SALDOS_ACESSORIOS.map((s) => (
            <tr key={s.sku}>
              <Celula>{nome(s.sku)}</Celula>
              <Celula className="text-suave">{s.sku}</Celula>
              <Celula>{s.quantidade < 5 ? <Selo tom="aviso">{s.quantidade} · estoque baixo</Selo> : s.quantidade}</Celula>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <div className="mt-4"><Aviso>Dois vendedores nunca reservam o mesmo IMEI: no sistema real a reserva é feita no banco com bloqueio.</Aviso></div>
    </>
  );
}
