// Retorno imediato em TODO formulário das telas reais (lote VEL-a: ORA-QUAL-010 e ORA-POS-002). O aceite do lote
// diz "nenhum botão de ação sem retorno visual": depois do toque, o botão trava e mostra um texto de espera enquanto
// o pedido está no servidor. Este teste lê os arquivos das telas e confere a regra em cada formulário, para que uma
// tela nova não volte ao botão parado. O que o botão desenha em cada estado está em componentes/BotaoDeEnvio.test.ts;
// o estado de verdade, no navegador, em e2e/entrar.spec.ts.
//
// As três formas de formulário que as telas reais usam, e por que cada uma dá retorno:
//   <form action={acaoDoServidor}>  o React marca o envio como pendente e o botão de envio lê isso (useFormStatus);
//   <Form action="/tela">           busca e filtro (next/form): navega sem recarregar, e o botão também fica pendente;
//   <FormularioDeArquivo action>    envio de arquivo para uma rota, pelo navegador: quem avisa o botão é o formulário.
// Um <form> comum com endereço em action= não avisa botão nenhum: por isso só é aceito onde está justificado abaixo.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const src = new URL(".", import.meta.url).pathname;

/** Todos os .tsx das telas reais (a demonstração é só desenho, sem ação no servidor). */
const telas = (pasta: string): string[] => readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
  if (e.isDirectory()) return e.name === "demo" ? [] : telas(join(pasta, e.name));
  return e.name.endsWith(".tsx") ? [join(pasta, e.name)] : [];
});

/** O texto sem os comentários, com as linhas no mesmo lugar: um <form> citado num comentário não é formulário. */
const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
  .replace(/(^|\s)\/\/.*$/gm, (c) => c.replace(/[^\n]/g, " "));

/** Onde termina a etiqueta de abertura que começa em `inicio`: o primeiro ">" fora de chaves e de aspas. */
const fimDaAbertura = (texto: string, inicio: number) => {
  let chaves = 0;
  let aspas: string | null = null;
  for (let p = inicio; p < texto.length; p++) {
    const c = texto[p];
    if (aspas !== null) {
      if (c === aspas) aspas = null;
    } else if (c === '"' || (c === "`" && chaves > 0)) aspas = c;
    else if (c === "{") chaves++;
    else if (c === "}") chaves--;
    else if (c === ">" && chaves === 0) return p;
  }
  return texto.length - 1;
};

/** As etiquetas de abertura de um elemento ou componente dentro de um trecho (sem confundir Botao com BotaoConfirmar). */
const aberturas = (trecho: string, nome: string) => [...trecho.matchAll(new RegExp(`<${nome}(?=[\\s>/])`, "g"))]
  .map((m) => ({ em: m.index, etiqueta: trecho.slice(m.index, fimDaAbertura(trecho, m.index) + 1) }));

type Arquivo = { nome: string; texto: string };
type Formulario = { onde: string; arquivo: Arquivo; tipo: "form" | "Form" | "FormularioDeArquivo"; abertura: string; corpo: string };

const arquivos: Arquivo[] = telas(src).sort().map((caminho) => ({ nome: caminho.slice(src.length), texto: semComentarios(readFileSync(caminho, "utf8")) }));
const linha = (texto: string, em: number) => texto.slice(0, em).split("\n").length;

const formularios: Formulario[] = arquivos.flatMap((arquivo) => (["form", "Form", "FormularioDeArquivo"] as const).flatMap((tipo) =>
  aberturas(arquivo.texto, tipo).map(({ em, etiqueta }) => {
    const depois = em + etiqueta.length;
    const fecho = etiqueta.endsWith("/>") ? depois : arquivo.texto.indexOf(`</${tipo}>`, depois);
    return { onde: `${arquivo.nome}:${linha(arquivo.texto, em)}`, arquivo, tipo, abertura: etiqueta, corpo: fecho < 0 ? "" : arquivo.texto.slice(depois, fecho) };
  })));

/** O que vem em action=: "texto", {`molde`} ou {expressão}; null quando a etiqueta não tem. */
const acaoDe = (abertura: string) => {
  const m = /(?<![\w-])action=/.exec(abertura);
  if (m === null) return null;
  const resto = abertura.slice(m.index + m[0].length);
  if (resto.startsWith('"')) return resto.slice(0, resto.indexOf('"', 1) + 1);
  let chaves = 0;
  for (let p = 0; p < resto.length; p++) {
    if (resto[p] === "{") chaves++;
    else if (resto[p] === "}" && --chaves === 0) return resto.slice(0, p + 1);
  }
  return resto;
};

/** Os nomes que um arquivo importa de um arquivo de ações do servidor (acoes.ts, sempre "use server"). */
const acoesImportadas = (texto: string) => [...texto.matchAll(/import\s+\{([^}]*)\}\s+from\s+"([^"]+)"/g)]
  .filter(([, , de = ""]) => /(^|\/)acoes$/.test(de))
  .flatMap(([, nomes = ""]) => nomes.split(",").map((n) => n.trim().split(/\s+as\s+/).pop() ?? "").filter((n) => n !== ""));

/** As ações que o arquivo recebe do useActionState: o segundo nome da lista, desde que a ação passada venha de acoes.ts. */
const acoesDoEstado = (texto: string) => {
  const importadas = acoesImportadas(texto);
  return [...texto.matchAll(/const \[\w+, (\w+)[^\]]*\] = useActionState(?:<[^>]*>)?\(\s*(\w+)/g)].filter(([, , passada = ""]) => importadas.includes(passada)).map(([, nome = ""]) => nome);
};

/** A ação é uma função do servidor? É o que faz o React marcar o envio como pendente. */
const acaoEhFuncaoDoServidor = (f: Formulario) => {
  const nome = /^\{([A-Za-z_]\w*)\}$/.exec(acaoDe(f.abertura) ?? "")?.[1];
  return nome !== undefined && (acoesImportadas(f.arquivo.texto).includes(nome) || acoesDoEstado(f.arquivo.texto).includes(nome));
};

/** Os botões de envio que travam e avisam: Botao com type="submit", BotaoConfirmar e BotaoDeEnvio. */
const botoesCientes = (corpo: string) => [
  ...aberturas(corpo, "Botao").filter(({ etiqueta }) => /\btype="submit"/.test(etiqueta)),
  ...aberturas(corpo, "BotaoConfirmar"),
  ...aberturas(corpo, "BotaoDeEnvio"),
];

/**
 * Formulários comuns (<form>) que NÃO têm função do servidor em action=, um a um, com o motivo.
 * Qualquer outro que apareça reprova o teste: ou vira uma das três formas acima, ou entra aqui com a justificativa.
 */
const FORMULARIOS_COMUNS_ACEITOS: Record<string, string> = {
  // o próprio componente de envio de arquivo: recebe o endereço de quem o usa e avisa o botão pelo contexto
  "componentes/FormularioDeArquivo.tsx": "sem action",
  // busca da vitrine pública: não tem botão (a pessoa confirma no teclado) e a página troca inteira pelo navegador,
  // que mostra o próprio carregamento; funciona sem JavaScript, o que importa numa página aberta ao público
  "app/loja/VitrineDaLoja.tsx": '"/loja"',
};

describe("os arquivos em que a regra se apoia", () => {
  it("o teste enxerga os formulários das telas (se a contagem cair, a varredura quebrou)", () => {
    const quantos = (tipo: Formulario["tipo"]) => formularios.filter((f) => f.tipo === tipo).length;
    expect(arquivos.length).toBeGreaterThanOrEqual(200);
    expect(quantos("form")).toBeGreaterThanOrEqual(160);
    expect(quantos("Form")).toBeGreaterThanOrEqual(9);
    expect(quantos("FormularioDeArquivo")).toBeGreaterThanOrEqual(4);
    // todo formulário achado tem começo e fim: nenhum corpo veio vazio por etiqueta de fecho perdida
    expect(formularios.filter((f) => f.corpo.trim() === "").map((f) => f.onde)).toEqual([]);
  });

  it("todo arquivo de ações é do servidor", () => {
    const lista = (pasta: string): string[] => readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return lista(join(pasta, e.name));
      return e.name === "acoes.ts" ? [join(pasta, e.name)] : [];
    });
    const acoes = lista(src);
    expect(acoes.length).toBeGreaterThanOrEqual(30);
    expect(acoes.filter((a) => !readFileSync(a, "utf8").startsWith('"use server";')).map((a) => a.slice(src.length))).toEqual([]);
  });

  it("os botões de envio leem o estado do envio; o Botao comum entrega o de envio quando é type=\"submit\"", () => {
    const de = (nome: string) => arquivos.find((a) => a.nome === nome)?.texto ?? "";
    expect(de("componentes/BotaoDeEnvio.tsx")).toContain("useFormStatus()");
    expect(de("componentes/BotaoConfirmar.tsx")).toContain("useFormStatus()");
    expect(de("componentes/ui.tsx")).toContain('if (type === "submit") return <BotaoDeEnvio');
  });
});

describe("formulário de ação: <form action={função do servidor}>", () => {
  const comuns = formularios.filter((f) => f.tipo === "form");

  it("a ação é sempre uma função de acoes.ts (direto ou pelo useActionState); as exceções são as justificadas", () => {
    const fora = comuns.filter((f) => !acaoEhFuncaoDoServidor(f)).map((f) => [f.arquivo.nome, acaoDe(f.abertura) ?? "sem action"]);
    expect(Object.fromEntries(fora)).toEqual(FORMULARIOS_COMUNS_ACEITOS);
    expect(fora).toHaveLength(Object.keys(FORMULARIOS_COMUNS_ACEITOS).length);
  });

  it("nenhum muda o método, a codificação ou o envio por conta própria (seria um envio que o botão não enxerga)", () => {
    const mexidos = comuns.filter((f) => acaoEhFuncaoDoServidor(f) && /(?<![\w-])(method|encType|onSubmit|target)=/.test(f.abertura));
    expect(mexidos.map((f) => f.onde)).toEqual([]);
  });

  it("todo formulário de ação tem ao menos um botão de envio que trava e avisa", () => {
    const acoes = comuns.filter(acaoEhFuncaoDoServidor);
    expect(acoes.length).toBeGreaterThanOrEqual(160);
    expect(acoes.filter((f) => botoesCientes(f.corpo).length === 0).map((f) => f.onde)).toEqual([]);
  });
});

describe("busca e filtro: <Form> do next/form", () => {
  const buscas = formularios.filter((f) => f.tipo === "Form");

  it("o Form é o do next/form", () => {
    expect(buscas.filter((f) => !f.arquivo.texto.includes('import Form from "next/form";')).map((f) => f.onde)).toEqual([]);
  });

  it("não busca a tela de destino antes da hora: o destino depende do que a pessoa digitar (prefetch={false})", () => {
    expect(buscas.filter((f) => !f.abertura.includes("prefetch={false}")).map((f) => f.onde)).toEqual([]);
  });

  it("tem botão de envio que trava e avisa enquanto a tela filtrada não chega", () => {
    expect(buscas.filter((f) => botoesCientes(f.corpo).length === 0).map((f) => f.onde)).toEqual([]);
  });
});

describe("envio de arquivo: <FormularioDeArquivo>", () => {
  const envios = formularios.filter((f) => f.tipo === "FormularioDeArquivo");
  /** Onde o campo do arquivo fica em outro componente, usado dentro do formulário: a tela e o arquivo do componente. */
  const CAMPO_EM_OUTRO_COMPONENTE: Record<string, { componente: string; arquivo: string }> = {
    "app/produtos/importar/page.tsx": { componente: "EscolherColunas", arquivo: "app/produtos/importar/EscolherColunas.tsx" },
    // EXT-a: o extrato da maquininha ou do banco; o componente lê o arquivo no aparelho (as colunas, ou o OFX).
    "app/pagamentos/extratos/importar/page.tsx": { componente: "EscolherColunasDoExtrato", arquivo: "app/pagamentos/extratos/importar/EscolherColunasDoExtrato.tsx" },
    // META-a: o relatório do Gerenciador de Anúncios; o componente lê as colunas no aparelho.
    "app/relatorios/anuncios/page.tsx": { componente: "EscolherColunasDosAnuncios", arquivo: "app/relatorios/anuncios/EscolherColunasDosAnuncios.tsx" },
    // MKTPL-a: o relatório de vendas de um marketplace; o componente lê as colunas no aparelho.
    "app/relatorios/marketplaces/page.tsx": { componente: "EscolherColunasDoMarketplace", arquivo: "app/relatorios/marketplaces/EscolherColunasDoMarketplace.tsx" },
  };
  const temCampoDeArquivo = (trecho: string) => aberturas(trecho, "input").some(({ etiqueta }) => etiqueta.includes('type="file"'));

  it("o endereço é o de uma rota do sistema", () => {
    expect(envios.filter((f) => !/^("\/|\{`\/)/.test(acaoDe(f.abertura) ?? "")).map((f) => f.onde)).toEqual([]);
  });

  it("é só para arquivo: o campo do arquivo está no formulário, ou no componente dele que o formulário usa", () => {
    const sem = envios.filter((f) => {
      if (temCampoDeArquivo(f.corpo)) return false;
      const outro = CAMPO_EM_OUTRO_COMPONENTE[f.arquivo.nome];
      return outro === undefined || aberturas(f.corpo, outro.componente).length === 0 || !temCampoDeArquivo(arquivos.find((a) => a.nome === outro.arquivo)?.texto ?? "");
    });
    expect(sem.map((f) => f.onde)).toEqual([]);
  });

  it("tem botão de envio que trava e avisa enquanto o arquivo sobe", () => {
    expect(envios.filter((f) => botoesCientes(f.corpo).length === 0).map((f) => f.onde)).toEqual([]);
  });
});

describe("nenhum envio escapa dos botões que avisam", () => {
  it("todo <button> escrito à mão diz o tipo, e os de envio são só os dois que leem o estado do envio", () => {
    const outros = arquivos.flatMap((a) => aberturas(a.texto, "button")
      .filter(({ etiqueta }) => !/\btype="button"/.test(etiqueta))
      .map(({ etiqueta }) => `${a.nome} ${/\btype=("[^"]*"|\{[^}]*\})/.exec(etiqueta)?.[1] ?? "sem type"}`));
    expect(outros).toEqual([
      'componentes/BotaoConfirmar.tsx "submit"',
      'componentes/BotaoDeEnvio.tsx "submit"',
      // o Botao comum repassa o tipo pedido; quando é "submit" ele já devolveu o BotaoDeEnvio na linha de cima
      "componentes/ui.tsx {type}",
    ]);
  });

  it("não há atalho que envie por fora: input de envio, formAction, botão ligado a formulário distante ou form.submit()", () => {
    const atalhos = [/<input\b[^>]*\btype="(submit|image)"/, /\bformAction=/, /\sform=["{]/, /\.submit\(\)/];
    expect(arquivos.filter((a) => atalhos.some((re) => re.test(a.texto))).map((a) => a.nome)).toEqual([]);
  });
});
