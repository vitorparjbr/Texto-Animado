(() => {
    function bindEvents(deps) {
        const {
            state,
            videoBg,
            imageBg,
            getActiveLayer,
            createDefaultLayer,
            saveUndoState,
            undo,
            redo,
            syncUIFromState,
            resetAnimation,
            initCanvas,
            togglePlayPause,
            openMenu,
            closeMenu,
            isMenuOpen,
            showToast,
            runExport
        } = deps;

        document.getElementById('menuToggle').addEventListener('click', openMenu);
        document.getElementById('closeMenu').addEventListener('click', closeMenu);
        document.getElementById('menuOverlay').addEventListener('click', closeMenu);

        document.getElementById('undoBtn').addEventListener('click', undo);
        document.getElementById('redoBtn').addEventListener('click', redo);

        var textInputTimer;
        document.getElementById('textInput').addEventListener('input', function(e) {
            getActiveLayer().text = e.target.value || '';
            var activeLayerText = document.querySelector('.layer-item.active .layer-text');
            if (activeLayerText) {
                activeLayerText.textContent = e.target.value || '(vazio)';
            }
            clearTimeout(textInputTimer);
            textInputTimer = setTimeout(saveUndoState, 600);
        });

        document.getElementById('speedControl').addEventListener('input', function(e) {
            saveUndoState();
            state.speed = parseFloat(e.target.value);
            document.getElementById('speedValue').textContent = state.speed + 'x';
        });

        document.getElementById('layerDelay').addEventListener('input', function(e) {
            saveUndoState();
            var delay = parseFloat(e.target.value);
            getActiveLayer().startDelay = delay;
            document.getElementById('layerDelayValue').textContent = delay.toFixed(1) + 's';
        });

        document.querySelectorAll('[data-align]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                saveUndoState();
                document.querySelectorAll('[data-align]').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                getActiveLayer().align = btn.dataset.align;
            });
        });

        document.querySelectorAll('[data-anim]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                saveUndoState();
                document.querySelectorAll('[data-anim]').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                getActiveLayer().animationType = btn.dataset.anim;
                resetAnimation();
            });
        });

        document.querySelectorAll('[data-easing]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                saveUndoState();
                document.querySelectorAll('[data-easing]').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                getActiveLayer().easing = btn.dataset.easing;
            });
        });

        document.getElementById('fontFamily').addEventListener('change', function(e) {
            saveUndoState();
            getActiveLayer().fontFamily = e.target.value;
        });

        document.getElementById('fontSize').addEventListener('input', function(e) {
            saveUndoState();
            getActiveLayer().fontSize = Math.max(12, Math.min(200, parseInt(e.target.value, 10) || 48));
        });

        document.getElementById('textColor').addEventListener('input', function(e) {
            saveUndoState();
            getActiveLayer().textColor = e.target.value;
            document.getElementById('colorHex').textContent = e.target.value;
        });

        document.getElementById('boldToggle').addEventListener('click', function(e) {
            saveUndoState();
            const layer = getActiveLayer();
            layer.bold = !layer.bold;
            e.currentTarget.classList.toggle('active');
        });

        document.getElementById('italicToggle').addEventListener('click', function(e) {
            saveUndoState();
            const layer = getActiveLayer();
            layer.italic = !layer.italic;
            e.currentTarget.classList.toggle('active');
        });

        document.getElementById('gradientToggle').addEventListener('click', function(e) {
            saveUndoState();
            const layer = getActiveLayer();
            layer.useGradient = !layer.useGradient;
            e.currentTarget.classList.toggle('active');
            e.currentTarget.textContent = layer.useGradient ? 'ON' : 'OFF';
        });

        document.getElementById('gradientColor1').addEventListener('input', function(e) {
            saveUndoState();
            getActiveLayer().gradientColor1 = e.target.value;
        });

        document.getElementById('gradientColor2').addEventListener('input', function(e) {
            saveUndoState();
            getActiveLayer().gradientColor2 = e.target.value;
        });

        document.getElementById('effectType').addEventListener('change', function(e) {
            saveUndoState();
            getActiveLayer().effect = e.target.value;
            document.getElementById('effectOptions').style.display = e.target.value === 'none' ? 'none' : 'block';
        });

        document.getElementById('effectColor').addEventListener('input', function(e) {
            saveUndoState();
            getActiveLayer().effectColor = e.target.value;
        });

        document.getElementById('effectThickness').addEventListener('input', function(e) {
            saveUndoState();
            getActiveLayer().effectThickness = parseInt(e.target.value, 10);
            document.getElementById('thicknessValue').textContent = e.target.value;
        });

        document.getElementById('effectIntensity').addEventListener('input', function(e) {
            saveUndoState();
            getActiveLayer().effectIntensity = parseInt(e.target.value, 10);
            document.getElementById('intensityValue').textContent = e.target.value + '%';
        });

        document.querySelectorAll('[data-format]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                saveUndoState();
                document.querySelectorAll('[data-format]').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                state.format = btn.dataset.format;
                initCanvas();
            });
        });

        document.querySelectorAll('[data-res]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                saveUndoState();
                document.querySelectorAll('[data-res]').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                state.resolution = parseInt(btn.dataset.res, 10);
                initCanvas();
            });
        });

        document.getElementById('bgTransparent').addEventListener('click', function() {
            saveUndoState();
            state.bgTransparent = true;
            document.getElementById('bgTransparent').classList.add('active');
            document.getElementById('bgColorBtn').classList.remove('active');
            document.getElementById('bgColorPicker').style.display = 'none';
        });

        document.getElementById('bgColorBtn').addEventListener('click', function() {
            saveUndoState();
            state.bgTransparent = false;
            document.getElementById('bgColorBtn').classList.add('active');
            document.getElementById('bgTransparent').classList.remove('active');
            document.getElementById('bgColorPicker').style.display = 'block';
        });

        document.getElementById('bgColorValue').addEventListener('input', function(e) {
            saveUndoState();
            state.bgColor = e.target.value;
        });

        document.getElementById('mediaInput').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            if (state.mediaSource) URL.revokeObjectURL(state.mediaSource);

            const url = URL.createObjectURL(file);

            if (file.type.startsWith('video/')) {
                state.mediaType = 'video';
                state.mediaSource = url;
                videoBg.src = url;
                videoBg.play();
            } else if (file.type.startsWith('image/')) {
                state.mediaType = 'image';
                state.mediaSource = url;
                imageBg.src = url;
            }

            document.getElementById('removeMedia').style.display = 'block';
        });

        document.getElementById('removeMedia').addEventListener('click', function() {
            if (state.mediaSource) URL.revokeObjectURL(state.mediaSource);
            state.mediaType = null;
            state.mediaSource = null;
            videoBg.src = '';
            imageBg.src = '';
            document.getElementById('removeMedia').style.display = 'none';
            document.getElementById('mediaInput').value = '';
        });

        document.getElementById('addLayerBtn').addEventListener('click', function() {
            saveUndoState();
            const newLayer = createDefaultLayer(state.nextLayerId++);
            newLayer.text = 'Nova camada';
            state.layers.push(newLayer);
            state.activeLayerId = newLayer.id;
            syncUIFromState();
        });

        document.getElementById('playPauseBtn').addEventListener('click', togglePlayPause);

        document.getElementById('resetBtn').addEventListener('click', function() {
            resetAnimation();
        });

        document.getElementById('exportBtn').addEventListener('click', runExport);

        function getSlotKey() {
            var slotEl = document.getElementById('saveSlot');
            var slot = slotEl ? slotEl.value : '1';
            return 'textflow_project_slot' + slot;
        }

        document.getElementById('saveProject').addEventListener('click', function() {
            var data = {
                layers: state.layers,
                activeLayerId: state.activeLayerId,
                nextLayerId: state.nextLayerId,
                speed: state.speed,
                format: state.format,
                resolution: state.resolution,
                bgTransparent: state.bgTransparent,
                bgColor: state.bgColor
            };

            try {
                localStorage.setItem(getSlotKey(), JSON.stringify(data));
                var slotEl = document.getElementById('saveSlot');
                var slotName = slotEl ? 'Slot ' + slotEl.value : '';
                showToast('Projeto salvo! (' + slotName + ')', 'success');
                // Warn if media background exists — it is not serializable
                if (state.mediaType) {
                    setTimeout(function() {
                        showToast('Atenção: o fundo importado não é salvo', 'info');
                    }, 2600);
                }
            } catch (e) {
                showToast('Erro ao salvar', 'error');
            }
        });

        document.getElementById('loadProject').addEventListener('click', function() {
            try {
                var raw = localStorage.getItem(getSlotKey());
                if (!raw) {
                    var slotEl = document.getElementById('saveSlot');
                    var slotName = slotEl ? 'Slot ' + slotEl.value : 'slot';
                    showToast(slotName + ' está vazio', 'info');
                    return;
                }

                var data = JSON.parse(raw);
                saveUndoState();
                if (state.mediaSource) URL.revokeObjectURL(state.mediaSource);
                state.mediaType = null;
                state.mediaSource = null;
                videoBg.pause();
                videoBg.removeAttribute('src');
                videoBg.load();
                imageBg.removeAttribute('src');
                document.getElementById('removeMedia').style.display = 'none';
                document.getElementById('mediaInput').value = '';
                state.layers = data.layers || state.layers;
                state.activeLayerId = data.activeLayerId || state.layers[0].id;
                state.nextLayerId = data.nextLayerId || state.layers.length + 1;
                state.speed = data.speed || 2;
                state.format = data.format || '1:1';
                state.resolution = data.resolution || 720;
                state.bgTransparent = data.bgTransparent !== undefined ? data.bgTransparent : true;
                state.bgColor = data.bgColor || '#0a0a0f';

                initCanvas();
                syncUIFromState();
                var slotEl2 = document.getElementById('saveSlot');
                var slotName2 = slotEl2 ? 'Slot ' + slotEl2.value : '';
                showToast('Projeto carregado! (' + slotName2 + ')', 'success');
            } catch (e) {
                showToast('Erro ao carregar', 'error');
            }
        });

        document.getElementById('clearProject').addEventListener('click', function() {
            var slotEl = document.getElementById('saveSlot');
            var slotName = slotEl ? 'Slot ' + slotEl.value : '';
            localStorage.removeItem(getSlotKey());
            showToast(slotName + ' limpo', 'info');
        });

        document.addEventListener('keydown', function(e) {
            const tag = e.target.tagName;
            const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

            if (e.key === 'Escape') {
                if (isMenuOpen()) closeMenu();
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' || e.key === 'Z') {
                    e.preventDefault();
                    undo();
                    return;
                }
                if (e.key === 'y' || e.key === 'Y') {
                    e.preventDefault();
                    redo();
                    return;
                }
                if (e.key === 'b' || e.key === 'B') {
                    e.preventDefault();
                    saveUndoState();
                    const layer = getActiveLayer();
                    layer.bold = !layer.bold;
                    document.getElementById('boldToggle').classList.toggle('active');
                    return;
                }
                if (e.key === 'i' || e.key === 'I') {
                    e.preventDefault();
                    saveUndoState();
                    const layer2 = getActiveLayer();
                    layer2.italic = !layer2.italic;
                    document.getElementById('italicToggle').classList.toggle('active');
                    return;
                }
                if (e.key === 'e' || e.key === 'E') {
                    e.preventDefault();
                    runExport();
                    return;
                }
            }

            if (isInput) return;

            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                togglePlayPause();
            } else if (e.key === 'r' || e.key === 'R') {
                resetAnimation();
            } else if (e.key === 'm' || e.key === 'M') {
                if (isMenuOpen()) closeMenu();
                else openMenu();
            }
        });
    }

    window.TextFlowEvents = {
        bindEvents
    };
})();
