-- =============================================================================
-- Lote QUAL-006a (24/11/2026; ORA-QUAL-006 e ORA-QUAL-013, a parte "o aviso no celular quando há erro do servidor"; a
-- fila integral de 23/11, item 7). Usa o canal do aviso no celular (PWA-b, ADR-014) e o alerta da rede (QUAL-a,
-- ADR-015). Decisão: ADR-015, adendo de 24/11.
--
--   * O site conta os erros do servidor desde o OBS-a (apps/plataforma/src/lib/saude/erros-do-servidor.ts) e agora deixa
--     de fora da conta os pedidos estranhos (malformados ou para um endereço que não existe: robôs que testam o site). A
--     cada minuto, o worker dos avisos, no mesmo servidor e com o segredo dos avisos (nenhum segredo novo), lê a conta
--     num endereço que só responde dentro do servidor (/saude/erros) e a relata aqui. Se o site não responde, relata isso;
--   * privado.erros_do_servidor: uma linha só, com o último relato: desde quando o site conta, quantos erros havia,
--     quantos ainda esperam o alerta (a publicação recomeça a conta do site, não a dos que esperam), o erro mais recente
--     (a hora e o molde da rota), desde quando o site não responde, quando saiu cada alerta, e as duas regras;
--   * public.erros_do_servidor_relatar(segredo, relato): os erros novos viram um alerta da rede, no máximo um a cada hora
--     (o que acontece nesse meio vai no próximo: nada se perde); o site sem responder por 5 minutos vira "O site não
--     responde" (de novo a cada hora, enquanto durar) e, quando ele volta, "O site voltou". Vai para cada rede ativa,
--     para quem gere as lojas pela rede inteira (unidades.gerir: o dono e o administrador), que é quem vê os erros na
--     Saúde da operação. As duas regras (a hora e os 5 minutos) mudam com um update, sem migration;
--   * public.erros_do_servidor_situacao(): a Saúde da operação mostra quando o worker conferiu o site pela última vez e
--     quando saiu o último alerta; só para quem recebe o alerta;
--   * privado.avisos aceita a permissão unidades.gerir (no alerta da rede).
-- Reversão: supabase/reversao/<mesmo nome>.sql.
-- =============================================================================

-- 1) O alerta da rede pode ir para quem gere as lojas.
alter table privado.avisos drop constraint avisos_permissao_check;
alter table privado.avisos add constraint avisos_permissao_check
  check (permissao is null or permissao in ('desconto.aprovar', 'nota.aprovar', 'caixa.conferir', 'auditoria.ver', 'unidades.gerir'));

-- 2) O último relato do site e as regras do alerta.
create table privado.erros_do_servidor (
  unica boolean primary key default true check (unica),
  desde timestamptz not null,
  erros int not null default 0 check (erros >= 0),
  pendentes int not null default 0 check (pendentes >= 0),
  ultimo_em timestamptz,
  ultima_rota text check (ultima_rota ~ '^(/[]A-Za-z0-9_./()@[-]{0,160}|\(rota desconhecida\))$'),
  sem_resposta_desde timestamptz,
  relatado_em timestamptz not null default now(),
  alerta_de_erros_em timestamptz,
  alerta_de_fora_em timestamptz,
  alerta_a_cada interval not null default interval '1 hour' check (alerta_a_cada between interval '5 minutes' and interval '1 day'),
  fora_apos interval not null default interval '5 minutes' check (fora_apos between interval '2 minutes' and interval '1 hour'),
  constraint erro_com_rota check ((ultimo_em is null) = (ultima_rota is null))
);
alter table privado.erros_do_servidor enable row level security;
comment on table privado.erros_do_servidor is
  'QUAL-006a: o último relato do site (os erros do servidor e se ele respondeu), que o worker dos avisos faz a cada minuto, e as regras do alerta. Acesso só por public.erros_do_servidor_relatar e public.erros_do_servidor_situacao (RLS ligado, sem política).';
revoke all on privado.erros_do_servidor from public, anon, authenticated;

-- 3) O alerta do servidor: um para cada rede ativa, para quem gere as lojas pela rede inteira. Devolve quantos entraram.
--    Quem segura a repetição é a linha do relato (o alerta a cada hora), não o alvo: cada alerta tem o seu.
create or replace function privado.alerta_do_servidor(p_titulo text, p_corpo text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  quantos int;
begin
  insert into privado.avisos (organizacao_id, unidade_id, tipo, alvo_id, solicitante_id, permissao, titulo, corpo, endereco)
  select o.id, null, 'alerta', gen_random_uuid(), null, 'unidades.gerir', left(p_titulo, 80), left(p_corpo, 160), '/operacao'
  from public.organizacoes o
  where o.status = 'ativa';
  get diagnostics quantos = row_count;
  return quantos;
end;
$$;
revoke all on function privado.alerta_do_servidor(text, text) from public, anon, authenticated;

-- 4) O relato do worker dos avisos, a cada minuto. Devolve quantos alertas entraram na fila.
--    p_relato: {"respondeu": false} ou {"respondeu": true, "desde": instante, "erros": n,
--              "ultimo": {"quando": instante, "rota": molde} ou null}; instante em UTC ("2026-11-24T12:00:00.000Z").
create or replace function public.erros_do_servidor_relatar(p_segredo text, p_relato jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  instante constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$';
  respondeu boolean;
  v_desde timestamptz;
  v_erros int;
  v_ultimo_em timestamptz;
  v_rota text;
  e privado.erros_do_servidor;
  novos int;
  alertas int := 0;
begin
  if not privado.segredo_confere('avisos_no_celular', p_segredo) then
    raise exception 'Segredo dos avisos não confere' using errcode = '42501';
  end if;
  if p_relato is null or jsonb_typeof(p_relato) <> 'object' or coalesce(jsonb_typeof(p_relato -> 'respondeu'), '') <> 'boolean' then
    raise exception 'Relato inválido' using errcode = '22023';
  end if;
  respondeu := (p_relato ->> 'respondeu')::boolean;
  if respondeu then
    if coalesce(p_relato ->> 'desde', '') !~ instante or coalesce(jsonb_typeof(p_relato -> 'erros'), '') <> 'number'
       or coalesce(jsonb_typeof(p_relato -> 'ultimo'), '') not in ('object', 'null')
       or (jsonb_typeof(p_relato -> 'ultimo') = 'object' and (coalesce(p_relato -> 'ultimo' ->> 'quando', '') !~ instante
         or coalesce(jsonb_typeof(p_relato -> 'ultimo' -> 'rota'), '') <> 'string')) then
      raise exception 'Relato inválido' using errcode = '22023';
    end if;
    begin
      v_desde := (p_relato ->> 'desde')::timestamptz;
      v_erros := (p_relato ->> 'erros')::int;
      v_ultimo_em := (p_relato -> 'ultimo' ->> 'quando')::timestamptz;
      v_rota := p_relato -> 'ultimo' ->> 'rota';
    exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
      raise exception 'Relato inválido' using errcode = '22023';
    end;
    if v_erros < 0 or v_desde > now() + interval '5 minutes' or (v_erros > 0) <> (v_ultimo_em is not null)
       or v_ultimo_em < v_desde or v_ultimo_em > now() + interval '5 minutes'
       or v_rota !~ '^(/[]A-Za-z0-9_./()@[-]{0,160}|\(rota desconhecida\))$' then
      raise exception 'Relato inválido' using errcode = '22023';
    end if;
  end if;

  -- A linha única, travada: dois relatos ao mesmo tempo não avisam duas vezes.
  insert into privado.erros_do_servidor (unica, desde) values (true, coalesce(v_desde, now())) on conflict (unica) do nothing;
  select * into e from privado.erros_do_servidor where unica for update;

  if not respondeu then
    e.sem_resposta_desde := coalesce(e.sem_resposta_desde, now());
    if e.sem_resposta_desde <= now() - e.fora_apos
       and (e.alerta_de_fora_em is null or e.alerta_de_fora_em < e.sem_resposta_desde or e.alerta_de_fora_em <= now() - e.alerta_a_cada) then
      alertas := privado.alerta_do_servidor('O site não responde',
        format('O site não responde desde as %s. O servidor tenta religar sozinho a cada 5 minutos.',
          to_char(e.sem_resposta_desde at time zone 'America/Sao_Paulo', 'HH24:MI')));
      e.alerta_de_fora_em := now();
    end if;
    update privado.erros_do_servidor
    set sem_resposta_desde = e.sem_resposta_desde, alerta_de_fora_em = e.alerta_de_fora_em, relatado_em = now()
    where unica;
    return jsonb_build_object('alertas', alertas);
  end if;

  -- O site respondeu. Se ele voltou depois do alerta "O site não responde", avisa que voltou.
  if e.sem_resposta_desde is not null and e.alerta_de_fora_em >= e.sem_resposta_desde then
    alertas := alertas + privado.alerta_do_servidor('O site voltou',
      format('O site voltou a responder às %s (estava sem responder desde as %s).',
        to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI'), to_char(e.sem_resposta_desde at time zone 'America/Sao_Paulo', 'HH24:MI')));
  end if;
  -- Os erros novos: no mesmo processo, os que passaram do último relato; num processo novo (o site reiniciou ou foi
  -- publicado), todos os dele.
  novos := case when v_desde = e.desde then greatest(v_erros - e.erros, 0) else v_erros end;
  if novos > 0 then
    e.pendentes := e.pendentes + novos;
    e.ultimo_em := v_ultimo_em;
    e.ultima_rota := v_rota;
  end if;
  if e.pendentes > 0 and (e.alerta_de_erros_em is null or e.alerta_de_erros_em <= now() - e.alerta_a_cada) then
    alertas := alertas + privado.alerta_do_servidor(
      case when e.pendentes = 1 then 'Erro no servidor do site' else 'Erros no servidor do site' end,
      format('%s; o último às %s, em %s. Veja na Saúde da operação.',
        case when e.pendentes = 1 then '1 erro novo' else e.pendentes || ' erros novos' end,
        to_char(e.ultimo_em at time zone 'America/Sao_Paulo', 'HH24:MI'), e.ultima_rota));
    e.pendentes := 0;
    e.alerta_de_erros_em := now();
  end if;
  update privado.erros_do_servidor
  set desde = v_desde, erros = v_erros, pendentes = e.pendentes, ultimo_em = e.ultimo_em, ultima_rota = e.ultima_rota,
    sem_resposta_desde = null, relatado_em = now(), alerta_de_erros_em = e.alerta_de_erros_em
  where unica;
  return jsonb_build_object('alertas', alertas);
end;
$$;

-- 5) O que a Saúde da operação mostra: quando o worker conferiu o site e quando saiu o último alerta. Só para quem recebe o
--    alerta (quem gere as lojas pela rede inteira); a mesma linha para todas as redes (o site é um só).
create or replace function public.erros_do_servidor_situacao()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := (select u.organizacao_id from public.unidades u where u.id = (select public.unidade_atual()));
  e privado.erros_do_servidor;
begin
  if v_org is null or v_org not in (select privado.organizacoes_com_permissao('unidades.gerir')) then
    raise exception 'Só quem gere as lojas pela rede inteira vê o aviso dos erros do servidor' using errcode = '42501';
  end if;
  select * into e from privado.erros_do_servidor where unica;
  return jsonb_build_object(
    'relatado_em', e.relatado_em, 'sem_resposta_desde', e.sem_resposta_desde, 'pendentes', coalesce(e.pendentes, 0),
    'alerta_de_erros_em', e.alerta_de_erros_em, 'alerta_de_fora_em', e.alerta_de_fora_em,
    'alerta_a_cada_minutos', coalesce(extract(epoch from e.alerta_a_cada)::int / 60, 60),
    'fora_apos_minutos', coalesce(extract(epoch from e.fora_apos)::int / 60, 5));
end;
$$;

revoke all on function public.erros_do_servidor_relatar(text, jsonb), public.erros_do_servidor_situacao() from public, anon;
grant execute on function public.erros_do_servidor_situacao() to authenticated;
-- O worker chama com a chave pública (sem sessão de pessoa); o que protege é o segredo dos avisos, como na fila do PWA-b.
grant execute on function public.erros_do_servidor_relatar(text, jsonb) to anon, authenticated;
