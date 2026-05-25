(() => {
    function getFont(style) {
        const weight = style.bold ? 'bold' : 'normal';
        const fontStyle = style.italic ? 'italic' : 'normal';
        return fontStyle + ' ' + weight + ' ' + style.fontSize + 'px "' + style.fontFamily + '", sans-serif';
    }

    function getResolvedStyle(layer, index) {
        if (window.TextFlowState && typeof window.TextFlowState.getResolvedTextStyle === 'function') {
            return window.TextFlowState.getResolvedTextStyle(layer, index);
        }
        return {
            fontFamily: layer.fontFamily,
            fontSize: layer.fontSize,
            textColor: layer.textColor,
            bold: layer.bold,
            italic: layer.italic
        };
    }

    function sameStyle(a, b) {
        return !!a && !!b &&
            a.fontFamily === b.fontFamily &&
            a.fontSize === b.fontSize &&
            a.textColor === b.textColor &&
            a.bold === b.bold &&
            a.italic === b.italic;
    }

    function isInlineWhitespace(char) {
        return char !== '\n' && /\s/.test(char);
    }

    function measureTextWithStyle(ctx, text, style) {
        ctx.font = getFont(style);
        return ctx.measureText(text).width;
    }

    function buildStyledTokens(layer, text) {
        const safeText = text || '';
        const tokens = [];
        let index = 0;

        while (index < safeText.length) {
            const currentChar = safeText.charAt(index);
            if (currentChar === '\n') {
                tokens.push({ type: 'newline' });
                index++;
                continue;
            }

            const style = getResolvedStyle(layer, index);
            const whitespace = isInlineWhitespace(currentChar);
            let value = currentChar;
            index++;

            while (index < safeText.length) {
                const nextChar = safeText.charAt(index);
                if (nextChar === '\n') break;
                if (isInlineWhitespace(nextChar) !== whitespace) break;
                if (!sameStyle(style, getResolvedStyle(layer, index))) break;
                value += nextChar;
                index++;
            }

            tokens.push({
                type: whitespace ? 'space' : 'text',
                text: value,
                style: style
            });
        }

        return tokens;
    }

    function createEmptyLine() {
        return {
            fragments: [],
            width: 0,
            height: 0,
            maxFontSize: 0
        };
    }

    function appendFragment(line, fragment, width) {
        const last = line.fragments[line.fragments.length - 1];
        const resolvedWidth = width !== undefined ? width : fragment.width;

        if (last && sameStyle(last.style, fragment.style)) {
            last.text += fragment.text;
            last.width += resolvedWidth;
        } else {
            line.fragments.push({
                text: fragment.text,
                style: fragment.style,
                width: resolvedWidth
            });
        }

        line.width += resolvedWidth;
        line.maxFontSize = Math.max(line.maxFontSize, fragment.style.fontSize);
        line.height = Math.max(1, line.maxFontSize * 1.3);
    }

    function splitStyledTextToken(ctx, token, maxWidth) {
        let value = '';
        let width = 0;
        let position = 0;

        while (position < token.text.length) {
            const candidate = value + token.text.charAt(position);
            const candidateWidth = measureTextWithStyle(ctx, candidate, token.style);
            if (candidateWidth > maxWidth && value) break;
            value = candidate;
            width = candidateWidth;
            position++;
            if (candidateWidth > maxWidth) break;
        }

        if (!value) {
            value = token.text.charAt(0);
            width = measureTextWithStyle(ctx, value, token.style);
            position = 1;
        }

        return [
            { type: 'text', text: value, style: token.style, width: width },
            position < token.text.length ? { type: 'text', text: token.text.slice(position), style: token.style } : null
        ];
    }

    function layoutStyledText(ctx, layer, maxWidth, textOverride) {
        const tokens = buildStyledTokens(layer, textOverride !== undefined ? textOverride : layer.text);
        const lines = [];
        let currentLine = createEmptyLine();

        function commitLine(forceEmpty) {
            if (!currentLine.fragments.length && !forceEmpty && lines.length) return;
            if (!currentLine.fragments.length) {
                currentLine.height = Math.max(1, layer.fontSize * 1.3);
            }
            lines.push(currentLine);
            currentLine = createEmptyLine();
        }

        tokens.forEach(function(token) {
            if (token.type === 'newline') {
                commitLine(true);
                return;
            }

            let pending = token;
            while (pending) {
                if (pending.type === 'space' && currentLine.fragments.length === 0) {
                    pending = null;
                    continue;
                }

                const availableWidth = currentLine.fragments.length === 0 ? maxWidth : Math.max(0, maxWidth - currentLine.width);
                const pendingWidth = pending.width !== undefined ? pending.width : measureTextWithStyle(ctx, pending.text, pending.style);

                if (pendingWidth <= availableWidth || currentLine.fragments.length === 0 && pendingWidth <= maxWidth) {
                    appendFragment(currentLine, pending, pendingWidth);
                    pending = null;
                    continue;
                }

                if (pending.type === 'space') {
                    commitLine(false);
                    pending = null;
                    continue;
                }

                if (currentLine.fragments.length > 0) {
                    commitLine(false);
                    continue;
                }

                const parts = splitStyledTextToken(ctx, pending, Math.max(1, maxWidth));
                appendFragment(currentLine, parts[0], parts[0].width);
                commitLine(false);
                pending = parts[1];
            }
        });

        if (!lines.length || currentLine.fragments.length) {
            if (!currentLine.fragments.length) {
                currentLine.height = Math.max(1, layer.fontSize * 1.3);
            }
            lines.push(currentLine);
        }

        const totalHeight = lines.reduce(function(sum, line) {
            return sum + (line.height || Math.max(1, layer.fontSize * 1.3));
        }, 0);

        return {
            lines: lines,
            totalHeight: totalHeight
        };
    }

    function wrapText(ctx, text, maxWidth, layer) {
        return layoutStyledText(ctx, layer, maxWidth, text).lines.map(function(line) {
            return line.fragments.map(function(fragment) {
                return fragment.text;
            }).join('');
        });
    }

    function getTextHeight(ctx, canvas, layer) {
        return layoutStyledText(ctx, layer, canvas.width - 40).totalHeight;
    }

    function getTotalTextHeight(ctx, canvas, layers) {
        let total = 0;
        for (let i = 0; i < layers.length; i++) {
            total = Math.max(total, getTextHeight(ctx, canvas, layers[i]));
        }
        return total;
    }


    function applyEffect(ctx, layer, text, x, y, textStyle) {
        ctx.save();

        const style = textStyle || {
            fontFamily: layer.fontFamily,
            fontSize: layer.fontSize,
            textColor: layer.textColor,
            bold: layer.bold,
            italic: layer.italic
        };
        const color = style.textColor;
        const effectColor = layer.effectColor;
        const thickness = Math.max(1, layer.effectThickness);
        const intensity = layer.effectIntensity / 100;

        ctx.font = getFont(style);
        ctx.textAlign = 'left';

        let fillStyle = color;
        if (layer.useGradient) {
            // Calculate gradient bounds based on real text width and alignment
            const textWidth = ctx.measureText(text).width;
            const grad = ctx.createLinearGradient(x, y, x + textWidth, y + style.fontSize);
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

    function cloneLayerWithText(layer, visibleText) {
        const textLength = (visibleText || '').length;
        return Object.assign({}, layer, {
            text: visibleText,
            inlineStyles: (layer.inlineStyles || []).reduce(function(acc, style) {
                if (style.start >= textLength || style.end <= 0) return acc;
                const nextStyle = Object.assign({}, style, {
                    start: Math.max(0, Math.min(textLength, style.start)),
                    end: Math.max(0, Math.min(textLength, style.end))
                });
                if (nextStyle.end > nextStyle.start) acc.push(nextStyle);
                return acc;
            }, [])
        });
    }

    function getLineStartX(layer, anchorX, lineWidth) {
        if (layer.align === 'center') return anchorX - lineWidth / 2;
        if (layer.align === 'right') return anchorX - lineWidth;
        return anchorX;
    }

    function drawLayout(ctx, layer, layout, anchorX, startY, yOffset, wavePhase) {
        let currentY = startY + (yOffset || 0);

        layout.lines.forEach(function(line) {
            const lineStartX = getLineStartX(layer, anchorX, line.width);
            let currentX = lineStartX;
            let charIndex = 0;

            line.fragments.forEach(function(fragment) {
                if (wavePhase === undefined) {
                    applyEffect(ctx, layer, fragment.text, currentX, currentY, fragment.style);
                    currentX += fragment.width;
                    return;
                }

                for (let i = 0; i < fragment.text.length; i++) {
                    const char = fragment.text.charAt(i);
                    const charWidth = measureTextWithStyle(ctx, char, fragment.style);
                    const waveOffset = Math.sin(wavePhase + charIndex * 0.3) * 10;
                    applyEffect(ctx, layer, char, currentX, currentY + waveOffset, fragment.style);
                    currentX += charWidth;
                    charIndex++;
                }
            });

            currentY += line.height;
        });
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

        const layout = layoutStyledText(ctx, layer, canvas.width - 40);
        const totalHeight = layout.totalHeight;

        ctx.save();
        ctx.font = getFont(layer);
        ctx.textBaseline = 'top';
        let startX = 20;
        if (layer.align === 'center') startX = canvas.width / 2;
        if (layer.align === 'right') startX = canvas.width - 20;
        const baseY = (canvas.height - totalHeight) / 2;

        if (anim === 'fadeIn') {
            ctx.globalAlpha = t;
            drawLayout(ctx, layer, layout, startX, baseY);
            ctx.globalAlpha = 1;
        } else if (anim === 'typewriter') {
            const fullText = layer.text;
            const charsToShow = Math.floor(t * fullText.length);
            const visibleText = fullText.substring(0, charsToShow);
            const visibleLayer = cloneLayerWithText(layer, visibleText);
            const visibleLayout = layoutStyledText(ctx, visibleLayer, canvas.width - 40);

            drawLayout(ctx, visibleLayer, visibleLayout, startX, baseY);

            if (charsToShow < fullText.length) {
                const lastLine = visibleLayout.lines[visibleLayout.lines.length - 1] || { fragments: [], width: 0, height: layer.fontSize * 1.3 };
                const cursorStyle = charsToShow > 0 ? getResolvedStyle(layer, charsToShow - 1) : getResolvedStyle(layer, 0);
                let lastY = baseY;

                for (let i = 0; i < visibleLayout.lines.length - 1; i++) {
                    lastY += visibleLayout.lines[i].height;
                }

                ctx.fillStyle = cursorStyle.textColor;
                const blink = Math.sin(Date.now() / 200) > 0;
                if (blink) {
                    ctx.fillRect(getLineStartX(layer, startX, lastLine.width) + lastLine.width + 2, lastY, 2, cursorStyle.fontSize);
                }
            }
        } else if (anim === 'zoomIn') {
            const scale = t;
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(scale, scale);
            ctx.globalAlpha = t;
            drawLayout(
                ctx,
                layer,
                layout,
                layer.align === 'center' ? 0 : layer.align === 'right' ? canvas.width / 2 - 20 : -canvas.width / 2 + 20,
                -totalHeight / 2
            );
            ctx.restore();
        } else if (anim === 'bounce') {
            const bounceY = (canvas.height - totalHeight) / 2 - (1 - t) * canvas.height * 0.5;
            drawLayout(ctx, layer, layout, startX, bounceY);
        } else if (anim === 'slideLeft') {
            const slideX = (1 - t) * (canvas.width + 100);
            ctx.save();
            ctx.translate(-slideX, 0);
            drawLayout(ctx, layer, layout, startX, baseY);
            ctx.restore();
        } else if (anim === 'slideRight') {
            const slideX = (1 - t) * (canvas.width + 100);
            ctx.save();
            ctx.translate(slideX, 0);
            drawLayout(ctx, layer, layout, startX, baseY);
            ctx.restore();
        } else if (anim === 'wave') {
            drawLayout(ctx, layer, layout, startX, baseY, 0, t * Math.PI * 4);
        } else if (anim === 'scrollUp') {
            const scrollY = (canvas.height + 50) - t * (canvas.height + totalHeight + 100);
            drawLayout(ctx, layer, layout, startX, scrollY);
        } else if (anim === 'scrollDown') {
            const scrollY = (-totalHeight - 50) + t * (canvas.height + totalHeight + 100);
            drawLayout(ctx, layer, layout, startX, scrollY);
        } else {
            drawLayout(ctx, layer, layout, startX, baseY);
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
