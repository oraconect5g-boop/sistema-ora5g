-- =============================================================================
-- Limpeza das fotos enviadas sem registro (lote CAT-011b: ORA-CAT-011, "limpeza de arquivo enviado sem registro")
--
-- A foto do produto vai primeiro ao Storage (bucket "produtos") e só depois é registrada (public.registrar_foto). Se o
-- registro não acontece (o celular perdeu a rede, a pessoa desistiu, o banco recusou), o arquivo fica no Storage sem
-- uso. Agora:
--   * public.fotos_sem_registro(): os arquivos do bucket "produtos" das redes em que a pessoa envia fotos
--     (catalogo.fotos: o dono e o gerente) que nenhuma foto registrada usa (nem as substituídas, que são histórico) e que
--     foram enviados há mais de um dia (o envio em andamento não entra); até 500, os mais antigos primeiro, com o total e
--     o tamanho. Quem não envia fotos em rede nenhuma: recusa (42501);
--   * public.fotos_sem_registro_limpar(caminhos): confere de novo cada caminho, tudo ou nada (um que não possa ser
--     apagado por quem pede recusa o pedido inteiro, P0002), registra a limpeza na auditoria (quem, quando, quantos e
--     quais) e devolve os caminhos; quem apaga é a API do Storage, como a pessoa logada (apagar a linha pelo SQL deixaria
--     o arquivo no armazenamento);
--   * a política produtos_fotos_limpar em storage.objects: apagar só o arquivo do bucket "produtos" da rede em que a
--     pessoa envia fotos, enviado há mais de um dia e sem foto registrada, conferido por privado.foto_registrada (que
--     não depende do que a pessoa enxerga das fotos).
-- A foto registrada nunca é apagada por aqui, nem a substituída. Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create or replace function privado.foto_registrada(p_caminho text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.fotos_produto f where f.caminho = p_caminho);
$$;
revoke all on function privado.foto_registrada(text) from public, anon;
grant execute on function privado.foto_registrada(text) to authenticated;

create policy produtos_fotos_limpar on storage.objects for delete to authenticated
  using (bucket_id = 'produtos'
         and (storage.foldername(name))[1] in (select o::text from privado.organizacoes_que_enviam_fotos() as o)
         and created_at < now() - interval '1 day'
         and not privado.foto_registrada(name));

-- -----------------------------------------------------------------------------
-- Os arquivos sem registro: listar e pedir a limpeza
-- -----------------------------------------------------------------------------
create or replace function public.fotos_sem_registro()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resultado jsonb;
begin
  if not exists (select 1 from privado.organizacoes_que_enviam_fotos()) then
    raise exception 'Só quem envia fotos do catálogo vê os arquivos sem registro' using errcode = '42501';
  end if;
  with soltos as (
    select o.name as caminho, coalesce((o.metadata ->> 'size')::bigint, 0) as bytes, o.created_at as enviado_em
    from storage.objects o
    where o.bucket_id = 'produtos'
      and (storage.foldername(o.name))[1] in (select r::text from privado.organizacoes_que_enviam_fotos() as r)
      and o.created_at < now() - interval '1 day'
      and not exists (select 1 from public.fotos_produto f where f.caminho = o.name)
  )
  select jsonb_build_object(
    'quantos', (select count(*) from soltos),
    'bytes', (select coalesce(sum(s.bytes), 0) from soltos s),
    'arquivos', coalesce((
      select jsonb_agg(jsonb_build_object('caminho', x.caminho, 'bytes', x.bytes, 'enviado_em', x.enviado_em) order by x.enviado_em, x.caminho)
      from (select s.* from soltos s order by s.enviado_em, s.caminho limit 500) x), '[]'::jsonb)
  ) into resultado;
  return resultado;
end;
$$;

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
  v_org text;
begin
  if not exists (select 1 from privado.organizacoes_que_enviam_fotos()) then
    raise exception 'Só quem envia fotos do catálogo limpa os arquivos sem registro' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct c), '{}') into v_pedidos from unnest(coalesce(p_caminhos, '{}')) c where c is not null;
  if cardinality(v_pedidos) = 0 or cardinality(v_pedidos) > 500 then
    raise exception 'Informe de 1 a 500 arquivos' using errcode = '22023';
  end if;
  select coalesce(array_agg(o.name order by o.name), '{}') into v_validos
  from storage.objects o
  where o.bucket_id = 'produtos' and o.name = any (v_pedidos)
    and (storage.foldername(o.name))[1] in (select r::text from privado.organizacoes_que_enviam_fotos() as r)
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.fotos_produto f where f.caminho = o.name);
  if cardinality(v_validos) <> cardinality(v_pedidos) then
    raise exception 'Arquivo sem registro não encontrado para você (ou já registrado, ou enviado há menos de um dia)' using errcode = 'P0002';
  end if;
  for v_org in select distinct (storage.foldername(c))[1] from unnest(v_validos) c loop
    insert into public.auditoria (usuario_id, organizacao_id, acao, alvo_tipo, alvo_id, depois, motivo, origem)
    values ((select auth.uid()), v_org::uuid, 'storage.fotos_sem_registro_limpas', 'storage.objects', 'produtos',
            jsonb_build_object('quantos', (select count(*) from unnest(v_validos) c where (storage.foldername(c))[1] = v_org),
                               'caminhos', (select jsonb_agg(c order by c) from unnest(v_validos) c where (storage.foldername(c))[1] = v_org)),
            'Limpeza das fotos enviadas sem registro', 'aplicacao');
  end loop;
  return jsonb_build_object('caminhos', to_jsonb(v_validos));
end;
$$;

revoke all on function public.fotos_sem_registro(), public.fotos_sem_registro_limpar(text[]) from public, anon;
grant execute on function public.fotos_sem_registro(), public.fotos_sem_registro_limpar(text[]) to authenticated;
