# Notificações do ZapAgenda

## O que funciona na demonstração

| Recurso | Comportamento |
| --- | --- |
| Aviso na tela | A aplicação confirma reserva, entrada na fila, aceite e conclusão no navegador. |
| WhatsApp assistido | Em cada painel, selecione um agendamento e gere uma confirmação ou um lembrete. O botão copia o texto. O prestador escolhe a conversa e envia. |
| Oferta de encaixe | O banco publica uma proposta individual no portal do cliente. O aceite revalida horário e prazo e grava a reserva em uma transação. |
| Lembretes automáticos e entrega | Fila persistente e funções de envio preparadas. A ativação depende da conta Meta, modelos e secrets descritos no guia de WhatsApp. |

A mensagem de estética usa nome, data, hora e link do portal. A descrição do atendimento fica no painel.

A configuração, o teste do número e os comandos de publicação estão em [Ativar o WhatsApp](whatsapp.md). Os testes desta entrega usam o banco isolado e respostas simuladas da Meta.

## Sequência para um piloto real

1. Validar a agenda, a fila e as ofertas compartilhadas em dois aparelhos, seguindo o [guia de configuração](supabase.md).
2. Medir os aceites de ofertas de cinco minutos no portal do cliente e registrar as escolhas de recebimento para as próximas notificações.
3. Depois de validar o fluxo, conectar um número comercial à WhatsApp Business Platform. Registrar o consentimento para cada finalidade, submeter os modelos e configurar credenciais no servidor. A política da plataforma exige modelos aprovados para iniciar conversas. [Política do WhatsApp Business](https://business.whatsapp.com/policy) · [Documentação da plataforma](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview).
4. Automatizar primeiro a confirmação de reserva e um único lembrete antes da visita. Quando uma visita for cancelada ou remarcada, cancelar o lembrete antigo. Usar uma chave única por reserva, tipo e horário para evitar envios duplicados.
5. Usar webhooks para distinguir os estados `enviado`, `entregue` e `falhou`. Medir separadamente se a cliente aceitou a oferta e se o atendimento aconteceu.

## Critério de aceite da integração

Em dois dispositivos, o prestador abre uma vaga, a cliente aceita antes da expiração e o painel atualiza. O segundo aceite para o mesmo trecho é recusado de forma clara. Uma remarcação altera o lembrete agendado. O estúdio enxerga a situação do envio e pode corrigir um contato com falha.
