(() => {
    const { easings, state, createDefaultLayer, getActiveLayer, getCanvasDimensions, saveUndoState, undo, redo, resetAnimation: stateReset } = window.TextFlowState;
    const { getTotalTextHeight, render } = window.TextFlowRender;
    const { exportVideo } = window.TextFlowExporter;
    const { bindEvents } = window.TextFlowEvents;

    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
    const videoBg = document.getElementById('videoBg');
    const imageBg = document.getElementById('imageBg');
    const audioTrack = document.getElementById('audioTrack');
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

    function hasImportedAudio() {
        return !!state.audioSource;
    }

    function hasBackgroundVideoAudio() {
        return state.mediaType === 'video' && !!state.mediaSource;
    }

    function getActiveAudioMode() {
        if (state.audioSourceMode === 'backgroundVideo' && hasBackgroundVideoAudio()) {
            return 'backgroundVideo';
        }
        if (hasImportedAudio()) {
            return 'imported';
        }
        return 'none';
    }

    function getActiveAudioDuration() {
        if (getActiveAudioMode() === 'backgroundVideo') {
            return Number.isFinite(videoBg.duration) ? videoBg.duration : 0;
        }
        return state.audioDuration || 0;
    }

    function getActiveAudioLabel() {
        if (getActiveAudioMode() === 'backgroundVideo') {
            return (state.mediaFileName || 'Video de fundo') + ' • audio do video';
        }
        return state.audioFileName;
    }

    function getActivePreviewAudioSource() {
        if (getActiveAudioMode() === 'backgroundVideo') {
            return state.mediaSource;
        }
        return state.audioSource;
    }

    function ensurePreviewAudioSource() {
        var nextSource = getActivePreviewAudioSource();
        var currentSource = audioTrack.getAttribute('src');

        if (!nextSource) {
            if (currentSource) {
                audioTrack.pause();
                audioTrack.removeAttribute('src');
                audioTrack.load();
            }
            return;
        }

        if (currentSource !== nextSource) {
            audioTrack.pause();
            audioTrack.src = nextSource;
            audioTrack.load();
        }
    }

    function resetAnimation() {
        stateReset();
        if (state.mediaType === 'video') {
            if (getActiveAudioMode() === 'backgroundVideo') {
                syncBackgroundVideo(true);
            } else {
                videoBg.currentTime = 0;
            }
        }
        syncPreviewAudio(true);
    }

    function formatSeconds(seconds) {
        return (Math.round(seconds * 10) / 10).toFixed(1) + 's';
    }

    function getAudioTrimStart() {
        return Math.max(0, Math.min(state.audioTrimStart || 0, getActiveAudioDuration()));
    }

    function getAudioTrimEnd() {
        const duration = getActiveAudioDuration();
        if (!duration) return 0;
        const rawEnd = state.audioTrimEnd || duration;
        return Math.max(getAudioTrimStart(), Math.min(rawEnd, duration));
    }

    function applyAudioVolume() {
        audioTrack.volume = Math.max(0, Math.min(state.audioVolume || 0, 1));
    }

    function isAudioReadyForExport() {
        var activeAudioMode = getActiveAudioMode();
        if (activeAudioMode === 'imported') {
            return !!state.audioBuffer;
        }
        if (activeAudioMode === 'backgroundVideo') {
            return hasBackgroundVideoAudio() && (videoBg.readyState >= 1 || Number.isFinite(videoBg.duration));
        }
        return true;
    }

    function updateExportAvailability() {
        var exportBtn = document.getElementById('exportBtn');
        var exportHint = document.getElementById('audioExportHint');
        var activeAudioMode = getActiveAudioMode();
        var mediaRecorderSupported = typeof MediaRecorder !== 'undefined' && (
            MediaRecorder.isTypeSupported('video/webm') || MediaRecorder.isTypeSupported('video/mp4')
        );
        var canExport = mediaRecorderSupported && !(activeAudioMode === 'imported' && state.audioIsDecoding) && isAudioReadyForExport();

        exportBtn.disabled = !canExport;
        if (mediaRecorderSupported && !canExport && activeAudioMode === 'imported' && state.audioIsDecoding) {
            exportHint.textContent = 'Aguarde o audio terminar de processar para exportar.';
            exportHint.style.display = 'block';
        } else if (mediaRecorderSupported && !canExport && activeAudioMode === 'backgroundVideo') {
            exportHint.textContent = 'Aguarde o video de fundo carregar para usar o audio dele na exportacao.';
            exportHint.style.display = 'block';
        } else {
            exportHint.style.display = 'none';
        }

        if (!mediaRecorderSupported) {
            exportHint.style.display = 'none';
        }
    }

    function syncBackgroundVideo(forceSeek) {
        var trimStart;
        var trimEnd;
        var targetTime;

        if (getActiveAudioMode() !== 'backgroundVideo' || state.mediaType !== 'video' || videoBg.readyState < 1) {
            return;
        }

        trimStart = getAudioTrimStart();
        trimEnd = getAudioTrimEnd();
        targetTime = Math.min(trimEnd, trimStart + state.globalTime);

        if (
            forceSeek ||
            videoBg.currentTime < trimStart ||
            videoBg.currentTime > trimEnd ||
            Math.abs(videoBg.currentTime - targetTime) > 0.25
        ) {
            try {
                videoBg.currentTime = targetTime;
            } catch (error) {
                // Ignore transient seek failures while metadata is loading.
            }
        }

        if (state.isPlaying && targetTime < trimEnd - 0.05) {
            videoBg.play().catch(function() {});
        } else {
            videoBg.pause();
        }
    }

    function syncPreviewAudio(forceSeek) {
        ensurePreviewAudioSource();

        if (getActiveAudioMode() === 'none' || !getActiveAudioDuration() || audioTrack.readyState < 1) {
            return;
        }

        const trimStart = getAudioTrimStart();
        const trimEnd = getAudioTrimEnd();
        const targetTime = Math.min(trimEnd, trimStart + state.globalTime);

        applyAudioVolume();

        if (
            forceSeek ||
            audioTrack.currentTime < trimStart ||
            audioTrack.currentTime > trimEnd ||
            Math.abs(audioTrack.currentTime - targetTime) > 0.25
        ) {
            try {
                audioTrack.currentTime = targetTime;
            } catch (error) {
                // Ignore transient seek failures while metadata is loading.
            }
        }

        if (state.isPlaying && targetTime < trimEnd - 0.05) {
            if (audioTrack.paused) {
                audioTrack.play().catch(function() {});
            }
        } else if (!audioTrack.paused) {
            audioTrack.pause();
        }
    }

    function handleResize() {
        // Skip resize when menu is open: the virtual keyboard opening fires a resize
        // event but we don't want to shrink the canvas while the user is typing.
        if (isMenuOpen()) return;
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const horizontalPadding = viewportWidth <= 640 ? 16 : 64;
        const verticalPadding = viewportWidth <= 640 ? 112 : 180;
        const dim = getCanvasDimensions();
        const maxWidth = Math.max(180, viewportWidth - horizontalPadding);
        const maxHeight = Math.max(180, viewportHeight - verticalPadding);
        const scale = Math.min(maxWidth / dim.width, maxHeight / dim.height, 1);
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
            if (getActiveAudioMode() === 'backgroundVideo') {
                syncBackgroundVideo(true);
            } else if (state.isPlaying) {
                videoBg.play().catch(function() {});
            } else {
                videoBg.pause();
            }
        }
        syncPreviewAudio(true);
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
            el.dataset.layerId = layer.id;
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

        var activeAudioMode = getActiveAudioMode();
        var hasAudio = activeAudioMode !== 'none';
        var backgroundAudioWrap = document.getElementById('audioUseBackgroundWrap');
        var backgroundAudioToggle = document.getElementById('audioUseBackgroundVideo');
        var audioControls = document.getElementById('audioControls');
        var audioSummary = document.getElementById('audioSummary');
        var audioTimeline = document.getElementById('audioTimeline');
        backgroundAudioWrap.style.display = hasBackgroundVideoAudio() ? 'flex' : 'none';
        backgroundAudioToggle.checked = activeAudioMode === 'backgroundVideo';
        audioControls.style.display = hasAudio ? 'block' : 'none';
        if (hasAudio) {
            var trimStart = getAudioTrimStart();
            var trimEnd = getAudioTrimEnd();
            if (activeAudioMode === 'imported' && state.audioIsDecoding) {
                audioSummary.textContent = getActiveAudioLabel() + ' • processando audio para exportacao...';
            } else if (activeAudioMode === 'backgroundVideo' && !getActiveAudioDuration()) {
                audioSummary.textContent = getActiveAudioLabel() + ' • carregando audio do video...';
            } else if (activeAudioMode === 'imported' && !state.audioBuffer) {
                audioSummary.textContent = getActiveAudioLabel() + ' • preview pronto, mas a exportacao com audio nao esta disponivel.';
            } else {
                audioSummary.textContent = getActiveAudioLabel() + ' • ' + formatSeconds(getActiveAudioDuration()) + ' • trecho ' + formatSeconds(trimStart) + ' - ' + formatSeconds(trimEnd);
            }
            document.getElementById('audioVolume').value = state.audioVolume;
            document.getElementById('audioVolumeValue').textContent = Math.round(state.audioVolume * 100) + '%';
            document.getElementById('audioTrimStart').value = trimStart.toFixed(1);
            document.getElementById('audioTrimEnd').value = trimEnd.toFixed(1);
            document.getElementById('audioFadeIn').value = (state.audioFadeIn || 0).toFixed(1);
            document.getElementById('audioFadeOut').value = (state.audioFadeOut || 0).toFixed(1);
            if (getActiveAudioDuration() > 0) {
                var selectionLeft = (trimStart / getActiveAudioDuration()) * 100;
                var selectionWidth = ((trimEnd - trimStart) / getActiveAudioDuration()) * 100;
                document.getElementById('audioTimelineSelection').style.left = selectionLeft + '%';
                document.getElementById('audioTimelineSelection').style.width = selectionWidth + '%';
                document.getElementById('audioTimelineStart').textContent = formatSeconds(trimStart);
                document.getElementById('audioTimelineEnd').textContent = formatSeconds(trimEnd);
                document.getElementById('audioTimelineLength').textContent = 'Trecho ' + formatSeconds(trimEnd - trimStart);
                audioTimeline.style.display = 'flex';
            } else {
                audioTimeline.style.display = 'none';
            }
        } else {
            audioSummary.textContent = hasBackgroundVideoAudio()
                ? 'Importe uma trilha ou marque a opcao para usar o audio do video de fundo.'
                : 'Nenhum áudio importado.';
            audioTimeline.style.display = 'none';
        }

        updateExportAvailability();

        // Delay slider
        var delayEl = document.getElementById('layerDelay');
        var delayValEl = document.getElementById('layerDelayValue');
        if (delayEl) {
            delayEl.value = layer.startDelay || 0;
            delayValEl.textContent = (layer.startDelay || 0).toFixed(1) + 's';
        }

        renderLayers();
    }

    function openMenu() {
        const menu = document.getElementById('sideMenu');
        const overlay = document.getElementById('menuOverlay');
        const menuToggle = document.getElementById('menuToggle');
        menu.classList.remove('hidden', 'menu-exit');
        menu.classList.add('menu-enter');
        menu.setAttribute('aria-hidden', 'false');
        overlay.classList.add('active');
        menuToggle.setAttribute('aria-expanded', 'true');
        menuToggle.style.display = 'none';
        requestAnimationFrame(function() {
            document.getElementById('closeMenu').focus();
        });
    }

    function closeMenu() {
        const menu = document.getElementById('sideMenu');
        const overlay = document.getElementById('menuOverlay');
        const menuToggle = document.getElementById('menuToggle');
        menu.classList.remove('menu-enter');
        menu.classList.add('menu-exit');
        menu.setAttribute('aria-hidden', 'true');
        overlay.classList.remove('active');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.style.display = '';
        setTimeout(function() {
            menu.classList.add('hidden');
            menuToggle.focus();
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
            getTotalTextHeight: function() {
                return getTotalTextHeight(ctx, canvas, state.layers);
            },
            getAudioTrimStart,
            getAudioTrimEnd,
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
            state.globalTime += delta;
        }

        if (getActiveAudioMode() === 'backgroundVideo') {
            syncBackgroundVideo(false);
        }

        if (getActiveAudioMode() !== 'none') {
            syncPreviewAudio(false);
        }

        render(ctx, canvas, state, videoBg, imageBg, easings);
        state.animationId = requestAnimationFrame(animate);
    }

    bindEvents({
        state,
        videoBg,
        imageBg,
        audioTrack,
        getActiveLayer,
        createDefaultLayer,
        saveUndoState,
        undo: runUndo,
        redo: runRedo,
        syncUIFromState,
        syncPreviewAudio,
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

    // Pause animation loop when tab is hidden to save battery
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            if (state.animationId) {
                cancelAnimationFrame(state.animationId);
                state.animationId = null;
            }
            videoBg.pause();
            if (!audioTrack.paused) {
                audioTrack.pause();
            }
        } else {
            if (!state.animationId) {
                state.lastTime = 0;
                state.animationId = requestAnimationFrame(animate);
            }
            syncBackgroundVideo(true);
            syncPreviewAudio(true);
        }
    });

    // Swipe from left edge to open menu (mobile)
    var swipeTouchStartX = 0;
    var swipeTouchStartY = 0;
    document.addEventListener('touchstart', function(e) {
        swipeTouchStartX = e.touches[0].clientX;
        swipeTouchStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function(e) {
        if (isMenuOpen()) return;
        var dx = e.changedTouches[0].clientX - swipeTouchStartX;
        var dy = Math.abs(e.changedTouches[0].clientY - swipeTouchStartY);
        if (swipeTouchStartX < 30 && dx > 60 && dy < 80) {
            openMenu();
        }
    }, { passive: true });

    initCanvas();
    syncUIFromState();
    requestAnimationFrame(animate);
})();
