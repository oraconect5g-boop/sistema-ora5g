-- Reversão de 20261116102346_limpeza_das_fotos_protocolo (lote INTEG-b): o registro, a limpeza e a política do Storage
-- voltam às versões de antes (sem a separação), a conclusão sai e a tabela das separações sai.

drop function if exists public.fotos_limpeza_concluir(text[]);

-- public.fotos_sem_registro_limpar: de volta à de 20261115142547_limpeza_das_fotos.sql.
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

-- public.registrar_foto: de volta à de 20261109191416_fotos_idempotentes_lote3.sql.
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

drop policy produtos_fotos_limpar on storage.objects;
create policy produtos_fotos_limpar on storage.objects for delete to authenticated
  using (bucket_id = 'produtos'
         and (storage.foldername(name))[1] in (select o::text from privado.organizacoes_que_enviam_fotos() as o)
         and created_at < now() - interval '1 day'
         and not privado.foto_registrada(name));

drop function if exists privado.foto_separada_para_limpeza(text);
drop table if exists privado.fotos_em_limpeza;
