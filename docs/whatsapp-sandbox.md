# Teste automatizado com a 360dialog

Esta entrega parte do commit `4c318146cb15e4966a96b86d40ff5684ea8f36bb` do ZapAgenda. A usuária confirmou o teste de API, a confirmação de reserva, o cancelamento e a oferta de encaixe. O banco mostrou `read`, sem erro, para confirmação e cancelamento. O recebimento real do lembrete ainda precisa ser confirmado. Os ajustes de janelas repetidas e histórico estão em [Atualizar e testar a agenda](ajustes-agenda-historico.md).

O worker continua usando a fila já existente de confirmações, lembretes, cancelamentos e ofertas. O Cron existente continua chamando a mesma função. `WHATSAPP_PROVIDER=360dialog_sandbox` seleciona o novo transporte; ausente ou `meta` preserva o caminho anterior. Não é preciso cadastrar outra conta de teste na Meta.

## Limites antes de começar

- Ambiente de demonstração para um único telefone autorizado. Não serve para disparar avisos a clientes reais de um estabelecimento.
- A documentação técnica do sandbox informa **25 requisições**, incluindo rejeições. O contador do ZapAgenda limita a **20 tentativas automáticas por chave**, contando também reservas interrompidas, para deixar margem a testes manuais. Testes feitos fora do ZapAgenda não são contabilizados localmente e podem esgotar a cota antes disso.
- Nesta entrega os quatro avisos são **textos de demonstração**, identificados como teste. Os modelos pt_BR aprovados na conta Meta não são transferidos para a 360dialog.
- A sessão do ZapAgenda pausa após **24 horas**. Para uma nova sessão, envie outra mensagem ao número do sandbox e execute novamente o configurador. A cota por chave não é reiniciada. Essa pausa conservadora impede que a demonstração tente manter mensagens personalizadas fora de uma janela iniciada pelo testador.
- A fila só retira avisos criados depois de configurar a sessão, para o telefone informado. Mensagens antigas ou de outros telefones permanecem intactas e não são redirecionadas ao time.
- Um aviso por execução do Cron, sem repetição automática de falhas ou resultados incertos. Confirmar a recepção no celular é parte obrigatória do teste.

## 1. Copiar os arquivos

Extraia o ZIP de atualização **dentro da pasta do repositório**, a mesma que contém package.json. O ZIP contém apenas os arquivos alterados/adicionados; confira `git status --short` antes de substituir arquivos locais que possam ter alterações próprias. Se houver mudanças locais nesses mesmos arquivos, preserve uma cópia e concilie o diff antes de substituí-los.

O arquivo `package.json` deve continuar sendo JSON. Os comandos abaixo são executados no terminal; não devem ser colados no package.json.

## 2. Preparar o banco

No Supabase do projeto, abra **SQL Editor → New query**. Copie **todo o conteúdo** de:

`supabase/migrations/202611210005_whatsapp_sandbox.sql`

Execute e confira `Success. No rows returned`. Essa migração acrescenta o contador e o processamento restrito do sandbox. Depende das quatro migrações anteriores, já usadas na integração Meta. Pode ser reaplicada sem apagar a agenda ou reiniciar a cota.

O espaço de teste precisa continuar habilitado. Se necessário, execute no mesmo SQL Editor:

```sql
update public.za_spaces set whatsapp_enabled = true where slug = 'barbearia';
```

## 3. Configurar e publicar

O computador precisa do Node.js 22 ou superior e do login do Supabase CLI, como na publicação anterior. Caso precise autenticar novamente:

```powershell
npx.cmd --yes supabase@3.2.0 login
```

Envie `oi` ao [número oficial do sandbox](https://wa.me/551146733492?text=oi) para iniciar a janela de conversa. No terminal PowerShell, dentro do repositório, execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\configurar-whatsapp-sandbox.ps1
```

O configurador usa por padrão o projeto `ynkxjhyirdxuzdhtirfs` e o portal `https://zapagenda-two.vercel.app`. Ele pede o telefone, o BSUID opcional e a API key em entrada oculta. Não cole chaves em arquivos do aplicativo, em package.json, no chat ou no Git.

O script pausa a fila, publica `whatsapp-worker` e `whatsapp-sandbox-webhook`, configura os secrets, cadastra o webhook autenticado e só então ativa o envio. O token anterior do worker e a programação do Cron permanecem em uso. A chave passa por arquivo temporário fora do repositório, removido no final, e não aparece nos argumentos dos processos. A CLI é fixada na versão 3.2.0; não requer Docker com `--use-api`.

Se houver falha, não repita agendamentos em massa. A configuração interrompe e tenta pausar o envio novamente; confira `WHATSAPP_DELIVERY_ENABLED=false` no painel. O script não foi executado na conta da usuária nem validado em Windows nesta entrega.

### Alternativa manual ao configurador

Configure os mesmos secrets em **Edge Functions → Secrets**, mantendo `WHATSAPP_DELIVERY_ENABLED=false` durante a publicação:

| Nome | Valor |
| --- | --- |
| WHATSAPP_PROVIDER | 360dialog_sandbox |
| D360_API_KEY | Chave privada recebida da 360dialog |
| D360_SANDBOX_PHONE | Telefone que enviou START, somente dígitos, com país e DDD |
| D360_SANDBOX_BSUID | Somente se o provedor instruiu usar BSUID; caso contrário deixe vazio |
| D360_SANDBOX_STARTED_AT | Momento atual em ISO 8601 com fuso, por exemplo o resultado de `(Get-Date).ToUniversalTime().ToString('o')` |
| D360_WEBHOOK_TOKEN | Token aleatório independente de 32 bytes, representado por 64 caracteres hexadecimais |
| PUBLIC_APP_URL | https://zapagenda-two.vercel.app |

Publique as duas funções do script e registre o receptor por `POST https://waba-sandbox.360dialog.io/v1/configs/webhook`. O corpo contém `url` apontando para `/functions/v1/whatsapp-sandbox-webhook` e `headers.Authorization` com `Basic base64(zapagenda:D360_WEBHOOK_TOKEN)`. O endpoint de configuração exige o header `D360-API-KEY` com a chave do sandbox. Essa chamada de configuração não deve imprimir os headers nem o corpo com credenciais. Depois de conferir o receptor e o cadastro, ative `WHATSAPP_DELIVERY_ENABLED=true`.

## 4. Validar a automação na agenda

1. Envie `oi` ao sandbox. O webhook deve retornar HTTP 200 no log da função. Se retornar 401, confira se o sandbox está repassando o header Authorization configurado. Não remova a autenticação para contornar o problema. O suporte a headers no endpoint de configuração específico do sandbox ainda precisa ser confirmado no ambiente real; a documentação geral da 360dialog descreve esse mecanismo.
2. Entre **como cliente**. Em **Seu WhatsApp**, autorize os avisos para o mesmo telefone que recebeu a chave. Cadastros com outro telefone não recebem mensagens neste modo.
3. Crie **um novo agendamento** para o futuro. Com Cron ativo, a confirmação deve sair na próxima execução. A resposta do worker com `processed: 1` indica processamento, não entrega.
4. Confira a mensagem no celular. No painel, a sequência esperada é **Na fila → Processando → Aceita pelo provedor → Enviada → Entregue/Lida**. Alguns estados podem passar rápido. Sem callback de entrega, o painel permanece em Aceita pelo provedor; não infere entrega por tempo.
5. Cancele essa reserva. O lembrete pendente deve ser cancelado e um aviso de cancelamento deve sair. Isso consome mais uma tentativa.
6. Teste o encaixe apenas depois dessas duas entregas. Oferta com prazo de cinco minutos não é reenviada após expirar. Crie o pedido antes de abrir uma janela compatível. O aceite no portal continua sendo a fonte da reserva; responder texto no WhatsApp não confirma a oferta.
7. Para verificar lembrete, escolha um agendamento cujo lembrete de três horas antes ocorra ainda dentro da sessão de teste. Não é necessário alterar o relógio do sistema nem gerar dezenas de reservas.

### Diagnóstico sem expor telefone ou chave

No SQL Editor, estas consultas mostram uso e estado da fila sem revelar a chave ou o telefone:

```sql
select attempts, updated_at
from public.za_whatsapp_sandbox_usage
order by updated_at desc;

select q.kind, q.status, q.error_code, q.created_at, q.due_at
from public.za_whatsapp_outbox q
join public.za_spaces s on s.id = q.space_id
where s.slug = 'barbearia'
order by q.created_at desc limit 10;
```

`sandbox_session_expired` no retorno do worker significa sessão fora do período. HTTP 429 do provedor significa cota esgotada. Sem chamadas novas ao provedor e uso local em 20, o limite local foi atingido. Não zere o contador para tentar ultrapassar a cota. Qualquer nova API key exige a autorização normal do provedor.

## Interromper ou voltar à Meta

Para pausar, defina `WHATSAPP_DELIVERY_ENABLED=false` em Edge Functions → Secrets. O Cron pode permanecer agendado: com envio desativado o worker não retira mensagens.

Para voltar à Meta, mantenha a pausa, configure `WHATSAPP_PROVIDER=meta` e valide as credenciais, modelos e a resolução do bloqueio original antes de reativar. Revise a fila pendente: os avisos não enviados a outros telefones continuam nela. O webhook Meta original continua exigindo sua assinatura HMAC; o novo endpoint não altera essa proteção.

## Salvar a alteração no Git e atualizar a interface

O configurador publica apenas o backend no Supabase. Para publicar o texto **Aceita pelo provedor** na interface e manter o código no repositório, revise o diff, faça o commit e abra o Pull Request para main como na entrega anterior. A Vercel publica a interface após o merge. Antes disso, a versão antiga da interface pode mostrar **Recebida pela Meta** mesmo que o novo backend esteja usando a 360dialog.

```powershell
git switch -c feat/whatsapp-sandbox
git status --short
git --no-pager diff --stat
npm.cmd test
npm.cmd run build
git add -- dist/app.mjs docs/whatsapp.md docs/whatsapp-sandbox.md scripts/configurar-whatsapp-sandbox.ps1 supabase/config.toml supabase/functions/_shared/whatsapp.mjs supabase/functions/whatsapp-sandbox-webhook/index.ts supabase/migrations/202611210005_whatsapp_sandbox.sql tests/banco.test.mjs tests/whatsapp-sandbox.test.mjs
git commit -m "feat: integra sandbox da 360dialog a fila de notificacoes"
git push -u origin HEAD
```

## Validação da entrega de código

O teste automatizado usa PostgreSQL via PGlite para verificar migrações reaplicáveis, isolamento de telefone/data, permissões e cota persistente. Os testes HTTP simulam aceite, timeout, rejeição, BSUID e callbacks autenticados. Não foram feitas chamadas de mensagem à 360dialog nem alterações ao Supabase da usuária pelo assistente.

## Documentação do provedor

- https://docs.360dialog.com/docs/get-started/sandbox
- https://docs.360dialog.com/docs/messaging/webhook
- https://supabase.com/docs/reference/cli/supabase-secrets-set
- https://supabase.com/docs/reference/cli/supabase-functions-deploy
