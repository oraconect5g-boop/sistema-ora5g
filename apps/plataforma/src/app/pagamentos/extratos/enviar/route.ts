import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { redirecionar } from "../../../../lib/acesso/redirecionar";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { LINHAS_DO_EXTRATO, ErroDoOfx, lerMapaDoExtrato, lerOfx, mapaParaGravar, montarLinhasDoExtrato, pareceOfx, type LinhasDoExtrato } from "../../../../lib/extratos/leitura";
import { erroDaPlanilhaNoExtrato, erroDosExtratos, lerEnvioDoExtrato } from "../../../../lib/extratos/regras";
import { ErroDaPlanilha, LIMITES_DA_PLANILHA } from "../../../../lib/importacao/csv";
import { descomprimirNoServidor } from "../../../../lib/importacao/descomprimir-servidor";
import { lerPlanilha } from "../../../../lib/importacao/planilha";
import type { Json } from "../../../../lib/supabase/tipos-banco";

export const dynamic = "force-dynamic";

const voltar = (parametros: Record<string, string>) => redirecionar(`/pagamentos/extratos/importar?${new URLSearchParams(parametros)}`);

// Envio do extrato (lote EXT-a: ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006; ADR-016). Rota própria, e não ação do servidor,
// por causa do tamanho do arquivo (até 5 MB). O servidor relê o arquivo inteiro (a tela só leu o cabeçalho), calcula a
// impressão digital (SHA-256: o mesmo arquivo devolve o mesmo extrato), monta as linhas com o mapeamento (ou do OFX, que
// tem os campos com nome) e grava o extrato no banco, que valida tudo de novo. Nada é conciliado aqui: cada conciliação
// é uma decisão de quem concilia, na tela do extrato.
export async function POST(requisicao: NextRequest) {
  // Só formulário desta mesma origem (além do cookie SameSite=Lax da sessão).
  const origem = requisicao.headers.get("origin");
  const host = requisicao.headers.get("x-forwarded-host") ?? requisicao.headers.get("host");
  if (origem && host && new URL(origem).host !== host) return new Response("Origem não permitida", { status: 403 });

  const { supabase, situacao, molde } = await obterSessao({ exigirLoja: true });
  // Ler o arquivo custa; quem não concilia na loja do turno nem chega lá (o banco recusaria de qualquer jeito).
  if (!molde.permissoes.has("pagamento.conciliar")) return voltar({ erro: "permissao" });
  const tamanho = Number(requisicao.headers.get("content-length") ?? "0");
  if (tamanho > LIMITES_DA_PLANILHA.bytes + 64 * 1024) return voltar({ erro: "grande" });
  let dados: FormData;
  try {
    dados = await requisicao.formData();
  } catch {
    return voltar({ erro: "arquivo" });
  }
  const envio = lerEnvioDoExtrato(dados);
  if (!envio.ok) return voltar({ erro: envio.erro });
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return voltar({ erro: arquivo instanceof File ? "vazio" : "arquivo" });
  if (arquivo.size > LIMITES_DA_PLANILHA.bytes) return voltar({ erro: "grande" });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  let lidas: LinhasDoExtrato;
  let mapeamento: { [chave: string]: Json } = {};
  if (pareceOfx(bytes)) {
    try {
      lidas = lerOfx(bytes);
    } catch (e) {
      return voltar({ erro: e instanceof ErroDoOfx ? e.motivo : "arquivo" });
    }
    mapeamento = { formato: "ofx" };
  } else {
    let planilha;
    try {
      planilha = await lerPlanilha(bytes, descomprimirNoServidor);
    } catch (e) {
      return voltar({ erro: e instanceof ErroDaPlanilha ? erroDaPlanilhaNoExtrato(e.motivo) : "arquivo" });
    }
    const mapa = lerMapaDoExtrato((n) => dados.get(n), planilha.cabecalho.length);
    if (!mapa) return voltar({ erro: "mapeamento" });
    lidas = montarLinhasDoExtrato(planilha, mapa);
    mapeamento = { formato: planilha.formato, ...mapaParaGravar(planilha.cabecalho, mapa) };
  }
  const [problema] = lidas.problemas;
  if (problema) return voltar({ erro: "linha", linha: String(problema.numero), campo: problema.campo, texto: problema.texto });
  if (lidas.linhas.length === 0) return voltar({ erro: "nenhuma" });
  if (lidas.linhas.length > LINHAS_DO_EXTRATO) return voltar({ erro: "linhas" });
  if (lidas.deFora > 0) mapeamento.de_fora = lidas.deFora;

  const { data, error } = await supabase.rpc("extrato_importar", {
    // A rede vai sem loja (o banco confere que a pessoa concilia pela rede inteira); a loja é a do turno.
    p_unidade: (envio.envio.onde === "rede" ? null : situacao.unidade_id) as string,
    p_tipo: envio.envio.tipo,
    p_fonte: envio.envio.fonte,
    p_meios: envio.envio.meios,
    p_arquivo: arquivo.name.slice(0, 200) || "extrato",
    p_impressao: createHash("sha256").update(bytes).digest("hex"),
    p_linhas: lidas.linhas as unknown as Json,
    p_mapeamento: mapeamento,
  });
  if (error) {
    const chave = erroDosExtratos(error);
    return voltar({ erro: envio.envio.onde === "rede" && chave === "permissao" ? "rede" : chave });
  }
  const resposta = data as { extrato?: unknown; repetido?: unknown } | null;
  if (typeof resposta?.extrato !== "string") return voltar({ erro: "falha" });
  const busca = new URLSearchParams({ ok: resposta.repetido === true ? "repetido" : "importado" });
  if (resposta.repetido !== true && lidas.deFora > 0) busca.set("de_fora", String(lidas.deFora));
  return redirecionar(`/pagamentos/extratos/${resposta.extrato}?${busca}`);
}
