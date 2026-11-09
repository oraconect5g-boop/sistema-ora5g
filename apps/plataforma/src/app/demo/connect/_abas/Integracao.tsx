import { BookOpen, KeyRound, ListChecks, PlugZap, Store } from "lucide-react";
import { Fragment } from "react";

import { Aviso, Cartao, Celula, Indicador, Selo, Tabela, type Tom } from "../../../../componentes/ui";
import { nomeDaLoja, PDVS_CONTEL } from "../../../../demo/dados";
import { FUNCOES_NOGLE, type AbaConnect, type QuemUsa } from "../../../../integracoes/nogle/catalogo";
import { numero } from "../../../../lib/formato";

const NOME_ABA: Record<AbaConnect, string> = {
  operacoes: "Operações", ativar: "Ativar chip", linha: "Consultar linha", recarga: "Recarga", portabilidade: "Portabilidade",
  atendimento: "Bloqueio e atendimento", chips: "Chips e entrega", carteira: "Carteira e relatórios", integracao: "Integração",
};
const NOME_QUEM: Record<QuemUsa, string> = { loja: "Loja", gestao: "Gerente e dono", administracao: "Administração", sistema: "Sistema" };
const TOM_METODO: Record<string, Tom> = { GET: "info", POST: "sucesso", PUT: "aviso", DELETE: "perigo" };

const PENDENCIAS = [
  ["Tipo da chave da Ora (decisão P9)", "Franquia, marca/MVNO ou PDV. Define quais das 62 funções a Ora pode usar; a documentação não diz o que cada tipo libera."],
  ["Credenciais no lugar certo", "chave_acesso (e a da franquia ou do PDV) só no gerenciador de segredos do servidor, nunca no navegador nem no chat."],
  ["Consultas GET com corpo", "25 consultas mandam os dados no corpo de um GET; navegador e fetch não enviam. Confirmar se a Nogle aceita parâmetros no endereço."],
  ["Ambiente de testes", "Não há sandbox documentado: combinar com o suporte uma linha e um chip de teste antes de ligar."],
  ["Pedido repetido", "Não há chave contra duplicidade nem aviso automático (webhook): depois de falha ou demora, consultar antes de reenviar."],
  ["Respostas em formatos diferentes", "retorno, status, message/errors ou só mensagem; o adaptador normaliza (testado com os exemplos da documentação)."],
  ["Corpo da recarga", "A tabela pede numero e id_plano; o exemplo manda uma lista numeros[]. Confirmar o formato certo."],
  ["Troca de chip", "Citada como motivo de cancelamento, mas sem rota documentada para pedir."],
  ["LGPD", "A validação de CPF devolve nome e nascimento: usar só no cadastro do próprio cliente e registrar a consulta."],
];

/** Catálogo completo da API NOGLE (gerado da documentação oficial) e o que falta para ligar a integração. */
export function Integracao() {
  const grupos = [...new Set(FUNCOES_NOGLE.map((f) => f.grupo))];
  const escritas = FUNCOES_NOGLE.filter((f) => f.efeito === "escrita").length;
  const corpoEmGet = FUNCOES_NOGLE.filter((f) => f.corpoEmGet).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Funções na documentação" valor={numero(FUNCOES_NOGLE.length)} icone={BookOpen} detalhe={`${grupos.length} grupos · lida em 07/11/2026`} />
        <Indicador rotulo="Funções que alteram algo" valor={numero(escritas)} icone={PlugZap} detalhe="Ativar, recarregar, bloquear, portar..." />
        <Indicador rotulo="Consultas GET com corpo" valor={numero(corpoEmGet)} icone={ListChecks} detalhe="Confirmar com a Nogle" tom="atencao" />
        <Indicador rotulo="Ligadas de verdade" valor="0" icone={KeyRound} detalhe="Aguardando chave e credenciais (P9)" tom="atencao" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Cartao className="xl:col-span-2" titulo="O que falta para ligar a Nogle" subtitulo="Fonte: https://docs.nogle.tech/ (API NOGLE)" icone={KeyRound}>
          <ul className="space-y-3">
            {PENDENCIAS.map(([titulo, texto]) => (
              <li key={titulo} className="flex gap-3 text-sm"><span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" /><span><strong>{titulo}.</strong> {texto}</span></li>
            ))}
          </ul>
        </Cartao>
        <Cartao titulo="Lojas da Ora como PDV na Nogle" subtitulo="GET /pdv/listar · cadastro por POST /pdv/cadastrar" icone={Store}>
          <ul className="divide-y divide-borda text-sm">
            {PDVS_CONTEL.map((p) => (
              <li key={p.idPdv} className="flex items-center justify-between gap-2 py-2"><span>{nomeDaLoja(p.loja)}<span className="block text-xs text-suave">{p.usuarios} usuários · mínimo de {p.estoqueMinimo} chips</span></span><Selo tom="neutro">PDV {p.idPdv}</Selo></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-suave">As outras 11 lojas entram como PDV quando a chave for de marca ou franquia (exemplo fictício).</p>
        </Cartao>
      </div>

      <Cartao titulo="Todas as funções da API e onde aparecem na Ora" subtitulo="Proposta de uso e de quem acessa, para validar com o proprietário e a Nogle">
        <Tabela colunas={["Função", "Rota", "Na tela", "Quem", "Observação"]} legenda="Funções da API NOGLE e onde aparecem na Ora" minimo="min-w-[52rem]">
          {grupos.map((grupo) => (
            <Fragment key={grupo}>
              <tr className="bg-slate-50/80">
                <th scope="colgroup" colSpan={5} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-suave sm:px-5">{grupo}</th>
              </tr>
              {FUNCOES_NOGLE.filter((f) => f.grupo === grupo).map((f) => (
                <tr key={`${f.metodo} ${f.caminho}`}>
                  <Celula className="font-medium">{f.nome}<span className="block max-w-xs text-xs font-normal text-suave">{f.descricao}</span></Celula>
                  <Celula className="whitespace-nowrap"><Selo tom={TOM_METODO[f.metodo] ?? "neutro"}>{f.metodo}</Selo> <code className="text-xs">{f.caminho}</code></Celula>
                  <Celula className="text-suave">{NOME_ABA[f.aba]}</Celula>
                  <Celula className="text-suave">{NOME_QUEM[f.quem]}</Celula>
                  <Celula className="max-w-xs text-xs text-suave">
                    {f.corpoEmGet && <span className="block">GET com corpo</span>}
                    {f.reconsultar.length > 0 && <span className="block">Antes de repetir: {f.reconsultar.join(", ")}</span>}
                    {f.obrigatorios.length > 0 && <span className="block">Obrigatórios: {f.obrigatorios.slice(0, 4).join(", ")}{f.obrigatorios.length > 4 ? ` e mais ${f.obrigatorios.length - 4}` : ""}</span>}
                  </Celula>
                </tr>
              ))}
            </Fragment>
          ))}
        </Tabela>
      </Cartao>
      <Aviso tom="info">Tudo nesta tela vem da cópia da documentação guardada no repositório (docs/integracoes/nogle). Nenhuma rota foi inventada, e nenhuma chamada real é feita na demonstração.</Aviso>
    </div>
  );
}
