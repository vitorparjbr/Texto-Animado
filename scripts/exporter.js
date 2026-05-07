(() => {
    async function exportVideo(deps) {
        const {
            canvas,
            state,
            getTotalTextHeight,
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
            let mimeType = 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/mp4';
                    if (!MediaRecorder.isTypeSupported(mimeType)) {
                        throw new Error('Seu navegador não suporta gravação de vídeo.');
                    }
                }
            }

            const ext = mimeType.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
            const stream = canvas.captureStream(30);
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 5000000
            });

            const chunks = [];
            mediaRecorder.ondataavailable = function(e) {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            const duration = state.layers.reduce(function(maxDuration, layer) {
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
