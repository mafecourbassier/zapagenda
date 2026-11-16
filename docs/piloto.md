# Arquitetura e piloto

## Protótipo atual

| Área | Implementação |
| --- | --- |
| Interfaces | Início, Barbearia, Manicure e painel, com rotas por hash e um tema para cada público |
| Motion | Cortina diagonal para Barbearia, abertura arredondada para Manicure e redução de movimento quando o dispositivo pede |
| Agenda | Reserva de horários livres, lista de espera, abertura por cancelamento e conclusão de encaixes |
| Regra de encaixe | Sugere até duas solicitações na janela, respeitando duração, disponibilidade e ocupação registrada |
| Dados | Exemplos fictícios, com persistência no mesmo navegador |
| Validação | Testes Node da regra de encaixe e roteiro visual no README |

## Primeiro piloto com dados compartilhados

1. Implementar um backend HTTP com um banco transacional. Sugestão para o time — Postgres e autenticação de prestador via Supabase, sujeitos à adoção pelo Contrabarra.
2. Isolar os dados por estabelecimento. Registrar profissionais, serviços, disponibilidade, reservas, solicitações da fila e ofertas.
3. Gerar um link de aceite de uso único que expire. Aceitar a oferta e registrar a reserva na mesma transação, com verificação de conflito no banco.
4. Começar com envio assistido pelo WhatsApp da própria empresa. O prestador controla o envio e o cliente fornece consentimento para avisos em seu cadastro.
5. Registrar horário ofertado, aceite, atendimento efetivamente concluído e valor informado pelo negócio. A integração oficial de WhatsApp entra como uma issue independente depois do teste do fluxo.

## Critério de validação

Escolha uma barbearia ou estúdio com uma vaga real. Peça ao profissional que registre o horário em que ele pode atender e convide clientes que já demonstraram interesse. Acompanhe o aceite e a conclusão. A cena para o pitch pode mostrar a vaga original, o encaixe sugerido, a confirmação e o valor do serviço, com dados pessoais ocultos.

| Indicador | Como medir |
| --- | --- |
| Vagas oferecidas | Intervalos reais para os quais houve uma oferta |
| Ofertas aceitas | Aceites válidos da pessoa convidada, com data e hora |
| Encaixes concluídos | Atendimentos que o profissional confirmou como realizados |
| Valor bruto | Soma dos preços dos encaixes realmente concluídos |
| Disposição a pagar | Resposta do prestador a uma proposta explícita após o uso |

Cada mudança de piloto pode ser vinculada a uma issue. Registre acontecimentos reais com autorização e use os exemplos fictícios da versão atual para ensaiar o vídeo.
