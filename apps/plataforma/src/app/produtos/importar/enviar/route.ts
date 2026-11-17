import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { redirecionar } from "../../../../lib/acesso/redirecionar";
import { obterSessao } from "../../../../lib/acesso/sessao";
import { dividirEmPartes, linhaDeTotal, montarLinhas } from "../../../../lib/importacao/catalogo";
import type { Json } from "../../../../lib/supabase/tipos-banco";
import { ErroDaPlanilha, LIMITES_DA_PLANILHA } from "../../../../lib/importacao/csv";
import { descomprimirNoServidor } from "../../../../lib/importacao/descomprimir-servidor";
import { lerPlanilha } from "../../../../lib/importacao/planilha";
import { erroDaPlanilhaNaImportacao, erroDoBancoNaImportacao, lerEnvio, mapeamentoParaGravar } from "../../../../lib/importacao/regras";

export const dynamic = "force-dynamic";

const voltar = (parametros: Record<string, string>) => redirecionar(`/produtos/importar?${new URLSearchParams(parametros)}`);

// Envio da planilha (lote L3c: ORA-CAT-002; o Excel .xlsx desde o CAT-002b). Rota própria, e não ação do servidor,
// por causa do tamanho do arquivo (até 5 MB). O servidor relê o arquivo inteiro (a tela só leu o cabeçalho), calcula
// a impressão digital (SHA-256), monta as linhas com o mapeamento e grava a PRÉVIA no banco, que
// valida tudo de novo. Nada entra no catálogo aqui: aplicar é outra pessoa, em outra etapa.
export async function POST(requisicao: NextRequest) {
  // Só formulário desta mesma origem (além do cookie SameSite=Lax da sessão).
  const origem = requisicao.headers.get("origin");
  const host = requisicao.headers.get("x-forwarded-host") ?? requisicao.headers.get("host");
  if (origem && host && new URL(origem).host !== host) return new Response("Origem não permitida", { status: 403 });

  const { supabase, situacao } = await obterSessao({ exigirLoja: true });
  // Só quem gera a prévia tem a planilha lida (CAT-002b): ler o Excel custa mais que ler o CSV, e o banco recusaria
  // depois de qualquer jeito. Quem decide continua sendo o banco (importacao_catalogo_previa); aqui só poupa o servidor.
  const pode = await supabase.rpc("tem_permissao", { p_permissao: "importacao.executar" });
  if (pode.error) return voltar({ erro: "falha" });
  if (pode.data !== true) return voltar({ erro: "permissao" });
  const tamanho = Number(requisicao.headers.get("content-length") ?? "0");
  if (tamanho > LIMITES_DA_PLANILHA.bytes + 64 * 1024) return voltar({ erro: "grande" });
  let dados: FormData;
  try {
    dados = await requisicao.formData();
  } catch {
    return voltar({ erro: "arquivo" });
  }
  const arquivo = dados.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return voltar({ erro: arquivo instanceof File ? "vazio" : "arquivo" });
  if (arquivo.size > LIMITES_DA_PLANILHA.bytes) return voltar({ erro: "grande" });
  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  let planilha;
  try {
    planilha = await lerPlanilha(bytes, descomprimirNoServidor);
  } catch (e) {
    return voltar({ erro: e instanceof ErroDaPlanilha ? erroDaPlanilhaNaImportacao(e.motivo) : "arquivo" });
  }
  const lido = lerEnvio(dados, planilha.cabecalho.length);
  if (!lido.ok) return voltar({ erro: lido.erro });
  if (planilha.linhas.length === 0) return voltar({ erro: "vazio" });

  const unidade = await supabase.from("unidades").select("organizacao_id").eq("id", situacao.unidade_id as string).maybeSingle();
  if (unidade.error || !unidade.data) return voltar({ erro: "falha" });
  // A linha de total no fim da planilha (a da Rein) fica de fora, à vista na prévia; o resto vai em partes de até 2.000
  // linhas, uma prévia por parte (o banco aceita até 2.000 por chamada). Arquivo de uma parte só fica como antes.
  const total = linhaDeTotal(planilha, lido.envio.mapa);
  const todas = montarLinhas(planilha, lido.envio.mapa, lido.envio.padroes);
  const ignoradas = total === null ? [] : [{ linha: todas[total]?.numero ?? total + 2, motivo: "linha de total no fim da planilha" }];
  const linhas = total === null ? todas : todas.filter((_, i) => i !== total);
  if (linhas.length === 0) return voltar({ erro: "vazio" });
  const partes = dividirEmPartes(linhas);
  const impressao = (parte: number) => {
    const hash = createHash("sha256").update(bytes);
    // Cada parte tem a própria impressão digital: o banco recusa aplicar duas vezes o mesmo arquivo (OR023).
    if (partes.length > 1) hash.update(`:parte:${parte}:de:${partes.length}`);
    return hash.digest("hex");
  };
  const nomeDoArquivo = arquivo.name.slice(0, 170) || (planilha.formato === "xlsx" ? "planilha.xlsx" : "planilha.csv");
  const mapeamento = mapeamentoParaGravar(planilha.cabecalho, lido.envio.mapa, lido.envio.padroes);
  // O que a prévia guarda além das colunas: a linha que ficou de fora e, na planilha grande, qual parte é esta.
  const extrasDoMapeamento = (numero: number, parte: readonly { numero: number }[]) => {
    const extras: { [chave: string]: Json } = {};
    if (ignoradas.length > 0) extras.ignoradas = ignoradas;
    if (partes.length > 1) extras.parte = { numero, de: partes.length, linhas: [parte[0]?.numero ?? 0, parte.at(-1)?.numero ?? 0] };
    return extras;
  };
  let primeira: { id: string; ok: string } | null = null;
  for (const [i, parte] of partes.entries()) {
    const numero = i + 1;
    const { data, error } = await supabase.rpc("importacao_catalogo_previa", {
      p_organizacao: unidade.data.organizacao_id,
      p_arquivo_nome: partes.length > 1 ? `${nomeDoArquivo} (parte ${numero} de ${partes.length})` : nomeDoArquivo,
      p_sha256: impressao(numero),
      p_mapeamento: { ...mapeamento, ...extrasDoMapeamento(numero, parte) },
      p_linhas: parte,
    });
    if (error) return voltar({ erro: erroDoBancoNaImportacao(error), ...(primeira ? { importacao: primeira.id } : {}) });
    const resposta = data as { id?: unknown; repetida?: unknown; atualizada?: unknown } | null;
    // Sem o número da prévia na resposta não há o que mostrar: nada de dizer "prévia gravada" no escuro.
    if (typeof resposta?.id !== "string") return voltar({ erro: "falha", ...(primeira ? { importacao: primeira.id } : {}) });
    // Arquivo já enviado antes (R2): a prévia é a mesma, comparada de novo com o cadastro de agora; se algo
    // mudou desde a última comparação, a tela avisa para conferir outra vez.
    const ok = partes.length > 1 ? "previa_partes" : resposta.repetida !== true ? "previa" : resposta.atualizada === true ? "previa_atualizada" : "previa_repetida";
    if (!primeira) primeira = { id: resposta.id, ok };
  }
  return primeira ? voltar({ importacao: primeira.id, ok: primeira.ok }) : voltar({ erro: "falha" });
}
