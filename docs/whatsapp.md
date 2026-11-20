# Ativar o WhatsApp do piloto

## Preparação feita no código

Esta entrega usa a WhatsApp Business Platform da Meta e Edge Functions do Supabase. O envio começa com uma conta e um número de teste controlados pelo time. As credenciais ficam nos secrets das funções. A configuração pública em `dist/cloud-config.mjs` continua identificando o projeto Supabase do site.

Cada cliente autoriza as notificações no portal e informa um telefone com código do país. O profissional vê os últimos eventos em Notificações automáticas. A autorização de recebimento está vinculada ao estabelecimento.

## 1. Aplicar a atualização local

Extraia o ZIP em uma pasta temporária. Na sua pasta `zapagenda-git`, confira primeiro `git status --short`. Conclua os commits da entrega anterior antes de trocar de branch. Depois, crie a branch desta entrega.

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/whatsapp-notificacoes
```

Se já estiver nessa branch, continue nela. Copie o conteúdo da pasta extraída para `zapagenda-git`, substituindo os arquivos correspondentes. O ZIP não contém uma pasta .git, portanto seu histórico fica preservado. No SQL Editor, execute `supabase/migrations/202611190004_whatsapp.sql`. Depois, execute no PowerShell.

```powershell
npm.cmd install
npm.cmd run build
npm.cmd test
npm.cmd run dev
```

Na conta de cliente, abra Seu WhatsApp, configure o número do próprio time e marque a autorização. Faça uma reserva nova. A confirmação e o lembrete entram na fila, que fica visível ao profissional. A ativação de envio começa desativada.

Os avisos são criados para agendamentos feitos depois da autorização. Para uma reserva feita a menos de três horas do atendimento, a confirmação já contém os dados da visita. Nesse caso é criada a confirmação imediata.

## 2. Configurar a conta Meta

Siga o [guia oficial de primeiros passos](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started/).

1. Crie um app com o caso de uso Connect with customers through WhatsApp.
2. Acesse API Setup. Guarde o Phone Number ID e identifique a conta de mensagens.
3. Configure um número de teste destinatário que pertença ao próprio time e valide uma primeira mensagem pelo painel Meta.
4. Guarde o token de acesso no gerenciador de secrets. Para operação contínua, siga o procedimento oficial para token de usuário do sistema.
5. No WhatsApp Manager, crie os quatro modelos pt_BR do arquivo `supabase/whatsapp-templates.json`. Eles usam cinco variáveis posicionais, nesta ordem: nome, estabelecimento, data, hora e link do portal. A aprovação e a classificação são feitas pela Meta.

Os exemplos de URL dos modelos devem ser substituídos pelo domínio público do aplicativo ao preparar a submissão. O arquivo contém propostas de texto para cadastro.

## 3. Publicar as duas funções

O Supabase CLI pode ser executado com npx. Faça a autenticação na sua conta.

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref ynkxjhyirdxuzdhtirfs
npx.cmd supabase functions deploy whatsapp-webhook
npx.cmd supabase functions deploy whatsapp-worker
```

O `supabase/config.toml` permite que os endpoints sejam chamados pela Meta e pelo Cron. O webhook autentica cada POST com a assinatura HMAC da Meta. O worker exige WHATSAPP_WORKER_TOKEN no cabeçalho Authorization.

## 4. Configurar secrets no Supabase

Em Edge Functions, Secrets, cadastre os valores do arquivo `supabase/functions/.env.example`. Copie os valores reais diretamente para os campos do Supabase. O arquivo .env.example serve como lista de nomes.

| Secret | Valor |
| --- | --- |
| WHATSAPP_DELIVERY_ENABLED | false durante a preparação, true para ativar o envio |
| WHATSAPP_API_VERSION | Versão suportada pela conta, por exemplo v27.0 |
| WHATSAPP_PHONE_NUMBER_ID | Phone Number ID do painel Meta |
| WHATSAPP_ACCESS_TOKEN | Token da conta de mensagens |
| WHATSAPP_APP_SECRET | App Secret do aplicativo Meta |
| WHATSAPP_VERIFY_TOKEN | Texto aleatório definido pelo time para verificar o webhook |
| WHATSAPP_WORKER_TOKEN | Outro texto aleatório para autenticar o worker |
| PUBLIC_APP_URL | Domínio público de produção, começando com https:// |
| WHATSAPP_TEMPLATE_CONFIRMATION | Nome do modelo aprovado de confirmação |
| WHATSAPP_TEMPLATE_REMINDER | Nome do modelo aprovado de lembrete |
| WHATSAPP_TEMPLATE_CANCELLATION | Nome do modelo aprovado de cancelamento |
| WHATSAPP_TEMPLATE_OFFER | Nome do modelo aprovado de encaixe |

As funções leem a chave administrativa do SUPABASE_SECRET_KEYS injetado pelo Supabase e mantêm compatibilidade com SUPABASE_SERVICE_ROLE_KEY. A chave administrativa é usada para os RPCs de processamento da fila. Os clientes do site usam a chave pública e seus próprios logins.

## 5. Configurar o webhook Meta

Callback URL da conta deste projeto.

```text
https://ynkxjhyirdxuzdhtirfs.supabase.co/functions/v1/whatsapp-webhook
```

Informe o mesmo Verify Token que está no secret WHATSAPP_VERIFY_TOKEN. Conclua a verificação e assine o campo messages da conta de mensagens. Confira os eventos sent, delivered e read depois de uma mensagem de teste. Os eventos recebidos por este webhook atualizam o histórico da notificação.

## 6. Ativar o agendamento e o espaço do piloto

Crie no Supabase Vault o secret `zapagenda_whatsapp_worker_token`, com exatamente o valor de WHATSAPP_WORKER_TOKEN. Execute `supabase/whatsapp-schedule.sql` no SQL Editor. O Cron chama o worker a cada minuto. O token é lido do Vault em cada chamada.

Quando as funções, os modelos e o número estiverem configurados, altere WHATSAPP_DELIVERY_ENABLED para true e execute.

```sql
update public.za_spaces
set whatsapp_enabled = true
where slug = 'barbearia';
```

A barbearia passa a ter envio ativo. Os outros espaços do piloto podem ser ativados pelo mesmo procedimento, usando seu slug. Nesta etapa, os três espaços fictícios usam o remetente de teste definido nos secrets. O onboarding de números próprios de cada empresa é uma etapa posterior do SaaS.

## 7. Conferir o primeiro ciclo

1. Autorize o recebimento pela conta do cliente e faça uma reserva nova para amanhã.
2. Confira uma confirmação na fila e o lembrete com horário de envio três horas antes.
3. Aguarde o Cron e confira o telefone. O estado inicial Recebida pela Meta significa que a API aceitou a requisição. O webhook deve depois registrar Entregue ou Lida.
4. Cancele uma segunda reserva. O lembrete pendente dela deve mudar para Cancelada e um aviso de cancelamento deve entrar na fila.
5. Crie um pedido de encaixe e abra uma janela compatível. A oferta gera um aviso com o link do portal. Aceitar a oferta gera a confirmação do novo atendimento.
6. Desative os avisos no portal e confira o cancelamento dos envios pendentes desse cliente.

Para testar um lembrete rapidamente em um agendamento de teste controlado pelo time, o administrador pode antecipar sua due_at no SQL Editor. Confira o identificador da mensagem e o destinatário antes de editar o agendamento de envio.

## Falhas e limites desta etapa

O worker retira até três mensagens por execução e revalida autorização e disponibilidade antes de chamar a Meta. Rejeições explícitas ficam como Falhou. Interrupções com resultado desconhecido ficam como Revisar envio. Confira o histórico na Meta antes de reenviar esses casos, porque uma requisição sem resposta pode ter sido aceita.

Eventos repetidos são deduplicados. Eventos que chegam antes de gravar o identificador da mensagem são conciliados quando esse identificador é salvo. Um evento enviado atrasado preserva o estado Lida já recebido.

A programação do Cron e o processamento da Meta acrescentam latência ao horário planejado. Revogar a preferência cancela os avisos pendentes. Uma mensagem cuja transmissão já começou pode chegar depois dessa mudança.

Para interromper o envio, configure WHATSAPP_DELIVERY_ENABLED como false. Para pausar apenas um espaço, altere whatsapp_enabled para false. As confirmações e ofertas do portal continuam seguindo a agenda autenticada.

As respostas por texto, confirmação pelo WhatsApp, reagendamento por conversa e IA de negociação de horários estão na próxima entrega. A etapa atual notifica e direciona para o portal.

## Git e publicação

Depois do teste local e da revisão dos arquivos.

```powershell
git add -- dist/app.mjs dist/cloud.mjs dist/sections.css dist/assets/supabase-LICENSES.txt scripts/build-vendor.mjs tests/banco.test.mjs tests/whatsapp.test.mjs supabase/config.toml supabase/migrations/202611190004_whatsapp.sql supabase/functions supabase/whatsapp-schedule.sql supabase/whatsapp-templates.json docs/whatsapp.md docs/validacao-2026-11-19.md docs/notificacoes.md README.md
git --no-pager diff --cached --stat
git commit -m "feat: prepara notificacoes do WhatsApp com fila e webhook"
git push -u origin HEAD
```

Abra o Pull Request para main e aguarde as verificações. O merge publica o site na Vercel conectada ao repositório. A publicação das Edge Functions é feita pelos comandos do passo 3. Os secrets são configurados no projeto Supabase.

## Fontes oficiais

- [Primeiros passos da WhatsApp Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started/)
- [Modelos de utilidade](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates/utility-templates/)
- [Verificação e assinatura de webhooks](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/)
- [Agendar Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Secrets das Edge Functions](https://supabase.com/docs/guides/functions/secrets)
