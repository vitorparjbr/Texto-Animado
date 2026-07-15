# TextFlow - Animador de Texto

Aplicativo web para criar animações de texto em canvas, com pré-visualização em tempo real e exportação de vídeo no navegador. Funciona como PWA instalável (Android).

## Visão Geral

O TextFlow permite:

- Escrever e estilizar texto animado com múltiplas camadas
- Ajustar fonte, cor, alinhamento, velocidade e efeitos
- Aplicar formatação parcial em letras, palavras ou frases dentro da camada ativa
- Aplicar gradiente de duas cores ao texto (calculado com base na largura real do texto)
- **Configurar o atraso de entrada de cada camada** (timeline independente: 0–10s)
- Aplicar animações com easing configurável
- Gerenciar múltiplas camadas de texto independentes
- Definir formato do canvas (9:16, 1:1, 16:9) e resolução (480p, 720p, 1080p)
- Usar fundo transparente, cor sólida, imagem ou vídeo importado
- Importar uma trilha de áudio com volume, corte, fade in e fade out
- Usar o áudio do vídeo de fundo como alternativa à trilha importada
- Salvar projetos em até **5 slots independentes** via `localStorage`
- Desfazer e refazer alterações (undo/redo, até 50 estados)
- Exportar o resultado como vídeo com **pré-visualização antes de baixar**
- **Compartilhar o vídeo exportado** diretamente via menu nativo do Android (WhatsApp, Instagram, Drive…)
- Usar offline como PWA instalado (Service Worker com cache completo)

## Tecnologias

- HTML5 / CSS3 / JavaScript puro (sem framework de build)
- WebCodecs API (Mp4Muxer) e MediaRecorder API (exportação de vídeo)
- Service Worker (cache offline / PWA)
- Biblioteca externa `mp4-muxer` carregada via CDN para renderização de MP4 nativo
- **Sem Tailwind CDN** — estilos utilitários locais em `styles/utils.css`
- Google Fonts: Space Grotesk, Playfair Display, Roboto Mono, Bebas Neue, Pacifico, Oswald

## Estrutura do Projeto

```text
index.html            # Página principal
manifest.json         # Manifesto PWA (ícones separados any/maskable, shortcuts)
service-worker.js     # Cache offline (textflow-v18)
styles/
  utils.css           # Utilitários CSS locais (substituto do Tailwind CDN)
  main.css            # Estilos globais e componentes visuais
scripts/
  state.js            # Estado global, seleção ativa, estilos inline, formatos, easing, undo/redo, resetAnimation, áudio
  render.js           # Renderização do texto e efeitos no canvas (timeline por layer e fragmentos estilizados)
  events.js           # Binding de eventos e atalhos de teclado
  exporter.js         # Fluxo de exportação + mixagem simples de áudio + preview + Web Share API
  main.js             # Bootstrap, loop de animação e orquestração
icons/
  icon-192.png        # Ícone PWA
  icon-512.png        # Ícone PWA
```

## Como Executar

É um app estático — não há build necessário.

1. Sirva a pasta do projeto em um servidor local simples e abra `index.html` em um navegador moderno (Chrome ou Edge recomendados).
2. Exemplo rápido: `python -m http.server 8000` e depois acesse `http://localhost:8000/`.
3. Ajuste as opções no menu lateral (ícone ☰).
4. Use os controles de reprodução para pré-visualizar.
5. Clique em **"Exportar Vídeo"** → assista o preview → baixe ou descarte.

## Fluxo da Aplicação

1. `state.js` — Expõe `window.TextFlowState` com estado, seleção persistida do editor, estilos inline por intervalo, formatos, áudio, undo/redo e `resetAnimation`.
2. `render.js` — Expõe `window.TextFlowRender`; cada layer calcula seu próprio `t` a partir de `state.globalTime - layer.startDelay` e desenha fragmentos estilizados no canvas.
3. `events.js` — Expõe `window.TextFlowEvents`, conecta UI ao estado e aplica formatação parcial na seleção do textarea.
4. `exporter.js` — Expõe `window.TextFlowExporter`; grava via `MediaRecorder`, mistura a trilha de áudio quando disponível e exibe modal de preview.
5. `main.js` — Inicializa o app, incrementa `state.globalTime` no loop, sincroniza UI e reflete o estilo da seleção nos controles.

## Interface do Menu Lateral

| Seção | O que controla |
| --- | --- |
| **Texto** | Conteúdo do texto da camada ativa, com seleção persistida para aplicar formatação parcial |
| **Velocidade** | Slider de 0.1× a 5× (global) |
| **Atraso da camada** | Slider de 0s a 10s — delay de entrada da camada ativa |
| **Alinhamento** | Esquerda, centro, direita |
| **Fonte** | Família, tamanho, cor, negrito/itálico; com seleção ativa, afeta só o trecho selecionado |
| **Gradiente** | Ativar e configurar 2 cores |
| **Efeitos** | Sombra, Neon, Contorno, Vazado, Brilho |
| **Animação** | 9 tipos selecionáveis |
| **Easing** | 6 curvas de interpolação |
| **Formato** | 9:16, 1:1, 16:9 |
| **Resolução** | 480p, 720p, 1080p |
| **Fundo** | Transparente, cor sólida, imagem ou vídeo |
| **Áudio** | Importar trilha ou usar o áudio do vídeo de fundo, com volume, início, fim, fade in e fade out |
| **Camadas** | Adicionar, duplicar, remover, alternar |
| **Slot** | Seletor de 1 a 5 para salvamento independente |
| **Salvar / Carregar / Limpar** | Opera no slot selecionado |
| **Undo / Redo** | Botões no cabeçalho do menu (até 50 estados) |

## Formatação Parcial por Seleção

O editor de texto da camada ativa agora aceita formatação parcial por intervalo.

- Selecione uma letra, palavra ou frase no campo **Texto**.
- Use os controles de **Fonte** para aplicar família, tamanho, cor, negrito ou itálico apenas naquele trecho.
- O preview em canvas reflete imediatamente essa formatação parcial.
- O painel mostra quando a seleção está ativa e sinaliza quando o trecho contém **estilos mistos**.
- O botão **"Limpar formatação do trecho"** remove apenas os estilos inline da seleção e mantém o estilo base da camada.
- Sem seleção ativa, os mesmos controles continuam atuando sobre a camada inteira.

## Timeline Independente por Camada

Cada camada tem seu próprio **atraso de entrada** (`startDelay`, em segundos). O modelo usa `state.globalTime` acumulado no loop:

```text
t_layer = clamp((globalTime - layer.startDelay) / animDuration, 0, 1)
```

- Layers com `globalTime < startDelay` são **invisíveis** até seu momento.
- Scroll usa velocidade em px/s calculada em tempo real e agora conta com renderização suavizada para velocidades lentas (0.1×–0.5×).
- Ao resetar, `globalTime = 0` faz todas as layers voltarem ao início.

## Recursos de Animação

**Animações disponíveis:**
`scrollUp` · `scrollDown` · `fadeIn` · `typewriter` · `zoomIn` · `bounce` · `slideLeft` · `slideRight` · `wave`

**Curvas de easing:**
`linear` · `easeIn` · `easeOut` · `easeInOut` · `elasticOut` · `bounceOut`

## Exportação e Preview

1. Clique **"Exportar Vídeo"** → gravação inicia com barra de progresso
2. Após a gravação, o **modal de preview** abre com o vídeo reproduzindo
3. Clique **"Compartilhar"** para abrir o menu nativo do Android (WhatsApp, Instagram, Drive…) — o botão só aparece se o navegador suportar compartilhamento de arquivos
4. Clique **"Baixar"** para salvar o arquivo localmente
5. Clique **"Descartar"** para cancelar (o blob é liberado da memória após 30s)

Se houver uma trilha importada ou o áudio do vídeo de fundo estiver selecionado, a exportação incorpora o trecho configurado com volume, fade in e fade out.

O preview usa o mesmo pipeline de renderização da exportação, então a formatação parcial aplicada em letras, palavras ou frases também aparece no vídeo exportado.

> Se o navegador não suportar `MediaRecorder`, o botão "Exportar Vídeo" é desabilitado automaticamente com um aviso explicativo.

O exportador tenta nativamente utilizar **WebCodecs** junto ao pacote **Mp4Muxer** para entregar uma excelente qualidade em formato `.mp4`. Caso o hardware ou o navegador mobile falhe ao codificar, ele faz fallback automático para `MediaRecorder` seguindo os MIME types: `video/mp4` → `video/webm;codecs=vp8,opus` → `video/webm`.

## Atalhos de Teclado

| Atalho | Ação |
| --- | --- |
| `Espaço` | Play / Pause |
| `R` | Reiniciar animação (`globalTime = 0`) |
| `M` | Abrir / fechar menu |
| `Esc` | Fechar menu |
| `Ctrl+Z` / `Cmd+Z` | Desfazer |
| `Ctrl+Y` / `Cmd+Y` | Refazer |
| `Ctrl+B` / `Cmd+B` | Negrito |
| `Ctrl+I` / `Cmd+I` | Itálico |
| `Ctrl+E` / `Cmd+E` | Exportar vídeo |

> Com uma seleção ativa no campo de texto, `Ctrl+B` e `Ctrl+I` atuam apenas sobre o trecho selecionado. Sem seleção, continuam alterando a camada inteira.

## Salvamento Local

Chaves no `localStorage`: `textflow_project_slot1` a `textflow_project_slot5`.

> **Atenção:** fundos e áudios importados **não são salvos** — são URLs temporárias. Ao carregar um projeto salvo, reimporte os arquivos manualmente. Um aviso é exibido automaticamente ao salvar quando há mídia importada.

## PWA / Offline

- Service Worker `textflow-v18` cacheia o app shell e assets estáticos na primeira abertura online.
- Após a primeira visita, o app funciona completamente offline.
- Instalável em Android via Chrome ("Adicionar à tela inicial" ou prompt automático).
- Ícones com entradas separadas `"purpose": "any"` e `"purpose": "maskable"` — exibidos corretamente em launchers adaptivos do Android.
- Shortcut registrado no manifesto: long-press no ícone exibe o atalho "Novo Projeto".
- Orientação: suporta retrato e paisagem.
- O app exibe um banner quando uma nova versão do Service Worker está pronta para ativação.
- **Loop de animação pausado** quando a aba vai para segundo plano (`visibilitychange`) — economiza bateria.
- **Swipe da borda esquerda** (≤30px) para a direita abre o menu lateral, como apps nativos Android.
- **`touch-action: manipulation`** em todos os botões elimina o delay de 300ms ao tocar.

### Atualização de versão do PWA

- Sempre incremente `CACHE_NAME` em [service-worker.js](service-worker.js#L1) quando mudar HTML, bootstrap, manifesto ou arquivos essenciais do app shell.
- Navegação usa network-first com fallback offline para reduzir risco de o app instalado ficar preso em shell antigo.
- Se uma atualização já estiver baixada, o app exibe um banner para recarregar e ativar a nova versão.

## Compatibilidade

| Navegador | Suporte |
| --- | --- |
| Chrome / Edge Android | ✅ Completo (PWA, canvas, exportação, compartilhamento) |
| Chrome / Edge desktop | ✅ Completo |
| Firefox | ⚠️ Canvas OK; exportação `.webm`; compartilhamento não suportado |
| Safari / iOS | ⚠️ Canvas OK; exportação de vídeo não suportada (`MediaRecorder`) |

## Limitações Conhecidas

- Todas as camadas compartilham a mesma `speed` global — velocidades individuais por layer não estão implementadas.
- A formatação parcial atual cobre família, tamanho, cor, negrito e itálico; gradiente, efeitos e alinhamento continuam sendo propriedades da camada inteira.
- Tailwind CDN foi removido; os estilos utilitários locais (`utils.css`) cobrem todas as classes usadas, mas não suportam JIT dinâmico.
- O modal de preview usa o mesmo blob que a exportação — em dispositivos com pouca memória, vídeos longos podem ser lentos para carregar.
- Fundos importados (imagem ou vídeo) não são salvos nos slots — são blob URLs temporários criados no momento do import.
- O áudio é limitado a uma única fonte por projeto; você pode escolher entre trilha importada ou áudio do vídeo de fundo, mas não misturar ambas.

## Licença

Uso pessoal. Defina a licença (ex.: MIT) antes de distribuir publicamente.
