# ZapAgenda

Projeto do Contrabarra para o Startup Challenge UMC. Duas experiências de agendamento, Barbearia e Manicure, com a mesma lógica para encontrar encaixes.

## Rodar no VS Code

Requisito local de desenvolvimento — Node.js 22 ou superior.

```bash
npm run dev
```

Abra [http://127.0.0.1:4173](http://127.0.0.1:4173). O projeto funciona com HTML, CSS e JavaScript, com fontes e fotos locais. A pasta `dist/` é a fonte publicada deste protótipo.

```bash
npm test
```

## Demonstrar em um minuto

1. Abra o início e navegue pela Barbearia e pela Manicure para ver as transições.
2. Na Manicure, abra **Painel do negócio**. Selecione **Manicure** no painel, se for preciso.
3. Cancele o atendimento fictício da Clara, às 14h. A lista propõe manutenção e esmaltação na janela de 90 min.
4. Abra cada oferta e clique em **Simular aceite**. Conclua os dois atendimentos no painel.
5. O valor bruto dos encaixes concluídos passa a **R$ 140**. **Reiniciar simulação** repõe os dados de exemplo.

O navegador mantém os dados da demonstração localmente. Reservas entre dispositivos, acesso do prestador e envio de WhatsApp pertencem à etapa do piloto. Use nomes fictícios neste protótipo.

## Documentação

- [Trabalhar com GitHub e publicar uma versão](docs/github.md)
- [Arquitetura, escopo e roteiro do piloto](docs/piloto.md)
