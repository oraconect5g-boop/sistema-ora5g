-- =============================================================================
-- Semente do banco de DESENVOLVIMENTO (ora5g-dev). Dados FICTÍCIOS: o CNPJ raiz 11.222.333
-- é o exemplo clássico de documentação, as lojas de teste não são as lojas reais e os IMEIs
-- e ICCIDs são gerados. NUNCA rodar em homologação com dados reais nem em produção.
-- Pode rodar de novo: não duplica nada (ids fixos e chaves de idempotência "semente:").
-- A auditoria automática registra tudo com o motivo abaixo.
-- =============================================================================
begin;
select set_config('ora.motivo', 'Semente de desenvolvimento (dados fictícios)', true);

insert into public.organizacoes (id, nome) values
  ('0a5e0000-0000-4000-8000-000000000001', 'Ora 5G (desenvolvimento)')
on conflict (id) do nothing;

insert into public.empresas (id, organizacao_id, razao_social, nome_fantasia, cnpj_raiz) values
  ('0a5e0000-0000-4000-8000-000000000010', '0a5e0000-0000-4000-8000-000000000001', 'Ora 5G Dados de Teste Ltda', 'Ora 5G', '11222333')
on conflict (id) do nothing;

insert into public.unidades (id, organizacao_id, empresa_id, codigo, nome, tipo, cnpj, uf, cidade) values
  ('0a5e0000-0000-4000-8000-000000000020', '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000010',
   'santa-candida', 'Santa Cândida (teste)', 'loja_fisica', '11222333000181', 'PR', 'Curitiba'),
  ('0a5e0000-0000-4000-8000-000000000021', '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000010',
   'loja-teste-2', 'Loja de teste 2', 'loja_fisica', '11222333000262', 'PR', 'Curitiba'),
  ('0a5e0000-0000-4000-8000-000000000022', '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000010',
   'assistencia', 'Assistência (teste)', 'assistencia', null, 'PR', 'Curitiba')
on conflict (id) do nothing;

insert into public.categorias (id, organizacao_id, nome) values
  ('0a5e0000-0000-4000-8000-000000000101', '0a5e0000-0000-4000-8000-000000000001', 'Celulares'),
  ('0a5e0000-0000-4000-8000-000000000102', '0a5e0000-0000-4000-8000-000000000001', 'Acessórios'),
  ('0a5e0000-0000-4000-8000-000000000103', '0a5e0000-0000-4000-8000-000000000001', 'Chips e serviços')
on conflict (id) do nothing;

insert into public.marcas (id, organizacao_id, nome) values
  ('0a5e0000-0000-4000-8000-000000000111', '0a5e0000-0000-4000-8000-000000000001', 'Samsung'),
  ('0a5e0000-0000-4000-8000-000000000112', '0a5e0000-0000-4000-8000-000000000001', 'Motorola'),
  ('0a5e0000-0000-4000-8000-000000000113', '0a5e0000-0000-4000-8000-000000000001', 'Geonav')
on conflict (id) do nothing;

insert into public.produtos (id, organizacao_id, tipo, nome, categoria_id, marca_id) values
  ('0a5e0000-0000-4000-8000-000000000201', '0a5e0000-0000-4000-8000-000000000001', 'aparelho', 'Galaxy A15', '0a5e0000-0000-4000-8000-000000000101', '0a5e0000-0000-4000-8000-000000000111'),
  ('0a5e0000-0000-4000-8000-000000000202', '0a5e0000-0000-4000-8000-000000000001', 'aparelho', 'Moto G24', '0a5e0000-0000-4000-8000-000000000101', '0a5e0000-0000-4000-8000-000000000112'),
  ('0a5e0000-0000-4000-8000-000000000203', '0a5e0000-0000-4000-8000-000000000001', 'acessorio', 'Capa de proteção', '0a5e0000-0000-4000-8000-000000000102', null),
  ('0a5e0000-0000-4000-8000-000000000204', '0a5e0000-0000-4000-8000-000000000001', 'acessorio', 'Cabo USB-C 1 m', '0a5e0000-0000-4000-8000-000000000102', '0a5e0000-0000-4000-8000-000000000113'),
  ('0a5e0000-0000-4000-8000-000000000205', '0a5e0000-0000-4000-8000-000000000001', 'chip', 'Chip Ora Connect', '0a5e0000-0000-4000-8000-000000000103', null),
  ('0a5e0000-0000-4000-8000-000000000206', '0a5e0000-0000-4000-8000-000000000001', 'recarga', 'Recarga Ora Connect', '0a5e0000-0000-4000-8000-000000000103', null)
on conflict (id) do nothing;

insert into public.variantes (id, organizacao_id, produto_id, sku, nome, cor, capacidade, codigo_barras, estoque_minimo) values
  ('0a5e0000-0000-4000-8000-000000000301', '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000201', 'APA-0001', 'Galaxy A15 128 GB Azul', 'Azul', '128 GB', null, 2),
  ('0a5e0000-0000-4000-8000-000000000302', '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000202', 'APA-0002', 'Moto G24 128 GB Grafite', 'Grafite', '128 GB', null, 2),
  ('0a5e0000-0000-4000-8000-000000000303', '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000203', 'ACE-0001', 'Capa de proteção', null, null, '7890000000011', 10),
  ('0a5e0000-0000-4000-8000-000000000304', '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000204', 'ACE-0004', 'Cabo USB-C 1 m', null, null, '7890000000042', 8),
  ('0a5e0000-0000-4000-8000-000000000305', '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000205', 'CHI-0001', 'Chip Ora Connect', null, null, null, 20),
  ('0a5e0000-0000-4000-8000-000000000306', '0a5e0000-0000-4000-8000-000000000001', '0a5e0000-0000-4000-8000-000000000206', 'REC-0001', 'Recarga Ora Connect', null, null, null, 0)
on conflict (id) do nothing;

-- Preço geral da rede (origem: importação fictícia) e um preço de exceção na loja de teste 2.
insert into public.precos (organizacao_id, variante_id, unidade_id, valor_centavos, inicio, origem, motivo)
select '0a5e0000-0000-4000-8000-000000000001', v.id::uuid, v.unidade::uuid, v.valor, timestamptz '2026-11-01 00:00-03', v.origem, 'Semente de desenvolvimento'
from (values
  ('0a5e0000-0000-4000-8000-000000000301', null, 129900, 'importacao'),
  ('0a5e0000-0000-4000-8000-000000000302', null, 109900, 'importacao'),
  ('0a5e0000-0000-4000-8000-000000000303', null, 7900, 'importacao'),
  ('0a5e0000-0000-4000-8000-000000000304', null, 4990, 'importacao'),
  ('0a5e0000-0000-4000-8000-000000000305', null, 1000, 'importacao'),
  ('0a5e0000-0000-4000-8000-000000000302', '0a5e0000-0000-4000-8000-000000000021', 104900, 'manual')
) as v (id, unidade, valor, origem)
where not exists (select 1 from public.precos p where p.variante_id = v.id::uuid and p.unidade_id is not distinct from v.unidade::uuid);

insert into public.custos (organizacao_id, variante_id, valor_centavos, inicio, origem, referencia)
select '0a5e0000-0000-4000-8000-000000000001', v.id::uuid, v.valor, timestamptz '2026-11-01 00:00-03', 'importacao', 'semente'
from (values
  ('0a5e0000-0000-4000-8000-000000000301', 98000),
  ('0a5e0000-0000-4000-8000-000000000302', 81000),
  ('0a5e0000-0000-4000-8000-000000000303', 1800),
  ('0a5e0000-0000-4000-8000-000000000304', 1200),
  ('0a5e0000-0000-4000-8000-000000000305', 450)
) as v (id, valor)
where not exists (select 1 from public.custos c where c.variante_id = v.id::uuid);

-- Estoque: aparelhos e chips um a um (IMEI/ICCID fictícios com dígito verificador), acessórios por quantidade.
do $$
declare
  santa constant uuid := '0a5e0000-0000-4000-8000-000000000020';
  loja2 constant uuid := '0a5e0000-0000-4000-8000-000000000021';
  completar text;
  base text;
begin
  for i in 1..6 loop
    base := '35209900180' || lpad(i::text, 3, '0');
    select base || d into completar from generate_series(0, 9) d where privado.luhn_valido(base || d) limit 1;
    perform privado.registrar_item_serializado(case when i <= 4 then santa else loja2 end,
      '0a5e0000-0000-4000-8000-000000000301', completar, null, null, 'entrada_importacao', 'semente:galaxy:' || i);
  end loop;
  for i in 1..3 loop
    base := '35209900181' || lpad(i::text, 3, '0');
    select base || d into completar from generate_series(0, 9) d where privado.luhn_valido(base || d) limit 1;
    perform privado.registrar_item_serializado(case when i <= 2 then santa else loja2 end,
      '0a5e0000-0000-4000-8000-000000000302', completar, null, null, 'entrada_importacao', 'semente:moto:' || i);
  end loop;
  for i in 1..8 loop
    base := '89551000000009' || lpad(i::text, 4, '0');
    select base || d into completar from generate_series(0, 9) d where privado.luhn_valido(base || d) limit 1;
    perform privado.registrar_item_serializado(case when i <= 5 then santa else loja2 end,
      '0a5e0000-0000-4000-8000-000000000305', null, null, completar, 'entrada_importacao', 'semente:chip:' || i);
  end loop;
  perform privado.lancar_movimento(santa, '0a5e0000-0000-4000-8000-000000000303', 24, 'entrada_importacao', null, null, null, null, 'semente:capa:santa');
  perform privado.lancar_movimento(loja2, '0a5e0000-0000-4000-8000-000000000303', 9, 'entrada_importacao', null, null, null, null, 'semente:capa:loja2');
  perform privado.lancar_movimento(santa, '0a5e0000-0000-4000-8000-000000000304', 3, 'entrada_importacao', null, null, null, null, 'semente:cabo:santa');
  perform privado.lancar_movimento(loja2, '0a5e0000-0000-4000-8000-000000000304', 15, 'entrada_importacao', null, null, null, null, 'semente:cabo:loja2');
end;
$$;

commit;
