(() => {
    function bindEvents(deps) {
        const {
            state,
            videoBg,
            imageBg,
            audioTrack,
            getActiveLayer,
            createDefaultLayer,
            saveUndoState,
            undo,
            redo,
            syncUIFromState,
            syncPreviewAudio,
            resetAnimation,
            initCanvas,
            togglePlayPause,
            openMenu,
            closeMenu,
            isMenuOpen,
            showToast,
            runExport,
            getBaseVideoDuration,
            getVideoDuration
        } = deps;
        const stateApi = window.TextFlowState || {};
        const applyInlineStyle = stateApi.applyInlineStyle;
        const clearInlineStylesInRange = stateApi.clearInlineStylesInRange;
        const getSelectionStyleState = stateApi.getSelectionStyleState;
        const syncInlineStylesWithText = stateApi.syncInlineStylesWithText;

        function setStoredTextSelection(start, end) {
            state.textSelectionStart = Math.max(0, parseInt(start, 10) || 0);
            state.textSelectionEnd = Math.max(state.textSelectionStart, parseInt(end, 10) || 0);
            state.textSelectionLayerId = getActiveLayer().id;
        }

        function getTextSelectionRange() {
            const input = document.getElementById('textInput');
            const activeLayer = getActiveLayer();
            const isTextareaFocused = document.activeElement === input;
            const start = isTextareaFocused ? (input.selectionStart || 0) : (state.textSelectionLayerId === activeLayer.id ? (state.textSelectionStart || 0) : 0);
            const end = isTextareaFocused ? (input.selectionEnd || 0) : (state.textSelectionLayerId === activeLayer.id ? (state.textSelectionEnd || 0) : 0);
            return {
                input: input,
                start: start,
                end: end
            };
        }

        function applyStyleToSelection(patch, getFallbackValue) {
            const selection = getTextSelectionRange();
            const layer = getActiveLayer();
            if (selection.end > selection.start && typeof applyInlineStyle === 'function') {
                saveUndoState();
                applyInlineStyle(layer, selection.start, selection.end, patch);
                setStoredTextSelection(selection.start, selection.end);
                selection.input.focus();
                selection.input.setSelectionRange(selection.start, selection.end);
                return true;
            }

            if (typeof getFallbackValue === 'function') {
                saveUndoState();
                getFallbackValue(layer);
            }
            return false;
        }

        function toggleSelectionBooleanStyle(key, buttonId) {
            const selection = getTextSelectionRange();
            const layer = getActiveLayer();
            if (selection.end > selection.start && typeof applyInlineStyle === 'function' && typeof getSelectionStyleState === 'function') {
                const selectionState = getSelectionStyleState(layer, selection.start, selection.end)[key];
                const nextValue = selectionState.mixed ? true : !selectionState.value;
                saveUndoState();
                const patch = {};
                patch[key] = nextValue;
                applyInlineStyle(layer, selection.start, selection.end, patch);
                setStoredTextSelection(selection.start, selection.end);
                selection.input.focus();
                selection.input.setSelectionRange(selection.start, selection.end);
                return;
            }

            saveUndoState();
            layer[key] = !layer[key];
            document.getElementById(buttonId).classList.toggle('active', layer[key]);
        }

        function refreshTextSelectionUI() {
            syncUIFromState();
        }

        function captureTextareaSelection() {
            setStoredTextSelection(textInput.selectionStart || 0, textInput.selectionEnd || 0);
            refreshTextSelectionUI();
        }

        function hasBackgroundVideoAudio() {
            return state.mediaType === 'video' && !!state.mediaSource;
        }

        function getActiveAudioDuration() {
            if (state.audioSourceMode === 'backgroundVideo' && hasBackgroundVideoAudio()) {
                return Number.isFinite(videoBg.duration) ? videoBg.duration : 0;
            }
            return state.audioDuration || 0;
        }

        function clearAudioState() {
            if (state.audioSource) URL.revokeObjectURL(state.audioSource);
            state.audioFile = null;
            state.audioSource = null;
            state.audioFileName = '';
            state.audioDuration = 0;
            state.audioTrimStart = 0;
            state.audioTrimEnd = 0;
            state.audioDelay = 0;
            state.audioFadeIn = 0;
            state.audioFadeOut = 0;
            state.audioVolume = 1;
            state.audioBuffer = null;
            state.audioIsDecoding = false;
            audioTrack.pause();
            audioTrack.removeAttribute('src');
            audioTrack.load();
            document.getElementById('audioInput').value = '';
        }

        function applyAudioSourceMode(nextMode, resetTrim) {
            state.audioSourceMode = nextMode === 'backgroundVideo' && hasBackgroundVideoAudio() ? 'backgroundVideo' : 'imported';

            if (resetTrim) {
                state.audioTrimStart = 0;
                state.audioTrimEnd = getActiveAudioDuration();
                state.audioFadeIn = 0;
                state.audioFadeOut = 0;
            }

            normalizeAudioSettings();
        }

        function clampAudioValue(value, fallback) {
            var parsed = parseFloat(value);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(0, parsed);
        }

        function normalizeAudioSettings() {
            var activeDuration = getActiveAudioDuration();
            if (!activeDuration) return;
            state.audioTrimStart = Math.min(clampAudioValue(state.audioTrimStart, 0), activeDuration);
            state.audioTrimEnd = Math.min(clampAudioValue(state.audioTrimEnd, activeDuration), activeDuration);
            state.audioTrimEnd = Math.max(state.audioTrimStart, state.audioTrimEnd || activeDuration);
            var clipDuration = Math.max(0, state.audioTrimEnd - state.audioTrimStart);
            state.audioFadeIn = Math.min(clampAudioValue(state.audioFadeIn, 0), clipDuration);
            state.audioFadeOut = Math.min(clampAudioValue(state.audioFadeOut, 0), clipDuration);
            state.audioVolume = Math.max(0, Math.min(parseFloat(state.audioVolume) || 0, 1));
        }

        function getTimelineTrack() {
            return document.querySelector('#audioTimeline .audio-timeline-track');
        }

        function getAudioTrimHandleForTime(time) {
            return Math.abs(time - state.audioTrimStart) <= Math.abs(time - state.audioTrimEnd) ? 'start' : 'end';
        }

        function getAudioTimelineTime(clientX) {
            var track = getTimelineTrack();
            var duration = getActiveAudioDuration();
            var rect;
            var ratio;
            if (!track || !duration) return 0;
            rect = track.getBoundingClientRect();
            if (!rect.width) return 0;
            ratio = (clientX - rect.left) / rect.width;
            ratio = Math.max(0, Math.min(ratio, 1));
            return ratio * duration;
        }

        function applyAudioTrimFromTimeline(handle, nextValue) {
            if (!getActiveAudioDuration()) return;
            if (handle === 'start') {
                state.audioTrimStart = nextValue;
            } else {
                state.audioTrimEnd = nextValue;
            }
            normalizeAudioSettings();
            resetAnimation();
            syncUIFromState();
        }

        var activeAudioTrimHandle = null;

        function beginAudioTrimDrag(handle, e) {
            if (!getActiveAudioDuration()) return;
            saveUndoState();
            activeAudioTrimHandle = handle;
            applyAudioTrimFromTimeline(handle, getAudioTimelineTime(e.clientX));
            e.preventDefault();
        }

        function stopAudioTrimDrag() {
            activeAudioTrimHandle = null;
        }

        document.getElementById('menuToggle').addEventListener('click', openMenu);
        document.getElementById('closeMenu').addEventListener('click', closeMenu);
        document.getElementById('menuOverlay').addEventListener('click', closeMenu);

        var peekBtn = document.getElementById('peekBtn');
        var sideMenu = document.getElementById('sideMenu');
        if (peekBtn) {
            function startPeek(e) {
                e.preventDefault();
                sideMenu.style.opacity = '0';
                sideMenu.style.pointerEvents = 'none';
            }
            function stopPeek(e) {
                e.preventDefault();
                sideMenu.style.opacity = '1';
                sideMenu.style.pointerEvents = '';
            }
            peekBtn.addEventListener('mousedown', startPeek);
            peekBtn.addEventListener('touchstart', startPeek);
            document.addEventListener('mouseup', function(e) {
                if (sideMenu.style.opacity === '0') stopPeek(e);
            });
            document.addEventListener('touchend', function(e) {
                if (sideMenu.style.opacity === '0') stopPeek(e);
            });
        }

        document.getElementById('undoBtn').addEventListener('click', undo);
        document.getElementById('redoBtn').addEventListener('click', redo);

        var textInputTimer;
        var textInput = document.getElementById('textInput');
        textInput.addEventListener('input', function(e) {
            syncInlineStylesWithText(getActiveLayer(), e.target.value || '');
            setStoredTextSelection(e.target.selectionStart || 0, e.target.selectionEnd || 0);
            var activeLayerText = document.querySelector('.layer-item.active .layer-text');
            if (activeLayerText) {
                activeLayerText.textContent = e.target.value || '(vazio)';
            }
            clearTimeout(textInputTimer);
            textInputTimer = setTimeout(saveUndoState, 600);
            refreshTextSelectionUI();
        });

        ['select', 'keyup', 'mouseup', 'focus'].forEach(function(eventName) {
            textInput.addEventListener(eventName, captureTextareaSelection);
        });

        document.getElementById('clearSelectionFormatting').addEventListener('click', function() {
            const selection = getTextSelectionRange();
            if (selection.end <= selection.start || typeof clearInlineStylesInRange !== 'function') return;
            saveUndoState();
            clearInlineStylesInRange(getActiveLayer(), selection.start, selection.end);
            setStoredTextSelection(selection.start, selection.end);
            selection.input.focus();
            selection.input.setSelectionRange(selection.start, selection.end);
            refreshTextSelectionUI();
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
            applyStyleToSelection({ fontFamily: e.target.value }, function(layer) {
                layer.fontFamily = e.target.value;
            });
            refreshTextSelectionUI();
        });

        document.getElementById('fontSize').addEventListener('input', function(e) {
            const nextSize = Math.max(12, Math.min(200, parseInt(e.target.value, 10) || 48));
            applyStyleToSelection({ fontSize: nextSize }, function(layer) {
                layer.fontSize = nextSize;
            });
            refreshTextSelectionUI();
        });

        document.getElementById('textColor').addEventListener('input', function(e) {
            applyStyleToSelection({ textColor: e.target.value }, function(layer) {
                layer.textColor = e.target.value;
            });
            document.getElementById('colorHex').textContent = e.target.value;
            refreshTextSelectionUI();
        });

        document.getElementById('boldToggle').addEventListener('click', function() {
            toggleSelectionBooleanStyle('bold', 'boldToggle');
            refreshTextSelectionUI();
        });

        document.getElementById('italicToggle').addEventListener('click', function() {
            toggleSelectionBooleanStyle('italic', 'italicToggle');
            refreshTextSelectionUI();
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
                state.mediaFile = file;
                state.mediaType = 'video';
                state.mediaSource = url;
                state.mediaFileName = file.name;
                videoBg.src = url;
                if (!state.audioSource) {
                    applyAudioSourceMode('backgroundVideo', true);
                }
                videoBg.play().catch(function() {});
            } else if (file.type.startsWith('image/')) {
                state.mediaFile = file;
                state.mediaType = 'image';
                state.mediaSource = url;
                state.mediaFileName = file.name;
                imageBg.src = url;
                if (state.audioSourceMode === 'backgroundVideo') {
                    applyAudioSourceMode('imported', true);
                }
            }

            document.getElementById('removeMedia').style.display = 'block';
            syncUIFromState();
        });

        document.getElementById('removeMedia').addEventListener('click', function() {
            if (state.mediaSource) URL.revokeObjectURL(state.mediaSource);
            state.mediaType = null;
            state.mediaFile = null;
            state.mediaSource = null;
            state.mediaFileName = '';
            videoBg.src = '';
            imageBg.src = '';
            document.getElementById('removeMedia').style.display = 'none';
            document.getElementById('mediaInput').value = '';
            if (state.audioSourceMode === 'backgroundVideo') {
                applyAudioSourceMode('imported', true);
            }
            syncUIFromState();
        });

        function handleAudioFile(file) {
            var AudioContextCtor;
            if (!file) return;

            clearAudioState();

            state.audioFile = file;
            state.audioSource = URL.createObjectURL(file);
            state.audioFileName = file.name;
            state.audioSourceMode = 'imported';
            state.audioIsDecoding = true;
            audioTrack.src = state.audioSource;
            audioTrack.load();
            syncUIFromState();

            AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextCtor) {
                state.audioBuffer = null;
                state.audioIsDecoding = false;
                showToast('Preview de áudio pronto, mas a exportação com áudio pode não funcionar neste navegador.', 'info');
                syncUIFromState();
                return;
            }

            file.arrayBuffer().then(function(arrayBuffer) {
                var decodeContext = new AudioContextCtor();
                return decodeContext.decodeAudioData(arrayBuffer).then(function(buffer) {
                    state.audioBuffer = buffer;
                    if (typeof decodeContext.close === 'function') {
                        return decodeContext.close().catch(function() {}).then(function() {
                            return buffer;
                        });
                    }
                    return buffer;
                }, function(error) {
                    if (typeof decodeContext.close === 'function') {
                        decodeContext.close().catch(function() {});
                    }
                    throw error;
                });
            }).then(function(buffer) {
                state.audioIsDecoding = false;
                if (!state.audioDuration) {
                    state.audioDuration = buffer.duration;
                }
                applyAudioSourceMode('imported', true);
                syncUIFromState();
            }).catch(function() {
                state.audioBuffer = null;
                state.audioIsDecoding = false;
                showToast('Nao foi possivel decodificar o audio para exportacao.', 'error');
                syncUIFromState();
            });
        }

        document.getElementById('audioInput').addEventListener('change', function(e) {
            handleAudioFile(e.target.files[0]);
        });

        document.getElementById('audioUseBackgroundVideo').addEventListener('change', function(e) {
            saveUndoState();
            applyAudioSourceMode(e.target.checked ? 'backgroundVideo' : 'imported', true);
            resetAnimation();
            syncUIFromState();
        });

        document.getElementById('audioTimelineStartHandle').addEventListener('pointerdown', function(e) {
            beginAudioTrimDrag('start', e);
        });

        document.getElementById('audioTimelineEndHandle').addEventListener('pointerdown', function(e) {
            beginAudioTrimDrag('end', e);
        });

        getTimelineTrack().addEventListener('pointerdown', function(e) {
            var handle;
            if (!getActiveAudioDuration()) return;
            if (e.target.closest('.audio-timeline-handle')) return;
            saveUndoState();
            handle = getAudioTrimHandleForTime(getAudioTimelineTime(e.clientX));
            activeAudioTrimHandle = handle;
            applyAudioTrimFromTimeline(handle, getAudioTimelineTime(e.clientX));
            e.preventDefault();
        });

        document.addEventListener('pointermove', function(e) {
            if (!activeAudioTrimHandle) return;
            applyAudioTrimFromTimeline(activeAudioTrimHandle, getAudioTimelineTime(e.clientX));
            e.preventDefault();
        });

        document.addEventListener('pointerup', stopAudioTrimDrag);
        document.addEventListener('pointercancel', stopAudioTrimDrag);

        audioTrack.addEventListener('loadedmetadata', function() {
            if (state.audioSourceMode === 'backgroundVideo' && hasBackgroundVideoAudio()) {
                normalizeAudioSettings();
                syncUIFromState();
                syncPreviewAudio(true);
                return;
            }
            if (!state.audioSource) return;
            state.audioDuration = audioTrack.duration || state.audioDuration || 0;
            if (!state.audioTrimEnd && state.audioDuration) {
                state.audioTrimEnd = state.audioDuration;
            }
            normalizeAudioSettings();
            syncUIFromState();
            syncPreviewAudio(true);
        });

        videoBg.addEventListener('loadedmetadata', function() {
            if (state.audioSourceMode === 'backgroundVideo') {
                if (!state.audioTrimEnd || state.audioTrimEnd > getActiveAudioDuration()) {
                    state.audioTrimEnd = getActiveAudioDuration();
                }
                normalizeAudioSettings();
                syncUIFromState();
                resetAnimation();
                return;
            }
            syncUIFromState();
        });

        audioTrack.addEventListener('timeupdate', function() {
            if (!getActiveAudioDuration()) return;
            normalizeAudioSettings();
            if (audioTrack.currentTime >= state.audioTrimEnd - 0.02) {
                audioTrack.pause();
            }
        });

        document.getElementById('audioVolume').addEventListener('input', function(e) {
            saveUndoState();
            state.audioVolume = Math.max(0, Math.min(parseFloat(e.target.value) || 0, 1));
            normalizeAudioSettings();
            syncUIFromState();
            syncPreviewAudio(false);
        });

        document.getElementById('audioLoop').addEventListener('change', function(e) {
            saveUndoState();
            state.audioLoop = !!e.target.checked;
            resetAnimation();
            syncUIFromState();
        });

        document.getElementById('audioDelay').addEventListener('input', function(e) {
            saveUndoState();
            state.audioDelay = Math.max(0, parseFloat(e.target.value) || 0);
            document.getElementById('audioDelayValue').textContent = state.audioDelay.toFixed(1) + 's';
            resetAnimation();
            syncUIFromState();
        });

        document.getElementById('audioTrimStart').addEventListener('change', function(e) {
            saveUndoState();
            state.audioTrimStart = clampAudioValue(e.target.value, 0);
            normalizeAudioSettings();
            resetAnimation();
            syncUIFromState();
        });

        document.getElementById('audioTrimEnd').addEventListener('change', function(e) {
            saveUndoState();
            state.audioTrimEnd = clampAudioValue(e.target.value, getActiveAudioDuration());
            normalizeAudioSettings();
            resetAnimation();
            syncUIFromState();
        });

        document.getElementById('audioFadeIn').addEventListener('change', function(e) {
            saveUndoState();
            state.audioFadeIn = clampAudioValue(e.target.value, 0);
            normalizeAudioSettings();
            syncUIFromState();
        });

        document.getElementById('audioFadeOut').addEventListener('change', function(e) {
            saveUndoState();
            state.audioFadeOut = clampAudioValue(e.target.value, 0);
            normalizeAudioSettings();
            syncUIFromState();
        });

        document.getElementById('removeAudio').addEventListener('click', function() {
            clearAudioState();
            state.audioSourceMode = 'imported';
            syncUIFromState();
        });

        document.getElementById('exportTrimActive').addEventListener('change', function(e) {
            saveUndoState();
            state.exportTrimActive = !!e.target.checked;
            const baseDuration = getBaseVideoDuration();
            if (!state.exportTrimEnd || state.exportTrimEnd > baseDuration) {
                state.exportTrimEnd = baseDuration;
            }
            resetAnimation();
            syncUIFromState();
        });

        document.getElementById('exportTrimStart').addEventListener('change', function(e) {
            saveUndoState();
            const baseDuration = getBaseVideoDuration();
            const val = clampAudioValue(e.target.value, 0);
            state.exportTrimStart = Math.min(val, baseDuration);
            if (state.exportTrimEnd < state.exportTrimStart) {
                state.exportTrimEnd = state.exportTrimStart;
            }
            resetAnimation();
            syncUIFromState();
        });

        document.getElementById('exportTrimEnd').addEventListener('change', function(e) {
            saveUndoState();
            const baseDuration = getBaseVideoDuration();
            const val = clampAudioValue(e.target.value, baseDuration);
            state.exportTrimEnd = Math.min(val, baseDuration);
            if (state.exportTrimStart > state.exportTrimEnd) {
                state.exportTrimStart = state.exportTrimEnd;
            }
            resetAnimation();
            syncUIFromState();
        });

        document.getElementById('addLayerBtn').addEventListener('click', function() {
            saveUndoState();
            const newLayer = createDefaultLayer(state.nextLayerId++);
            newLayer.text = 'Nova camada';
            state.layers.push(newLayer);
            state.activeLayerId = newLayer.id;
            setStoredTextSelection(0, 0);
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
                bgColor: state.bgColor,
                exportTrimActive: state.exportTrimActive,
                exportTrimStart: state.exportTrimStart,
                exportTrimEnd: state.exportTrimEnd,
                audioLoop: state.audioLoop,
                audioDelay: state.audioDelay
            };

            try {
                localStorage.setItem(getSlotKey(), JSON.stringify(data));
                var slotEl = document.getElementById('saveSlot');
                var slotName = slotEl ? 'Slot ' + slotEl.value : '';
                showToast('Projeto salvo! (' + slotName + ')', 'success');
                // Warn if media background exists — it is not serializable
                if (state.mediaType || state.audioSource) {
                    setTimeout(function() {
                        showToast('Atenção: fundos e audio importados nao sao salvos', 'info');
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
                state.mediaFileName = '';
                clearAudioState();
                state.layers = data.layers || state.layers;
                state.activeLayerId = data.activeLayerId || state.layers[0].id;
                state.nextLayerId = data.nextLayerId || state.layers.length + 1;
                state.speed = data.speed || 2;
                state.format = data.format || '1:1';
                state.resolution = data.resolution || 720;
                state.bgTransparent = data.bgTransparent !== undefined ? data.bgTransparent : true;
                state.bgColor = data.bgColor || '#0a0a0f';
                state.exportTrimActive = data.exportTrimActive || false;
                state.exportTrimStart = data.exportTrimStart || 0;
                state.exportTrimEnd = data.exportTrimEnd || 0;
                state.audioSourceMode = 'imported';
                state.audioTrimStart = 0;
                state.audioTrimEnd = 0;
                state.audioFadeIn = 0;
                state.audioFadeOut = 0;
                state.audioVolume = 1;
                state.audioLoop = data.audioLoop !== undefined ? data.audioLoop : true;
                state.audioDelay = data.audioDelay || 0;

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
                    toggleSelectionBooleanStyle('bold', 'boldToggle');
                    refreshTextSelectionUI();
                    return;
                }
                if (e.key === 'i' || e.key === 'I') {
                    e.preventDefault();
                    toggleSelectionBooleanStyle('italic', 'italicToggle');
                    refreshTextSelectionUI();
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

        // Auto-load test audio if URL has ?testAudio=true
        if (window.location.search.includes('testAudio=true')) {
            fetch('test.wav')
                .then(r => r.blob())
                .then(blob => {
                    const file = new File([blob], 'test.wav', { type: 'audio/wav' });
                    handleAudioFile(file);
                })
                .catch(err => console.error('Failed to auto-load test audio:', err));
        }
    }

    window.TextFlowEvents = {
        bindEvents
    };
})();
