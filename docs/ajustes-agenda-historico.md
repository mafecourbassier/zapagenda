# Atualização da agenda e checklist de encerramento

## O que foi ajustado

- Uma janela manual não pode repetir nem sobrepor outra faixa já publicada no mesmo espaço e dia. O formulário informa as faixas existentes; o banco também valida, inclusive para outra aba ou aparelho.
- Repetir a mesma operação não renova ofertas nem cria outra janela. Cancelar uma reserva reaproveita uma janela existente que já cubra aquele intervalo.
- A migração unifica janelas antigas com data e faixa exatamente iguais. Preserva reservas, pedidos, identificadores das ofertas e suas referências.
- O WhatsApp assistido e suas ações de copiar mensagens foram removidos. As notificações automáticas continuam funcionando.
- Limpar histórico fica disponível no painel e na área do cliente. Arquiva atendimentos realizados/cancelados e notificações entregues, lidas, canceladas ou com falha. A limpeza é por conta e por espaço, com confirmação e restauração.
- Reservas confirmadas, fila e avisos pendentes/em processamento permanecem visíveis. A limpeza não muda a ocupação, o valor dos encaixes, as autorizações de WhatsApp nem os contadores de envio. Não elimina dados definitivamente.

## Como instalar

O pacote inclui os arquivos da integração anterior com a 360dialog para manter o repositório completo. Foi preparado sobre a entrega anterior, baseada no commit `4c318146cb15e4966a96b86d40ff5684ea8f36bb`.

1. Extraia o ZIP em uma pasta temporária.
2. Copie as pastas `dist`, `docs`, `scripts`, `supabase` e `tests` para a raiz do projeto no computador, a mesma pasta de `package.json`. Mescle as pastas e substitua os arquivos correspondentes. Não exclua as demais pastas do projeto.
3. No Supabase do ZapAgenda, abra **SQL Editor → New query**.
4. Abra `supabase/migrations/202611210006_agenda_historico.sql`, copie todo o conteúdo e execute no SQL Editor. O resultado esperado é **Success. No rows returned**. As migrações anteriores, incluindo a 005 do sandbox, devem estar aplicadas. Não é preciso repeti-las.
5. A configuração de WhatsApp que já funcionou pode continuar como está. Estes ajustes não exigem executar novamente o configurador nem republicar as Edge Functions.
6. No PowerShell, dentro da pasta do projeto, execute os comandos abaixo. Se algum teste falhar, pare antes do commit e confira o erro.

```powershell
git switch -c ajustes/agenda-historico
npm.cmd test
npm.cmd run build
git diff --check
git status --short
git add -- dist/app.mjs dist/cloud.mjs dist/sections.css docs/notificacoes.md docs/whatsapp.md docs/whatsapp-sandbox.md docs/ajustes-agenda-historico.md scripts/configurar-whatsapp-sandbox.ps1 supabase/config.toml supabase/functions/_shared/whatsapp.mjs supabase/functions/whatsapp-sandbox-webhook/index.ts supabase/migrations/202611210005_whatsapp_sandbox.sql supabase/migrations/202611210006_agenda_historico.sql tests/banco.test.mjs tests/whatsapp-sandbox.test.mjs tests/agenda-historico.test.mjs
git diff --cached --stat
git commit -m "fix: impede janelas repetidas e adiciona historico reversivel"
git push -u origin HEAD
```

7. No GitHub, abra o Pull Request da branch `ajustes/agenda-historico` para `main`, confira os arquivos e faça o merge após os checks passarem.
8. Na Vercel, aguarde o deploy de produção correspondente ao merge ficar **Ready**. Abra `https://zapagenda-two.vercel.app/` e atualize com **Ctrl + F5**. Enviar arquivos para uma branch, sozinho, não atualiza a produção.

### Se a primeira tentativa mostrou `relation "za_duplicate_gaps" does not exist`

O pacote foi atualizado: a migração 006 usa um bloco único para consolidar duplicatas, sem tabela temporária. Baixe a versão atualizada e substitua o arquivo 006 também na pasta do projeto. No SQL Editor, abra uma nova consulta e execute o arquivo inteiro, de `begin;` a `commit;`, sem selecionar apenas um trecho. O script pode ser reaplicado. O funcionamento do WhatsApp não exige reconfiguração por causa desta correção.

## Teste 1 — faixa repetida

1. Abra a área profissional e selecione uma data futura.
2. Escolha uma faixa livre que comporte um serviço e ainda não esteja publicada. Anote data, início e fim.
3. Em **Preencher vaga → Informar horário**, preencha esses valores e clique em **Buscar encaixes**.
4. Abra **Informar outro horário**. A faixa anterior deve aparecer em **Faixas já publicadas**.
5. Informe novamente a mesma data, início e fim e clique em **Buscar encaixes**.
6. Esperado: o formulário mostra que a faixa coincide com um horário já publicado e permanece aberto. Nenhuma nova janela ou oferta é criada.
7. Experimente um intervalo parcialmente sobreposto. Ele também deve ser recusado. Um intervalo adjacente, livre e dentro do expediente continua permitido.

## Teste 2 — remover o assistido

1. No painel profissional, role até a parte abaixo da agenda.
2. Esperado: não aparecem **WhatsApp assistido** nem **Preparar mensagem**.
3. A seção **Notificações automáticas** continua mostrando os envios e seus estados.

## Teste 3 — limpar e restaurar

1. Use uma conta com pelo menos um atendimento cancelado/realizado. Mantenha uma reserva confirmada ou um pedido de espera para comparar.
2. Em **Histórico da agenda**, clique em **Limpar histórico**.
3. Leia o aviso e clique em **Voltar**. Nada deve mudar.
4. Abra novamente e confirme **Limpar histórico**.
5. Esperado: atendimentos encerrados e avisos concluídos ficam ocultos. Reservas confirmadas, fila e avisos pendentes permanecem; o valor dos encaixes realizados permanece igual.
6. Atualize a página. A limpeza deve continuar aplicada àquela conta.
7. Abra a outra conta (cliente em janela anônima, profissional na janela normal). A limpeza da primeira conta não deve limpar o histórico da segunda.
8. Na primeira conta, clique em **Restaurar histórico** e confirme. Os registros devem voltar à exibição habitual.
9. Repita em tela de celular para conferir os botões e o texto.

## Teste 4 — encerrar as notificações

1. Mantenha o mesmo telefone autorizado e a sessão do sandbox válida, seguindo `whatsapp-sandbox.md`.
2. Crie um pedido de encaixe e publique uma janela compatível. Aguarde a oferta no WhatsApp e aceite no portal dentro de cinco minutos da geração.
3. Confira a nova reserva no cliente e no painel e a confirmação automática no WhatsApp. Se esse ciclo já tiver sido concluído, não é necessário repeti-lo apenas para gerar mais mensagens.
4. Para testar o lembrete, use uma reserva cujo início esteja a mais de três horas do momento atual e cujo lembrete caiba dentro da sessão de teste. Exemplo: reserva às 16h, criada antes das 13h, gera lembrete previsto para 13h.
5. Mantenha a reserva ativa até o lembrete. Compare o horário em **Notificações automáticas** e confirme o recebimento no celular. O Cron processa um aviso por execução; pode haver atraso de uma execução.
6. Depois do horário inicial de um atendimento de teste, use **Marcar realizado** no painel e confira a atualização no cliente.

## Checklist para fechar a demonstração

- [x] Agenda e cancelamento utilizados pela usuária.
- [x] Confirmação e cancelamento recebidos automaticamente no WhatsApp.
- [x] Banco mostrou `read`, sem erro, nos dois envios verificados.
- [x] Recebimento da oferta de encaixe confirmado pela usuária.
- [x] Impedimento de faixas repetidas/sobrepostas implementado e testado localmente.
- [x] Remoção do envio assistido implementada no código.
- [x] Limpeza e restauração por conta implementadas e testadas no banco.
- [x] 53 testes automatizados e compilação passaram nesta entrega, incluindo a consolidação executada isoladamente.
- [ ] Aplicar a migração 006 no Supabase e publicar os arquivos na Vercel.
- [ ] Executar os testes 1, 2 e 3 na versão publicada, inclusive no celular.
- [ ] Confirmar o ciclo oferta → aceite → reserva → confirmação, caso ainda não concluído.
- [ ] Confirmar o recebimento real do lembrete.
- [ ] Confirmar **Marcar realizado** após o início do atendimento.
- [ ] Registrar um vídeo curto do fluxo e feedback de quem testou para a apresentação.

Os testes locais cobrem regras do banco, isolamento entre usuários, deduplicação, preservação dos avisos e transportes com respostas simuladas. A tentativa de teste visual local foi impedida pela restrição de execução do navegador neste ambiente; a interface publicada ainda precisa dos testes manuais acima. Nenhum envio real foi disparado nestas verificações e nenhuma alteração foi publicada na conta da usuária.

O escopo de encerramento é a demonstração acadêmica com o telefone do sandbox. Atendimento a vários destinatários e operação comercial exigem uma etapa própria de configuração e validação.
