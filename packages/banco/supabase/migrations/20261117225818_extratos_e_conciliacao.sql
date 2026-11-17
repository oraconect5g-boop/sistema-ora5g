-- =============================================================================
-- Lote EXT-a (plano do proprietário de 16/11, Onda 3, item E3 "Extratos", a parte que não depende do arquivo real;
-- ORA-PAY-009, ORA-PAY-010 e ORA-FIN-006, e partes de ORA-PAY-003, ORA-PAY-011, ORA-FIN-001 e ORA-REPORT-005).
-- Decisão: ADR-016.
--
-- O extrato da maquininha (PicPay, PagBank) ou do banco entra por arquivo. A tela lê o arquivo (CSV, Excel ou OFX), a
-- pessoa diz qual coluna é cada campo (nada é suposto do formato de um provedor) e o banco grava as linhas. Depois, o
-- banco sugere o pagamento de cada linha, e a pessoa concilia: uma linha por vez ou todas as sugestões certas de uma vez.
-- A conciliação é a de sempre (public.pagamento_conciliar, do L7a): a referência, o valor líquido e a data em que o
-- dinheiro caiu, agora tirados da linha do extrato.
--
--   * public.extratos: o arquivo importado (a loja, ou a rede para a conta do banco; o tipo; a fonte; os meios de
--     pagamento que ele cobre, como Pix PicPay e cartão PicPay; o período; a impressão digital SHA-256, que não deixa
--     importar o mesmo arquivo duas vezes; quem importou e quando);
--   * public.extrato_linhas: cada linha (o valor, com sinal: o negativo é estorno, chargeback ou saída; a taxa e o
--     líquido, quando o arquivo traz; a data do movimento e a do repasse; a referência, o terminal e a descrição) e a
--     situação (pendente, conciliada com um pagamento, ou ignorada com motivo);
--   * public.extrato_importar: grava o extrato e as linhas, com as regras de cada campo; o mesmo arquivo devolve o mesmo
--     extrato. A loja: quem concilia pagamentos nela (pagamento.conciliar). A rede (sem loja, para o extrato do banco):
--     quem concilia pela rede inteira;
--   * public.extratos_recentes: a lista dos extratos de quem concilia, com as linhas por situação;
--   * public.extrato_sugestoes: para cada linha de crédito pendente, os pagamentos confirmados e ainda não conciliados
--     de um dos meios do extrato, com o mesmo valor bruto, da venda concluída até um dia antes ou depois da data da
--     linha, da loja do extrato e da maquininha da linha (quando os dois dizem); a referência igual ao comprovante vem
--     primeiro;
--   * public.extrato_conciliar: concilia a linha com o pagamento (o dinheiro tem de ter caído: a data do repasse até
--     hoje); public.extrato_conciliar_certas: todas as linhas com uma sugestão só, que não é sugestão de outra linha;
--   * public.extrato_ignorar e public.extrato_desfazer: tiram a linha da conta (com motivo) ou desfazem a conciliação;
--     a conciliação desfeita na tela da conciliação também devolve a linha para pendente (gatilho);
--   * public.extrato_resumo: os créditos, os débitos (estornos, chargebacks e saídas), as taxas, o líquido, o que ainda
--     vai cair (repasse futuro) e as linhas por situação.
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

create table public.extratos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  organizacao_id uuid not null references public.organizacoes (id),
  unidade_id uuid,
  tipo text not null check (tipo in ('maquininha', 'banco')),
  fonte text not null check (length(fonte) between 2 and 80 and fonte = btrim(fonte)),
  meios text[] not null check (cardinality(meios) between 1 and 4 and array_position(meios, null) is null),
  arquivo text not null check (length(arquivo) between 1 and 200),
  impressao text not null check (impressao ~ '^[0-9a-f]{64}$'),
  periodo_inicio date not null,
  periodo_fim date not null,
  linhas int not null check (linhas between 1 and 5000),
  mapeamento jsonb not null default '{}'::jsonb check (jsonb_typeof(mapeamento) = 'object'),
  importado_por uuid not null references public.perfis_usuario (id),
  importado_em timestamptz not null default now(),
  foreign key (unidade_id, organizacao_id) references public.unidades (id, organizacao_id),
  unique (organizacao_id, impressao),
  constraint extrato_periodo check (periodo_fim >= periodo_inicio)
);
comment on table public.extratos is
  'EXT-a: o extrato da maquininha ou do banco importado por arquivo (ADR-016); a loja, ou a rede para a conta do banco.';
create index extratos_unidade on public.extratos (unidade_id, organizacao_id);
create index extratos_organizacao on public.extratos (organizacao_id, importado_em desc);
create index extratos_importado_por on public.extratos (importado_por);
create trigger extratos_auditar after insert on public.extratos
  for each row execute function privado.auditar_mudanca();

create table public.extrato_linhas (
  id uuid primary key default gen_random_uuid(),
  extrato_id uuid not null references public.extratos (id),
  organizacao_id uuid not null references public.organizacoes (id),
  numero int not null check (numero between 1 and 999999),
  data date not null,
  valor_centavos bigint not null check (valor_centavos <> 0 and abs(valor_centavos) <= 100000000000),
  taxa_centavos bigint check (taxa_centavos is null or taxa_centavos between 0 and 100000000000),
  liquido_centavos bigint check (liquido_centavos is null or abs(liquido_centavos) <= 100000000000),
  data_liquidacao date,
  referencia text check (referencia is null or (length(referencia) between 1 and 80 and referencia = btrim(referencia))),
  terminal text check (terminal is null or (length(terminal) between 1 and 40 and terminal = btrim(terminal))),
  descricao text check (descricao is null or (length(descricao) between 1 and 200 and descricao = btrim(descricao))),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'conciliada', 'ignorada')),
  pagamento_id uuid references public.venda_pagamentos (id),
  decidida_por uuid references public.perfis_usuario (id),
  decidida_em timestamptz,
  motivo text check (motivo is null or length(motivo) between 3 and 200),
  unique (extrato_id, numero),
  constraint linha_conciliada_tem_pagamento check ((situacao = 'conciliada') = (pagamento_id is not null)),
  constraint linha_decidida check ((situacao = 'pendente') = (decidida_em is null) and (decidida_em is null) = (decidida_por is null)),
  constraint linha_ignorada_tem_motivo check ((situacao = 'ignorada') = (motivo is not null))
);
comment on table public.extrato_linhas is
  'EXT-a: as linhas do extrato importado (ADR-016); o valor com sinal (negativo: estorno, chargeback ou saída) e a conciliação com o pagamento.';
create index extrato_linhas_organizacao on public.extrato_linhas (organizacao_id);
create index extrato_linhas_pagamento on public.extrato_linhas (pagamento_id);
create index extrato_linhas_decidida_por on public.extrato_linhas (decidida_por);
-- Um pagamento conciliado por uma linha só.
create unique index extrato_linhas_um_pagamento on public.extrato_linhas (pagamento_id) where situacao = 'conciliada';
create trigger extrato_linhas_auditar after update on public.extrato_linhas
  for each row execute function privado.auditar_mudanca();

-- Quem vê e mexe no extrato: o da loja, quem concilia pagamentos nela; o da rede, quem concilia pela rede inteira.
create or replace function privado.extrato_e_meu(p_organizacao uuid, p_unidade uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_unidade is null then p_organizacao in (select privado.organizacoes_com_permissao('pagamento.conciliar'))
    else (select public.tem_permissao('pagamento.conciliar', p_unidade))
  end;
$$;
revoke all on function privado.extrato_e_meu(uuid, uuid) from public, anon;
grant execute on function privado.extrato_e_meu(uuid, uuid) to authenticated;

alter table public.extratos enable row level security;
alter table public.extrato_linhas enable row level security;
revoke all on public.extratos, public.extrato_linhas from anon, authenticated;
revoke all on sequence public.extratos_numero_seq from anon, authenticated;
grant select on public.extratos, public.extrato_linhas to authenticated;
create policy extratos_ler on public.extratos for select to authenticated
  using ((select privado.extrato_e_meu(organizacao_id, unidade_id)));
create policy extrato_linhas_ler on public.extrato_linhas for select to authenticated
  using (exists (select 1 from public.extratos e where e.id = extrato_id));

-- -----------------------------------------------------------------------------
-- A importação
-- -----------------------------------------------------------------------------
create or replace function public.extrato_importar(
  p_unidade uuid, p_tipo text, p_fonte text, p_meios text[], p_arquivo text, p_impressao text, p_linhas jsonb, p_mapeamento jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  organizacao uuid;
  v_fonte text := regexp_replace(btrim(coalesce(p_fonte, '')), '\s+', ' ', 'g');
  v_arquivo text := left(btrim(coalesce(p_arquivo, '')), 200);
  v_meios text[] := (select array_agg(distinct m order by m) from unnest(p_meios) m);
  existente public.extratos;
  v_extrato public.extratos;
  invalidas int;
begin
  if p_unidade is null then
    select u.organizacao_id into organizacao from public.unidades u where u.id = (select public.unidade_atual());
  else
    select u.organizacao_id into organizacao from public.unidades u where u.id = p_unidade;
  end if;
  if usuario is null or organizacao is null or not (select privado.extrato_e_meu(organizacao, p_unidade)) then
    raise exception 'Sem permissão para conciliar pagamentos aqui' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('maquininha', 'banco') or length(v_fonte) not between 2 and 80
     or length(v_arquivo) = 0 or coalesce(p_impressao, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Extrato inválido' using errcode = '22023';
  end if;
  -- Os meios que o extrato cobre: cartão e Pix (os que se conciliam), ao menos um.
  if v_meios is null or exists (select 1 from unnest(v_meios) m where m is null or not privado.meio_liquidavel(m)) then
    raise exception 'Escolha os meios de pagamento do extrato: Pix ou cartão' using errcode = '22023';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) not between 1 and 5000 then
    raise exception 'O extrato leva de 1 a 5.000 linhas' using errcode = '22023';
  end if;
  -- O mesmo arquivo (a mesma impressão digital) devolve o mesmo extrato.
  perform pg_advisory_xact_lock(privado.trava_da_chave('extratos', organizacao, p_impressao));
  select * into existente from public.extratos e where e.organizacao_id = organizacao and e.impressao = p_impressao;
  if found then
    if existente.unidade_id is distinct from p_unidade then
      raise exception 'Este arquivo já foi importado em outro lugar (outra loja ou a rede)' using errcode = '22023';
    end if;
    return jsonb_build_object('extrato', existente.id, 'numero', existente.numero, 'linhas', existente.linhas, 'repetido', true);
  end if;
  -- Cada linha: número, data, valor com sinal (diferente de zero) e os opcionais no formato.
  select count(*) into invalidas
  from jsonb_array_elements(p_linhas) l
  where jsonb_typeof(l) <> 'object'
     or coalesce(l ->> 'numero', '') !~ '^[1-9][0-9]{0,5}$'
     or coalesce(l ->> 'data', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or coalesce(l ->> 'valor', '') !~ '^-?[1-9][0-9]{0,11}$'
     or (l ? 'taxa' and l ->> 'taxa' is not null and l ->> 'taxa' !~ '^[0-9]{1,12}$')
     or (l ? 'liquido' and l ->> 'liquido' is not null and l ->> 'liquido' !~ '^-?[0-9]{1,12}$')
     or (l ? 'data_liquidacao' and l ->> 'data_liquidacao' is not null and l ->> 'data_liquidacao' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
     or length(coalesce(l ->> 'referencia', '')) > 80 or length(coalesce(l ->> 'terminal', '')) > 40
     or length(coalesce(l ->> 'descricao', '')) > 200;
  if invalidas > 0 then
    raise exception 'Linha do extrato fora do formato' using errcode = '22023';
  end if;
  if (select count(distinct (l ->> 'numero')::int) from jsonb_array_elements(p_linhas) l) <> jsonb_array_length(p_linhas) then
    raise exception 'Linha repetida no extrato' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Extrato importado: ' || v_fonte, true);
  insert into public.extratos (organizacao_id, unidade_id, tipo, fonte, meios, arquivo, impressao, periodo_inicio, periodo_fim, linhas,
    mapeamento, importado_por)
  select organizacao, p_unidade, p_tipo, v_fonte, v_meios, v_arquivo, p_impressao, min((l ->> 'data')::date), max((l ->> 'data')::date),
    jsonb_array_length(p_linhas), case when jsonb_typeof(p_mapeamento) = 'object' then p_mapeamento else '{}'::jsonb end, usuario
  from jsonb_array_elements(p_linhas) l
  returning * into v_extrato;
  insert into public.extrato_linhas (extrato_id, organizacao_id, numero, data, valor_centavos, taxa_centavos, liquido_centavos,
    data_liquidacao, referencia, terminal, descricao)
  select v_extrato.id, organizacao, (l ->> 'numero')::int, (l ->> 'data')::date, (l ->> 'valor')::bigint,
    nullif(l ->> 'taxa', '')::bigint, nullif(l ->> 'liquido', '')::bigint, nullif(l ->> 'data_liquidacao', '')::date,
    nullif(btrim(regexp_replace(coalesce(l ->> 'referencia', ''), '\s+', ' ', 'g')), ''),
    nullif(btrim(regexp_replace(coalesce(l ->> 'terminal', ''), '\s+', ' ', 'g')), ''),
    nullif(btrim(regexp_replace(coalesce(l ->> 'descricao', ''), '\s+', ' ', 'g')), '')
  from jsonb_array_elements(p_linhas) l;
  return jsonb_build_object('extrato', v_extrato.id, 'numero', v_extrato.numero, 'linhas', v_extrato.linhas, 'repetido', false);
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Data fora do calendário no extrato' using errcode = '22023';
end;
$$;

-- A lista dos extratos de quem concilia (os das lojas dela e, para quem concilia pela rede, os da rede), com as linhas
-- por situação; os mais recentes primeiro.
create or replace function public.extratos_recentes(p_limite int)
returns table (id uuid, numero bigint, unidade_id uuid, loja text, tipo text, fonte text, arquivo text, periodo_inicio date,
  periodo_fim date, linhas int, importado_em timestamptz, pendentes bigint, conciliadas bigint, ignoradas bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with meus as (
    select e.* from public.extratos e
    where e.organizacao_id in (select v.organizacao_id from privado.vinculos_vigentes() v)
      and privado.extrato_e_meu(e.organizacao_id, e.unidade_id)
    order by e.importado_em desc
    limit least(greatest(coalesce(p_limite, 50), 1), 200)
  )
  select m.id, m.numero, m.unidade_id, u.nome, m.tipo, m.fonte, m.arquivo, m.periodo_inicio, m.periodo_fim, m.linhas, m.importado_em,
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'pendente'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'conciliada'),
    (select count(*) from public.extrato_linhas l where l.extrato_id = m.id and l.situacao = 'ignorada')
  from meus m
  left join public.unidades u on u.id = m.unidade_id
  order by m.importado_em desc;
$$;

-- -----------------------------------------------------------------------------
-- As sugestões e a conciliação
-- -----------------------------------------------------------------------------
create or replace function public.extrato_sugestoes(p_extrato uuid)
returns table (linha_id uuid, pagamento_id uuid, venda_numero bigint, meio text, valor_centavos bigint, concluida_em timestamptz,
  loja text, terminal text, pela_referencia boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  e public.extratos;
begin
  select * into e from public.extratos x where x.id = p_extrato;
  if not found or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Extrato não encontrado para você' using errcode = '42501';
  end if;
  return query
  select l.id, p.id, v.numero, p.meio, p.valor_centavos, v.concluida_em, u.nome, t.identificador,
    (l.referencia is not null and p.comprovante is not null and l.referencia = btrim(p.comprovante))
  from public.extrato_linhas l
  join public.venda_pagamentos p on p.valor_centavos = l.valor_centavos
  join public.vendas v on v.id = p.venda_id
  join public.unidades u on u.id = v.unidade_id
  left join public.terminais t on t.id = p.terminal_id
  where l.extrato_id = e.id and l.situacao = 'pendente' and l.valor_centavos > 0
    and v.organizacao_id = e.organizacao_id and (e.unidade_id is null or v.unidade_id = e.unidade_id)
    and v.unidade_id in (select privado.unidades_com_permissao('pagamento.conciliar'))
    and p.meio = any (e.meios) and p.situacao = 'confirmado' and p.conciliado_em is null
    and v.situacao = 'concluida'
    and (v.concluida_em at time zone 'America/Sao_Paulo')::date between l.data - 1 and l.data + 1
    and (l.terminal is null or t.identificador is null or t.identificador = l.terminal)
    and not exists (select 1 from public.extrato_linhas o where o.pagamento_id = p.id and o.situacao = 'conciliada')
  order by l.numero, (l.referencia is not null and p.comprovante is not null and l.referencia = btrim(p.comprovante)) desc, v.concluida_em;
end;
$$;

create or replace function public.extrato_conciliar(p_linha uuid, p_pagamento uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.extrato_linhas;
  e public.extratos;
  v_venda public.vendas;
  v_pagamento public.venda_pagamentos;
  v_data date;
  v_liquido bigint;
begin
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  select * into v_pagamento from public.venda_pagamentos p where p.id = p_pagamento;
  select * into v_venda from public.vendas v where v.id = v_pagamento.venda_id;
  if v_pagamento.id is null or v_venda.organizacao_id <> e.organizacao_id or (e.unidade_id is not null and v_venda.unidade_id <> e.unidade_id)
     or not (select public.tem_permissao('pagamento.conciliar', v_venda.unidade_id)) then
    raise exception 'Pagamento não encontrado para você' using errcode = '42501';
  end if;
  if l.situacao = 'conciliada' and l.pagamento_id = p_pagamento then
    return jsonb_build_object('conciliada', true, 'repetida', true);
  end if;
  if l.situacao <> 'pendente' then
    raise exception 'Esta linha do extrato já foi decidida: desfaça antes' using errcode = '22023';
  end if;
  if not (v_pagamento.meio = any (e.meios)) then
    raise exception 'Este pagamento não é de um meio deste extrato' using errcode = '22023';
  end if;
  if l.valor_centavos <> v_pagamento.valor_centavos then
    raise exception 'O valor da linha não é o do pagamento' using errcode = '22023';
  end if;
  if exists (select 1 from public.extrato_linhas o where o.pagamento_id = p_pagamento and o.situacao = 'conciliada' and o.id <> l.id) then
    raise exception 'Este pagamento já está conciliado com outra linha de extrato' using errcode = '22023';
  end if;
  -- A data em que o dinheiro caiu: a do repasse (ou a da linha), nunca antes do dia da venda.
  v_data := greatest(coalesce(l.data_liquidacao, l.data), (v_venda.concluida_em at time zone 'America/Sao_Paulo')::date);
  if v_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O dinheiro desta linha ainda não caiu: concilie no dia do repasse' using errcode = '22023';
  end if;
  v_liquido := coalesce(l.liquido_centavos, l.valor_centavos - coalesce(l.taxa_centavos, 0));
  -- A conciliação de sempre (L7a), com a referência (a da linha, ou o número do extrato e da linha), o líquido e a data.
  perform public.pagamento_conciliar(p_pagamento,
    case when length(l.referencia) >= 3 then l.referencia else format('Extrato %s, linha %s', e.numero, l.numero) end, v_liquido, v_data);
  update public.extrato_linhas x set situacao = 'conciliada', pagamento_id = p_pagamento, decidida_por = (select auth.uid()), decidida_em = now()
  where x.id = l.id;
  return jsonb_build_object('conciliada', true, 'repetida', false);
end;
$$;

create or replace function public.extrato_conciliar_certas(p_extrato uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s record;
  conciliadas int := 0;
begin
  for s in
    with sugestoes as (select * from public.extrato_sugestoes(p_extrato)),
    por_linha as (select x.linha_id, count(*) as n from sugestoes x group by x.linha_id),
    por_pagamento as (select x.pagamento_id, count(*) as n from sugestoes x group by x.pagamento_id)
    select x.linha_id, x.pagamento_id
    from sugestoes x
    join por_linha pl on pl.linha_id = x.linha_id and pl.n = 1
    join por_pagamento pp on pp.pagamento_id = x.pagamento_id and pp.n = 1
    join public.extrato_linhas l on l.id = x.linha_id
    where coalesce(l.data_liquidacao, l.data) <= (now() at time zone 'America/Sao_Paulo')::date
  loop
    perform public.extrato_conciliar(s.linha_id, s.pagamento_id);
    conciliadas := conciliadas + 1;
  end loop;
  return jsonb_build_object('conciliadas', conciliadas);
end;
$$;

create or replace function public.extrato_ignorar(p_linha uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  l public.extrato_linhas;
  e public.extratos;
begin
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  if l.situacao = 'ignorada' then
    return false;
  end if;
  if l.situacao <> 'pendente' then
    raise exception 'Esta linha está conciliada: desfaça antes' using errcode = '22023';
  end if;
  perform set_config('ora.motivo', 'Linha do extrato fora da conta: ' || v_motivo, true);
  update public.extrato_linhas x set situacao = 'ignorada', motivo = left(v_motivo, 200), decidida_por = (select auth.uid()), decidida_em = now()
  where x.id = l.id;
  return true;
end;
$$;

create or replace function public.extrato_desfazer(p_linha uuid, p_motivo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := privado.exigir_motivo(p_motivo);
  l public.extrato_linhas;
  e public.extratos;
  v_unidade uuid;
begin
  select * into l from public.extrato_linhas x where x.id = p_linha for update;
  select * into e from public.extratos x where x.id = l.extrato_id;
  if l.id is null or not (select privado.extrato_e_meu(e.organizacao_id, e.unidade_id)) then
    raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
  end if;
  if l.situacao = 'pendente' then
    return false;
  end if;
  if l.situacao = 'conciliada' then
    select v.unidade_id into v_unidade from public.venda_pagamentos p join public.vendas v on v.id = p.venda_id where p.id = l.pagamento_id;
    if not (select public.tem_permissao('pagamento.conciliar', v_unidade)) then
      raise exception 'Linha do extrato não encontrada para você' using errcode = '42501';
    end if;
    -- A conciliação de sempre desfaz o pagamento, e o gatilho devolve a linha (o update abaixo só pega o que sobrar).
    perform public.pagamento_desconciliar(l.pagamento_id, v_motivo);
  else
    perform set_config('ora.motivo', 'Linha do extrato de volta à conta: ' || v_motivo, true);
  end if;
  update public.extrato_linhas x set situacao = 'pendente', pagamento_id = null, motivo = null, decidida_por = null, decidida_em = null
  where x.id = l.id and x.situacao <> 'pendente';
  return true;
end;
$$;

-- A conciliação desfeita na tela da conciliação (public.pagamento_desconciliar) devolve a linha do extrato para pendente.
create or replace function privado.extrato_linha_de_volta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.extrato_linhas l set situacao = 'pendente', pagamento_id = null, decidida_por = null, decidida_em = null
  where l.pagamento_id = new.id and l.situacao = 'conciliada';
  return null;
end;
$$;
revoke all on function privado.extrato_linha_de_volta() from public, anon, authenticated;
create trigger venda_pagamentos_extrato_de_volta after update of conciliado_em on public.venda_pagamentos
  for each row when (old.conciliado_em is not null and new.conciliado_em is null)
  execute function privado.extrato_linha_de_volta();

-- O resumo do extrato (lido com a permissão de quem pede: o RLS das linhas).
create or replace function public.extrato_resumo(p_extrato uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'creditos', count(*) filter (where l.valor_centavos > 0),
    'creditos_centavos', coalesce(sum(l.valor_centavos) filter (where l.valor_centavos > 0), 0),
    'debitos', count(*) filter (where l.valor_centavos < 0),
    'debitos_centavos', coalesce(sum(-l.valor_centavos) filter (where l.valor_centavos < 0), 0),
    'taxas_centavos', coalesce(sum(l.taxa_centavos), 0),
    'liquido_centavos', coalesce(sum(coalesce(l.liquido_centavos, l.valor_centavos - coalesce(l.taxa_centavos, 0))), 0),
    'a_cair_centavos', coalesce(sum(coalesce(l.liquido_centavos, l.valor_centavos - coalesce(l.taxa_centavos, 0)))
      filter (where l.data_liquidacao > (now() at time zone 'America/Sao_Paulo')::date and l.valor_centavos > 0), 0),
    'pendentes', count(*) filter (where l.situacao = 'pendente'),
    'conciliadas', count(*) filter (where l.situacao = 'conciliada'),
    'ignoradas', count(*) filter (where l.situacao = 'ignorada'))
  from public.extrato_linhas l
  where l.extrato_id = p_extrato;
$$;

revoke all on function public.extrato_importar(uuid, text, text, text[], text, text, jsonb, jsonb), public.extratos_recentes(int), public.extrato_sugestoes(uuid),
  public.extrato_conciliar(uuid, uuid), public.extrato_conciliar_certas(uuid), public.extrato_ignorar(uuid, text),
  public.extrato_desfazer(uuid, text), public.extrato_resumo(uuid) from public, anon;
grant execute on function public.extrato_importar(uuid, text, text, text[], text, text, jsonb, jsonb), public.extratos_recentes(int), public.extrato_sugestoes(uuid),
  public.extrato_conciliar(uuid, uuid), public.extrato_conciliar_certas(uuid), public.extrato_ignorar(uuid, text),
  public.extrato_desfazer(uuid, text), public.extrato_resumo(uuid) to authenticated;