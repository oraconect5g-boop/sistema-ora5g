// Planilha da equipe e dos acessos (lote FIN-009d: ORA-FIN-009, a exportação nas demais telas reais). Serve também à
// revisão periódica de acessos (docs/operacao/SEGURANCA_PERIODICA.md: quem é dono e administrador, os convites abertos
// e as contas bloqueadas). Regras puras: as mesmas pessoas da tela (com acesso ativo na rede, ou bloqueadas), uma linha
// por acesso, com a função, o lugar e desde quando; quem não tem acesso aparece numa linha só. E os convites em
// andamento. No Excel, a tabela das pessoas é a do filtro (para filtrar por função, loja ou situação).
import { PAPEIS, type Papel } from "../acesso/regras";
import type { Celula, SecaoCsv } from "../csv";

export const LIMITE_DA_PLANILHA_DA_EQUIPE = 5_000;

/** Os textos da situação do convite (os mesmos da tela). */
export const SITUACOES_DO_CONVITE: Record<string, string> = {
  pendente: "na fila de envio", processando: "enviando", enviado: "e-mail enviado; aguardando a pessoa entrar", erro: "não enviado",
};

export type RedeDaPlanilha = { id: string; nome: string };
export type PessoaDaPlanilha = { id: string; nome: string; email: string; status: string; ultimoAcessoEm: string | null };
export type AcessoDaPlanilha = { usuarioId: string; organizacaoId: string; papel: string; unidadeId: string | null; inicio: string };
export type ConviteDaPlanilha = {
  id: string; organizacaoId: string; nome: string; email: string; papel: string; unidades: readonly string[]; situacao: string; erro: string | null;
};

export const nomeDoPapel = (papel: string) => (Object.hasOwn(PAPEIS, papel) ? PAPEIS[papel as Papel].nome : papel);
const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR");

export function planilhaDaEquipe(p: {
  redes: readonly RedeDaPlanilha[]; pessoas: readonly PessoaDaPlanilha[]; acessos: readonly AcessoDaPlanilha[]; convites: readonly ConviteDaPlanilha[];
  /** O nome do lugar do acesso (nulo: a rede inteira). */
  loja: (id: string | null) => string;
  gerado: string;
}): SecaoCsv[] {
  const redes = [...p.redes].sort((a, b) => porNome(a.nome, b.nome) || a.id.localeCompare(b.id));
  const variasRedes = redes.length > 1;
  const daRede = (r: RedeDaPlanilha): Celula[] => (variasRedes ? [r.nome] : []);
  const linhas: Celula[][] = [];
  const contadas = new Set<string>();
  for (const r of redes) {
    const acessosDaRede = p.acessos.filter((a) => a.organizacaoId === r.id);
    const pessoas = p.pessoas.filter((x) => acessosDaRede.some((a) => a.usuarioId === x.id) || x.status === "bloqueado")
      .sort((a, b) => porNome(a.nome, b.nome) || a.id.localeCompare(b.id));
    for (const x of pessoas) {
      contadas.add(x.id);
      const base: Celula[] = [...daRede(r), x.nome, x.email, x.status === "bloqueado" ? "bloqueado" : "ativo", x.ultimoAcessoEm ? { instante: x.ultimoAcessoEm } : "nunca entrou"];
      const acessos = acessosDaRede.filter((a) => a.usuarioId === x.id)
        .sort((a, b) => porNome(nomeDoPapel(a.papel), nomeDoPapel(b.papel)) || porNome(p.loja(a.unidadeId), p.loja(b.unidadeId)));
      if (acessos.length === 0) linhas.push([...base, "", "sem acesso ativo nesta rede", null]);
      for (const a of acessos) linhas.push([...base, nomeDoPapel(a.papel), p.loja(a.unidadeId), { instante: a.inicio }]);
    }
  }
  const convites = redes.flatMap((r) => p.convites.filter((c) => c.organizacaoId === r.id)
    .sort((a, b) => porNome(a.nome, b.nome) || a.id.localeCompare(b.id))
    .map((c): Celula[] => [
      ...daRede(r), c.nome, c.email, nomeDoPapel(c.papel), c.unidades.length ? c.unidades.map((u) => p.loja(u)).join(", ") : p.loja(null),
      SITUACOES_DO_CONVITE[c.situacao] ?? c.situacao, c.situacao === "erro" ? c.erro ?? "sem detalhe" : null,
    ]));
  return [
    {
      linhas: [
        ["Equipe e acessos", variasRedes ? `${redes.length} redes` : redes[0]?.nome ?? ""],
        ["Gerado em", p.gerado, `${contadas.size} ${contadas.size === 1 ? "pessoa" : "pessoas"} · ${convites.length} ${convites.length === 1 ? "convite em andamento" : "convites em andamento"}`],
        ["Uma linha por acesso ativo de cada pessoa (função e lugar); quem não tem acesso aparece numa linha só. Para a revisão periódica: os donos e administradores, os convites abertos e as contas bloqueadas."],
      ],
    },
    { colunas: [...(variasRedes ? ["Rede"] : []), "Pessoa", "E-mail", "Situação", "Último acesso", "Função", "Onde", "Acesso desde"], linhas, filtro: true },
    ...(convites.length ? [{ colunas: [...(variasRedes ? ["Rede"] : []), "Convite para", "E-mail", "Função", "Lojas", "Situação", "Motivo do erro"], linhas: convites }] : []),
  ];
}
