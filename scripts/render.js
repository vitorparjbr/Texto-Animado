(() => {
    function getFont(layer) {
        const weight = layer.bold ? 'bold' : 'normal';
        const style = layer.italic ? 'italic' : 'normal';
        return style + ' ' + weight + ' ' + layer.fontSize + 'px "' + layer.fontFamily + '", sans-serif';
    }

    function wrapText(ctx, text, maxWidth, layer) {
        ctx.font = getFont(layer);
        const paragraphs = text.split('\n');
        const allLines = [];

        for (let p = 0; p < paragraphs.length; p++) {
            const para = paragraphs[p];
            if (para === '') {
                allLines.push('');
                continue;
            }
            const words = para.split(' ');
            let currentLine = '';
            for (let w = 0; w < words.length; w++) {
                const word = words[w];
                const testLine = currentLine + (currentLine ? ' ' : '') + word;
                if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                    allLines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) allLines.push(currentLine);
        }

        return allLines.length ? allLines : [''];
    }

    function getTextHeight(ctx, canvas, layer) {
        const lines = wrapText(ctx, layer.text, canvas.width - 40, layer);
        return lines.length * layer.fontSize * 1.3;
    }

    function getTotalTextHeight(ctx, canvas, layers) {
        let total = 0;
        for (let i = 0; i < layers.length; i++) {
            total = Math.max(total, getTextHeight(ctx, canvas, layers[i]));
        }
        return total;
    }


    function applyEffect(ctx, layer, text, x, y) {
        ctx.save();

        const color = layer.textColor;
        const effectColor = layer.effectColor;
        const thickness = Math.max(1, layer.effectThickness);
        const intensity = layer.effectIntensity / 100;

        let fillStyle = color;
        if (layer.useGradient) {
            // Calculate gradient bounds based on real text width and alignment
            const textWidth = ctx.measureText(text).width;
            let gradX0, gradX1;
            if (layer.align === 'center') {
                gradX0 = x - textWidth / 2;
                gradX1 = x + textWidth / 2;
            } else if (layer.align === 'right') {
                gradX0 = x - textWidth;
                gradX1 = x;
            } else {
                gradX0 = x;
                gradX1 = x + textWidth;
            }
            const grad = ctx.createLinearGradient(gradX0, y, gradX1, y + layer.fontSize);
            grad.addColorStop(0, layer.gradientColor1);
            grad.addColorStop(1, layer.gradientColor2);
            fillStyle = grad;
        }

        switch (layer.effect) {
            case 'shadow':
                ctx.shadowColor = effectColor;
                ctx.shadowBlur = thickness * 3;
                ctx.shadowOffsetX = thickness;
                ctx.shadowOffsetY = thickness;
                ctx.fillStyle = fillStyle;
                ctx.fillText(text, x, y);
                break;
            case 'neon':
                ctx.shadowColor = effectColor;
                ctx.shadowBlur = thickness * 5 * intensity;
                ctx.fillStyle = fillStyle;
                for (let i = 0; i < 3; i++) ctx.fillText(text, x, y);
                break;
            case 'outline':
                ctx.strokeStyle = effectColor;
                ctx.lineWidth = thickness;
                ctx.fillStyle = fillStyle;
                ctx.strokeText(text, x, y);
                ctx.fillText(text, x, y);
                break;
            case 'hollow':
                ctx.strokeStyle = effectColor;
                ctx.lineWidth = thickness;
                ctx.strokeText(text, x, y);
                break;
            case 'glow': {
                // Save current alpha so we don't break animations that already set it (e.g. fadeIn)
                const savedAlpha = ctx.globalAlpha;
                ctx.shadowColor = effectColor;
                ctx.shadowBlur = thickness * 8;
                ctx.fillStyle = fillStyle;
                ctx.globalAlpha = savedAlpha * (0.3 + 0.7 * intensity);
                ctx.fillText(text, x, y);
                // Restore alpha and draw solid text on top
                ctx.globalAlpha = savedAlpha;
                ctx.shadowBlur = 0;
                ctx.fillText(text, x, y);
                break;
            }
            default:
                ctx.fillStyle = fillStyle;
                ctx.fillText(text, x, y);
        }

        ctx.restore();
    }

    function renderLayer(ctx, canvas, state, layer, easings) {
        const globalTime = state.globalTime;
        const delay = layer.startDelay || 0;

        // Layer not started yet — skip rendering
        if (globalTime < delay) return;

        const localTime = globalTime - delay;
        const anim = layer.animationType;
        const isScroll = anim === 'scrollUp' || anim === 'scrollDown';
        const easingFn = easings[layer.easing] || easings.linear;

        let t;
        if (isScroll) {
            // Calculate t so that text travels full canvas + text height at given speed
            const textH = getTextHeight(ctx, canvas, layer);
            const totalDist = canvas.height + textH + 100;
            const scrollDuration = totalDist / Math.max(1, state.speed * 60);
            t = easingFn((localTime % scrollDuration) / scrollDuration);
        } else {
            const animDuration = Math.max(0.5, 5 / state.speed);
            t = easingFn(Math.min(1, (localTime % animDuration) / animDuration));
        }

        const lines = wrapText(ctx, layer.text, canvas.width - 40, layer);
        const lineHeight = layer.fontSize * 1.3;
        const totalHeight = lines.length * lineHeight;

        ctx.save();
        ctx.font = getFont(layer);
        ctx.textBaseline = 'top';

        ctx.textAlign = layer.align;
        let startX = 20;
        if (layer.align === 'center') startX = canvas.width / 2;
        if (layer.align === 'right') startX = canvas.width - 20;

        if (anim === 'fadeIn') {
            ctx.globalAlpha = t;
            for (let i = 0; i < lines.length; i++) {
                const y = (canvas.height - totalHeight) / 2 + i * lineHeight;
                applyEffect(ctx, layer, lines[i], startX, y);
            }
            ctx.globalAlpha = 1;
        } else if (anim === 'typewriter') {
            const fullText = layer.text;
            const charsToShow = Math.floor(t * fullText.length);
            const visibleText = fullText.substring(0, charsToShow);
            const visibleLines = wrapText(ctx, visibleText, canvas.width - 40, layer);

            for (let i = 0; i < visibleLines.length; i++) {
                const y = (canvas.height - totalHeight) / 2 + i * lineHeight;
                applyEffect(ctx, layer, visibleLines[i], startX, y);
            }

            if (charsToShow < fullText.length) {
                const lastLine = visibleLines[visibleLines.length - 1] || '';
                const lastY = (canvas.height - totalHeight) / 2 + (visibleLines.length - 1) * lineHeight;
                const mw = ctx.measureText(lastLine).width;
                let cursorX;
                if (layer.align === 'center') cursorX = startX + mw / 2;
                else if (layer.align === 'right') cursorX = startX;
                else cursorX = startX + mw;

                ctx.fillStyle = layer.textColor;
                const blink = Math.sin(Date.now() / 200) > 0;
                if (blink) ctx.fillRect(cursorX + 2, lastY, 2, layer.fontSize);
            }
        } else if (anim === 'zoomIn') {
            const scale = t;
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(scale, scale);
            ctx.globalAlpha = t;
            for (let i = 0; i < lines.length; i++) {
                const y = -totalHeight / 2 + i * lineHeight;
                const x = layer.align === 'center' ? 0 : layer.align === 'right' ? canvas.width / 2 - 20 : -canvas.width / 2 + 20;
                applyEffect(ctx, layer, lines[i], x, y);
            }
            ctx.restore();
        } else if (anim === 'bounce') {
            const bounceY = (canvas.height - totalHeight) / 2 - (1 - t) * canvas.height * 0.5;
            for (let i = 0; i < lines.length; i++) {
                const y = bounceY + i * lineHeight;
                if (y > -lineHeight && y < canvas.height + lineHeight) {
                    applyEffect(ctx, layer, lines[i], startX, y);
                }
            }
        } else if (anim === 'slideLeft') {
            const slideX = (1 - t) * (canvas.width + 100);
            ctx.save();
            ctx.translate(-slideX, 0);
            for (let i = 0; i < lines.length; i++) {
                const y = (canvas.height - totalHeight) / 2 + i * lineHeight;
                applyEffect(ctx, layer, lines[i], startX, y);
            }
            ctx.restore();
        } else if (anim === 'slideRight') {
            const slideX = (1 - t) * (canvas.width + 100);
            ctx.save();
            ctx.translate(slideX, 0);
            for (let i = 0; i < lines.length; i++) {
                const y = (canvas.height - totalHeight) / 2 + i * lineHeight;
                applyEffect(ctx, layer, lines[i], startX, y);
            }
            ctx.restore();
        } else if (anim === 'wave') {
            const savedAlign = layer.align;
            for (let i = 0; i < lines.length; i++) {
                const y = (canvas.height - totalHeight) / 2 + i * lineHeight;
                const chars = lines[i].split('');
                let cx = startX;

                if (layer.align === 'center') {
                    cx = startX - ctx.measureText(lines[i]).width / 2;
                    ctx.textAlign = 'left';
                } else if (layer.align === 'right') {
                    cx = startX - ctx.measureText(lines[i]).width;
                    ctx.textAlign = 'left';
                }

                for (let ci = 0; ci < chars.length; ci++) {
                    const waveOffset = Math.sin((t * Math.PI * 4) + ci * 0.3) * 10;
                    applyEffect(ctx, layer, chars[ci], cx, y + waveOffset);
                    cx += ctx.measureText(chars[ci]).width;
                }

                ctx.textAlign = savedAlign;
            }
        } else if (anim === 'scrollUp') {
            const scrollY = (canvas.height + 50) - t * (canvas.height + totalHeight + 100);
            for (let i = 0; i < lines.length; i++) {
                const y = scrollY + i * lineHeight;
                if (y < -lineHeight || y > canvas.height + lineHeight) continue;
                applyEffect(ctx, layer, lines[i], startX, y);
            }
        } else if (anim === 'scrollDown') {
            const scrollY = (-totalHeight - 50) + t * (canvas.height + totalHeight + 100);
            for (let i = 0; i < lines.length; i++) {
                const y = scrollY + i * lineHeight;
                if (y < -lineHeight || y > canvas.height + lineHeight) continue;
                applyEffect(ctx, layer, lines[i], startX, y);
            }
        } else {
            for (let i = 0; i < lines.length; i++) {
                const y = (canvas.height - totalHeight) / 2 + i * lineHeight;
                applyEffect(ctx, layer, lines[i], startX, y);
            }
        }

        ctx.restore();
    }

    // Cache do último frame de vídeo válido para evitar flickering quando readyState cai
    // temporariamente durante buffering/seek no mobile.
    var _lastVideoFrame = null;
    var _lastVideoFrameCtx = null;
    var _lastVideoFrameSrc = '';

    function render(ctx, canvas, state, videoBg, imageBg, easings) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        try {
            if (state.mediaType === 'video' && videoBg.src) {
                if (videoBg.readyState >= 2) {
                    ctx.drawImage(videoBg, 0, 0, canvas.width, canvas.height);
                    // Atualiza o cache do frame para usar como fallback quando readyState cair
                    if (_lastVideoFrameSrc !== videoBg.src || !_lastVideoFrame ||
                            _lastVideoFrame.width !== canvas.width || _lastVideoFrame.height !== canvas.height) {
                        _lastVideoFrame = document.createElement('canvas');
                        _lastVideoFrame.width = canvas.width;
                        _lastVideoFrame.height = canvas.height;
                        _lastVideoFrameCtx = _lastVideoFrame.getContext('2d');
                        _lastVideoFrameSrc = videoBg.src;
                    }
                    _lastVideoFrameCtx.drawImage(videoBg, 0, 0, canvas.width, canvas.height);
                } else if (_lastVideoFrame && _lastVideoFrameSrc === videoBg.src &&
                           _lastVideoFrame.width === canvas.width && _lastVideoFrame.height === canvas.height) {
                    // Usa o frame em cache enquanto o vídeo está bufferizando (evita flickering)
                    ctx.drawImage(_lastVideoFrame, 0, 0, canvas.width, canvas.height);
                } else if (!state.bgTransparent) {
                    ctx.fillStyle = state.bgColor;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            } else if (state.mediaType === 'image' && imageBg.src && imageBg.complete) {
                ctx.drawImage(imageBg, 0, 0, canvas.width, canvas.height);
            } else if (!state.bgTransparent) {
                ctx.fillStyle = state.bgColor;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            // Libera memória do fallback caso não estejamos mais usando vídeo
            if (state.mediaType !== 'video' || !videoBg.src) {
                if (_lastVideoFrame) {
                    _lastVideoFrame.width = 0;
                    _lastVideoFrame.height = 0;
                    _lastVideoFrame = null;
                    _lastVideoFrameCtx = null;
                    _lastVideoFrameSrc = '';
                }
            }
        } catch (e) {
            // ignore transient media decode errors while loading
        }

        for (let i = 0; i < state.layers.length; i++) {
            renderLayer(ctx, canvas, state, state.layers[i], easings);
        }
    }

    window.TextFlowRender = {
        getFont,
        wrapText,
        getTextHeight,
        getTotalTextHeight,
        render
    };
})();
