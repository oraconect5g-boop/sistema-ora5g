-- =============================================================================
-- CONNECT-d, a correção da primeira leitura de verdade (24/11/2026, 23:17): a lista geral da Nogle (GET /linhas/estoque)
-- traz o estoque virgem INTEIRO da MVNO, inclusive os chips que já estão nos PDVs (693 = 370 nos PDVs + 323 sem PDV). A
-- função de 20261125015559_estoque_de_chips_da_nogle tratava a lista como "o que está sem PDV": (1) a contagem "sem PDV"
-- da leitura saía como o total (470 físicos e 223 eSIM, quando eram 323 chips ao todo); (2) se a leitura de um PDV
-- falhasse, a lista geral levaria os chips dele para "sem PDV" e a loja apareceria vazia, contra a regra de que o PDV que
-- falhou fica como estava. Agora os PDVs que responderam são gravados primeiro, e a lista geral só acrescenta o que não
-- está em nenhum PDV. A forma da leitura, as tabelas e as permissões não mudam. O corpo de antes foi conferido no
-- ora5g-dev (o md5 do prosrc igual ao da migration de origem) antes desta troca.
-- Reversão: supabase/reversao/<mesmo nome>.sql (a função de antes).
-- =============================================================================

-- p_leitura = { pdvs: [{ id, nome, cidade, uf, estoque_minimo }], mvno: [{ iccid, tipo }] | null,
--               estoques: [{ pdv, chips: [{ iccid, tipo, repassado_em }] }], falhas }
-- A lista dos PDVs vem sempre (sem ela o worker não grava nada). A MVNO nula e o PDV fora de "estoques" são os que
-- falharam na leitura: o estoque deles fica como estava. A lista da MVNO traz o estoque virgem inteiro, inclusive o que já
-- está nos PDVs: o chip de um PDV fica nele, e fica "sem PDV" só o que não está em nenhum.
create or replace function public.connect_worker_gravar_estoque(p_organizacao uuid, p_leitura jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pdvs jsonb := p_leitura -> 'pdvs';
  v_mvno jsonb := p_leitura -> 'mvno';
  v_estoques jsonb := p_leitura -> 'estoques';
  v_falhas int;
  v_estoque jsonb;
  v_pdv int;
  v_lidos int := 0;
  v_numero bigint;
  v_mvno_fisicos int;
  v_mvno_esims int;
begin
  if p_organizacao is null or not exists (select 1 from public.organizacoes o where o.id = p_organizacao) then
    raise exception 'Rede desconhecida' using errcode = '22023';
  end if;
  if p_leitura is null or jsonb_typeof(p_leitura) <> 'object'
     or jsonb_typeof(v_pdvs) is distinct from 'array' or jsonb_array_length(v_pdvs) not between 1 and 2000
     or jsonb_typeof(v_estoques) is distinct from 'array' or jsonb_array_length(v_estoques) > 2000
     or (v_mvno is not null and jsonb_typeof(v_mvno) not in ('array', 'null'))
     or coalesce(p_leitura ->> 'falhas', '0') !~ '^[0-9]{1,6}$' then
    raise exception 'Leitura do estoque da Nogle em formato inválido' using errcode = '22023';
  end if;
  v_falhas := coalesce(p_leitura ->> 'falhas', '0')::int;
  if exists (select 1 from jsonb_array_elements(v_pdvs) e
             where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'id', '') !~ '^[1-9][0-9]{0,8}$'
                or length(trim(coalesce(e ->> 'nome', ''))) not between 1 and 120
                or coalesce(trim(e ->> 'uf'), '') !~ '^([A-Z]{2})?$'
                or coalesce(e ->> 'estoque_minimo', '') !~ '^([0-9]{1,5})?$')
     or (select count(distinct e ->> 'id') <> count(*) from jsonb_array_elements(v_pdvs) e) then
    raise exception 'PDV da Nogle em formato inválido' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_mvno) = 'array' then v_mvno else '[]'::jsonb end) c
             where jsonb_typeof(c) <> 'object' or coalesce(c ->> 'iccid', '') !~ '^89[0-9]{17,18}$'
                or coalesce(c ->> 'tipo', '') not in ('fisico', 'esim'))
     or exists (select 1 from jsonb_array_elements(v_estoques) e
                where jsonb_typeof(e) <> 'object' or coalesce(e ->> 'pdv', '') !~ '^[1-9][0-9]{0,8}$'
                   or jsonb_typeof(e -> 'chips') is distinct from 'array'
                   or not exists (select 1 from jsonb_array_elements(v_pdvs) p where p ->> 'id' = e ->> 'pdv')
                   or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(e -> 'chips') = 'array' then e -> 'chips' else '[]'::jsonb end) c
                              where jsonb_typeof(c) <> 'object' or coalesce(c ->> 'iccid', '') !~ '^89[0-9]{17,18}$'
                                 or coalesce(c ->> 'tipo', '') not in ('fisico', 'esim')
                                 or coalesce(c ->> 'repassado_em', '') !~ '^([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?)?$'))
     or (select count(distinct e ->> 'pdv') <> count(*) from jsonb_array_elements(v_estoques) e) then
    raise exception 'Chip da Nogle em formato inválido' using errcode = '22023';
  end if;

  -- Uma leitura por vez na rede.
  perform pg_advisory_xact_lock(privado.trava_da_chave('connect_chips_nogle', p_organizacao, 'leitura'));

  -- Os PDVs: o que a Nogle listou fica ativo, com o nome, a cidade, a UF e o estoque mínimo de agora; o que sumiu da
  -- lista fica inativo (a ligação com a loja continua, para voltar como estava).
  insert into public.connect_pdvs (organizacao_id, pdv_id, nome, cidade, uf, estoque_minimo, ativo, visto_em)
  select p_organizacao, (e ->> 'id')::int, left(trim(e ->> 'nome'), 120), left(nullif(trim(e ->> 'cidade'), ''), 80),
         nullif(trim(e ->> 'uf'), ''), nullif(e ->> 'estoque_minimo', '')::int, true, now()
  from jsonb_array_elements(v_pdvs) e
  on conflict (organizacao_id, pdv_id) do update
    set nome = excluded.nome, cidade = excluded.cidade, uf = excluded.uf, estoque_minimo = excluded.estoque_minimo,
        ativo = true, visto_em = excluded.visto_em;
  update public.connect_pdvs p set ativo = false
  where p.organizacao_id = p_organizacao and p.ativo
    and not exists (select 1 from jsonb_array_elements(v_pdvs) e where (e ->> 'id')::int = p.pdv_id);

  -- O estoque de cada PDV que respondeu, antes da lista da MVNO (o chip que está num PDV fica nele).
  for v_estoque in select e from jsonb_array_elements(v_estoques) e loop
    v_pdv := (v_estoque ->> 'pdv')::int;
    delete from public.connect_chips_nogle c where c.organizacao_id = p_organizacao and c.pdv_id = v_pdv;
    insert into public.connect_chips_nogle (organizacao_id, iccid, pdv_id, tipo, repassado_em, lido_em)
    select distinct on (c ->> 'iccid') p_organizacao, c ->> 'iccid', v_pdv, c ->> 'tipo',
           nullif(c ->> 'repassado_em', '')::timestamp, now()
    from jsonb_array_elements(v_estoque -> 'chips') c
    on conflict (organizacao_id, iccid) do update
      set pdv_id = excluded.pdv_id, tipo = excluded.tipo, repassado_em = excluded.repassado_em, lido_em = excluded.lido_em;
    update public.connect_pdvs p set estoque_lido_em = now() where p.organizacao_id = p_organizacao and p.pdv_id = v_pdv;
    v_lidos := v_lidos + 1;
  end loop;

  -- O estoque sem PDV, quando a lista da MVNO foi lida. A lista traz o estoque virgem INTEIRO da MVNO, inclusive o que já
  -- está nos PDVs (a primeira leitura de verdade, 24/11: 693 = 370 nos PDVs + 323 sem PDV): o chip que já está num PDV
  -- fica nele (o do PDV que falhou, como estava); fica "sem PDV" só o que não está em nenhum.
  if jsonb_typeof(v_mvno) = 'array' then
    delete from public.connect_chips_nogle c where c.organizacao_id = p_organizacao and c.pdv_id is null;
    insert into public.connect_chips_nogle (organizacao_id, iccid, pdv_id, tipo, repassado_em, lido_em)
    select distinct on (c ->> 'iccid') p_organizacao, c ->> 'iccid', null, c ->> 'tipo', null, now()
    from jsonb_array_elements(v_mvno) c
    on conflict (organizacao_id, iccid) do nothing;
    select count(*) filter (where c.tipo = 'fisico'), count(*) filter (where c.tipo = 'esim')
    into v_mvno_fisicos, v_mvno_esims
    from public.connect_chips_nogle c where c.organizacao_id = p_organizacao and c.pdv_id is null;
  end if;

  -- As contagens de cada PDV, de novo (um chip pode ter passado de um PDV que falhou para outro que respondeu).
  update public.connect_pdvs p
  set fisicos = c.fisicos, esims = c.esims
  from (select pp.pdv_id,
               (count(cc.iccid) filter (where cc.tipo = 'fisico'))::int as fisicos,
               (count(cc.iccid) filter (where cc.tipo = 'esim'))::int as esims
        from public.connect_pdvs pp
        left join public.connect_chips_nogle cc on cc.organizacao_id = pp.organizacao_id and cc.pdv_id = pp.pdv_id
        where pp.organizacao_id = p_organizacao
        group by pp.pdv_id) c
  where p.organizacao_id = p_organizacao and p.pdv_id = c.pdv_id
    and (p.fisicos <> c.fisicos or p.esims <> c.esims);

  insert into public.connect_leituras_nogle (organizacao_id, pdvs, pdvs_lidos, mvno_fisicos, mvno_esims, falhas)
  values (p_organizacao, jsonb_array_length(v_pdvs), v_lidos, v_mvno_fisicos, v_mvno_esims, v_falhas)
  returning numero into v_numero;
  return jsonb_build_object(
    'numero', v_numero,
    'pdvs', jsonb_array_length(v_pdvs),
    'pdvs_lidos', v_lidos,
    'chips', (select count(*) from public.connect_chips_nogle c where c.organizacao_id = p_organizacao),
    'falhas', v_falhas);
end;
$$;
revoke all on function public.connect_worker_gravar_estoque(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.connect_worker_gravar_estoque(uuid, jsonb) to service_role;
