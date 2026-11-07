import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Celula, Selo, Tabela, TituloPagina } from "../../../componentes/ui";
import { LEADS } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

export default async function Clientes() {
  const { perfil, permitido } = await acessoDaPagina("clientes");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Clientes" />;
  return (
    <>
      <TituloPagina titulo="Clientes e atendimento" subtitulo="Busca exata por CPF ou telefone; nada de lista completa para o vendedor" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Leads e conversas" subtitulo="Origem do contato preservada para medir campanhas">
          <Tabela colunas={["Cliente", "Origem", "Interesse", "Responsável", "Etapa"]} legenda="Leads">
            {LEADS.map((l) => (
              <tr key={l.nome}><Celula>{l.nome}</Celula><Celula>{l.origem}</Celula><Celula>{l.interesse}</Celula><Celula>{l.responsavel}</Celula><Celula><Selo tom="info">{l.etapa}</Selo></Celula></tr>
            ))}
          </Tabela>
        </Cartao>
        <Cartao titulo="Conversa (exemplo)" subtitulo="Mariana S. · WhatsApp · atribuída a Ana">
          <div className="space-y-2 text-sm">
            <p className="max-w-[85%] rounded-cartao bg-fundo px-3 py-2">Olá! Vocês têm o Galaxy A55 na loja?</p>
            <p className="ml-auto max-w-[85%] rounded-cartao bg-acao px-3 py-2 text-white">Temos sim! Quer reservar para retirar hoje na Santa Cândida?</p>
            <p className="text-xs text-suave">✦ Sugestão de IA supervisionada: consultar estoque antes de responder. A IA nunca dá desconto nem aprova nada.</p>
          </div>
        </Cartao>
      </div>
      <div className="mt-4">
        <Aviso tom="aviso" titulo="WhatsApp oficial ainda não conectado">A integração usa só a API oficial da Meta (APIs não oficiais arriscam bloquear os números). Base de clientes começa vazia.</Aviso>
      </div>
    </>
  );
}
