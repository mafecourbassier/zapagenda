# ZapAgenda, por Contrabarra

Projeto do Contrabarra para o Startup Challenge UMC. Barbearia, Manicure e Estética têm páginas próprias e painéis separados. As três usam a mesma regra de encaixe de até dois atendimentos em uma vaga.

## Rodar no VS Code

Use Node.js 22 ou superior. O projeto funciona com HTML, CSS e JavaScript, com fontes e fotografias incluídas e módulos nativos do Node.js.

No Windows, abra a pasta com `package.json` e rode:

```powershell
npm.cmd run dev
```

Acesse [http://127.0.0.1:4173](http://127.0.0.1:4173). Para os testes, abra outro terminal e rode:

```powershell
npm.cmd test
```

Em macOS e Linux, use `npm` no lugar de `npm.cmd`. A pasta `dist/` contém os arquivos publicados.

## Demonstrar o produto

1. Abra **Manicure → Painel da manicure**. Se já usou a demo, pode clicar em **Reiniciar este painel** para repor os exemplos desse segmento.
2. Cancele o atendimento fictício da Clara, às 14h. A lista propõe manutenção em gel e esmaltação na janela de 90 min.
3. Em **Ver oferta**, simule o aceite de cada encaixe. Conclua ambos. O valor bruto dos encaixes concluídos deve chegar a **R$ 140**.
4. Em **WhatsApp assistido → Preparar mensagem**, selecione um agendamento marcado e copie a confirmação ou o lembrete.
5. Entre nas páginas de **Barbearia** e **Estética** e abra os painéis próprios para conferir a separação dos dados.

A demonstração usa estabelecimentos, nomes, depoimentos e valores fictícios. Os dados ficam no navegador. O aceite compartilhado, o acesso por estabelecimento e a automação do WhatsApp são etapas do piloto.

## Documentação

- [Criar o repositório, comitar e publicar no Vercel](docs/github.md)
- [Escopo e validação do piloto](docs/piloto.md)
- [Notificações e integração com WhatsApp](docs/notificacoes.md)
