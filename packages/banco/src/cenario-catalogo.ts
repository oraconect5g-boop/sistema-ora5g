import { comDigitoLuhn, type ExecutorSql } from "./banco-de-teste";
import { ids } from "./cenario";

// Catálogo e estoque FICTÍCIOS para os testes do ADR-003 (sobre o cenário de acesso).
const id = (n: number) => `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;

export const cat = {
  celulares: id(1),
  acessorios: id(2),
  chips: id(3),
  categoriaOutraOrg: id(4),
  marca: id(10),
  produtoAparelho: id(20),
  produtoCapa: id(21),
  produtoChip: id(22),
  produtoRecarga: id(23),
  aparelho: id(30),
  capa: id(31),
  chip: id(32),
  recarga: id(33),
  imei1: comDigitoLuhn("35209900170001"),
  imei2: comDigitoLuhn("35209900170002"),
  imei3: comDigitoLuhn("35209900170003"),
  iccid1: comDigitoLuhn("895510000000000001"),
};

export const itens: Record<"a1" | "a2" | "b1" | "chipA", string> = { a1: "", a2: "", b1: "", chipA: "" };

export async function montarCatalogo(db: ExecutorSql) {
  const c = cat;
  const o = ids.organizacao;
  await db.exec(`
    insert into public.categorias (id, organizacao_id, nome) values
      ('${c.celulares}', '${o}', 'Celulares'), ('${c.acessorios}', '${o}', 'Acessórios'), ('${c.chips}', '${o}', 'Chips'),
      ('${c.categoriaOutraOrg}', '${ids.outraOrganizacao}', 'Celulares');
    insert into public.marcas (id, organizacao_id, nome) values ('${c.marca}', '${o}', 'Samsung');
    insert into public.produtos (id, organizacao_id, tipo, nome, categoria_id, marca_id) values
      ('${c.produtoAparelho}', '${o}', 'aparelho', 'Galaxy A15', '${c.celulares}', '${c.marca}'),
      ('${c.produtoCapa}', '${o}', 'acessorio', 'Capa de proteção', '${c.acessorios}', null),
      ('${c.produtoChip}', '${o}', 'chip', 'Chip pré-pago', '${c.chips}', null),
      ('${c.produtoRecarga}', '${o}', 'recarga', 'Recarga', '${c.chips}', null);
    insert into public.variantes (id, organizacao_id, produto_id, sku, nome, codigo_barras) values
      ('${c.aparelho}', '${o}', '${c.produtoAparelho}', 'APA-0001', 'Galaxy A15 128 GB Azul', '7890000000011'),
      ('${c.capa}', '${o}', '${c.produtoCapa}', 'ACE-0001', 'Capa de proteção', '7890000000028'),
      ('${c.chip}', '${o}', '${c.produtoChip}', 'CHI-0001', 'Chip pré-pago', null),
      ('${c.recarga}', '${o}', '${c.produtoRecarga}', 'REC-99999', 'Recarga', null);
    insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem) values
      ('${o}', '${c.aparelho}', null, 149900, now() - interval '30 days', 'importacao'),
      ('${o}', '${c.aparelho}', '${ids.lojaB}', 139900, now() - interval '30 days', 'manual'),
      ('${o}', '${c.capa}', null, 7900, now() - interval '30 days', 'importacao');
    insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem) values
      ('${o}', '${c.aparelho}', 110000, now() - interval '30 days', 'importacao'),
      ('${o}', '${c.capa}', 1800, now() - interval '30 days', 'importacao');
  `);

  const entrada = async (unidade: string, variante: string, imei: string | null, iccid: string | null, chave: string) =>
    (await db.query<{ id: string }>(
      "select privado.registrar_item_serializado($1, $2, $3, null, $4, 'entrada_importacao', $5) as id",
      [unidade, variante, imei, iccid, chave],
    )).rows[0]?.id ?? "";
  itens.a1 = await entrada(ids.lojaA, c.aparelho, c.imei1, null, "teste:a1");
  itens.a2 = await entrada(ids.lojaA, c.aparelho, c.imei2, null, "teste:a2");
  itens.b1 = await entrada(ids.lojaB, c.aparelho, c.imei3, null, "teste:b1");
  itens.chipA = await entrada(ids.lojaA, c.chip, null, c.iccid1, "teste:chipA");
  await db.query("select privado.lancar_movimento($1, $2, 10, 'entrada_importacao', null, null, null, null, 'teste:capaA')", [ids.lojaA, c.capa]);
  await db.query("select privado.lancar_movimento($1, $2, 3, 'entrada_importacao', null, null, null, null, 'teste:capaB')", [ids.lojaB, c.capa]);
}
