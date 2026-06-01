(() => {
    const easings = {
        linear: t => t,
        easeIn: t => t * t * t,
        easeOut: t => 1 - Math.pow(1 - t, 3),
        easeInOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
        elasticOut: t => {
            if (t === 0 || t === 1) return t;
            return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
        },
        bounceOut: t => {
            const n1 = 7.5625;
            const d1 = 2.75;
            if (t < 1 / d1) return n1 * t * t;
            if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
            if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
            return n1 * (t -= 2.625 / d1) * t + 0.984375;
        }
    };

    function createDefaultLayer(id) {
        return {
            id,
            text: 'Texto animado surgindo do rodapé',
            inlineStyles: [],
            fontFamily: 'Space Grotesk',
            fontSize: 48,
            textColor: '#ffffff',
            bold: false,
            italic: false,
            effect: 'none',
            effectColor: '#ff6b4a',
            effectThickness: 3,
            effectIntensity: 50,
            align: 'left',
            animationType: 'scrollUp',
            easing: 'linear',
            useGradient: false,
            gradientColor1: '#ff6b4a',
            gradientColor2: '#4a9fff',
            startDelay: 0
        };
    }

    const state = {
        layers: [createDefaultLayer(1)],
        activeLayerId: 1,
        nextLayerId: 2,
        speed: 2,
        format: '1:1',
        resolution: 720,
        bgTransparent: true,
        bgColor: '#0a0a0f',
        mediaType: null,
        mediaSource: null,
        mediaFileName: '',
        audioSource: null,
        audioSourceMode: 'imported',
        audioFileName: '',
        audioDuration: 0,
        audioTrimStart: 0,
        audioTrimEnd: 0,
        audioFadeIn: 0,
        audioFadeOut: 0,
        audioVolume: 1,
        audioBuffer: null,
        audioIsDecoding: false,
        audioLoop: true,
        exportTrimActive: false,
        exportTrimStart: 0,
        exportTrimEnd: 0,
        isExporting: false,
        isPlaying: true,
        globalTime: 0,
        lastTime: 0,
        textSelectionStart: 0,
        textSelectionEnd: 0,
        textSelectionLayerId: 1,
        animationId: null
    };

    const baseFormats = {
        '9:16': { w: 9, h: 16 },
        '1:1': { w: 1, h: 1 },
        '16:9': { w: 16, h: 9 }
    };

    const undoStack = [];
    const redoStack = [];
    let ignoreStateChange = false;

    const inlineStyleKeys = ['fontFamily', 'fontSize', 'textColor', 'bold', 'italic'];

    function ensureInlineStyles(layer) {
        if (!layer || !Array.isArray(layer.inlineStyles)) {
            layer.inlineStyles = [];
        }
        return layer.inlineStyles;
    }

    function cloneInlineStyle(style) {
        const next = {
            start: style.start,
            end: style.end
        };

        inlineStyleKeys.forEach(function(key) {
            if (style[key] !== undefined) next[key] = style[key];
        });

        return next;
    }

    function sanitizeInlineStyle(layer, style) {
        const textLength = (layer.text || '').length;
        const start = Math.max(0, Math.min(textLength, parseInt(style.start, 10) || 0));
        const end = Math.max(start, Math.min(textLength, parseInt(style.end, 10) || 0));
        const next = { start, end };

        inlineStyleKeys.forEach(function(key) {
            if (style[key] !== undefined) next[key] = style[key];
        });

        return next;
    }

    function sameInlinePatch(a, b) {
        if (!a || !b) return false;
        for (let i = 0; i < inlineStyleKeys.length; i++) {
            const key = inlineStyleKeys[i];
            if (a[key] !== b[key]) return false;
        }
        return true;
    }

    function normalizeInlineStyles(layer) {
        const sanitized = ensureInlineStyles(layer)
            .map(function(style) {
                return sanitizeInlineStyle(layer, style);
            })
            .filter(function(style) {
                if (style.end <= style.start) return false;
                return inlineStyleKeys.some(function(key) {
                    return style[key] !== undefined;
                });
            })
            .sort(function(a, b) {
                if (a.start !== b.start) return a.start - b.start;
                return a.end - b.end;
            });

        const merged = [];

        sanitized.forEach(function(style) {
            const previous = merged[merged.length - 1];
            if (previous && previous.end === style.start && sameInlinePatch(previous, style)) {
                previous.end = style.end;
                return;
            }
            merged.push(style);
        });

        layer.inlineStyles = merged;
        return layer.inlineStyles;
    }

    function getResolvedTextStyle(layer, index) {
        const resolved = {
            fontFamily: layer.fontFamily,
            fontSize: layer.fontSize,
            textColor: layer.textColor,
            bold: layer.bold,
            italic: layer.italic
        };

        ensureInlineStyles(layer).forEach(function(style) {
            if (index < style.start || index >= style.end) return;
            inlineStyleKeys.forEach(function(key) {
                if (style[key] !== undefined) {
                    resolved[key] = style[key];
                }
            });
        });

        return resolved;
    }

    function applyInlineStyle(layer, start, end, patch) {
        const rangeStart = Math.max(0, parseInt(start, 10) || 0);
        const rangeEnd = Math.max(rangeStart, parseInt(end, 10) || 0);
        const nextPatch = {
            start: rangeStart,
            end: rangeEnd
        };

        inlineStyleKeys.forEach(function(key) {
            if (patch[key] !== undefined) nextPatch[key] = patch[key];
        });

        if (nextPatch.end <= nextPatch.start) return;

        ensureInlineStyles(layer).push(nextPatch);
        normalizeInlineStyles(layer);
    }

    function clearInlineStylesInRange(layer, start, end) {
        const rangeStart = Math.max(0, parseInt(start, 10) || 0);
        const rangeEnd = Math.max(rangeStart, parseInt(end, 10) || 0);

        if (rangeEnd <= rangeStart) return;

        layer.inlineStyles = ensureInlineStyles(layer).reduce(function(nextStyles, style) {
            if (style.end <= rangeStart || style.start >= rangeEnd) {
                nextStyles.push(cloneInlineStyle(style));
                return nextStyles;
            }

            if (style.start < rangeStart) {
                const left = cloneInlineStyle(style);
                left.end = rangeStart;
                nextStyles.push(left);
            }

            if (style.end > rangeEnd) {
                const right = cloneInlineStyle(style);
                right.start = rangeEnd;
                nextStyles.push(right);
            }

            return nextStyles;
        }, []);

        normalizeInlineStyles(layer);
    }

    function getSelectionStyleState(layer, start, end) {
        const selectionStart = Math.max(0, parseInt(start, 10) || 0);
        const selectionEnd = Math.max(selectionStart, parseInt(end, 10) || 0);
        const stateForSelection = {};

        inlineStyleKeys.forEach(function(key) {
            stateForSelection[key] = { mixed: false, value: undefined };
        });

        if (selectionEnd <= selectionStart) {
            const base = getResolvedTextStyle(layer, Math.max(0, selectionStart - 1));
            inlineStyleKeys.forEach(function(key) {
                stateForSelection[key] = { mixed: false, value: base[key] };
            });
            return stateForSelection;
        }

        for (let i = selectionStart; i < selectionEnd; i++) {
            const style = getResolvedTextStyle(layer, i);
            inlineStyleKeys.forEach(function(key) {
                const current = stateForSelection[key];
                if (current.value === undefined && !current.mixed) {
                    current.value = style[key];
                    return;
                }
                if (current.value !== style[key]) {
                    current.mixed = true;
                    current.value = undefined;
                }
            });
        }

        return stateForSelection;
    }

    function syncInlineStylesWithText(layer, nextText) {
        const previousText = layer.text || '';
        const styles = ensureInlineStyles(layer);
        let prefixLength = 0;
        let oldSuffixLength = 0;
        const safeNextText = nextText || '';

        if (previousText === safeNextText) return;

        while (
            prefixLength < previousText.length &&
            prefixLength < safeNextText.length &&
            previousText.charAt(prefixLength) === safeNextText.charAt(prefixLength)
        ) {
            prefixLength++;
        }

        while (
            oldSuffixLength < previousText.length - prefixLength &&
            oldSuffixLength < safeNextText.length - prefixLength &&
            previousText.charAt(previousText.length - 1 - oldSuffixLength) === safeNextText.charAt(safeNextText.length - 1 - oldSuffixLength)
        ) {
            oldSuffixLength++;
        }

        const oldChangeEnd = previousText.length - oldSuffixLength;
        const newChangeEnd = safeNextText.length - oldSuffixLength;
        const delta = safeNextText.length - previousText.length;
        const nextStyles = [];

        styles.forEach(function(style) {
            const current = cloneInlineStyle(style);

            if (current.end <= prefixLength) {
                nextStyles.push(current);
                return;
            }

            if (current.start >= oldChangeEnd) {
                current.start += delta;
                current.end += delta;
                nextStyles.push(current);
                return;
            }

            if (current.start < prefixLength && current.end > oldChangeEnd) {
                current.end += delta;
                nextStyles.push(current);
                return;
            }

            if (current.start < prefixLength && current.end > prefixLength) {
                current.end = prefixLength;
                nextStyles.push(current);
                return;
            }

            if (current.start < oldChangeEnd && current.end > oldChangeEnd) {
                current.start = newChangeEnd;
                current.end += delta;
                nextStyles.push(current);
            }
        });

        layer.inlineStyles = nextStyles;
        layer.text = safeNextText;
        normalizeInlineStyles(layer);
    }

    function getActiveLayer() {
        return state.layers.find(layer => layer.id === state.activeLayerId) || state.layers[0];
    }

    function getCanvasDimensions() {
        const fmt = baseFormats[state.format];
        const maxDim = state.resolution;
        if (fmt.w >= fmt.h) {
            return { width: maxDim, height: Math.round((maxDim * fmt.h) / fmt.w) };
        }
        return { width: Math.round((maxDim * fmt.w) / fmt.h), height: maxDim };
    }

    function snapshot() {
        return JSON.stringify({
            layers: state.layers,
            activeLayerId: state.activeLayerId,
            nextLayerId: state.nextLayerId,
            speed: state.speed,
            format: state.format,
            resolution: state.resolution,
            bgTransparent: state.bgTransparent,
            bgColor: state.bgColor,
            audioSourceMode: state.audioSourceMode,
            audioTrimStart: state.audioTrimStart,
            audioTrimEnd: state.audioTrimEnd,
            audioFadeIn: state.audioFadeIn,
            audioFadeOut: state.audioFadeOut,
            audioVolume: state.audioVolume,
            audioLoop: state.audioLoop,
            exportTrimActive: state.exportTrimActive,
            exportTrimStart: state.exportTrimStart,
            exportTrimEnd: state.exportTrimEnd
        });
    }

    function saveUndoState() {
        if (ignoreStateChange) return;
        undoStack.push(snapshot());
        if (undoStack.length > 50) undoStack.shift();
        redoStack.length = 0;
    }

    function undo(afterApply) {
        if (undoStack.length === 0) return;
        redoStack.push(snapshot());
        const prev = JSON.parse(undoStack.pop());
        ignoreStateChange = true;
        Object.assign(state, prev);
        ignoreStateChange = false;
        if (typeof afterApply === 'function') afterApply();
    }

    function redo(afterApply) {
        if (redoStack.length === 0) return;
        undoStack.push(snapshot());
        const next = JSON.parse(redoStack.pop());
        ignoreStateChange = true;
        Object.assign(state, next);
        ignoreStateChange = false;
        if (typeof afterApply === 'function') afterApply();
    }

    function resetAnimation() {
        state.globalTime = 0;
        state.lastTime = 0;
    }

    window.TextFlowState = {
        easings,
        state,
        createDefaultLayer,
        getActiveLayer,
        getCanvasDimensions,
        normalizeInlineStyles,
        getResolvedTextStyle,
        applyInlineStyle,
        clearInlineStylesInRange,
        getSelectionStyleState,
        syncInlineStylesWithText,
        saveUndoState,
        undo,
        redo,
        resetAnimation
    };
})();
