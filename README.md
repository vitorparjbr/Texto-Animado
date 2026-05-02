# TextFlow - Animador de Texto

Aplicativo web para criar animações de texto em canvas, com pré-visualização em tempo real e exportação de vídeo no navegador. Funciona como PWA instalável (Android e iOS).

## Visão Geral

O TextFlow permite:

- Escrever e estilizar texto animado
- Ajustar fonte, cor, alinhamento, velocidade e efeitos
- Aplicar gradiente de duas cores ao texto (calculado com base na largura real do texto)
- Aplicar animações com easing configurável
- Gerenciar múltiplas camadas de texto
- Definir formato do canvas (9:16, 1:1, 16:9) e resolução (480p, 720p, 1080p)
- Usar fundo transparente, cor sólida, imagem ou vídeo importado
- **Salvar projetos em até 5 slots independentes** via `localStorage`
- Desfazer e refazer alterações (undo/redo)
- Exportar o resultado como vídeo (`.webm` ou `.mp4`, conforme suporte do navegador)
- Usar offline como PWA instalado (Service Worker com cache completo)

## Tecnologias

- HTML5 / CSS3 / JavaScript puro (sem framework de build)
- API Canvas 2D
- MediaRecorder API (exportação de vídeo)
- Service Worker (cache offline / PWA)
- Tailwind CSS via CDN (utilitários no HTML)
- Google Fonts: Space Grotesk, Playfair Display, Roboto Mono, Bebas Neue, Pacifico, Oswald

## Estrutura do Projeto

```
Texto Animado.html    # Página principal
index.html            # Redirecionamento (entrada para GitHub Pages)
manifest.json         # Manifesto PWA
service-worker.js     # Cache offline
styles/
  main.css            # Estilos globais e componentes visuais
scripts/
  state.js            # Estado global, formatos, easing e undo/redo
  render.js           # Renderização do texto e efeitos no canvas
  events.js           # Binding de eventos e atalhos de teclado
  exporter.js         # Fluxo de exportação de vídeo
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
4. Clique em **"Exportar Vídeo"** para gerar o arquivo.

## Fluxo da Aplicação

1. `state.js` — Expõe `window.TextFlowState` com estado, formatos e undo/redo.
2. `render.js` — Expõe `window.TextFlowRender` com funções de desenho canvas.
3. `events.js` — Expõe `window.TextFlowEvents`, conecta UI ao estado.
4. `exporter.js` — Expõe `window.TextFlowExporter`, grava o canvas via `MediaRecorder`.
5. `main.js` — Inicializa o app, sincroniza UI e dispara o loop com `requestAnimationFrame`.

## Interface do Menu Lateral

| Seção | O que controla |
|---|---|
| **Texto** | Conteúdo do texto da camada ativa |
| **Velocidade** | Slider de 0.5× a 5× |
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

## Recursos de Animação

**Animações disponíveis:**
`scrollUp` · `scrollDown` · `fadeIn` · `typewriter` · `zoomIn` · `bounce` · `slideLeft` · `slideRight` · `wave`

**Curvas de easing:**
`linear` · `easeIn` · `easeOut` · `easeInOut` · `elasticOut` · `bounceOut`

## Exportação

A exportação usa `MediaRecorder` com fallback automático de MIME:

1. Tenta `video/webm;codecs=vp9`
2. Se não suportado, tenta `video/webm`
3. Se não suportado, tenta `video/mp4`

Observações:
- O arquivo final depende do suporte do navegador.
- A duração da gravação é calculada automaticamente com base na animação e velocidade.
- Fundos de vídeo importado também aparecem no vídeo exportado (renderizados via `ctx.drawImage`).

## Atalhos de Teclado

| Atalho | Ação |
|---|---|
| `Espaço` | Play / Pause |
| `R` | Reiniciar animação |
| `M` | Abrir / fechar menu |
| `Esc` | Fechar menu |
| `Ctrl+Z` / `Cmd+Z` | Desfazer |
| `Ctrl+Y` / `Cmd+Y` | Refazer |
| `Ctrl+B` / `Cmd+B` | Negrito |
| `Ctrl+I` / `Cmd+I` | Itálico |
| `Ctrl+E` / `Cmd+E` | Exportar vídeo |

## Salvamento Local

O projeto usa `localStorage` com chaves `textflow_project_slot1` a `textflow_project_slot5`.

> **Atenção:** fundos importados (imagem ou vídeo) **não são salvos** no localStorage — eles são blob URLs temporários e não serializáveis. Ao carregar um projeto salvo, reimporte o fundo manualmente. Um aviso é exibido automaticamente ao salvar quando há fundo ativo.

## PWA / Offline

- O Service Worker faz cache de todos os arquivos locais e recursos externos (Tailwind CDN, Google Fonts) na primeira abertura online.
- Após a primeira visita, o app funciona completamente offline.
- Instalável em Android (Chrome) e iOS (Safari → "Adicionar à Tela de Início").
- Orientação: suporta retrato e paisagem.

## Compatibilidade Recomendada

| Navegador | Suporte |
|---|---|
| Chrome / Edge (desktop e Android) | ✅ Completo |
| Safari (iOS) | ✅ Completo (PWA, canvas, vídeo) |
| Firefox | ⚠️ Canvas OK; exportação `.webm` (sem VP9); `playsinline` ignorado |

## Limitações Conhecidas

- Todas as camadas compartilham o mesmo progresso de animação — não há timeline independente por camada.
- Apenas um projeto pode ser editado por vez (sem abas ou workspaces múltiplos).
- Tailwind CSS carregado via CDN — se o cache do service worker não tiver sido populado durante uso online anterior, os estilos podem não carregar offline.

## Próximas Melhorias Sugeridas

- Substituir Tailwind CDN por CSS local compilado
- Adicionar timeline independente por camada
- Pré-visualização do arquivo antes de baixar

## Licença

Uso pessoal. Defina a licença (ex.: MIT) antes de distribuir publicamente.
