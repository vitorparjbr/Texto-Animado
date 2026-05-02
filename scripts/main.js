(() => {
    const { easings, state, createDefaultLayer, getActiveLayer, getCanvasDimensions, saveUndoState, undo, redo } = window.TextFlowState;
    const { getTotalTextHeight, resetAnimation: resetAnimationCore, render } = window.TextFlowRender;
    const { exportVideo } = window.TextFlowExporter;
    const { bindEvents } = window.TextFlowEvents;

    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
    const videoBg = document.getElementById('videoBg');
    const imageBg = document.getElementById('imageBg');
    const toastEl = document.getElementById('toast');

    let toastTimeout;

    function showToast(msg, type) {
        const toastType = type || 'info';
        clearTimeout(toastTimeout);
        toastEl.textContent = msg;
        toastEl.className = 'toast ' + toastType;
        requestAnimationFrame(function() {
            toastEl.classList.add('show');
        });
        toastTimeout = setTimeout(function() {
            toastEl.classList.remove('show');
        }, 2500);
    }

    function resetAnimation() {
        resetAnimationCore(state, canvas);
    }

    function handleResize() {
        const dim = getCanvasDimensions();
        const maxWidth = Math.min(dim.width, window.innerWidth - 32);
        const maxHeight = window.innerHeight - 150;
        const scale = Math.min(maxWidth / dim.width, maxHeight / dim.height);
        canvas.style.width = (dim.width * scale) + 'px';
        canvas.style.height = (dim.height * scale) + 'px';
    }

    function initCanvas() {
        const dim = getCanvasDimensions();
        canvas.width = dim.width;
        canvas.height = dim.height;
        handleResize();
        resetAnimation();
    }

    function updatePlayPauseUI() {
        document.getElementById('playIcon').style.display = state.isPlaying ? 'none' : 'block';
        document.getElementById('pauseIcon').style.display = state.isPlaying ? 'block' : 'none';
    }

    function togglePlayPause() {
        state.isPlaying = !state.isPlaying;
        updatePlayPauseUI();
        if (state.mediaType === 'video') {
            if (state.isPlaying) videoBg.play();
            else videoBg.pause();
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function renderLayers() {
        const list = document.getElementById('layersList');
        list.innerHTML = '';

        state.layers.forEach(function(layer) {
            const el = document.createElement('div');
            el.className = 'layer-item' + (layer.id === state.activeLayerId ? ' active' : '');
            el.innerHTML =
                '<span class="layer-text">' + escapeHtml(layer.text || '(vazio)') + '</span>' +
                '<div class="layer-actions">' +
                    '<button class="duplicate-layer" title="Duplicar" data-id="' + layer.id + '">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                    '</button>' +
                    '<button class="delete-layer" title="Remover" data-id="' + layer.id + '">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>' +
                '</div>';

            el.addEventListener('click', function(e) {
                if (e.target.closest('.layer-actions')) return;
                saveUndoState();
                state.activeLayerId = layer.id;
                syncUIFromState();
            });

            list.appendChild(el);
        });

        list.querySelectorAll('.delete-layer').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (state.layers.length <= 1) {
                    showToast('Precisa ter pelo menos uma camada', 'error');
                    return;
                }
                saveUndoState();
                const id = parseInt(btn.dataset.id, 10);
                state.layers = state.layers.filter(function(layer) {
                    return layer.id !== id;
                });
                if (state.activeLayerId === id) state.activeLayerId = state.layers[0].id;
                syncUIFromState();
            });
        });

        list.querySelectorAll('.duplicate-layer').forEach(function(btn) {
            btn.addEventListener('click', function() {
                saveUndoState();
                const id = parseInt(btn.dataset.id, 10);
                const src = state.layers.find(function(layer) {
                    return layer.id === id;
                });
                if (!src) return;
                const dup = Object.assign({}, src, { id: state.nextLayerId++ });
                dup.text = src.text + ' (copia)';
                state.layers.push(dup);
                state.activeLayerId = dup.id;
                syncUIFromState();
            });
        });
    }

    function syncUIFromState() {
        const layer = getActiveLayer();
        document.getElementById('textInput').value = layer.text;
        document.getElementById('fontFamily').value = layer.fontFamily;
        document.getElementById('fontSize').value = layer.fontSize;
        document.getElementById('textColor').value = layer.textColor;
        document.getElementById('colorHex').textContent = layer.textColor;
        document.getElementById('speedControl').value = state.speed;
        document.getElementById('speedValue').textContent = state.speed + 'x';

        document.getElementById('boldToggle').classList.toggle('active', layer.bold);
        document.getElementById('italicToggle').classList.toggle('active', layer.italic);

        document.getElementById('effectType').value = layer.effect;
        document.getElementById('effectOptions').style.display = layer.effect === 'none' ? 'none' : 'block';
        document.getElementById('effectColor').value = layer.effectColor;
        document.getElementById('effectThickness').value = layer.effectThickness;
        document.getElementById('thicknessValue').textContent = layer.effectThickness;
        document.getElementById('effectIntensity').value = layer.effectIntensity;
        document.getElementById('intensityValue').textContent = layer.effectIntensity + '%';

        document.getElementById('gradientColor1').value = layer.gradientColor1;
        document.getElementById('gradientColor2').value = layer.gradientColor2;
        const gradientToggle = document.getElementById('gradientToggle');
        gradientToggle.classList.toggle('active', layer.useGradient);
        gradientToggle.textContent = layer.useGradient ? 'ON' : 'OFF';

        document.querySelectorAll('[data-align]').forEach(function(b) {
            b.classList.toggle('active', b.dataset.align === layer.align);
        });
        document.querySelectorAll('[data-anim]').forEach(function(b) {
            b.classList.toggle('active', b.dataset.anim === layer.animationType);
        });
        document.querySelectorAll('[data-easing]').forEach(function(b) {
            b.classList.toggle('active', b.dataset.easing === layer.easing);
        });
        document.querySelectorAll('[data-format]').forEach(function(b) {
            b.classList.toggle('active', b.dataset.format === state.format);
        });
        document.querySelectorAll('[data-res]').forEach(function(b) {
            b.classList.toggle('active', parseInt(b.dataset.res, 10) === state.resolution);
        });

        document.getElementById('bgTransparent').classList.toggle('active', state.bgTransparent);
        document.getElementById('bgColorBtn').classList.toggle('active', !state.bgTransparent);
        document.getElementById('bgColorPicker').style.display = state.bgTransparent ? 'none' : 'block';

        renderLayers();
    }

    function openMenu() {
        const menu = document.getElementById('sideMenu');
        const overlay = document.getElementById('menuOverlay');
        menu.classList.remove('hidden', 'menu-exit');
        menu.classList.add('menu-enter');
        overlay.classList.add('active');
        document.getElementById('menuToggle').style.display = 'none';
    }

    function closeMenu() {
        const menu = document.getElementById('sideMenu');
        const overlay = document.getElementById('menuOverlay');
        menu.classList.remove('menu-enter');
        menu.classList.add('menu-exit');
        overlay.classList.remove('active');
        document.getElementById('menuToggle').style.display = '';
        setTimeout(function() {
            menu.classList.add('hidden');
        }, 300);
    }

    function isMenuOpen() {
        return !document.getElementById('sideMenu').classList.contains('hidden');
    }

    function runUndo() {
        undo(function() {
            syncUIFromState();
            showToast('Ação desfeita', 'info');
        });
    }

    function runRedo() {
        redo(function() {
            syncUIFromState();
            showToast('Ação refeita', 'info');
        });
    }

    function runExport() {
        return exportVideo({
            canvas,
            state,
            getActiveLayer,
            getTotalTextHeight: function() {
                return getTotalTextHeight(ctx, canvas, state.layers);
            },
            updatePlayPauseUI,
            resetAnimation,
            showToast
        });
    }

    function animate(timestamp) {
        if (!state.lastTime) state.lastTime = timestamp;
        let delta = (timestamp - state.lastTime) / 1000;
        state.lastTime = timestamp;

        if (delta > 0.1) delta = 0.016;

        if (state.isPlaying) {
            const anim = getActiveLayer().animationType;
            const isScrollAnim = anim === 'scrollUp' || anim === 'scrollDown';

            if (isScrollAnim) {
                const textHeight = getTotalTextHeight(ctx, canvas, state.layers);
                const totalDistance = canvas.height + textHeight + 100;
                const pixelsPerSecond = state.speed * 60;
                const duration = totalDistance / pixelsPerSecond;
                state.animProgress += delta / duration;
                if (state.animProgress > 1) state.animProgress = 0;
            } else {
                const duration = Math.max(0.5, 5 / state.speed);
                state.animProgress += delta / duration;
                if (state.animProgress > 1) state.animProgress = 0;
            }
        }

        render(ctx, canvas, state, videoBg, imageBg, easings);
        state.animationId = requestAnimationFrame(animate);
    }

    bindEvents({
        state,
        videoBg,
        imageBg,
        getActiveLayer,
        createDefaultLayer,
        saveUndoState,
        undo: runUndo,
        redo: runRedo,
        syncUIFromState,
        resetAnimation,
        initCanvas,
        togglePlayPause,
        openMenu,
        closeMenu,
        isMenuOpen,
        showToast,
        runExport
    });

    window.addEventListener('resize', handleResize);

    initCanvas();
    syncUIFromState();
    requestAnimationFrame(animate);
})();
