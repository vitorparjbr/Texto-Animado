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
        audioSource: null,
        audioFileName: '',
        audioDuration: 0,
        audioTrimStart: 0,
        audioTrimEnd: 0,
        audioFadeIn: 0,
        audioFadeOut: 0,
        audioVolume: 1,
        audioBuffer: null,
        isPlaying: true,
        globalTime: 0,
        lastTime: 0,
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
            audioTrimStart: state.audioTrimStart,
            audioTrimEnd: state.audioTrimEnd,
            audioFadeIn: state.audioFadeIn,
            audioFadeOut: state.audioFadeOut,
            audioVolume: state.audioVolume
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
        saveUndoState,
        undo,
        redo,
        resetAnimation
    };
})();
