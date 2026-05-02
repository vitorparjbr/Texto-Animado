(() => {
    async function exportVideo(deps) {
        const {
            canvas,
            state,
            getActiveLayer,
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

            const anim = getActiveLayer().animationType;
            const isScroll = anim === 'scrollUp' || anim === 'scrollDown';
            let duration;

            if (isScroll) {
                const textHeight = getTotalTextHeight();
                const totalDistance = canvas.height + textHeight + 100;
                const pixelsPerSecond = state.speed * 60;
                duration = (totalDistance / pixelsPerSecond) * 1000;
            } else {
                duration = Math.max(500, (5 / state.speed) * 1000);
            }

            const startY = state.animationY;
            const startProgress = state.animProgress;
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
            const dlUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = dlUrl;
            anchor.download = 'texto-animado.' + ext;
            anchor.click();
            URL.revokeObjectURL(dlUrl);

            state.animationY = startY;
            state.animProgress = startProgress;
            state.isPlaying = wasPlaying;
            updatePlayPauseUI();

            statusEl.textContent = 'Exportado com sucesso!';
            showToast('Vídeo exportado!', 'success');

            setTimeout(function() {
                statusEl.style.display = 'none';
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
            }, 3000);
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
