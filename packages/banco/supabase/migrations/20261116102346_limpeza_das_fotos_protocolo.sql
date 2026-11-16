-- =============================================================================
-- A limpeza das fotos sem registro não apaga o arquivo de uma foto que está sendo registrada (#98; lote INTEG-b;
-- diagnóstico integral de 16/11/2026, REV-CONT-001; ORA-CAT-011)
--
-- O defeito (prova do Codex com duas conexões): a foto em registro (public.registrar_foto, ainda sem confirmar) e a
-- limpeza (public.fotos_sem_registro_limpar e a política do Storage) não se enxergavam; a limpeza liberava e apagava o
-- arquivo, as duas confirmavam e sobrava uma foto ativa sem arquivo. Uma trava que termina antes da chamada ao Storage
-- não resolve: o apagar é uma chamada HTTP fora da transação. Agora é um protocolo em três passos:
--   1. separar (fotos_sem_registro_limpar): pega a MESMA trava do caminho que o registrar_foto pega, confere de novo
--      (o registro em andamento termina antes; o que ele confirmou conta) e grava a separação em
--      privado.fotos_em_limpeza, na auditoria como "limpeza pedida";
--   2. apagar (a API do Storage, como a pessoa logada): a política só deixa apagar o arquivo separado, sem foto, da rede
--      de quem pede e de mais de um dia; o registrar_foto recusa o arquivo separado (OR004: envie a foto de novo);
--   3. concluir (public.fotos_limpeza_concluir, nova): confere no Storage o que sumiu de fato e marca como removido, na
--      auditoria como "removidas"; o que não sumiu (o Storage falhou) fica separado e pendente, e a próxima limpeza tenta
--      de novo (separar de novo é idempotente).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table privado.fotos_em_limpeza (
  caminho text primary key,
  organizacao_id uuid not null references public.organizacoes (id),
  pedida_por uuid not null references public.perfis_usuario (id),
  pedida_em timestamptz not null default now(),
  tentativas int not null default 1 check (tentativas >= 1),
  removida_em timestamptz,
  removida_por uuid references public.perfis_usuario (id)
);
create index fotos_em_limpeza_organizacao on privado.fotos_em_limpeza (organizacao_id);
create index fotos_em_limpeza_pedida_por on privado.fotos_em_limpeza (pedida_por);
create index fotos_em_limpeza_removida_por on privado.fotos_em_limpeza (removida_por);
alter table privado.fotos_em_limpeza enable row level security;
revoke all on privado.fotos_em_limpeza from public, anon, authenticated;

-- A separação ainda aberta (pedida e não removida), para a política do Storage.
create or replace function privado.foto_separada_para_limpeza(p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from privado.fotos_em_limpeza l where l.caminho = p_caminho and l.removida_em is null);
$$;
revoke all on function privado.foto_separada_para_limpeza(text) from public, anon;
grant execute on function privado.foto_separada_para_limpeza(text) to authenticated;

drop policy produtos_fotos_limpar on storage.objects;
create policy produtos_fotos_limpar on storage.objects for delete to authenticated
  using (bucket_id = 'produtos'
         and (storage.foldername(name))[1] in (select o::text from privado.organizacoes_que_enviam_fotos() as o)
         and created_at < now() - interval '1 day'
         and not privado.foto_registrada(name)
         and privado.foto_separada_para_limpeza(name));

create or replace function public.registrar_foto(
  p_produto uuid, p_variante uuid, p_caminho text, p_largura int, p_altura int, p_ilustracao boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  produto public.produtos;
  partes text[];
  meta jsonb;
  nova uuid;
  existente public.fotos_produto;
begin
  select * into produto from public.produtos p where p.id = p_produto;
  if not found or ator is null or produto.organizacao_id not in (select privado.organizacoes_que_enviam_fotos()) then
    raise exception 'Sem permissão para enviar foto deste produto' using errcode = '42501';
  end if;
  if p_variante is not null and not exists (
       select 1 from public.variantes v where v.id = p_variante and v.produto_id = p_produto) then
    raise exception 'A variante não é deste produto' using errcode = '22023';
  end if;
  partes := string_to_array(coalesce(p_caminho, ''), '/');
  if p_caminho !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(produto|[0-9a-f-]{36})/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
     or partes[1] <> produto.organizacao_id::text or partes[2] <> p_produto::text
     or partes[3] <> coalesce(p_variante::text, 'produto') then
    raise exception 'Caminho da foto fora do padrão deste produto' using errcode = '22023';
  end if;
  -- Repetir o registro do mesmo arquivo (clique duplo, nova tentativa da tela) devolve a mesma foto
  -- (REV-040, #42). O mesmo arquivo em outro produto ou variação, já substituído ou com outra
  -- marcação de ilustração é recusado (OR004). Trava pelo caminho: duas tentativas ao mesmo tempo
  -- não criam duas fotos.
  perform pg_advisory_xact_lock(privado.trava_da_chave('fotos', produto.organizacao_id, p_caminho));
  select * into existente from public.fotos_produto f where f.caminho = p_caminho;
  if found then
    if existente.produto_id = p_produto and existente.variante_id is not distinct from p_variante
       and existente.substituida_em is null and existente.ilustracao = coalesce(p_ilustracao, false) then
      return existente.id;
    end if;
    raise exception 'Este arquivo já foi registrado de outro jeito: envie a foto de novo' using errcode = 'OR004';
  end if;
  -- #98: o arquivo separado para a limpeza das fotos sem registro não vira foto (a limpeza pega a mesma trava do
  -- caminho; quem chega depois dela vê a separação e para aqui, antes de qualquer registro).
  if exists (select 1 from privado.fotos_em_limpeza l where l.caminho = p_caminho) then
    raise exception 'Este arquivo foi separado para a limpeza das fotos sem registro: envie a foto de novo' using errcode = 'OR004';
  end if;
  select o.metadata into meta from storage.objects o where o.bucket_id = 'produtos' and o.name = p_caminho;
  if meta is null then
    raise exception 'O arquivo não chegou ao Storage' using errcode = 'P0002';
  end if;
  if coalesce(p_ilustracao, false) and produto.tipo in ('aparelho', 'acessorio', 'chip') then
    raise exception 'Produto físico precisa de foto real, não de ilustração' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Foto do produto enviada', true);
  update public.fotos_produto f set substituida_em = now()
  where f.produto_id = p_produto and f.variante_id is not distinct from p_variante and f.substituida_em is null;
  insert into public.fotos_produto (organizacao_id, produto_id, variante_id, caminho, largura, altura, bytes, tipo, ilustracao, criado_por)
  values (produto.organizacao_id, p_produto, p_variante, p_caminho, p_largura, p_altura,
          (meta ->> 'size')::int, meta ->> 'mimetype', coalesce(p_ilustracao, false), ator)
  returning id into nova;
  return nova;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1. Separar
-- -----------------------------------------------------------------------------
create or replace function public.fotos_sem_registro_limpar(p_caminhos text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedidos text[];
  v_validos text[];
  v_caminho text;
  v_org text;
begin
  if not exists (select 1 from privado.organizacoes_que_enviam_fotos()) then
    raise exception 'Só quem envia fotos do catálogo limpa os arquivos sem registro' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct c), '{}') into v_pedidos from unnest(coalesce(p_caminhos, '{}')) c where c is not null;
  if cardinality(v_pedidos) = 0 or cardinality(v_pedidos) > 500 then
    raise exception 'Informe de 1 a 500 arquivos' using errcode = '22023';
  end if;
  -- #98: a mesma trava do caminho que o registrar_foto pega, em ordem (duas limpezas não se travam uma à outra). O
  -- registro que estava em andamento termina antes; a conferência abaixo, já depois da trava, vê o que ele confirmou.
  for v_caminho in select c from unnest(v_pedidos) c
                   where c ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/(produto|[0-9a-f-]{36})/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' order by c loop
    perform pg_advisory_xact_lock(privado.trava_da_chave('fotos', (storage.foldername(v_caminho))[1]::uuid, v_caminho));
  end loop;
  select coalesce(array_agg(o.name order by o.name), '{}') into v_validos
  from storage.objects o
  where o.bucket_id = 'produtos' and o.name = any (v_pedidos)
    and (storage.foldername(o.name))[1] in (select r::text from privado.organizacoes_que_enviam_fotos() as r)
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.fotos_produto f where f.caminho = o.name);
  if cardinality(v_validos) <> cardinality(v_pedidos) then
    raise exception 'Arquivo sem registro não encontrado para você (ou já registrado, ou enviado há menos de um dia)' using errcode = 'P0002';
  end if;
  -- A separação: o registro passa a recusar estes arquivos e o Storage passa a deixar apagá-los. Separar de novo o que
  -- ficou pendente (o Storage falhou antes) é a nova tentativa.
  insert into privado.fotos_em_limpeza (caminho, organizacao_id, pedida_por)
  select c, (storage.foldername(c))[1]::uuid, (select auth.uid()) from unnest(v_validos) c
  on conflict (caminho) do update
    set tentativas = privado.fotos_em_limpeza.tentativas + 1, pedida_em = now(), pedida_por = excluded.pedida_por
    where privado.fotos_em_limpeza.removida_em is null;
  for v_org in select distinct (storage.foldername(c))[1] from unnest(v_validos) c loop
    insert into public.auditoria (usuario_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, motivo, origem)
    values ((select auth.uid()), v_org::uuid, 'storage.fotos_sem_registro_limpeza_pedida', 'storage.objects', 'produtos',
            jsonb_build_object('quantos', (select count(*) from unnest(v_validos) c where (storage.foldername(c))[1] = v_org),
                               'caminhos', (select jsonb_agg(c order by c) from unnest(v_validos) c where (storage.foldername(c))[1] = v_org)),
            'Limpeza das fotos enviadas sem registro: separadas para apagar', 'aplicacao');
  end loop;
  return jsonb_build_object('caminhos', to_jsonb(v_validos));
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Concluir: o que sumiu do Storage de fato
-- -----------------------------------------------------------------------------
create or replace function public.fotos_limpeza_concluir(p_caminhos text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pedidos text[];
  v_removidos text[];
  v_pendentes text[];
  v_org text;
begin
  if not exists (select 1 from privado.organizacoes_que_enviam_fotos()) then
    raise exception 'Só quem envia fotos do catálogo limpa os arquivos sem registro' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct c), '{}') into v_pedidos from unnest(coalesce(p_caminhos, '{}')) c where c is not null;
  if cardinality(v_pedidos) = 0 or cardinality(v_pedidos) > 500 then
    raise exception 'Informe de 1 a 500 arquivos' using errcode = '22023';
  end if;
  -- Só as separações abertas das redes de quem pede; o resto é ignorado. Nenhuma aberta: nada a concluir para você.
  if not exists (select 1 from privado.fotos_em_limpeza l where l.caminho = any (v_pedidos) and l.removida_em is null
                   and l.organizacao_id in (select r from privado.organizacoes_que_enviam_fotos() as r)) then
    raise exception 'Nenhum arquivo separado para a limpeza encontrado para você' using errcode = 'P0002';
  end if;
  with abertas as (
    select l.caminho from privado.fotos_em_limpeza l
    where l.caminho = any (v_pedidos) and l.removida_em is null
      and l.organizacao_id in (select r from privado.organizacoes_que_enviam_fotos() as r)
    for update
  )
  select coalesce(array_agg(a.caminho order by a.caminho) filter (where not exists (select 1 from storage.objects o where o.bucket_id = 'produtos' and o.name = a.caminho)), '{}'),
         coalesce(array_agg(a.caminho order by a.caminho) filter (where exists (select 1 from storage.objects o where o.bucket_id = 'produtos' and o.name = a.caminho)), '{}')
    into v_removidos, v_pendentes
  from abertas a;
  update privado.fotos_em_limpeza l set removida_em = now(), removida_por = (select auth.uid()) where l.caminho = any (v_removidos);
  for v_org in select distinct (storage.foldername(c))[1] from unnest(v_removidos) c loop
    insert into public.auditoria (usuario_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, motivo, origem)
    values ((select auth.uid()), v_org::uuid, 'storage.fotos_sem_registro_removidas', 'storage.objects', 'produtos',
            jsonb_build_object('quantos', (select count(*) from unnest(v_removidos) c where (storage.foldername(c))[1] = v_org),
                               'caminhos', (select jsonb_agg(c order by c) from unnest(v_removidos) c where (storage.foldername(c))[1] = v_org)),
            'Limpeza das fotos enviadas sem registro: conferido que o arquivo saiu do Storage', 'aplicacao');
  end loop;
  return jsonb_build_object('removidos', to_jsonb(v_removidos), 'pendentes', to_jsonb(v_pendentes));
end;
$$;

revoke all on function public.fotos_limpeza_concluir(text[]) from public, anon;
grant execute on function public.fotos_limpeza_concluir(text[]) to authenticated;
