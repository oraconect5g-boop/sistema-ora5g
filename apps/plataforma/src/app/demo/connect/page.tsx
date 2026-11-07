import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, BotaoLink, Cartao, Celula, Indicador, Selo, Tabela, TituloPagina } from "../../../componentes/ui";
import { OPERACOES_CONNECT } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

const tom = (s: string) => (s.startsWith("Confirmada") ? "sucesso" : s.startsWith("Falhou") ? "perigo" : "info");

export default async function OraConnect() {
  const { perfil, permitido } = await acessoDaPagina("connect");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Ora Connect" />;
  return (
    <>
      <TituloPagina titulo="Ora Connect" subtitulo="Chips, ativações, portabilidades e recargas por vendedor" acao={<BotaoLink href="/demo/vender">Vender chip</BotaoLink>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Chips vendidos hoje" valor="15" />
        <Indicador rotulo="Ativações confirmadas" valor="11" detalhe="1 falhou, 1 aguardando" tom="atencao" />
        <Indicador rotulo="Portabilidades" valor="4" />
        <Indicador rotulo="Recargas" valor="22" detalhe="Valor de face separado da receita" />
      </div>
      <Cartao titulo="Operações de hoje" subtitulo="Status vem da operadora; nada é dado como confirmado sem resposta" className="mt-4">
        <Tabela colunas={["Hora", "Vendedor", "Operação", "Linha", "Situação"]} legenda="Operações Ora Connect">
          {OPERACOES_CONNECT.map((o) => (
            <tr key={o.hora + o.linha}>
              <Celula>{o.hora}</Celula><Celula>{o.vendedor}</Celula><Celula>{o.tipo}</Celula><Celula className="font-mono">{o.linha}</Celula>
              <Celula><Selo tom={tom(o.situacao)}>{o.situacao}</Selo></Celula>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <div className="mt-4">
        <Aviso tom="aviso" titulo="Integração Nogle ainda não ligada">
          A documentação oficial mostrou só autenticação e consultas. Faltam o tipo da chave da Ora (franquia, marca ou PDV) e as rotas de ativação e recarga. Até lá, as operações são registradas manualmente, com status honesto.
        </Aviso>
      </div>
    </>
  );
}
