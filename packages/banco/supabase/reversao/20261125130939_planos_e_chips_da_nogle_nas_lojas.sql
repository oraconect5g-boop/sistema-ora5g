-- Reversão de 20261125130939_planos_e_chips_da_nogle_nas_lojas (lote CONNECT-f): tira as quatro funções. O que elas já
-- gravaram fica como dado do cadastro e do estoque, com o histórico: a "Ativação Ora Connect", as variações por plano e os
-- preços (encerráveis pela tela de preços) e os chips que entraram pelo ICCID (com os movimentos de entrada no livro).
drop function public.connect_chips_divergentes();
drop function privado.connect_chips_divergentes(uuid);
drop function public.connect_worker_chips_no_estoque(uuid);
drop function public.connect_worker_planos_no_caixa(uuid);
