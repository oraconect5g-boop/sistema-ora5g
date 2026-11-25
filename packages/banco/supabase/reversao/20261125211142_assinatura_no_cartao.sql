-- Reversão de 20261125211142_assinatura_no_cartao (lote PAY-015c): a assinatura no cartão pela Asaas sai. As assinaturas que
-- já existem na Asaas continuam lá (a reversão não fala com a Asaas): ela se recusa enquanto houver assinatura viva aqui.
do $$
begin
  if exists (select 1 from public.assinaturas a where a.situacao in ('aguardando_cartao', 'ativa', 'pausada', 'cancelando')) then
    raise exception 'Há assinatura no cartão viva: cancele-as antes (a Asaas continuaria cobrando)';
  end if;
end;
$$;
drop function public.assinatura_cancelada_na_asaas(uuid);
drop function public.assinaturas_a_cancelar(int);
drop function public.assinatura_consulta_aplicar(uuid, jsonb);
drop function public.assinaturas_a_conferir(int);
drop function public.assinatura_criacao_falhou(uuid, text, boolean);
drop function public.assinatura_link_registrar(uuid, text, text, timestamptz);
drop function public.assinaturas_a_criar(int);
drop function public.assinaturas_do_cliente(uuid);
drop function public.assinatura_cancelar(uuid, text);
drop function public.assinatura_pedir(uuid, text, bigint, text, text, text);
drop table public.assinatura_cobrancas;
drop table public.assinaturas;
alter table privado.pagamento_pelo_site drop column assinatura_validade;
