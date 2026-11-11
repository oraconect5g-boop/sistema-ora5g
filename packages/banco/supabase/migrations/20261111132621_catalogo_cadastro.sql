-- =============================================================================
-- Catálogo: cadastro pela tela (lote L3a: ORA-CAT-001, ORA-CAT-005)
--
-- Até aqui categorias, marcas, produtos e variações só entravam por migration ou semente. Agora quem
-- tem catalogo.gerir (dono e administrador, permissão nova) cadastra e edita pela tela, sempre com
-- motivo e auditoria. A política de desconto da categoria (teto e margem mínima, P14) é preço: só
-- quem tem preco.alterar muda. Regras:
--   * criar de novo o mesmo cadastro (mesmo nome, mesmo SKU ou a mesma chave do formulário) devolve
--     o que já existe, sem duplicar;
--   * o tipo do produto não muda depois de criado (aparelho, chip e acessório controlam o estoque de
--     jeitos diferentes); o SKU só muda enquanto a variação nunca foi usada (estoque, reserva, venda);
--   * inativar produto ou variação exige estoque zerado e nenhuma reserva ativa; categoria só inativa
--     sem produto ativo nela. Nada se apaga.
-- Códigos: OR020 cadastro em uso não pode ser inativado/alterado assim.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

do $$
begin
  perform set_config('ora.motivo', 'Catálogo pela tela (ORA-CAT-001): cadastrar e editar é de quem gere a rede', true);
  insert into public.permissoes (codigo, descricao, modulo)
  values ('catalogo.gerir', 'Cadastrar e editar categorias, marcas, produtos e variações', 'catalogo');
  insert into public.papel_permissoes (papel, permissao)
  values ('dono', 'catalogo.gerir'), ('administrador', 'catalogo.gerir');
end;
$$;

-- Idempotência da criação de produto (o nome pode repetir; a chave do formulário não).
alter table public.produtos add column chave_criacao text check (chave_criacao is null or length(trim(chave_criacao)) between 8 and 80);
create unique index produtos_chave_criacao on public.produtos (organizacao_id, chave_criacao) where chave_criacao is not null;

-- Mudanças de cadastro vão para a auditoria, como as de categoria (ORA-ORG-005).
create trigger marcas_auditar after insert or update on public.marcas
  for each row execute function privado.auditar_mudanca();
create trigger produtos_auditar after insert or update on public.produtos
  for each row execute function privado.auditar_mudanca();
create trigger variantes_auditar after insert or update on public.variantes
  for each row execute function privado.auditar_mudanca();

create or replace function privado.gere_catalogo(p_organizacao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_organizacao is not null and p_organizacao in (select privado.organizacoes_com_permissao('catalogo.gerir'));
$$;

-- Estoque ou reserva ativa de uma variação em qualquer loja (impede inativar).
create or replace function privado.variante_com_estoque(p_variante uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.estoque_saldos s where s.variante_id = p_variante and (s.quantidade > 0 or s.reservado > 0))
      or exists (select 1 from public.estoque_reservas r where r.variante_id = p_variante and r.situacao = 'ativa')
      or exists (select 1 from public.itens_serializados i
                 where i.variante_id = p_variante and i.situacao in ('disponivel', 'reservado', 'em_transito', 'em_assistencia'));
$$;

-- Variação já usada (livro, reserva ou venda): o SKU fica fixo.
create or replace function privado.variante_usada(p_variante uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.estoque_movimentos m where m.variante_id = p_variante)
      or exists (select 1 from public.estoque_reservas r where r.variante_id = p_variante)
      or exists (select 1 from public.venda_itens v where v.variante_id = p_variante)
      or exists (select 1 from public.itens_serializados i where i.variante_id = p_variante);
$$;

-- -----------------------------------------------------------------------------
-- Categoria e marca
-- -----------------------------------------------------------------------------
create or replace function public.catalogo_salvar_categoria(p_organizacao uuid, p_id uuid, p_nome text, p_ativa boolean, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_atual public.categorias;
  v_id uuid;
begin
  if not privado.gere_catalogo(p_organizacao) then
    raise exception 'Sem permissão para cadastrar no catálogo desta rede' using errcode = '42501';
  end if;
  if length(v_nome) = 0 or length(v_nome) > 60 then
    raise exception 'Informe o nome da categoria (até 60 letras)' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('categorias', p_organizacao, lower(v_nome)));
  if p_id is null then
    select * into v_atual from public.categorias c where c.organizacao_id = p_organizacao and lower(c.nome) = lower(v_nome);
    if found then
      return jsonb_build_object('id', v_atual.id, 'repetida', true);
    end if;
    perform set_config('ora.motivo', v_motivo, true);
    insert into public.categorias (organizacao_id, nome) values (p_organizacao, v_nome) returning id into v_id;
    return jsonb_build_object('id', v_id, 'repetida', false);
  end if;

  select * into v_atual from public.categorias c where c.id = p_id and c.organizacao_id = p_organizacao for update;
  if not found then
    raise exception 'Categoria não encontrada' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.categorias c where c.organizacao_id = p_organizacao and lower(c.nome) = lower(v_nome) and c.id <> p_id) then
    raise exception 'Já existe outra categoria com este nome' using errcode = '23505';
  end if;
  if coalesce(p_ativa, v_atual.ativa) = false and v_atual.ativa
     and exists (select 1 from public.produtos p where p.categoria_id = p_id and p.ativo) then
    raise exception 'A categoria ainda tem produto ativo: mova ou inative os produtos antes' using errcode = 'OR020';
  end if;
  if v_atual.nome = v_nome and v_atual.ativa = coalesce(p_ativa, v_atual.ativa) then
    return jsonb_build_object('id', p_id, 'repetida', true);
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.categorias c set nome = v_nome, ativa = coalesce(p_ativa, v_atual.ativa) where c.id = p_id;
  return jsonb_build_object('id', p_id, 'repetida', false);
end;
$$;

-- Política de desconto da categoria (P14): teto e margem mínima em pontos-base; nulos desligam.
create or replace function public.catalogo_definir_politica_desconto(p_categoria uuid, p_teto_pb int, p_margem_minima_pb int, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_atual public.categorias;
begin
  select * into v_atual from public.categorias c where c.id = p_categoria for update;
  if not found or v_atual.organizacao_id not in (select privado.organizacoes_com_permissao('preco.alterar')) then
    raise exception 'Categoria não encontrada para você' using errcode = 'P0002';
  end if;
  if (p_teto_pb is not null and p_teto_pb not between 0 and 10000) or (p_margem_minima_pb is not null and p_margem_minima_pb not between 0 and 10000) then
    raise exception 'Teto e margem vão de 0%% a 100%%' using errcode = '22023';
  end if;
  if (p_teto_pb is null) <> (p_margem_minima_pb is null) then
    raise exception 'Informe o teto e a margem mínima juntos (ou deixe os dois vazios para desligar o desconto)' using errcode = '22023';
  end if;
  if v_atual.desconto_teto_pb is not distinct from p_teto_pb and v_atual.margem_minima_pb is not distinct from p_margem_minima_pb then
    return false;
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.categorias c set desconto_teto_pb = p_teto_pb, margem_minima_pb = p_margem_minima_pb where c.id = p_categoria;
  return true;
end;
$$;

create or replace function public.catalogo_salvar_marca(p_organizacao uuid, p_id uuid, p_nome text, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_atual public.marcas;
  v_id uuid;
begin
  if not privado.gere_catalogo(p_organizacao) then
    raise exception 'Sem permissão para cadastrar no catálogo desta rede' using errcode = '42501';
  end if;
  if length(v_nome) = 0 or length(v_nome) > 60 then
    raise exception 'Informe o nome da marca (até 60 letras)' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('marcas', p_organizacao, lower(v_nome)));
  if p_id is null then
    select * into v_atual from public.marcas m where m.organizacao_id = p_organizacao and lower(m.nome) = lower(v_nome);
    if found then
      return jsonb_build_object('id', v_atual.id, 'repetida', true);
    end if;
    perform set_config('ora.motivo', v_motivo, true);
    insert into public.marcas (organizacao_id, nome) values (p_organizacao, v_nome) returning id into v_id;
    return jsonb_build_object('id', v_id, 'repetida', false);
  end if;
  select * into v_atual from public.marcas m where m.id = p_id and m.organizacao_id = p_organizacao for update;
  if not found then
    raise exception 'Marca não encontrada' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.marcas m where m.organizacao_id = p_organizacao and lower(m.nome) = lower(v_nome) and m.id <> p_id) then
    raise exception 'Já existe outra marca com este nome' using errcode = '23505';
  end if;
  if v_atual.nome = v_nome then
    return jsonb_build_object('id', p_id, 'repetida', true);
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.marcas m set nome = v_nome where m.id = p_id;
  return jsonb_build_object('id', p_id, 'repetida', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Produto
-- -----------------------------------------------------------------------------
create or replace function public.catalogo_salvar_produto(
  p_organizacao uuid, p_id uuid, p_tipo text, p_nome text, p_categoria uuid, p_marca uuid, p_modelo text, p_descricao text,
  p_publicar_online boolean, p_ativo boolean, p_chave text, p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_modelo text := nullif(trim(coalesce(p_modelo, '')), '');
  v_descricao text := nullif(trim(coalesce(p_descricao, '')), '');
  v_atual public.produtos;
  v_id uuid;
begin
  if not privado.gere_catalogo(p_organizacao) then
    raise exception 'Sem permissão para cadastrar no catálogo desta rede' using errcode = '42501';
  end if;
  if length(v_nome) = 0 or length(v_nome) > 120 then
    raise exception 'Informe o nome do produto (até 120 letras)' using errcode = '22023';
  end if;
  if length(coalesce(v_modelo, '')) > 60 or length(coalesce(v_descricao, '')) > 2000 then
    raise exception 'Modelo (até 60) ou descrição (até 2000) longos demais' using errcode = '22023';
  end if;
  if not exists (select 1 from public.categorias c where c.id = p_categoria and c.organizacao_id = p_organizacao and c.ativa) then
    raise exception 'Escolha uma categoria ativa desta rede' using errcode = '22023';
  end if;
  if p_marca is not null and not exists (select 1 from public.marcas m where m.id = p_marca and m.organizacao_id = p_organizacao) then
    raise exception 'Marca de outra rede ou inexistente' using errcode = '22023';
  end if;

  if p_id is null then
    if p_tipo is null or p_tipo not in ('aparelho', 'acessorio', 'chip', 'ativacao', 'portabilidade', 'recarga', 'servico') then
      raise exception 'Tipo de produto inválido' using errcode = '22023';
    end if;
    if p_chave is null or length(trim(p_chave)) not between 8 and 80 then
      raise exception 'Chave do formulário obrigatória' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(privado.trava_da_chave('produtos', p_organizacao, p_chave));
    select * into v_atual from public.produtos p where p.organizacao_id = p_organizacao and p.chave_criacao = trim(p_chave);
    if found then
      if v_atual.nome = v_nome and v_atual.tipo = p_tipo and v_atual.categoria_id = p_categoria then
        return jsonb_build_object('id', v_atual.id, 'repetida', true);
      end if;
      raise exception 'Chave do formulário já usada em outro produto' using errcode = 'OR004';
    end if;
    perform set_config('ora.motivo', v_motivo, true);
    insert into public.produtos (organizacao_id, tipo, nome, categoria_id, marca_id, modelo, descricao, publicar_online, chave_criacao)
    values (p_organizacao, p_tipo, v_nome, p_categoria, p_marca, v_modelo, v_descricao, coalesce(p_publicar_online, false), trim(p_chave))
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'repetida', false);
  end if;

  select * into v_atual from public.produtos p where p.id = p_id and p.organizacao_id = p_organizacao for update;
  if not found then
    raise exception 'Produto não encontrado' using errcode = 'P0002';
  end if;
  if p_tipo is not null and p_tipo <> v_atual.tipo then
    raise exception 'O tipo do produto não muda depois de criado: cadastre outro produto' using errcode = '22023';
  end if;
  if coalesce(p_ativo, v_atual.ativo) = false and v_atual.ativo
     and exists (select 1 from public.variantes v where v.produto_id = p_id and privado.variante_com_estoque(v.id)) then
    raise exception 'O produto ainda tem estoque ou reserva: zere antes de inativar' using errcode = 'OR020';
  end if;
  if v_atual.nome = v_nome and v_atual.categoria_id = p_categoria and v_atual.marca_id is not distinct from p_marca
     and v_atual.modelo is not distinct from v_modelo and v_atual.descricao is not distinct from v_descricao
     and v_atual.publicar_online = coalesce(p_publicar_online, v_atual.publicar_online) and v_atual.ativo = coalesce(p_ativo, v_atual.ativo) then
    return jsonb_build_object('id', p_id, 'repetida', true);
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.produtos p set nome = v_nome, categoria_id = p_categoria, marca_id = p_marca, modelo = v_modelo, descricao = v_descricao,
    publicar_online = coalesce(p_publicar_online, v_atual.publicar_online), ativo = coalesce(p_ativo, v_atual.ativo)
  where p.id = p_id;
  return jsonb_build_object('id', p_id, 'repetida', false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Variação (item vendável: SKU, código de barras, cor, capacidade, estoque mínimo)
-- -----------------------------------------------------------------------------
create or replace function public.catalogo_salvar_variante(
  p_produto uuid, p_id uuid, p_sku text, p_nome text, p_cor text, p_capacidade text, p_codigo_barras text,
  p_estoque_minimo int, p_ativa boolean, p_motivo text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  v_produto public.produtos;
  v_sku text := trim(coalesce(p_sku, ''));
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_cor text := nullif(trim(coalesce(p_cor, '')), '');
  v_capacidade text := nullif(trim(coalesce(p_capacidade, '')), '');
  v_codigo text := nullif(regexp_replace(coalesce(p_codigo_barras, ''), '\s', '', 'g'), '');
  v_minimo int := coalesce(p_estoque_minimo, 0);
  v_atual public.variantes;
  v_id uuid;
begin
  select * into v_produto from public.produtos p where p.id = p_produto;
  if not found or not privado.gere_catalogo(v_produto.organizacao_id) then
    raise exception 'Produto não encontrado para você' using errcode = 'P0002';
  end if;
  if v_sku !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,59}$' then
    raise exception 'SKU inválido: letras, números, ponto, hífen, barra ou sublinhado (até 60)' using errcode = '22023';
  end if;
  if length(v_nome) = 0 or length(v_nome) > 160 then
    raise exception 'Informe o nome da variação (até 160 letras)' using errcode = '22023';
  end if;
  if length(coalesce(v_cor, '')) > 40 or length(coalesce(v_capacidade, '')) > 40 then
    raise exception 'Cor ou capacidade longas demais (até 40)' using errcode = '22023';
  end if;
  if v_codigo is not null and v_codigo !~ '^[0-9]{8,14}$' then
    raise exception 'Código de barras inválido: de 8 a 14 dígitos' using errcode = '22023';
  end if;
  if v_minimo not between 0 and 100000 then
    raise exception 'Estoque mínimo inválido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(privado.trava_da_chave('variantes', v_produto.organizacao_id, lower(v_sku)));

  if p_id is null then
    if not v_produto.ativo then
      raise exception 'Produto inativo: reative antes de criar variação' using errcode = '22023';
    end if;
    select * into v_atual from public.variantes v where v.organizacao_id = v_produto.organizacao_id and lower(v.sku) = lower(v_sku);
    if found then
      if v_atual.produto_id = p_produto and v_atual.nome = v_nome and v_atual.cor is not distinct from v_cor
         and v_atual.capacidade is not distinct from v_capacidade and v_atual.codigo_barras is not distinct from v_codigo then
        return jsonb_build_object('id', v_atual.id, 'repetida', true);
      end if;
      raise exception 'Este SKU já está em outra variação' using errcode = '23505';
    end if;
    if v_codigo is not null and exists (select 1 from public.variantes v where v.organizacao_id = v_produto.organizacao_id and v.codigo_barras = v_codigo) then
      raise exception 'Este código de barras já está em outra variação' using errcode = '23505';
    end if;
    perform set_config('ora.motivo', v_motivo, true);
    insert into public.variantes (organizacao_id, produto_id, sku, nome, cor, capacidade, codigo_barras, estoque_minimo)
    values (v_produto.organizacao_id, p_produto, v_sku, v_nome, v_cor, v_capacidade, v_codigo, v_minimo)
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'repetida', false);
  end if;

  select * into v_atual from public.variantes v where v.id = p_id and v.produto_id = p_produto for update;
  if not found then
    raise exception 'Variação não encontrada' using errcode = 'P0002';
  end if;
  if v_atual.sku <> v_sku then
    if privado.variante_usada(p_id) then
      raise exception 'Este SKU já foi usado em estoque, reserva ou venda e não muda: cadastre outra variação' using errcode = 'OR020';
    end if;
    if exists (select 1 from public.variantes v where v.organizacao_id = v_produto.organizacao_id and lower(v.sku) = lower(v_sku) and v.id <> p_id) then
      raise exception 'Este SKU já está em outra variação' using errcode = '23505';
    end if;
  end if;
  if v_codigo is not null and exists (select 1 from public.variantes v where v.organizacao_id = v_produto.organizacao_id
                                       and v.codigo_barras = v_codigo and v.id <> p_id) then
    raise exception 'Este código de barras já está em outra variação' using errcode = '23505';
  end if;
  if coalesce(p_ativa, v_atual.ativa) = false and v_atual.ativa and privado.variante_com_estoque(p_id) then
    raise exception 'A variação ainda tem estoque ou reserva: zere antes de inativar' using errcode = 'OR020';
  end if;
  if coalesce(p_ativa, v_atual.ativa) and not v_atual.ativa and not v_produto.ativo then
    raise exception 'Produto inativo: reative o produto antes da variação' using errcode = '22023';
  end if;
  if v_atual.sku = v_sku and v_atual.nome = v_nome and v_atual.cor is not distinct from v_cor and v_atual.capacidade is not distinct from v_capacidade
     and v_atual.codigo_barras is not distinct from v_codigo and v_atual.estoque_minimo = v_minimo and v_atual.ativa = coalesce(p_ativa, v_atual.ativa) then
    return jsonb_build_object('id', p_id, 'repetida', true);
  end if;
  perform set_config('ora.motivo', v_motivo, true);
  update public.variantes v set sku = v_sku, nome = v_nome, cor = v_cor, capacidade = v_capacidade, codigo_barras = v_codigo,
    estoque_minimo = v_minimo, ativa = coalesce(p_ativa, v_atual.ativa)
  where v.id = p_id;
  return jsonb_build_object('id', p_id, 'repetida', false);
end;
$$;

revoke all on function privado.gere_catalogo(uuid), privado.variante_com_estoque(uuid), privado.variante_usada(uuid)
  from public, anon, authenticated;
revoke all on function public.catalogo_salvar_categoria(uuid, uuid, text, boolean, text),
  public.catalogo_definir_politica_desconto(uuid, int, int, text), public.catalogo_salvar_marca(uuid, uuid, text, text),
  public.catalogo_salvar_produto(uuid, uuid, text, text, uuid, uuid, text, text, boolean, boolean, text, text),
  public.catalogo_salvar_variante(uuid, uuid, text, text, text, text, text, int, boolean, text) from public, anon;
grant execute on function public.catalogo_salvar_categoria(uuid, uuid, text, boolean, text),
  public.catalogo_definir_politica_desconto(uuid, int, int, text), public.catalogo_salvar_marca(uuid, uuid, text, text),
  public.catalogo_salvar_produto(uuid, uuid, text, text, uuid, uuid, text, text, boolean, boolean, text, text),
  public.catalogo_salvar_variante(uuid, uuid, text, text, text, text, text, int, boolean, text) to authenticated;
