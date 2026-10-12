# Questões Manus — CFS 31

Aplicativo interativo de estudo para o Curso de Formação de Sargentos (CFS 31) da PMMS.

**Acesso:** https://vilsonloverthink.github.io/Quest-es-Manus-/

## O que oferece

- **Praticar:** selecione uma alternativa e confirme em **Conferir resposta**; só então a tentativa é registrada. Ao errar, o app mostra a correta, a justificativa, a resolução e a referência disponível. O trecho incorreto fornecido pelo banco aparece riscado e realçado em vermelho claro.
- **Simulado:** escolha respostas e confirme cada uma sem ver o gabarito durante a rodada; veja o resultado e revise erros ao terminar.
- **Banco:** abrir uma questão não a responde nem revela o gabarito. **Responder questão** e **Consultar gabarito e resolução** são opções separadas.
- **Filtros:** disciplina e assunto ficam dentro de um único controle recolhível, ao lado da busca.
- **Meu progresso:** histórico de tentativas, acertos, erros e favoritas, guardados somente no navegador utilizado.

O banco disponível tem **570 questões em 8 disciplinas**: Armamento e Munição I (43), Aspectos Culturais das Etnias Indígenas (80), Atendimento Pré-Hospitalar (66), Direito Penal (83), Direitos Humanos (116), Legislação de Trânsito (19), Ordem Unida (81) e Uso da Força (82). As referências e resoluções registradas são exibidas para consulta; confira as apostilas e a legislação vigente.

## Provão do CFS 30

As 100 questões adicionais do arquivo `Prova_Questoes_1_a_100_Editavel.docx` ainda não estão no app. O arquivo de origem não ficou acessível para esta sessão; a integração depende de receber o DOCX para extrair, conferir o gabarito e validar as referências nas apostilas antes de publicar as questões.

## Privacidade e execução local

As respostas e favoritas ficam no `localStorage` do navegador; não há conta nem envio de progresso ao servidor. Para executar localmente, sirva esta pasta por HTTP, por exemplo com `python3 -m http.server 8765`, e abra `http://localhost:8765`.

## Arquivo original preservado

`index-completo-backup.html` permanece arquivado sem alterações. Ele contém 454 questões de 7 disciplinas; essas 454 estão idênticas no banco interativo, que inclui mais 116 questões de Direitos Humanos.
