# Notificações do ZapAgenda

## O que funciona na demonstração

| Recurso | Comportamento |
| --- | --- |
| Aviso na tela | A aplicação confirma reserva, entrada na fila, aceite e conclusão no navegador. |
| WhatsApp assistido | Em cada painel, selecione um agendamento e gere uma confirmação ou um lembrete. O botão copia o texto. O prestador escolhe a conversa e envia. |
| Oferta de encaixe | A tela reproduz o aceite com dados fictícios no mesmo navegador, incluindo a verificação do horário selecionado. |
| Lembretes automáticos e entrega | Planejados para a integração com o provedor. |

A mensagem de estética usa nome, data e hora. A descrição do atendimento fica no painel.

## Sequência para um piloto real

1. Salvar agenda, fila, ofertas e escolhas de recebimento em um backend com autenticação do prestador e acesso por estabelecimento.
2. Criar um link de aceite de uso único, com validade e confirmação transacional no banco. O link pode ser enviado manualmente pelo WhatsApp da empresa no primeiro piloto.
3. Depois de validar o fluxo, conectar um número comercial à WhatsApp Business Platform. Registrar o consentimento para cada finalidade, submeter os modelos e configurar credenciais no servidor. A política da plataforma exige modelos aprovados para iniciar conversas. [Política do WhatsApp Business](https://business.whatsapp.com/policy) · [Documentação da plataforma](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview).
4. Automatizar primeiro a confirmação de reserva e um único lembrete antes da visita. Quando uma visita for cancelada ou remarcada, cancelar o lembrete antigo. Usar uma chave única por reserva, tipo e horário para evitar envios duplicados.
5. Usar webhooks para distinguir os estados `enviado`, `entregue` e `falhou`. Medir separadamente se a cliente aceitou a oferta e se o atendimento aconteceu.

## Critério de aceite da integração

Em dois dispositivos, o prestador abre uma vaga, a cliente aceita antes da expiração e o painel atualiza. O segundo aceite para o mesmo trecho é recusado de forma clara. Uma remarcação altera o lembrete agendado. O estúdio enxerga a situação do envio e pode corrigir um contato com falha.
