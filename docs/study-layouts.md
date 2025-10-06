# Presets de Layout de Study

Este projeto inclui presets nomeados para o layout de estudo dos flashcards.

## Friends Classic

- Nome interno: `friends_classic`
- O que faz:
  - Ordena os cards preservando a sequência natural de diálogos e episódios (prioriza `dialogueIndex`, depois `episodeOrder`, e por fim a ordem original).
  - Extrai e exibe a etiqueta de episódio na frente do card (usa `hint` ou o basename do pacote APKG).
  - Mantém a lógica atual de mídia (vídeo/áudio) e legendas.
- Aplicação automática:
  - É selecionado automaticamente para decks cuja origem indica "Friends" (pelo `hint`, caminhos de mídia ou padrões como `SxxEyy`).

## Force override por URL

Para restaurar/forçar um preset específico, use o parâmetro de query `layout` na página de estudo:

```
/flashcards/my-decks/:deckId?layout=friends_classic
```

Se quiser voltar ao comportamento padrão do app, use:

```
/flashcards/my-decks/:deckId?layout=default
```

## Como funciona

- O arquivo `src/config/studyLayouts.js` define os presets e a função de seleção `selectStudyLayout`.
- O `Study.jsx` utiliza `selectStudyLayout` com base nas linhas carregadas do deck e no `?layout=` da URL.
- A seleção é global (lado do cliente) e vale para todos os usuários.

## Recuperação / Backup

- O preset `friends_classic` centraliza a lógica de ordenação e extração (nome de episódio, ordem, índice de diálogo), servindo como ponto de restauração estável.
- Em caso de alterações futuras, basta manter/ajustar `src/config/studyLayouts.js` e usar o `?layout=friends_classic` para retornar ao comportamento “Friends”.