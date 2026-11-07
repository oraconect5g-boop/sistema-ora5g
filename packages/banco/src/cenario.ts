import type { PGlite } from "@electric-sql/pglite";

import { cnpj } from "./banco-de-teste";

// Dados FICTÍCIOS para os testes. CNPJs gerados, não pertencem a empresas reais.
export const RAIZ = "11222333";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ids = {
  organizacao: id(1),
  outraOrganizacao: id(2),
  empresa: id(10),
  outraEmpresa: id(11),
  lojaA: id(20),
  lojaB: id(21),
  lojaC: id(22),
  online: id(23),
  assistencia: id(24),
  lojaOutraOrg: id(25),
  dono: id(100),
  administrador: id(101),
  vendedorA: id(102),
  vendedorAB: id(103),
  bloqueado: id(104),
  encerrado: id(105),
  gerenteB: id(106),
  tecnico: id(107),
  semVinculo: id(108),
  donoOutraOrg: id(109),
};

export async function montarCenario(db: PGlite) {
  const i = ids;
  await db.exec(`
    insert into public.organizacoes (id, nome) values ('${i.organizacao}', 'Ora 5G (teste)'), ('${i.outraOrganizacao}', 'Outra rede (teste)');
    insert into public.empresas (id, organizacao_id, razao_social, cnpj_raiz) values
      ('${i.empresa}', '${i.organizacao}', 'Empresa Teste Ltda', '${RAIZ}'),
      ('${i.outraEmpresa}', '${i.outraOrganizacao}', 'Outra Empresa Ltda', '99888777');
    insert into public.unidades (id, organizacao_id, empresa_id, codigo, nome, tipo, cnpj) values
      ('${i.lojaA}', '${i.organizacao}', '${i.empresa}', 'loja-a', 'Loja A', 'loja_fisica', '${cnpj(RAIZ, "0001")}'),
      ('${i.lojaB}', '${i.organizacao}', '${i.empresa}', 'loja-b', 'Loja B', 'loja_fisica', '${cnpj(RAIZ, "0002")}'),
      ('${i.lojaC}', '${i.organizacao}', '${i.empresa}', 'loja-c', 'Loja C', 'loja_fisica', '${cnpj(RAIZ, "0003")}'),
      ('${i.assistencia}', '${i.organizacao}', '${i.empresa}', 'assistencia', 'Assistência', 'assistencia', null),
      ('${i.lojaOutraOrg}', '${i.outraOrganizacao}', '${i.outraEmpresa}', 'loja-x', 'Loja X', 'loja_fisica', '${cnpj("99888777", "0001")}');
    insert into public.unidades (id, organizacao_id, empresa_id, codigo, nome, tipo, unidade_emissora_id) values
      ('${i.online}', '${i.organizacao}', '${i.empresa}', 'online', 'Loja Online', 'online', '${i.lojaA}');
  `);

  const usuarios: [string, string][] = [
    [i.dono, "dono"], [i.administrador, "admin"], [i.vendedorA, "vendedor.a"], [i.vendedorAB, "vendedor.ab"],
    [i.bloqueado, "bloqueado"], [i.encerrado, "encerrado"], [i.gerenteB, "gerente.b"], [i.tecnico, "tecnico"],
    [i.semVinculo, "sem.vinculo"], [i.donoOutraOrg, "dono.outra"],
  ];
  for (const [usuario, nome] of usuarios) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [usuario, `${nome}@teste.invalid`]);
    await db.query("insert into public.perfis_usuario (id, nome, email) values ($1, $2, $3)", [usuario, nome, `${nome}@teste.invalid`]);
  }

  await db.exec(`
    insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, inicio, fim) values
      ('${i.dono}', '${i.organizacao}', 'dono', 'organizacao', null, now() - interval '1 day', null),
      ('${i.administrador}', '${i.organizacao}', 'administrador', 'organizacao', null, now() - interval '1 day', null),
      ('${i.vendedorA}', '${i.organizacao}', 'vendedor', 'unidade', '${i.lojaA}', now() - interval '1 day', null),
      ('${i.vendedorAB}', '${i.organizacao}', 'vendedor', 'unidade', '${i.lojaA}', now() - interval '1 day', null),
      ('${i.vendedorAB}', '${i.organizacao}', 'vendedor', 'unidade', '${i.lojaB}', now() - interval '1 day', null),
      ('${i.bloqueado}', '${i.organizacao}', 'vendedor', 'unidade', '${i.lojaA}', now() - interval '1 day', null),
      ('${i.encerrado}', '${i.organizacao}', 'vendedor', 'unidade', '${i.lojaA}', now() - interval '10 days', now() - interval '1 day'),
      ('${i.gerenteB}', '${i.organizacao}', 'gerente', 'unidade', '${i.lojaB}', now() - interval '1 day', null),
      ('${i.tecnico}', '${i.organizacao}', 'tecnico', 'unidade', '${i.assistencia}', now() - interval '1 day', null),
      ('${i.donoOutraOrg}', '${i.outraOrganizacao}', 'dono', 'organizacao', null, now() - interval '1 day', null);
  `);
}
