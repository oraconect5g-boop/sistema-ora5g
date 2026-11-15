-- =============================================================================
-- Carta de correção da NF-e registrada (lote FISC-009b: ORA-FISC-009, em parte)
--
-- Sem emissor contratado (A4), a carta de correção (o evento 110110 da NF-e) é feita no portal do fisco; aqui fica
-- registrado o que foi feito, como o cancelamento do L10c. As regras são as do fisco (Manual de Orientação ao
-- Contribuinte da SEFAZ-PR, Web Service da Carta de Correção, conferido em 15/11/2026): só a NF-e (modelo 55) tem
-- carta de correção (a NFC-e, modelo 65, não: rejeição 784); a nota tem de estar autorizada, nem cancelada nem
-- denegada (rejeição 580); o número da carta vai de 1 a 20 (rejeição 594); o texto da correção tem de 15 a 1.000
-- caracteres, e a correção mais recente substitui as anteriores. O prazo e o que a carta pode corrigir são do fisco (a
-- tela lembra o § 1º-A do art. 7º do Convênio S/N, de 15/12/1970): o sistema registra, não decide.
--
--   * public.notas_cartas_de_correcao: uma linha por carta registrada (a nota, o número, o protocolo do evento, o
--     texto, quem e quando); só inserção, como os eventos da nota; lida por quem vê a nota.
--   * public.notas_registrar_carta_de_correcao(pedido, numero, protocolo, correcao): quem aprova nota, na loja do
--     pedido (a mesma regra do registro da emissão e do cancelamento), registra a carta feita no portal. Repetir igual
--     devolve falso; o mesmo número com outro conteúdo, ou o mesmo protocolo noutra carta, é recusado.
--   * o evento "carta_de_correcao" no histórico da nota.
-- Reversão: supabase/reversao/<mesmo nome>.sql (só em banco sem dados reais).
-- =============================================================================

create table public.notas_cartas_de_correcao (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  pedido_id uuid not null references public.notas_pedidos (id),
  numero int not null check (numero between 1 and 20),
  protocolo text not null check (protocolo ~ '^[0-9]{15}$'),
  correcao text not null check (length(correcao) between 15 and 1000 and correcao = trim(correcao)),
  registrada_por uuid not null references public.perfis_usuario (id),
  registrada_em timestamptz not null default now(),
  unique (pedido_id, numero),
  unique (organizacao_id, protocolo)
);
create index notas_cartas_de_correcao_registrada_por on public.notas_cartas_de_correcao (registrada_por);
create trigger notas_cartas_de_correcao_sem_alteracao before update or delete on public.notas_cartas_de_correcao
  for each row execute function privado.so_insercao();
create trigger notas_cartas_de_correcao_sem_truncate before truncate on public.notas_cartas_de_correcao
  for each statement execute function privado.so_insercao();

alter table public.notas_cartas_de_correcao enable row level security;
revoke all on public.notas_cartas_de_correcao from anon, authenticated;
grant select on public.notas_cartas_de_correcao to authenticated;
create policy notas_cartas_de_correcao_ler on public.notas_cartas_de_correcao for select to authenticated
  using (pedido_id in (select p.id from public.notas_pedidos p));

alter table public.notas_eventos drop constraint notas_eventos_tipo_check;
alter table public.notas_eventos add constraint notas_eventos_tipo_check check (tipo in (
  'pedida', 'aprovada', 'correcao_solicitada', 'corrigida', 'emitida', 'emitida_sem_aprovacao_previa', 'cancelada',
  'ajustada_por_devolucao', 'cancelada_no_fisco', 'chave_corrigida', 'carta_de_correcao'));

-- -----------------------------------------------------------------------------
-- A carta de correção feita no portal, registrada
-- -----------------------------------------------------------------------------
create or replace function public.notas_registrar_carta_de_correcao(p_pedido uuid, p_numero int, p_protocolo text, p_correcao text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pedido public.notas_pedidos := privado.nota_para_aprovar(p_pedido);
  v_protocolo text := regexp_replace(coalesce(p_protocolo, ''), '[^0-9]', '', 'g');
  v_correcao text := trim(coalesce(p_correcao, ''));
  existente public.notas_cartas_de_correcao;
begin
  select * into existente from public.notas_cartas_de_correcao c where c.pedido_id = pedido.id and c.numero = p_numero;
  if found then
    if existente.protocolo = v_protocolo and existente.correcao = v_correcao then
      return false;
    end if;
    raise exception 'A carta de correção nº % desta nota já foi registrada com outro conteúdo', p_numero using errcode = '22023';
  end if;
  if pedido.situacao <> 'emitida' then
    raise exception 'Só a nota emitida (autorizada e não cancelada) tem carta de correção' using errcode = '22023';
  end if;
  if pedido.modelo is distinct from '55' then
    raise exception 'A carta de correção é só da NF-e (modelo 55); a NFC-e não tem: o caminho é cancelar e emitir outra' using errcode = '22023';
  end if;
  if p_numero is null or p_numero not between 1 and 20 then
    raise exception 'O número da carta de correção vai de 1 a 20 (como o do evento no fisco)' using errcode = '22023';
  end if;
  if v_protocolo !~ '^[0-9]{15}$' then
    raise exception 'Protocolo da carta de correção inválido: são 15 dígitos' using errcode = '22023';
  end if;
  if length(v_correcao) not between 15 and 1000 then
    raise exception 'O texto da correção tem de 15 a 1.000 caracteres (como o do evento no fisco)' using errcode = '22023';
  end if;
  if exists (select 1 from public.notas_cartas_de_correcao c where c.organizacao_id = pedido.organizacao_id and c.protocolo = v_protocolo) then
    raise exception 'Este protocolo já foi registrado em outra carta de correção' using errcode = '22023';
  end if;
  insert into public.notas_cartas_de_correcao (organizacao_id, pedido_id, numero, protocolo, correcao, registrada_por)
  values (pedido.organizacao_id, pedido.id, p_numero, v_protocolo, v_correcao, (select auth.uid()));
  perform privado.nota_evento(pedido, 'carta_de_correcao', 'Carta nº ' || p_numero || ', protocolo ' || v_protocolo || ': ' || left(v_correcao, 200));
  return true;
end;
$$;

revoke all on function public.notas_registrar_carta_de_correcao(uuid, int, text, text) from public, anon;
grant execute on function public.notas_registrar_carta_de_correcao(uuid, int, text, text) to authenticated;
