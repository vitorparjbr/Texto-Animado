# TextFlow - Animador de Texto

Aplicativo web para criar animações de texto em canvas, com pré-visualização em tempo real e exportação de vídeo no navegador. Funciona como PWA instalável (Android e iOS).

## Visão Geral

O TextFlow permite:

- Escrever e estilizar texto animado com múltiplas camadas
- Ajustar fonte, cor, alinhamento, velocidade e efeitos
- Aplicar gradiente de duas cores ao texto (calculado com base na largura real do texto)
- **Configurar o atraso de entrada de cada camada** (timeline independente: 0–10s)
- Aplicar animações com easing configurável
- Gerenciar múltiplas camadas de texto independentes
- Definir formato do canvas (9:16, 1:1, 16:9) e resolução (480p, 720p, 1080p)
- Usar fundo transparente, cor sólida, imagem ou vídeo importado
- Salvar projetos em até **5 slots independentes** via `localStorage`
- Desfazer e refazer alterações (undo/redo, até 50 estados)
- Exportar o resultado como vídeo com **pré-visualização antes de baixar**
- Usar offline como PWA instalado (Service Worker com cache completo)

## Tecnologias

- HTML5 / CSS3 / JavaScript puro (sem framework de build)
- API Canvas 2D
- MediaRecorder API (exportação de vídeo)
- Service Worker (cache offline / PWA)
- **Sem Tailwind CDN** — estilos utilitários locais em `styles/utils.css`
- Google Fonts: Space Grotesk, Playfair Display, Roboto Mono, Bebas Neue, Pacifico, Oswald

## Estrutura do Projeto

```
Texto Animado.html    # Página principal
index.html            # Redirecionamento (entrada para GitHub Pages)
manifest.json         # Manifesto PWA
service-worker.js     # Cache offline (textflow-v3)
styles/
  utils.css           # Utilitários CSS locais (substituto do Tailwind CDN)
  main.css            # Estilos globais e componentes visuais
scripts/
  state.js            # Estado global, formatos, easing, undo/redo, resetAnimation
  render.js           # Renderização do texto e efeitos no canvas (timeline por layer)
  events.js           # Binding de eventos e atalhos de teclado
  exporter.js         # Fluxo de exportação + modal de preview
  main.js             # Bootstrap, loop de animação e orquestração
icons/
  icon-192.png        # Ícone PWA
  icon-512.png        # Ícone PWA
```

## Como Executar

É um app estático — não há build necessário.

1. Abra o arquivo `Texto Animado.html` em um navegador moderno (Chrome ou Edge recomendados).
2. Ajuste as opções no menu lateral (ícone ☰).
3. Use os controles de reprodução para pré-visualizar.
4. Clique em **"Exportar Vídeo"** → assista o preview → baixe ou descarte.

## Fluxo da Aplicação

1. `state.js` — Expõe `window.TextFlowState` com estado, formatos, undo/redo e `resetAnimation`.
2. `render.js` — Expõe `window.TextFlowRender`; cada layer calcula seu próprio `t` a partir de `state.globalTime - layer.startDelay`.
3. `events.js` — Expõe `window.TextFlowEvents`, conecta UI ao estado.
4. `exporter.js` — Expõe `window.TextFlowExporter`; grava via `MediaRecorder` e exibe modal de preview.
5. `main.js` — Inicializa o app, incrementa `state.globalTime` no loop, sincroniza UI.

## Interface do Menu Lateral

| Seção | O que controla |
|---|---|
| **Texto** | Conteúdo do texto da camada ativa |
| **Velocidade** | Slider de 0.5× a 5× (global) |
| **Atraso da camada** | Slider de 0s a 10s — delay de entrada da camada ativa |
| **Alinhamento** | Esquerda, centro, direita |
| **Fonte** | Família, tamanho, cor, negrito/itálico |
| **Gradiente** | Ativar e configurar 2 cores |
| **Efeitos** | Sombra, Neon, Contorno, Vazado, Brilho |
| **Animação** | 9 tipos selecionáveis |
| **Easing** | 6 curvas de interpolação |
| **Formato** | 9:16, 1:1, 16:9 |
| **Resolução** | 480p, 720p, 1080p |
| **Fundo** | Transparente, cor sólida, imagem ou vídeo |
| **Camadas** | Adicionar, duplicar, remover, alternar |
| **Slot** | Seletor de 1 a 5 para salvamento independente |
| **Salvar / Carregar / Limpar** | Opera no slot selecionado |
| **Undo / Redo** | Botões no cabeçalho do menu (até 50 estados) |

## Timeline Independente por Camada

Cada camada tem seu próprio **atraso de entrada** (`startDelay`, em segundos). O modelo usa `state.globalTime` acumulado no loop:

```
t_layer = clamp((globalTime - layer.startDelay) / animDuration, 0, 1)
```

- Layers com `globalTime < startDelay` são **invisíveis** até seu momento.
- Scroll usa velocidade em px/s calculada em tempo real.
- Ao resetar, `globalTime = 0` faz todas as layers voltarem ao início.

## Recursos de Animação

**Animações disponíveis:**
`scrollUp` · `scrollDown` · `fadeIn` · `typewriter` · `zoomIn` · `bounce` · `slideLeft` · `slideRight` · `wave`

**Curvas de easing:**
`linear` · `easeIn` · `easeOut` · `easeInOut` · `elasticOut` · `bounceOut`

## Exportação e Preview

1. Clique **"Exportar Vídeo"** → gravação inicia com barra de progresso
2. Após a gravação, o **modal de preview** abre com o vídeo reproduzindo
3. Clique **"Baixar"** para confirmar e salvar o arquivo
4. Clique **"Descartar"** para cancelar (o blob é revogado da memória)

Fallback automático de MIME: `video/webm;codecs=vp9` → `video/webm` → `video/mp4`

## Atalhos de Teclado

| Atalho | Ação |
|---|---|
| `Espaço` | Play / Pause |
| `R` | Reiniciar animação (`globalTime = 0`) |
| `M` | Abrir / fechar menu |
| `Esc` | Fechar menu |
| `Ctrl+Z` / `Cmd+Z` | Desfazer |
| `Ctrl+Y` / `Cmd+Y` | Refazer |
| `Ctrl+B` / `Cmd+B` | Negrito |
| `Ctrl+I` / `Cmd+I` | Itálico |
| `Ctrl+E` / `Cmd+E` | Exportar vídeo |

## Salvamento Local

Chaves no `localStorage`: `textflow_project_slot1` a `textflow_project_slot5`.

> **Atenção:** fundos importados (imagem ou vídeo) **não são salvos** — são blob URLs temporários. Ao carregar um projeto salvo, reimporte o fundo manualmente. Um aviso é exibido automaticamente ao salvar quando há fundo ativo.

## PWA / Offline

- Service Worker `textflow-v3` cacheia todos os arquivos (incluindo `utils.css`) na primeira abertura online.
- Após a primeira visita, o app funciona completamente offline.
- Instalável em Android (Chrome) e iOS (Safari → "Adicionar à Tela de Início").
- Orientação: suporta retrato e paisagem.

## Compatibilidade

| Navegador | Suporte |
|---|---|
| Chrome / Edge (desktop e Android) | ✅ Completo |
| Safari (iOS) | ✅ Completo (PWA, canvas, vídeo) |
| Firefox | ⚠️ Canvas OK; exportação `.webm`; `playsinline` ignorado |

## Limitações Conhecidas

- Todas as camadas compartilham a mesma `speed` global — velocidades individuais por layer não estão implementadas.
- Tailwind CDN foi removido; os estilos utilitários locais (`utils.css`) cobrem todas as classes usadas, mas não suportam JIT dinâmico.
- O modal de preview usa o mesmo blob que a exportação — em dispositivos com pouca memória, vídeos longos podem ser lentos para carregar.

## Licença

Uso pessoal. Defina a licença (ex.: MIT) antes de distribuir publicamente.
