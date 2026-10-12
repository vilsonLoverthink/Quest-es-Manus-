# Questões Manus — CFS 31

Aplicativo interativo de estudo para a turma do Curso de Formação de Sargentos (CFS 31) da PMMS.

## O que oferece

- **Praticar:** responder questão por questão, ver gabarito e resolução, tentar novamente e marcar favoritas.
- **Simulado:** montar rodadas aleatórias sem revelar o gabarito durante a avaliação e revisar os erros depois.
- **Banco:** pesquisar, filtrar por disciplina/assunto e consultar alternativas, gabarito, resolução e referência.
- **Meu progresso:** acompanhar tentativas, acertos, erros e cobertura por disciplina.

O banco interativo tem **570 questões em 8 disciplinas**: Armamento e Munição I (43), Aspectos Culturais das Etnias Indígenas (80), Atendimento Pré-Hospitalar (66), Direito Penal (83), Direitos Humanos (116), Legislação de Trânsito (19), Ordem Unida (81) e Uso da Força (82).

## Privacidade e uso

As respostas e favoritas são guardadas no `localStorage` do navegador utilizado; não há conta nem envio de progresso para servidor. Para executar localmente, sirva a pasta por HTTP, por exemplo com `python3 -m http.server 8765`, e abra `http://localhost:8765`.

O conteúdo é material de estudo. Confira as apostilas e a legislação vigente; a aplicação não garante atualização normativa.

## Arquivo original

`index-completo-backup.html` foi preservado como recebido. Ele contém 454 questões de 7 disciplinas. O banco interativo acrescenta 116 questões de Direitos Humanos; as 454 questões compartilhadas estão idênticas entre o backup e `data/questions.json`.
