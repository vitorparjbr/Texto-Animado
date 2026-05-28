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

    function shouldBypassWebCodecsForImageExport(state) {
        const userAgentData = navigator.userAgentData;
        const isMobile = !!(userAgentData && userAgentData.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
        return isMobile && state.mediaType === 'image' && !!state.mediaSource;
    }

    function createExportAbortError() {
        const error = new Error('Exportação cancelada.');
        error.name = 'AbortError';
        return error;
    }

    function throwIfExportCancelled(exportController) {
        if (exportController && exportController.cancelled) {
            throw createExportAbortError();
        }
    }

    function getExportVideoBitrate(width, height) {
        return Math.max(5000000, Math.min(12000000, Math.round(width * height * 8)));
    }

    async function createExportImageSource(state, imageBg) {
        let exportImageBg = imageBg;
        let exportImageBitmap = null;

        if (state.mediaType === 'image' && imageBg.src && imageBg.complete && imageBg.naturalWidth > 0) {
            try {
                if (typeof createImageBitmap === 'function') {
                    if (state.mediaFile && state.mediaFile instanceof Blob) {
                        exportImageBitmap = await createImageBitmap(state.mediaFile);
                    } else {
                        exportImageBitmap = await createImageBitmap(imageBg);
                    }

                    var bitmapCanvas = document.createElement('canvas');
                    bitmapCanvas.width = exportImageBitmap.width;
                    bitmapCanvas.height = exportImageBitmap.height;
                    var bitmapCtx = bitmapCanvas.getContext('2d');
                    if (bitmapCtx) {
                        bitmapCtx.imageSmoothingEnabled = true;
                        if ('imageSmoothingQuality' in bitmapCtx) bitmapCtx.imageSmoothingQuality = 'high';
                        bitmapCtx.drawImage(exportImageBitmap, 0, 0);
                    }
                    exportImageBg = bitmapCanvas;
                    exportImageBg.complete = true;
                    exportImageBg.src = 'bitmap';
                }
            } catch (bitmapErr) {
                console.warn('Failed to pre-decode image for export, using original:', bitmapErr);
            }
        }

        return {
            source: exportImageBg,
            bitmap: exportImageBitmap
        };
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
        const needsLoop = totalDurationSec > startAt + clipDuration;
        const effectiveEnd = needsLoop ? totalDurationSec : startAt + clipDuration;

        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(offlineCtx.destination);

        gainNode.gain.setValueAtTime(fadeIn > 0 ? 0 : volume, startAt);
        if (fadeIn > 0) gainNode.gain.linearRampToValueAtTime(volume, startAt + fadeIn);
        if (fadeOut > 0) {
            const fadeOutStart = Math.max(startAt, effectiveEnd - fadeOut);
            gainNode.gain.setValueAtTime(volume, fadeOutStart);
            gainNode.gain.linearRampToValueAtTime(0.0001, effectiveEnd);
        }

        if (needsLoop) {
            source.loop = true;
            source.loopStart = trimStart;
            source.loopEnd = trimEnd;
            source.start(startAt, trimStart);
            source.stop(totalDurationSec);
        } else {
            source.start(startAt, trimStart, clipDuration);
        }

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

        async function exportVideoWebCodecs(deps, duration, activeAudioMode, exportStartMs, baseDuration) {
            const { canvas, state, getAudioTrimStart, getAudioTrimEnd, resetAnimation, showToast, exportController } = deps;
        const statusEl = document.getElementById('exportStatus');
        const progressBar = document.getElementById('progressBar');
        const { render } = window.TextFlowRender;
        const easings = window.TextFlowState.easings;
        const videoBg = document.getElementById('videoBg');
        const imageBg = document.getElementById('imageBg');
            const imageExportAsset = await createExportImageSource(state, imageBg);
            let exportImageBg = imageExportAsset.source;
            let exportImageBitmap = imageExportAsset.bitmap;
            throwIfExportCancelled(exportController);

        // Canvas offscreen dedicado para exportação — evita interferência com o canvas
        // principal e problemas de taint no mobile.
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        const exportCtx = exportCanvas.getContext('2d');
            if (exportCtx) {
                exportCtx.imageSmoothingEnabled = true;
                if ('imageSmoothingQuality' in exportCtx) exportCtx.imageSmoothingQuality = 'high';
            }

        const muxer = new Mp4Muxer.Muxer({
            target: new Mp4Muxer.ArrayBufferTarget(),
            video: { codec: 'avc', width: canvas.width, height: canvas.height },
            audio: activeAudioMode !== 'none' ? { codec: 'aac', numberOfChannels: 2, sampleRate: 44100 } : undefined,
            fastStart: 'in-memory'
        });

        // IMPORTANTE: erros no callback NÃO são capturados pelo try/catch externo.
        // Por isso capturamos em videoError e checamos no loop.
        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => { console.error('VideoEncoder error:', e); videoError = e; }
        });

        videoEncoder.configure({
            codec: 'avc1.4D401F',
            width: canvas.width,
            height: canvas.height,
            bitrate: getExportVideoBitrate(canvas.width, canvas.height),
            framerate: 30
        });

        const totalFrames = Math.ceil((duration / 1000) * 30);
        resetAnimation();
        state.isPlaying = false;
        
        let videoError = null;

        for (let i = 0; i < totalFrames; i++) {
            throwIfExportCancelled(exportController);
            if (videoError) throw videoError;
            state.globalTime = (exportStartMs / 1000) + (i / 30);

            if (state.mediaType === 'video' && videoBg.src) {
                videoBg.currentTime = getAudioTrimStart() + state.globalTime;
                // Sempre aguarda o evento 'seeked' para garantir que o frame correto
                // seja decodificado antes de renderizar. Sem isso, o canvas captura o
                // frame anterior ao seek (race condition) gerando vídeo com frames errados.
                await new Promise(function(seekResolve) {
                    var done = false;
                    var seekTimeout = setTimeout(function() {
                        if (!done) { done = true; seekResolve(); }
                    }, 500);
                    videoBg.addEventListener('seeked', function onSeeked() {
                        if (!done) {
                            done = true;
                            clearTimeout(seekTimeout);
                            videoBg.removeEventListener('seeked', onSeeked);
                            seekResolve();
                        }
                    });
                });
            }

            // Renderiza no canvas offscreen usando o imageBg pré-decodificado
            render(exportCtx, exportCanvas, state, videoBg, exportImageBg, easings);
            
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
            throwIfExportCancelled(exportController);

            const frame = new VideoFrame(exportCanvas, { timestamp: (i / 30) * 1000000 });
            videoEncoder.encode(frame, { keyFrame: i % 30 === 0 });
            frame.close();

            if (i % 5 === 0) {
                progressBar.style.width = ((i / totalFrames) * 80) + '%';
                statusEl.textContent = 'Renderizando Vídeo (' + Math.floor((i / totalFrames) * 100) + '%)...';
            }

            // Aguarda a fila do encoder diminuir, com timeout de segurança para evitar
            // travamento infinito no mobile caso o encoder pare de processar frames.
            var queueWaitStart = Date.now();
            while (videoEncoder.encodeQueueSize > 10) {
                await new Promise(r => setTimeout(r, 5));
                throwIfExportCancelled(exportController);
                if (Date.now() - queueWaitStart > 8000) {
                    throw new Error('VideoEncoder travou: fila de encode não está sendo processada (mobile).');
                }
            }
        }

        // Limpa o ImageBitmap para liberar memória GPU
        if (exportImageBitmap) {
            exportImageBitmap.close();
            exportImageBitmap = null;
        }

        await videoEncoder.flush();
        throwIfExportCancelled(exportController);
        // Verifica se houve erro silencioso no VideoEncoder após o flush
        if (videoError) throw videoError;

        if (activeAudioMode !== 'none') {
            statusEl.textContent = 'Processando Áudio...';
            progressBar.style.width = '85%';
            try {
                throwIfExportCancelled(exportController);
                let audioBuffer = await renderOfflineAudioBuffer(state, getAudioTrimStart, getAudioTrimEnd, baseDuration / 1000);
                if (audioBuffer && exportStartMs > 0) {
                    const sampleRate = audioBuffer.sampleRate;
                    const startFrame = Math.floor((exportStartMs / 1000) * sampleRate);
                    const numFrames = Math.floor((duration / 1000) * sampleRate);
                    const numChannels = audioBuffer.numberOfChannels;

                    const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
                        numChannels,
                        numFrames,
                        sampleRate
                    );
                    const slicedBuffer = offlineCtx.createBuffer(numChannels, numFrames, sampleRate);
                    for (let c = 0; c < numChannels; c++) {
                        const targetData = slicedBuffer.getChannelData(c);
                        const sourceData = audioBuffer.getChannelData(c);
                        targetData.set(sourceData.subarray(startFrame, startFrame + numFrames));
                    }
                    audioBuffer = slicedBuffer;
                }

                if (audioBuffer) {
                    let audioEncodeError = null;
                    const audioEncoder = new AudioEncoder({
                        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
                        error: e => { console.error('AudioEncoder error:', e); audioEncodeError = e; }
                    });
                    audioEncoder.configure({ codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: 44100, bitrate: 128000 });
                    progressBar.style.width = '90%';
                    await encodeAudioBuffer(audioBuffer, audioEncoder);
                    throwIfExportCancelled(exportController);
                    if (audioEncodeError) throw audioEncodeError;
                }
            } catch (err) {
                if (err && err.name === 'AbortError') throw err;
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
    async function createImportedAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd, totalDurationSec, exportStartSec) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) throw new Error('Navegador sem suporte a mixagem.');
        if (!state.audioBuffer) throw new Error('Aguarde o audio carregar.');

        const trimStart = getAudioTrimStart();
        const trimEnd = getAudioTrimEnd();
        const clipDuration = Math.max(0, trimEnd - trimStart);
        if (!clipDuration) return null;

        const audioOffset = exportStartSec ? (exportStartSec % clipDuration) : 0;

        const audioContext = new AudioContextCtor();
        const destination = audioContext.createMediaStreamDestination();
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        const volume = Math.max(0, Math.min(state.audioVolume || 0, 1));
        const startAt = audioContext.currentTime + 0.05;
        const needsLoop = totalDurationSec > 0 && totalDurationSec > (clipDuration - audioOffset);
        const effectiveDuration = totalDurationSec;
        const fadeIn = Math.min(Math.max(0, state.audioFadeIn || 0), effectiveDuration);
        const fadeOut = Math.min(Math.max(0, state.audioFadeOut || 0), effectiveDuration);
        const stopAt = startAt + effectiveDuration;

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
        if (needsLoop) {
            source.loop = true;
            source.loopStart = trimStart;
            source.loopEnd = trimEnd;
            source.start(startAt, trimStart + audioOffset);
            source.stop(stopAt + 0.02);
        } else {
            source.start(startAt, trimStart + audioOffset, clipDuration - audioOffset);
            source.stop(stopAt + 0.02);
        }

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

    async function createBackgroundVideoAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd, totalDurationSec, exportStartSec) {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) throw new Error('Navegador sem suporte a mixagem.');
        if (!state.mediaSource) throw new Error('Importe um video.');

        const trimStart = getAudioTrimStart();
        const trimEnd = getAudioTrimEnd();
        const clipDuration = Math.max(0, trimEnd - trimStart);
        if (!clipDuration) return null;

        const audioOffset = exportStartSec ? (exportStartSec % clipDuration) : 0;

        const audioContext = new AudioContextCtor();
        const destination = audioContext.createMediaStreamDestination();
        const sourceVideo = document.createElement('video');
        const gainNode = audioContext.createGain();
        const volume = Math.max(0, Math.min(state.audioVolume || 0, 1));
        const needsLoop = totalDurationSec > 0 && totalDurationSec > (clipDuration - audioOffset);
        const effectiveDuration = totalDurationSec;
        const fadeIn = Math.min(Math.max(0, state.audioFadeIn || 0), effectiveDuration);
        const fadeOut = Math.min(Math.max(0, state.audioFadeOut || 0), effectiveDuration);
        const startAt = audioContext.currentTime + 0.05;
        const stopAt = startAt + effectiveDuration;
        let sourceNode;
        let stopTimer;
        let loopListener = null;

        sourceVideo.preload = 'auto';
        sourceVideo.playsInline = true;
        sourceVideo.src = state.mediaSource;

        if (sourceVideo.readyState < 1) {
            sourceVideo.load();
            await waitForMediaElementEvent(sourceVideo, 'loadedmetadata');
        }

        const finalTrimStart = trimStart + audioOffset;
        if (finalTrimStart > 0) {
            sourceVideo.currentTime = finalTrimStart;
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

        if (needsLoop) {
            loopListener = function() {
                if (sourceVideo.currentTime >= trimEnd - 0.15) {
                    sourceVideo.currentTime = trimStart;
                }
            };
            sourceVideo.addEventListener('timeupdate', loopListener);
            stopTimer = setTimeout(function() {
                sourceVideo.pause();
            }, (totalDurationSec * 1000) + 50);
        } else {
            stopTimer = setTimeout(function() {
                sourceVideo.pause();
            }, (effectiveDuration * 1000) + 50);
        }

        return {
            stream: destination.stream,
            cleanup: function() {
                clearTimeout(stopTimer);
                if (loopListener) sourceVideo.removeEventListener('timeupdate', loopListener);
                sourceVideo.pause();
                sourceVideo.removeAttribute('src');
                sourceVideo.load();
                try { sourceNode.disconnect(); gainNode.disconnect(); } catch (e) {}
                if (typeof audioContext.close === 'function') audioContext.close().catch(()=>{});
            }
        };
    }

    async function exportVideoMediaRecorder(deps, mimeType, ext, duration, activeAudioMode, exportStartMs, baseDuration) {
        const { canvas, state, getAudioTrimStart, getAudioTrimEnd, resetAnimation, updatePlayPauseUI, exportController } = deps;
        const statusEl = document.getElementById('exportStatus');
        const progressBar = document.getElementById('progressBar');
        const { render } = window.TextFlowRender;
        const easings = window.TextFlowState.easings;
        const videoBg = document.getElementById('videoBg');
        const imageBg = document.getElementById('imageBg');

        const useDedicatedRecorderCanvas = state.mediaType !== 'video';
        let imageExportAsset = null;
        let renderCanvas = canvas;
        let renderCtx = null;
        let renderImageBg = imageBg;

        if (useDedicatedRecorderCanvas) {
            renderCanvas = document.createElement('canvas');
            renderCanvas.width = canvas.width;
            renderCanvas.height = canvas.height;
            renderCtx = renderCanvas.getContext('2d');
            if (renderCtx) {
                renderCtx.imageSmoothingEnabled = true;
                if ('imageSmoothingQuality' in renderCtx) renderCtx.imageSmoothingQuality = 'high';
            }

            imageExportAsset = await createExportImageSource(state, imageBg);
            renderImageBg = imageExportAsset.source;
            throwIfExportCancelled(exportController);
        }

        const canvasStream = renderCanvas.captureStream(30);
        let audioExport = null;
        let streamTracks = canvasStream.getVideoTracks().slice();
        let renderInterval = null;
        let progressInterval = null;
        let stopTimeout = null;
        let recordingStopped = false;

        const totalDurationSec = duration / 1000;
        const exportStartSec = exportStartMs / 1000;

        if (activeAudioMode === 'imported') {
            audioExport = await createImportedAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd, totalDurationSec, exportStartSec);
        } else if (activeAudioMode === 'backgroundVideo') {
            audioExport = await createBackgroundVideoAudioExportStream(state, getAudioTrimStart, getAudioTrimEnd, totalDurationSec, exportStartSec);
        }

        if (audioExport && audioExport.stream) {
            streamTracks = streamTracks.concat(audioExport.stream.getAudioTracks());
        }

        const stream = new MediaStream(streamTracks);
        const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: getExportVideoBitrate(renderCanvas.width, renderCanvas.height) });
        const chunks = [];

        function cleanupRecorderResources() {
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            if (renderInterval) {
                clearInterval(renderInterval);
                renderInterval = null;
            }
            if (stopTimeout) {
                clearTimeout(stopTimeout);
                stopTimeout = null;
            }
            stream.getTracks().forEach(function(track) {
                try { track.stop(); } catch (e) {}
            });
            if (audioExport) audioExport.cleanup();
            if (imageExportAsset && imageExportAsset.bitmap) {
                imageExportAsset.bitmap.close();
                imageExportAsset.bitmap = null;
            }
        }

        function stopRecorder() {
            if (recordingStopped) return;
            recordingStopped = true;
            if (mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
        }
        
        mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        const blobPromise = new Promise(function(resolve, reject) {
            mediaRecorder.onstop = function() {
                cleanupRecorderResources();
                if (exportController && exportController.cancelled) {
                    reject(createExportAbortError());
                    return;
                }
                resolve(new Blob(chunks, { type: mimeType }));
            };

            mediaRecorder.onerror = function(event) {
                cleanupRecorderResources();
                reject((event && event.error) || new Error('Falha ao gravar o vídeo.'));
            };
        });

        throwIfExportCancelled(exportController);

        if (useDedicatedRecorderCanvas && renderCtx) {
            state.globalTime = exportStartMs / 1000;
            render(renderCtx, renderCanvas, state, videoBg, renderImageBg, easings);
        }

        mediaRecorder.start();
        statusEl.textContent = 'Gravando (~' + Math.ceil(duration / 1000) + 's)...';

        resetAnimation();
        state.globalTime = exportStartMs / 1000;
        state.isPlaying = !useDedicatedRecorderCanvas;
        updatePlayPauseUI();

        const startTime = Date.now();
        progressInterval = setInterval(function() {
            const elapsed = Date.now() - startTime;
            progressBar.style.width = Math.min((elapsed / duration) * 100, 100) + '%';
            if (exportController && exportController.cancelled) {
                stopRecorder();
            }
        }, 100);

        if (useDedicatedRecorderCanvas && renderCtx) {
            const frameDuration = 1000 / 30;
            renderInterval = setInterval(function() {
                if (exportController && exportController.cancelled) {
                    stopRecorder();
                    return;
                }

                const elapsed = Math.min(Date.now() - startTime, duration);
                state.globalTime = (exportStartMs / 1000) + (elapsed / 1000);
                render(renderCtx, renderCanvas, state, videoBg, renderImageBg, easings);

                if (elapsed >= duration) {
                    stopRecorder();
                }
            }, frameDuration);
        }

        stopTimeout = setTimeout(function() {
            if (useDedicatedRecorderCanvas && renderCtx) {
                state.globalTime = (exportStartMs / 1000) + (duration / 1000);
                render(renderCtx, renderCanvas, state, videoBg, renderImageBg, easings);
            }
            stopRecorder();
        }, duration);

        statusEl.textContent = 'Processando vídeo...';
        progressBar.style.width = '100%';

        const blob = await blobPromise;

        return blob;
    }

    async function exportVideo(deps) {
        const { canvas, state, getTotalTextHeight, getAudioTrimStart, getAudioTrimEnd, updatePlayPauseUI, resetAnimation, showToast } = deps;
        const statusEl = document.getElementById('exportStatus');
        const exportBtn = document.getElementById('exportBtn');
        const recordingBadge = document.getElementById('recordingBadge');
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');
        const cancelExportBtn = document.getElementById('cancelExportBtn');

        statusEl.style.display = 'block';
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        exportBtn.disabled = true;
        recordingBadge.style.display = 'inline-block';

        const exportController = {
            cancelled: false,
            cancel: function() {
                if (this.cancelled) return;
                this.cancelled = true;
                statusEl.textContent = 'Cancelando exportação...';
            }
        };

        if (cancelExportBtn) {
            cancelExportBtn.classList.remove('hidden');
            cancelExportBtn.onclick = function() {
                exportController.cancel();
            };
        }

        const startGlobalTime = state.globalTime;
        const wasPlaying = state.isPlaying;
        state.isExporting = true;
        const exportDeps = Object.assign({}, deps, { exportController: exportController });

        try {
            const activeAudioMode = getActiveAudioMode(state);
            const visualDuration = getVisualDurationMs(canvas, state, getTotalTextHeight);
            const audioDuration = activeAudioMode !== 'none' ? Math.max(0, (getAudioTrimEnd() - getAudioTrimStart()) * 1000) : 0;
            const baseDuration = Math.max(visualDuration, audioDuration, 500);

            // Respeita corte configurado pelo usuário se for ativo
            let exportStartMs = 0;
            let exportEndMs = baseDuration;

            if (state.exportTrimActive && state.exportTrimEnd > state.exportTrimStart) {
                exportStartMs = Math.max(0, state.exportTrimStart * 1000);
                exportEndMs = Math.min(baseDuration, state.exportTrimEnd * 1000);
            }

            const duration = Math.max(500, exportEndMs - exportStartMs);
            
            let blob = null;
            let ext2;

            // Tenta WebCodecs (MP4 nativo, melhor qualidade)
            if (!shouldBypassWebCodecsForImageExport(state) && typeof window.VideoEncoder !== 'undefined' && window.Mp4Muxer) {
                try {
                    console.log('Using WebCodecs for export');
                    ext2 = 'mp4';
                    blob = await exportVideoWebCodecs(exportDeps, duration, activeAudioMode, exportStartMs, baseDuration);
                } catch (webCodecsErr) {
                    if (webCodecsErr && webCodecsErr.name === 'AbortError') {
                        throw webCodecsErr;
                    }
                    // No mobile, o VideoEncoder pode falhar por codec não suportado,
                    // GPU ocupada, ou outros erros de hardware. Faz fallback para MediaRecorder.
                    console.warn('WebCodecs export failed, falling back to MediaRecorder:', webCodecsErr);
                    showToast('Usando método alternativo para exportar...', 'info');
                    blob = null;
                    // Reseta o estado de animação para o MediaRecorder começar do zero
                    progressBar.style.width = '0%';
                    resetAnimation();
                    state.isPlaying = false;
                }
            } else if (shouldBypassWebCodecsForImageExport(state)) {
                console.log('Skipping WebCodecs for image export on mobile');
                showToast('Usando modo compatível para exportar imagem no celular...', 'info');
            }

            // Fallback: MediaRecorder (grava em tempo real)
            if (!blob) {
                console.log('Using MediaRecorder for export');
                if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
                    throw new Error('Exportação de vídeo não suportada neste navegador.');
                }
                let mimeType = getSupportedMimeType(activeAudioMode !== 'none');
                if (!mimeType) mimeType = getSupportedMimeType(false);
                if (!mimeType) throw new Error('Sem suporte a codecs de vídeo.');

                ext2 = mimeType.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
                blob = await exportVideoMediaRecorder(exportDeps, mimeType, ext2, duration, activeAudioMode, exportStartMs, baseDuration);
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
            if (error && error.name === 'AbortError') {
                statusEl.style.display = 'none';
                progressContainer.style.display = 'none';
                progressBar.style.width = '0%';
                showToast('Exportação cancelada', 'info');
            } else {
                console.error('Export error:', error);
                statusEl.textContent = error.message || 'Erro na exportação. Tente novamente.';
                showToast('Erro na exportação', 'error');
                progressContainer.style.display = 'none';
            }
        }

        exportBtn.disabled = false;
        recordingBadge.style.display = 'none';
        if (cancelExportBtn) {
            cancelExportBtn.classList.add('hidden');
            cancelExportBtn.onclick = null;
        }
    }

    window.TextFlowExporter = {
        exportVideo
    };
})();
