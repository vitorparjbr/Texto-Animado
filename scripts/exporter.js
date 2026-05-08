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
        if (state.audioSourceMode === 'backgroundVideo' && state.mediaType === 'video' && (state.mediaSource || state.mediaFile)) {
            return 'backgroundVideo';
        }
        if (state.audioSource || state.audioFile) {
            return 'imported';
        }
        return 'none';
    }

    // --- WebCodecs (Offline) Methods ---

    async function renderOfflineAudioBuffer(state, getAudioTrimStart, getAudioTrimEnd, totalDurationSec) {
        const AudioContextCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AudioContextCtor) return null;

        let file = null;
        let isBg = false;
        if (state.audioSourceMode === 'backgroundVideo' && state.mediaType === 'video' && state.mediaFile) {
            file = state.mediaFile;
            isBg = true;
        } else if (state.audioSourceMode === 'imported' && state.audioFile) {
            file = state.audioFile;
        }

        const trimStart = getAudioTrimStart();
        const trimEnd = getAudioTrimEnd();
        const clipDuration = Math.max(0, trimEnd - trimStart);
        if (!clipDuration) return null;

        let audioBuffer = state.audioBuffer;
        if (isBg && file) {
            const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
            const ab = await file.arrayBuffer();
            audioBuffer = await tempCtx.decodeAudioData(ab);
            if (typeof tempCtx.close === 'function') tempCtx.close().catch(()=>{});
        } else if (!audioBuffer && file) {
            const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
            const ab = await file.arrayBuffer();
            audioBuffer = await tempCtx.decodeAudioData(ab);
            if (typeof tempCtx.close === 'function') tempCtx.close().catch(()=>{});
        }

        if (!audioBuffer) return null;

        const sampleRate = 44100;
        const numChannels = 2;
        const offlineCtx = new AudioContextCtor(numChannels, Math.ceil(totalDurationSec * sampleRate), sampleRate);

        const source = offlineCtx.createBufferSource();
        const gainNode = offlineCtx.createGain();
        const volume = Math.max(0, Math.min(state.audioVolume || 0, 1));
        const fadeIn = Math.min(Math.max(0, state.audioFadeIn || 0), clipDuration);
        const fadeOut = Math.min(Math.max(0, state.audioFadeOut || 0), clipDuration);

        const startAt = 0.05;
        const stopAt = startAt + clipDuration;

        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        gainNode.gain.setValueAtTime(fadeIn > 0 ? 0 : volume, startAt);
        if (fadeIn > 0) gainNode.gain.linearRampToValueAtTime(volume, startAt + fadeIn);
        if (fadeOut > 0) {
            const fadeOutStart = Math.max(startAt, stopAt - fadeOut);
            gainNode.gain.setValueAtTime(volume, fadeOutStart);
            gainNode.gain.linearRampToValueAtTime(0.0001, stopAt);
        }

        source.start(startAt, trimStart, clipDuration);

        return await offlineCtx.startRendering();
    }

    async function encodeAudioBuffer(audioBuffer, audioEncoder) {
        const sampleRate = audioBuffer.sampleRate;
        const numChannels = audioBuffer.numberOfChannels;
        const totalFrames = audioBuffer.length;
        const chunkSize = sampleRate; // process 1 second at a time

        for (let i = 0; i < totalFrames; i += chunkSize) {
            const framesToCopy = Math.min(chunkSize, totalFrames - i);
            const planarData = new Float32Array(framesToCopy * numChannels);

            for (let c = 0; c < numChannels; c++) {
                const channelData = audioBuffer.getChannelData(c);
                planarData.set(channelData.subarray(i, i + framesToCopy), c * framesToCopy);
            }

            const audioData = new AudioData({
                format: 'f32-planar',
                sampleRate: sampleRate,
                numberOfFrames: framesToCopy,
                numberOfChannels: numChannels,
                timestamp: (i / sampleRate) * 1000000,
                data: planarData
            });

            audioEncoder.encode(audioData);
            audioData.close();

            await new Promise(r => setTimeout(r, 0));
        }
        await audioEncoder.flush();
    }

    async function exportVideoWebCodecs(deps, duration, activeAudioMode) {
        const { canvas, state, getAudioTrimStart, getAudioTrimEnd, resetAnimation, showToast } = deps;
        const statusEl = document.getElementById('exportStatus');
        const progressBar = document.getElementById('progressBar');
        const { render } = window.TextFlowRender;
        const easings = window.TextFlowState.easings;
        const videoBg = document.getElementById('videoBg');
        const imageBg = document.getElementById('imageBg');

        const muxer = new Mp4Muxer.Muxer({
            target: new Mp4Muxer.ArrayBufferTarget(),
            video: { codec: 'avc', width: canvas.width, height: canvas.height },
            audio: activeAudioMode !== 'none' ? { codec: 'aac', numberOfChannels: 2, sampleRate: 44100 } : undefined,
            fastStart: 'in-memory'
        });

        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => { console.error(e); throw new Error('VideoEncoder erro: ' + e.message); }
        });

        videoEncoder.configure({
            codec: 'avc1.4D401F',
            width: canvas.width,
            height: canvas.height,
            bitrate: 5000000,
            framerate: 30
        });

        const totalFrames = Math.ceil((duration / 1000) * 30);
        resetAnimation();
        state.isPlaying = false;
        
        let videoError = null;

        for (let i = 0; i < totalFrames; i++) {
            if (videoError) throw videoError;
            state.globalTime = i / 30;

            if (state.mediaType === 'video' && videoBg.src) {
                videoBg.currentTime = getAudioTrimStart() + state.globalTime;
                if (videoBg.readyState < 2) {
                    await new Promise(r => {
                        const check = () => { if (videoBg.readyState >= 2) { videoBg.removeEventListener('seeked', check); r(); } };
                        videoBg.addEventListener('seeked', check);
                    });
                }
            }

            render(canvas.getContext('2d'), canvas, state, videoBg, imageBg, easings);
            
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));

            const frame = new VideoFrame(canvas, { timestamp: (i / 30) * 1000000 });
            videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
            frame.close();

            if (i % 5 === 0) {
                progressBar.style.width = ((i / totalFrames) * 80) + '%';
                statusEl.textContent = 'Renderizando Vídeo (' + Math.floor((i / totalFrames) * 100) + '%)...';
            }

            while (videoEncoder.encodeQueueSize > 10) {
                await new Promise(r => setTimeout(r, 5));
            }
        }

        await videoEncoder.flush();

        if (activeAudioMode !== 'none') {
            statusEl.textContent = 'Processando Áudio...';
            progressBar.style.width = '85%';
            try {
                const audioBuffer = await renderOfflineAudioBuffer(state, getAudioTrimStart, getAudioTrimEnd, duration / 1000);
                if (audioBuffer) {
                    const audioEncoder = new AudioEncoder({
                        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                        error: e => { console.error(e); throw new Error('AudioEncoder erro: ' + e.message); }
                    });
                    audioEncoder.configure({ codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: 44100, bitrate: 128000 });
                    progressBar.style.width = '90%';
                    await encodeAudioBuffer(audioBuffer, audioEncoder);
                }
            } catch (err) {
                console.error("Audio WebCodecs error:", err);
                showToast('Aviso: Ocorreu um erro ao processar o áudio, o vídeo sairá mudo.', 'info');
            }
        }

        statusEl.textContent = 'Finalizando arquivo...';
        progressBar.style.width = '100%';
        muxer.finalize();

        return new Blob([muxer.target.buffer], { type: 'video/mp4' });
    }

    // --- MediaRecorder Fallback ---
    async function createImportedAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) throw new Error('Navegador sem suporte a mixagem.');
        if (!state.audioBuffer) throw new Error('Aguarde o audio carregar.');

        const trimStart = getAudioTrimStart();
        const trimEnd = getAudioTrimEnd();
        const clipDuration = Math.max(0, trimEnd - trimStart);
        if (!clipDuration) return null;

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
        if (fadeIn > 0) gainNode.gain.linearRampToValueAtTime(volume, startAt + fadeIn);
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
                try { source.disconnect(); gainNode.disconnect(); } catch (e) {}
                if (typeof audioContext.close === 'function') audioContext.close().catch(()=>{});
            }
        };
    }

    function waitForMediaElementEvent(mediaElement, eventName) {
        return new Promise(function(resolve, reject) {
            function cleanup() {
                mediaElement.removeEventListener(eventName, onReady);
                mediaElement.removeEventListener('error', onError);
            }
            function onReady() { cleanup(); resolve(); }
            function onError() { cleanup(); reject(new Error('Nao carregou o video.')); }
            mediaElement.addEventListener(eventName, onReady, { once: true });
            mediaElement.addEventListener('error', onError, { once: true });
        });
    }

    async function createBackgroundVideoAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) throw new Error('Navegador sem suporte a mixagem.');
        if (!state.mediaSource) throw new Error('Importe um video.');

        const trimStart = getAudioTrimStart();
        const trimEnd = getAudioTrimEnd();
        const clipDuration = Math.max(0, trimEnd - trimStart);
        if (!clipDuration) return null;

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
        if (fadeIn > 0) gainNode.gain.linearRampToValueAtTime(volume, startAt + fadeIn);
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
                try { sourceNode.disconnect(); gainNode.disconnect(); } catch (e) {}
                if (typeof audioContext.close === 'function') audioContext.close().catch(()=>{});
            }
        };
    }

    async function exportVideoMediaRecorder(deps, mimeType, ext, duration, activeAudioMode) {
        const { canvas, state, getAudioTrimStart, getAudioTrimEnd, resetAnimation, updatePlayPauseUI } = deps;
        const statusEl = document.getElementById('exportStatus');
        const progressBar = document.getElementById('progressBar');

        const canvasStream = canvas.captureStream(30);
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
        const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });
        const chunks = [];
        
        mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

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
        if (audioExport) audioExport.cleanup();

        return blob;
    }

    async function exportVideo(deps) {
        const { canvas, state, getTotalTextHeight, getAudioTrimStart, getAudioTrimEnd, updatePlayPauseUI, showToast } = deps;
        const statusEl = document.getElementById('exportStatus');
        const exportBtn = document.getElementById('exportBtn');
        const recordingBadge = document.getElementById('recordingBadge');
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');

        statusEl.style.display = 'block';
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        exportBtn.disabled = true;
        recordingBadge.style.display = 'inline-block';

        const startGlobalTime = state.globalTime;
        const wasPlaying = state.isPlaying;
        state.isExporting = true;

        try {
            const activeAudioMode = getActiveAudioMode(state);
            const visualDuration = getVisualDurationMs(canvas, state, getTotalTextHeight);
            const audioDuration = activeAudioMode !== 'none' ? Math.max(0, (getAudioTrimEnd() - getAudioTrimStart()) * 1000) : 0;
            const duration = Math.max(visualDuration, audioDuration, 500);
            
            let blob;
            let ext2;

            if (typeof window.VideoEncoder !== 'undefined' && window.Mp4Muxer) {
                console.log('Using WebCodecs for export');
                ext2 = 'mp4';
                blob = await exportVideoWebCodecs(deps, duration, activeAudioMode);
            } else {
                console.log('Using MediaRecorder for export');
                if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
                    throw new Error('Exportação de vídeo não suportada neste navegador.');
                }
                let mimeType = getSupportedMimeType(activeAudioMode !== 'none');
                if (!mimeType) mimeType = getSupportedMimeType(false);
                if (!mimeType) throw new Error('Sem suporte a codecs de vídeo.');

                ext2 = mimeType.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
                blob = await exportVideoMediaRecorder(deps, mimeType, ext2, duration, activeAudioMode);
            }

            // Restore state
            state.globalTime = startGlobalTime;
            state.isPlaying = wasPlaying;
            state.isExporting = false;
            updatePlayPauseUI();

            statusEl.textContent = 'Pronto! Confirme o download.';

            var previewModal = document.getElementById('previewModal');
            var previewVideo = document.getElementById('previewVideo');
            var previewUrl = URL.createObjectURL(blob);
            previewVideo.src = previewUrl;
            previewModal.classList.remove('hidden');

            function closePreview() {
                setTimeout(function() { URL.revokeObjectURL(previewUrl); }, 30000);
                previewModal.classList.add('hidden');
                previewVideo.src = '';
                statusEl.style.display = 'none';
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
            }

            var shareBtn = document.getElementById('previewShare');
            var canShareFiles = navigator.canShare && navigator.canShare({
                files: [new File([blob], 'texto-animado.' + ext2, { type: blob.type })]
            });
            if (shareBtn) {
                if (canShareFiles) {
                    shareBtn.classList.remove('hidden');
                    shareBtn.onclick = function() {
                        var file = new File([blob], 'texto-animado.' + ext2, { type: blob.type });
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
            state.isExporting = false;
            state.globalTime = startGlobalTime;
            state.isPlaying = wasPlaying;
            updatePlayPauseUI();
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
