# TextFlow - Animador de Texto

Aplicativo web para criar animações de texto em canvas, com pré-visualização em tempo real e exportação de vídeo no navegador.

## Visão Geral

O TextFlow permite:

- Escrever e estilizar texto animado
- Ajustar fonte, cor, alinhamento, velocidade e efeitos
- Aplicar gradiente de duas cores ao texto
- Aplicar animações com easing configurável
- Gerenciar múltiplas camadas de texto
- Definir formato do canvas (9:16, 1:1, 16:9) e resolução (480p, 720p, 1080p)
- Usar fundo transparente, cor sólida, imagem ou vídeo
- Salvar, carregar e limpar projetos via `localStorage`
- Desfazer e refazer alterações (undo/redo)
- Exportar o resultado como vídeo (`.webm` ou `.mp4`, conforme suporte do navegador)

## Tecnologias

- HTML5
- CSS3
- JavaScript (sem framework de build)
- API Canvas 2D
- MediaRecorder API
- Tailwind CSS via CDN (utilitários no HTML)

## Estrutura do Projeto

- `Texto Animado.html`: página principal
- `styles/main.css`: estilos globais e componentes visuais
- `scripts/state.js`: estado global, formatos, easing e undo/redo
- `scripts/render.js`: lógica de renderização do texto e efeitos no canvas
- `scripts/events.js`: binding de eventos da interface e atalhos
- `scripts/exporter.js`: fluxo de exportação de vídeo
- `scripts/main.js`: orquestração da aplicação (bootstrap e loop de animação)

## Como Executar

Como é um app estático, não há etapa de build.

1. Abra o arquivo `Texto Animado.html` em um navegador moderno.
2. Ajuste as opções no menu lateral.
3. Use os controles de reprodução para pré-visualizar.
4. Clique em "Exportar Vídeo" para gerar o arquivo.

## Fluxo da Aplicação

1. `state.js` expõe o estado global (`window.TextFlowState`).
2. `render.js` expõe funções de desenho (`window.TextFlowRender`).
3. `events.js` conecta a UI ao estado (`window.TextFlowEvents`).
4. `exporter.js` grava o canvas (`window.TextFlowExporter`).
5. `main.js` inicializa o app, sincroniza UI e dispara o loop com `requestAnimationFrame`.

## Interface do Menu Lateral

O menu lateral de configurações inclui:

- **Texto**: campo de edição do conteúdo
- **Velocidade**: controle deslizante (0.5x a 5x)
- **Alinhamento**: esquerda, centro, direita
- **Fonte**: seleção entre 6 famílias (Space Grotesk, Playfair Display, Roboto Mono, Bebas Neue, Pacifico, Oswald), tamanho, cor, negrito/itálico
- **Gradiente**: toggle on/off com duas cores configuráveis
- **Efeitos**: sombra, neon, contorno, vazado, brilho — com ajustes de cor, espessura e intensidade
- **Animação**: 9 tipos selecionáveis (scroll up/down, fade in, typewriter, zoom in, bounce, slide left/right, wave)
- **Easing**: 6 curvas (linear, ease in/out/inout, elastic, bounce)
- **Formato**: 9:16, 1:1, 16:9
- **Resolução**: 480p, 720p, 1080p
- **Fundo**: transparente, cor sólida, imagem ou vídeo importado
- **Camadas**: adicionar, duplicar, remover e alternar entre camadas de texto
- **Projeto**: salvar, carregar e limpar dados do `localStorage`
- **Undo/Redo**: botões no cabeçalho do menu

O botão hambúrguer fica oculto enquanto o menu está aberto e reaparece ao fechar.

## Recursos de Animação

Animações suportadas no renderizador:

- `scrollUp`
- `scrollDown`
- `fadeIn`
- `typewriter`
- `zoomIn`
- `bounce`
- `slideLeft`
- `slideRight`
- `wave`

Easing disponível:

- `linear`
- `easeIn`
- `easeOut`
- `easeInOut`
- `elasticOut`
- `bounceOut`

## Exportação

A exportação usa `MediaRecorder` com fallback de MIME:

1. Tenta `video/webm;codecs=vp9`
2. Se não suportado, tenta `video/webm`
3. Se não suportado, tenta `video/mp4`

Observações:

- O arquivo final depende do suporte do navegador.
- O tempo de gravação varia conforme animação e velocidade.

## Atalhos de Teclado

- `Espaço`: play/pause
- `R`: reiniciar animação
- `M`: abrir/fechar menu
- `Esc`: fechar menu
- `Ctrl+Z` ou `Cmd+Z`: desfazer
- `Ctrl+Y` ou `Cmd+Y`: refazer
- `Ctrl+B` ou `Cmd+B`: negrito
- `Ctrl+I` ou `Cmd+I`: itálico
- `Ctrl+E` ou `Cmd+E`: exportar vídeo

## Estado Salvo Localmente

O projeto usa `localStorage` com a chave `textflow_project` para salvar e carregar configurações de edição.

## Compatibilidade Recomendada

- Google Chrome (recomendado)
- Microsoft Edge (Chromium)
- Outros navegadores modernos com suporte a Canvas e MediaRecorder

## Limitações Conhecidas

- A exportação depende do suporte de codec/MIME do navegador.
- Recursos avançados de gravação podem variar em navegadores móveis.
- Fundos importados (imagem ou vídeo) não são salvos no projeto (`localStorage`). Ao carregar um projeto salvo, o fundo precisará ser reimportado manualmente.

## Próximas Melhorias Sugeridas

- Remover dependência de Tailwind CDN e consolidar estilo local
- Adicionar testes para funções de estado e render
- Criar versão com servidor local e scripts de desenvolvimento

## Licença

Defina a licença do projeto (ex.: MIT) neste repositório antes da distribuição.
