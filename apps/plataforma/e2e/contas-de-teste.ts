// As contas de teste fictícias (e-mail @example.com) para as provas que rodam contra o site no ar: a prova #11 (J1-a,
// login-real.spec.ts), a venda de ponta a ponta (J1-b, venda-real.spec.ts), a transferência entre as lojas de teste (J1-c
// e J1-d, transferencia-real.spec.ts) e as provas que só leem: os relatórios e o estoque (J2-a,
// relatorios-e-estoque-real.spec.ts), o acesso por papel e por loja (J2-b, acesso-por-papel-real.spec.ts) e a navegação no
// celular (VEL-h, navegacao-real.spec.ts); e as que gravam só nas lojas de teste, com o sim do proprietário de 21/11: o caixa
// (J3-a, caixa-real.spec.ts), a venda com desconto e pagamento misto (J3-b, venda-com-desconto-real.spec.ts), cancelar e
// devolver (J3-c, cancelar-e-devolver-real.spec.ts), o estoque (J3-d, estoque-real.spec.ts), o cliente, o funil e a ordem
// de serviço (J3-e, clientes-e-os-real.spec.ts), o pedido de nota sem emitir e as metas (J3-e, nota-e-metas-real.spec.ts) e
// o financeiro (J3-f, financeiro-real.spec.ts), com as peças comuns em pdv-real.ts; e a que só lê as telas do AUD-c (os
// extratos, os repasses, a importação e as entregas: extratos-e-entregas-real.spec.ts) e a que só lê a tela de
// Transferências (TRF-d, transferencias-leitura-real.spec.ts); e a transferência recebida com falta, com o sim do
// proprietário de 23/11 (TRF-e, transferencia-com-falta-real.spec.ts); e a que só lê a conta do período no Financeiro
// (FIN-001a, conta-do-periodo-real.spec.ts) e a que escolhe o relatório original da Rein nas telas de importação, sem
// enviar (REIN-d, importar-planilha-leitura-real.spec.ts; pede também ORA_E2E_PLANILHA_REIN); e a que só lê os repasses
// atrasados das financeiras (FIN-007a, repasses-atrasados-real.spec.ts) e o aviso deles no Início, no sino e na previsão de
// caixa (FIN-007b, aviso-do-repasse-real.spec.ts); e a que só abre as vendas recentes para ler de onde vieram (CRM-009a,
// venda-do-site-real.spec.ts); e a que desliga a rede com a sessão aberta, sem gravar nada (POS-015a,
// sem-rede-com-login-real.spec.ts); e a que só lê os extratos e a venda cancelada com estorno (PAY-011a,
// debito-do-extrato-real.spec.ts); e a que só lê a taxa das financeiras no resultado do mês (FIN-002a,
// taxa-das-financeiras-real.spec.ts). Só no servidor: ORA_E2E_URL (o site, por
// exemplo https://ora5g.com.br) e ORA_E2E_CONTAS (o arquivo protegido das contas, ~/homologacao/contas-de-teste.txt). No CI os
// dois ficam vazios e as provas são puladas. A senha nunca vai para o log: o Playwright só mostra o nome do passo.
import { readFileSync } from "node:fs";

import { expect, type Page } from "@playwright/test";

export const arquivoDasContas = process.env.ORA_E2E_CONTAS?.trim();
export const noAr = Boolean(process.env.ORA_E2E_URL?.trim());

export type Conta = { nome: string; email: string; senha: string; onde: string };

/** A conta de teste pelo nome (a primeira coluna do arquivo). */
export function contaDeTeste(nome: string): Conta {
  const linha = readFileSync(arquivoDasContas as string, "utf8").split("\n").filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(" | ")).find(([n]) => n === nome);
  if (!linha || linha.length < 4) throw new Error(`a conta ${nome} não está no arquivo das contas de teste`);
  const [n, email, senha, onde] = linha as [string, string, string, string];
  return { nome: n, email, senha, onde };
}

/**
 * Entra com a conta e chega ao Início da loja dela (com uma loja só, o sistema escolhe sozinho). Quem tem mais de uma loja (o
 * Administrador (teste), na rede inteira) escolhe a loja dada.
 */
export async function entrar(pagina: Page, conta: Conta, naLoja: string = conta.onde) {
  await pagina.goto("/entrar");
  await pagina.getByLabel("E-mail", { exact: true }).fill(conta.email);
  await pagina.getByLabel("Senha", { exact: true }).fill(conta.senha);
  await pagina.getByRole("button", { name: "Entrar na plataforma" }).click();
  // Com uma loja só, o sistema escolhe sozinho e abre o Início; com mais de uma, a pessoa escolhe.
  const inicio = pagina.getByRole("heading", { level: 1, name: `Olá, ${conta.nome}` });
  const loja = pagina.getByRole("button", { name: new RegExp(naLoja.replace(/[()]/g, "\\$&")) });
  await expect(inicio.or(loja).first()).toBeVisible();
  if (!(await inicio.isVisible())) await loja.click();
  await expect(pagina).toHaveURL(/\/inicio/);
  await expect(inicio).toBeVisible();
}
