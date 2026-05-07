(() => {
    function getSupportedMimeType(hasAudio) {
        if (typeof MediaRecorder === 'undefined') return '';
        const candidates = hasAudio
            ? [
                'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
                'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
                'video/mp4',
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8',
                'video/webm'
            ]
            : [
                'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm',
                'video/mp4'
            ];

        for (let i = 0; i < candidates.length; i++) {
            if (MediaRecorder.isTypeSupported(candidates[i])) {
                return candidates[i];
            }
        }

        return '';
    }

    function getVisualDurationMs(canvas, state, getTotalTextHeight) {
        return state.layers.reduce(function(maxDuration, layer) {
            const anim = layer.animationType;
            const isScroll = anim === 'scrollUp' || anim === 'scrollDown';
            const startDelayMs = (layer.startDelay || 0) * 1000;
            let layerDurationMs;

            if (isScroll) {
                const textHeight = getTotalTextHeight();
                const totalDistance = canvas.height + textHeight + 100;
                const pixelsPerSecond = state.speed * 60;
                layerDurationMs = (totalDistance / pixelsPerSecond) * 1000;
            } else {
                layerDurationMs = Math.max(500, (5 / state.speed) * 1000);
            }

            return Math.max(maxDuration, startDelayMs + layerDurationMs);
        }, 500);
    }

    function getActiveAudioMode(state) {
        if (state.audioSourceMode === 'backgroundVideo' && state.mediaType === 'video' && state.mediaSource) {
            return 'backgroundVideo';
        }
        if (state.audioSource) {
            return 'imported';
        }
        return 'none';
    }

    async function createImportedAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            throw new Error('Seu navegador nao suporta mixagem de audio na exportacao.');
        }
        if (!state.audioBuffer) {
            throw new Error('Aguarde o audio terminar de carregar antes de exportar.');
        }

        const trimStart = getAudioTrimStart();
        const trimEnd = getAudioTrimEnd();
        const clipDuration = Math.max(0, trimEnd - trimStart);
        if (!clipDuration) {
            return null;
        }

        const audioContext = new AudioContextCtor();
        const destination = audioContext.createMediaStreamDestination();
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        const volume = Math.max(0, Math.min(state.audioVolume || 0, 1));
        const fadeIn = Math.min(Math.max(0, state.audioFadeIn || 0), clipDuration);
        const fadeOut = Math.min(Math.max(0, state.audioFadeOut || 0), clipDuration);
        const startAt = audioContext.currentTime + 0.05;
        const stopAt = startAt + clipDuration;

        source.buffer = state.audioBuffer;
        source.connect(gainNode);
        gainNode.connect(destination);

        gainNode.gain.setValueAtTime(fadeIn > 0 ? 0 : volume, startAt);
        if (fadeIn > 0) {
            gainNode.gain.linearRampToValueAtTime(volume, startAt + fadeIn);
        }
        if (fadeOut > 0) {
            const fadeOutStart = Math.max(startAt, stopAt - fadeOut);
            gainNode.gain.setValueAtTime(volume, fadeOutStart);
            gainNode.gain.linearRampToValueAtTime(0.0001, stopAt);
        }

        await audioContext.resume();
        source.start(startAt, trimStart, clipDuration);
        source.stop(stopAt + 0.02);

        return {
            stream: destination.stream,
            cleanup: function() {
                try {
                    source.disconnect();
                    gainNode.disconnect();
                } catch (error) {
                    // Ignore cleanup disconnect failures.
                }
                if (typeof audioContext.close === 'function') {
                    audioContext.close().catch(function() {});
                }
            }
        };
    }

    function waitForMediaElementEvent(mediaElement, eventName) {
        return new Promise(function(resolve, reject) {
            function cleanup() {
                mediaElement.removeEventListener(eventName, onReady);
                mediaElement.removeEventListener('error', onError);
            }

            function onReady() {
                cleanup();
                resolve();
            }

            function onError() {
                cleanup();
                reject(new Error('Nao foi possivel carregar o audio do video de fundo.'));
            }

            mediaElement.addEventListener(eventName, onReady, { once: true });
            mediaElement.addEventListener('error', onError, { once: true });
        });
    }

    async function createBackgroundVideoAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) {
            throw new Error('Seu navegador nao suporta mixagem de audio na exportacao.');
        }
        if (!state.mediaSource) {
            throw new Error('Importe um video de fundo para usar o audio dele.');
        }

        const trimStart = getAudioTrimStart();
        const trimEnd = getAudioTrimEnd();
        const clipDuration = Math.max(0, trimEnd - trimStart);
        if (!clipDuration) {
            return null;
        }

        const audioContext = new AudioContextCtor();
        const destination = audioContext.createMediaStreamDestination();
        const sourceVideo = document.createElement('video');
        const gainNode = audioContext.createGain();
        const volume = Math.max(0, Math.min(state.audioVolume || 0, 1));
        const fadeIn = Math.min(Math.max(0, state.audioFadeIn || 0), clipDuration);
        const fadeOut = Math.min(Math.max(0, state.audioFadeOut || 0), clipDuration);
        const startAt = audioContext.currentTime + 0.05;
        const stopAt = startAt + clipDuration;
        let sourceNode;
        let stopTimer;

        sourceVideo.preload = 'auto';
        sourceVideo.playsInline = true;
        sourceVideo.src = state.mediaSource;

        if (sourceVideo.readyState < 1) {
            sourceVideo.load();
            await waitForMediaElementEvent(sourceVideo, 'loadedmetadata');
        }

        if (trimStart > 0) {
            sourceVideo.currentTime = trimStart;
            await waitForMediaElementEvent(sourceVideo, 'seeked');
        }

        sourceNode = audioContext.createMediaElementSource(sourceVideo);
        sourceNode.connect(gainNode);
        gainNode.connect(destination);

        gainNode.gain.setValueAtTime(fadeIn > 0 ? 0 : volume, startAt);
        if (fadeIn > 0) {
            gainNode.gain.linearRampToValueAtTime(volume, startAt + fadeIn);
        }
        if (fadeOut > 0) {
            const fadeOutStart = Math.max(startAt, stopAt - fadeOut);
            gainNode.gain.setValueAtTime(volume, fadeOutStart);
            gainNode.gain.linearRampToValueAtTime(0.0001, stopAt);
        }

        await audioContext.resume();
        await sourceVideo.play();
        stopTimer = setTimeout(function() {
            sourceVideo.pause();
        }, (clipDuration * 1000) + 50);

        return {
            stream: destination.stream,
            cleanup: function() {
                clearTimeout(stopTimer);
                sourceVideo.pause();
                sourceVideo.removeAttribute('src');
                sourceVideo.load();
                try {
                    sourceNode.disconnect();
                    gainNode.disconnect();
                } catch (error) {
                    // Ignore cleanup disconnect failures.
                }
                if (typeof audioContext.close === 'function') {
                    audioContext.close().catch(function() {});
                }
            }
        };
    }

    async function exportVideo(deps) {
        const {
            canvas,
            state,
            getTotalTextHeight,
            getAudioTrimStart,
            getAudioTrimEnd,
            updatePlayPauseUI,
            resetAnimation,
            showToast
        } = deps;

        const statusEl = document.getElementById('exportStatus');
        const exportBtn = document.getElementById('exportBtn');
        const recordingBadge = document.getElementById('recordingBadge');
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');

        statusEl.style.display = 'block';
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        statusEl.textContent = 'Preparando gravação...';
        exportBtn.disabled = true;
        recordingBadge.style.display = 'inline-block';

        try {
            if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
                throw new Error('Exportação de vídeo não é suportada neste navegador. Use o Chrome para Android ou um computador.');
            }

            const activeAudioMode = getActiveAudioMode(state);
            let mimeType = getSupportedMimeType(activeAudioMode !== 'none');
            if (!mimeType) {
                mimeType = getSupportedMimeType(false);
                if (!mimeType) {
                    throw new Error('Seu navegador não suporta gravação de vídeo.');
                }
            }

            const ext = mimeType.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
            const canvasStream = canvas.captureStream(30);
            const visualDuration = getVisualDurationMs(canvas, state, getTotalTextHeight);
            const audioDuration = activeAudioMode !== 'none' ? Math.max(0, (getAudioTrimEnd() - getAudioTrimStart()) * 1000) : 0;
            const duration = Math.max(visualDuration, audioDuration, 500);
            let audioExport = null;
            let streamTracks = canvasStream.getVideoTracks().slice();

            if (activeAudioMode === 'imported') {
                audioExport = await createImportedAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd);
            } else if (activeAudioMode === 'backgroundVideo') {
                audioExport = await createBackgroundVideoAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd);
            }

            if (audioExport && audioExport.stream) {
                streamTracks = streamTracks.concat(audioExport.stream.getAudioTracks());
            }

            const stream = new MediaStream(streamTracks);

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 5000000
            });

            const chunks = [];
            mediaRecorder.ondataavailable = function(e) {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            const startGlobalTime = state.globalTime;
            const wasPlaying = state.isPlaying;

            const blobPromise = new Promise(function(resolve) {
                mediaRecorder.onstop = function() {
                    resolve(new Blob(chunks, { type: mimeType }));
                };
            });

            mediaRecorder.start();
            statusEl.textContent = 'Gravando (~' + Math.ceil(duration / 1000) + 's)...';

            resetAnimation();
            state.isPlaying = true;
            updatePlayPauseUI();

            const startTime = Date.now();
            const progressInterval = setInterval(function() {
                const elapsed = Date.now() - startTime;
                progressBar.style.width = Math.min((elapsed / duration) * 100, 100) + '%';
            }, 100);

            await new Promise(function(resolve) {
                setTimeout(function() {
                    clearInterval(progressInterval);
                    mediaRecorder.stop();
                    resolve();
                }, duration);
            });

            statusEl.textContent = 'Processando vídeo...';
            progressBar.style.width = '100%';

            const blob = await blobPromise;
            const ext2 = ext; // closure

            // Restore state
            state.globalTime = startGlobalTime;
            state.isPlaying = wasPlaying;
            updatePlayPauseUI();

            statusEl.textContent = 'Pronto! Confirme o download.';

            // Show preview modal instead of auto-downloading
            var previewModal = document.getElementById('previewModal');
            var previewVideo = document.getElementById('previewVideo');
            var previewUrl = URL.createObjectURL(blob);
            previewVideo.src = previewUrl;
            previewModal.classList.remove('hidden');

            function closePreview() {
                // Delay revoke so the download/share can start before the URL is invalidated
                setTimeout(function() { URL.revokeObjectURL(previewUrl); }, 30000);
                previewModal.classList.add('hidden');
                previewVideo.src = '';
                statusEl.style.display = 'none';
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
            }

            // Web Share API (Android Chrome)
            var shareBtn = document.getElementById('previewShare');
            var canShareFiles = navigator.canShare && navigator.canShare({
                files: [new File([blob], 'texto-animado.' + ext2, { type: mimeType })]
            });
            if (shareBtn) {
                if (canShareFiles) {
                    shareBtn.classList.remove('hidden');
                    shareBtn.onclick = function() {
                        var file = new File([blob], 'texto-animado.' + ext2, { type: mimeType });
                        navigator.share({ files: [file], title: 'TextFlow - Texto Animado' }).catch(function() {});
                        closePreview();
                    };
                } else {
                    shareBtn.classList.add('hidden');
                }
            }

            document.getElementById('previewDownload').onclick = function() {
                var anchor = document.createElement('a');
                anchor.href = previewUrl;
                anchor.download = 'texto-animado.' + ext2;
                anchor.click();
                closePreview();
                showToast('Vídeo baixado!', 'success');
            };

            document.getElementById('previewDiscard').onclick = function() {
                closePreview();
                showToast('Gravação descartada', 'info');
            };

            if (audioExport) {
                audioExport.cleanup();
            }
        } catch (error) {
            console.error('Export error:', error);
            statusEl.textContent = error.message || 'Erro na exportação. Tente novamente.';
            showToast('Erro na exportação', 'error');
            progressContainer.style.display = 'none';
        }

        exportBtn.disabled = false;
        recordingBadge.style.display = 'none';
    }

    window.TextFlowExporter = {
        exportVideo
    };
})();
