// AUD-f (auditoria de e7f55b2), item 1: o andamento da busca do cadastro do cliente na Nogle, sem a tela (o componente
// BuscaNoCadastroDaNogle liga isto aos campos do formulário). Cada busca tem um número: a resposta de uma busca que já não é a
// atual (outra busca começou, o documento mudou, a pessoa saiu) é ignorada e a busca é descartada no banco. A resposta usada
// também é descartada (o banco apaga a resposta e o documento). Sem resposta em 60 segundos, a busca para e é descartada.
import {
  cidadeDeReferencia, documentoParaBuscar, ERROS_DO_CADASTRO, listaDosCampos, planoDePreenchimento, type CampoNaTela, type CamposDoFormulario,
  type ErroDoCadastro, type EstadoDoCadastro,
} from "./cadastro-da-nogle";

export type AvisoDaBusca = { tom: "info" | "sucesso" | "aviso" | "perigo"; linhas: string[] };
export type DependenciasDaBusca = {
  pedir: (documento: string, chave: string) => Promise<{ ok: true; consulta: string } | { ok: false; erro: ErroDoCadastro }>;
  ler: (consulta: string, documento: string) => Promise<EstadoDoCadastro>;
  descartar: (consulta: string) => Promise<void>;
  esperar: (ms: number) => Promise<void>;
  novaChave: () => string;
  /** O campo do formulário como está agora (o valor, o limite de tamanho e se a pessoa mexeu nele desde a busca). */
  campoNaTela: (nome: string) => CampoNaTela | null;
  preencher: (nome: string, valor: string) => void;
  mostrar: (aviso: AvisoDaBusca | null) => void;
  ocupada: (sim: boolean) => void;
};
export type ModoDaBusca = "preencher" | "avisar";

export const DESCARTADA_PELO_DOCUMENTO = "O documento mudou: a busca anterior foi descartada. Busque de novo.";
export const DESCARTADA_NO_BANCO = "A busca foi descartada (o documento, a loja ou a sessão mudou, ou passou da hora). Busque de novo.";
export const SEM_RESPOSTA = "A Nogle não respondeu a tempo: tente de novo ou preencha à mão.";

export function criarBuscaDoCadastro(modo: ModoDaBusca, campos: CamposDoFormulario, deps: DependenciasDaBusca, opcoes = { intervaloMs: 1_500, tentativas: 40 }) {
  let numero = 0;
  let atual: { numero: number; documento: string; consulta: string | null } | null = null;
  const largar = () => {
    const consulta = atual?.consulta;
    atual = null;
    if (consulta) void deps.descartar(consulta).catch(() => undefined);
  };

  function concluir(estado: Exclude<EstadoDoCadastro, { estado: "esperando" }>) {
    if (estado.estado === "descartada") return deps.mostrar({ tom: "aviso", linhas: [DESCARTADA_NO_BANCO] });
    if (estado.estado === "falhou") return deps.mostrar({ tom: "perigo", linhas: [estado.mensagem] });
    if (estado.estado === "nao_encontrado") {
      return deps.mostrar(modo === "avisar"
        ? { tom: "sucesso", linhas: ["Não há cadastro na Nogle com este documento: pode cadastrar."] }
        : { tom: "info", linhas: ["A Nogle não tem cadastro com este documento: preencha os dados do cliente."] });
    }
    if (modo === "avisar") {
      return deps.mostrar({ tom: "aviso", linhas: ["Este documento já tem cadastro na Nogle: para mudar os dados, use \"Atualizar o cliente na Nogle\"."] });
    }
    const plano = planoDePreenchimento(estado.cadastro, campos, deps.campoNaTela);
    for (const p of plano.preencher) deps.preencher(p.nome, p.valor);
    const linhas: string[] = [];
    if (plano.preencher.length) linhas.push(`Preenchido com o cadastro da Nogle: ${listaDosCampos(plano.preencher.map((p) => p.campo))}. Confira com o cliente e corrija se precisar.`);
    else linhas.push("A Nogle achou o cadastro, mas nada novo para preencher.");
    if (plano.mantidos.length) linhas.push(`Mantido o que já estava no formulário: ${listaDosCampos(plano.mantidos)}.`);
    if (plano.naoCouberam.length) linhas.push(`Não coube no campo (confira à mão): ${listaDosCampos(plano.naoCouberam)}.`);
    if (plano.naoVieram.length) linhas.push(`A Nogle não mandou: ${listaDosCampos(plano.naoVieram)}.`);
    const cidade = cidadeDeReferencia(estado.cadastro);
    if (cidade) linhas.push(`Cidade no cadastro da Nogle: ${cidade}. Escolha a cidade na lista.`);
    deps.mostrar({ tom: plano.preencher.length ? "sucesso" : "info", linhas });
  }

  return {
    async buscar(textoDoDocumento: string): Promise<void> {
      const documento = documentoParaBuscar(textoDoDocumento);
      if (!documento) return deps.mostrar({ tom: "perigo", linhas: [ERROS_DO_CADASTRO.documento] });
      largar();
      const meu = ++numero;
      atual = { numero: meu, documento, consulta: null };
      const vale = () => atual?.numero === meu;
      deps.ocupada(true);
      deps.mostrar({ tom: "info", linhas: ["Buscando o cadastro na Nogle…"] });
      try {
        const pedido = await deps.pedir(documento, deps.novaChave()).catch(() => ({ ok: false as const, erro: "falha" as const }));
        if (!vale()) {
          if (pedido.ok) void deps.descartar(pedido.consulta).catch(() => undefined);
          return;
        }
        if (!pedido.ok) {
          atual = null;
          return deps.mostrar({ tom: "perigo", linhas: [ERROS_DO_CADASTRO[pedido.erro]] });
        }
        atual = { numero: meu, documento, consulta: pedido.consulta };
        for (let i = 0; i < opcoes.tentativas; i++) {
          await deps.esperar(opcoes.intervaloMs);
          if (!vale()) return;
          const estado = await deps.ler(pedido.consulta, documento).catch((): EstadoDoCadastro => ({ estado: "falhou", mensagem: ERROS_DO_CADASTRO.falha }));
          if (!vale()) return;
          if (estado.estado === "esperando") continue;
          largar();
          return concluir(estado);
        }
        largar();
        deps.mostrar({ tom: "aviso", linhas: [SEM_RESPOSTA] });
      } finally {
        if (numero === meu) deps.ocupada(false);
      }
    },
    /** O campo do documento mudou: a busca de outro documento é descartada (a resposta seria de outro cliente). */
    mudouODocumento(texto: string) {
      if (!atual || documentoParaBuscar(texto) === atual.documento) return;
      numero++;
      largar();
      deps.ocupada(false);
      deps.mostrar({ tom: "aviso", linhas: [DESCARTADA_PELO_DOCUMENTO] });
    },
    /** A pessoa saiu da tela: a busca em andamento é descartada. */
    sair() {
      numero++;
      largar();
    },
  };
}
export type BuscaDoCadastro = ReturnType<typeof criarBuscaDoCadastro>;
