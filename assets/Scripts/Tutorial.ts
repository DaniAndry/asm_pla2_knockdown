import {
    _decorator,
    Camera,
    Component,
    isValid,
    tween,
    Tween,
    UIOpacity,
    Vec3,
    screen,
    director,
} from 'cc';
import { LevelManager } from './LevelManager';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';

const { ccclass, property } = _decorator;

@ccclass('Tutorial')
export class Tutorial extends Component {
    @property({ tooltip: 'Бездействие перед повторным показом (сек)' })
    idleDelay: number = 3;

    @property({ tooltip: 'Длительность появления' })
    appearDuration: number = 0.25;

    @property({ tooltip: 'Длительность «нажатия» (scale + rotate)' })
    pressDuration: number = 0.45;

    @property({ tooltip: 'Длительность растворения' })
    fadeOutDuration: number = 0.3;

    @property({ tooltip: 'Пауза в конце цикла перед повтором' })
    loopPause: number = 0.15;

    @property({ tooltip: 'Стартовый множитель scale' })
    startScaleMul: number = 1.2;

    @property({ tooltip: 'Конечный множитель scale (уменьшение)' })
    endScaleMul: number = 0.85;

    @property({ tooltip: 'Поворот по Z во время жеста (градусы)' })
    pressAngleZ: number = 40;

    @property({ tooltip: 'Смещение руки относительно точки попадания (UI)' })
    pointerOffset: Vec3 = new Vec3(40, -50, 0);

    @property({ type: Camera, tooltip: 'Игровая камера (если пусто — берём с LevelManager)' })
    gameCamera: Camera = null;

    @property({ tooltip: 'Множитель размера руки в ландшафте (горизонт)' })
    landscapeScaleMul: number = 0.5;

    private opacity: UIOpacity | null = null;
    private editorScale = new Vec3(1, 1, 1);
    private baseScale = new Vec3(1, 1, 1);
    private baseEulerZ = 0;

    private isBlocked = false;
    private isShowing = false;
    private consumed = false;
    private loopToken = 0;

    private readonly _world = new Vec3();
    private readonly _screen = new Vec3();
    private readonly _uiPos = new Vec3();

    onLoad() {
        this.opacity = this.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
        this.editorScale.set(this.node.scale);
        this.refreshBaseScale();
        this.baseEulerZ = this.node.eulerAngles.z;
        this.hideImmediate();
    }

    start() {
        const scene = this.node.scene ?? director.getScene();
        if (scene) scene.on('projectile-fired', this.onFirstShot, this);
    }

    onDestroy() {
        const scene = this.node.scene ?? director.getScene();
        if (scene) scene.off('projectile-fired', this.onFirstShot, this);
        this.stopAnim();
        this.unschedule(this.showHint);
    }


    public onLevelReady() {
        if (this.isBlocked || this.consumed) return;
        this.unschedule(this.showHint);
        this.showHint();
    }


    public setBlocked(blocked: boolean) {
        this.isBlocked = blocked;
        this.unschedule(this.showHint);
        if (blocked) {
            this.hideImmediate();
        }
    }

    private onFirstShot = () => {
        this.consumed = true;
        this.unschedule(this.showHint);
        this.hideImmediate();
    };

    private showHint = () => {
        if (this.isBlocked || this.consumed) return;
        if (!this.placeOverTarget()) {
            this.scheduleOnce(this.showHint, 0.5);
            return;
        }

        this.isShowing = true;
        if (!this.node.active) this.node.active = true;
        this.playLoop();
    };

    private hideImmediate() {
        this.stopAnim();
        this.isShowing = false;
        this.refreshBaseScale();
        if (this.opacity) this.opacity.opacity = 0;
        this.node.setScale(this.baseScale);
        this.node.setRotationFromEuler(0, 0, this.baseEulerZ);

        this.node.setPosition(9999, 9999, 0);
    }

    private stopAnim() {
        this.loopToken++;
        Tween.stopAllByTarget(this.node);
        if (this.opacity) Tween.stopAllByTarget(this.opacity);
    }

    private playLoop() {
        this.stopAnim();
        if (!this.isShowing || this.isBlocked || this.consumed || !this.opacity) return;

        this.refreshBaseScale();

        const token = this.loopToken;
        const startScale = new Vec3(
            this.baseScale.x * this.startScaleMul,
            this.baseScale.y * this.startScaleMul,
            this.baseScale.z * this.startScaleMul,
        );
        const endScale = new Vec3(
            this.baseScale.x * this.endScaleMul,
            this.baseScale.y * this.endScaleMul,
            this.baseScale.z * this.endScaleMul,
        );
        const endEuler = new Vec3(0, 0, this.baseEulerZ + this.pressAngleZ);

        this.node.setScale(startScale);
        this.node.setRotationFromEuler(0, 0, this.baseEulerZ);
        this.opacity.opacity = 0;

        tween(this.opacity)
            .to(this.appearDuration, { opacity: 255 })
            .call(() => {
                if (token !== this.loopToken) return;
                tween(this.node)
                    .to(this.pressDuration, {
                        scale: endScale,
                        eulerAngles: endEuler,
                    }, { easing: 'sineOut' })
                    .call(() => {
                        if (token !== this.loopToken || !this.opacity) return;
                        tween(this.opacity)
                            .to(this.fadeOutDuration, { opacity: 0 })
                            .delay(this.loopPause)
                            .call(() => {
                                if (token !== this.loopToken || !this.isShowing || this.isBlocked || this.consumed) return;
                                this.placeOverTarget();
                                this.playLoop();
                            })
                            .start();
                    })
                    .start();
            })
            .start();
    }

    private placeOverTarget(): boolean {
        const target = this.findHintTarget();
        if (!target || !isValid(target.node)) return false;

        const cam = this.gameCamera || this.findGameCamera();
        if (!cam) return false;

        const parent = this.node.parent;
        if (!isValid(parent)) return false;

        this._world.set(target.node.worldPosition);
        cam.convertToUINode(this._world, parent, this._uiPos);
        this._uiPos.x += this.pointerOffset.x;
        this._uiPos.y += this.pointerOffset.y;
        this.node.setPosition(this._uiPos);
        return true;
    }

    private findHintTarget(): UniversalCollisionHandler | null {
        const level = this.getActiveLevelManager();
        if (!level) return null;

        const alive = level.getAliveDestructibles();
        if (alive.length === 0) return null;

        const cam = this.gameCamera || this.findGameCamera();
        if (!cam) return alive[0];

        const cx = screen.windowSize.width * 0.5;
        const cy = screen.windowSize.height * 0.55;
        let best: UniversalCollisionHandler | null = null;
        let bestDist = Number.POSITIVE_INFINITY;

        for (const handler of alive) {
            if (!isValid(handler?.node)) continue;
            cam.worldToScreen(handler.node.worldPosition, this._screen);
            if (this._screen.z < 0) continue;
            const dx = this._screen.x - cx;
            const dy = this._screen.y - cy;
            const d = dx * dx + dy * dy;
            if (d < bestDist) {
                bestDist = d;
                best = handler;
            }
        }

        return best || alive[Math.floor(alive.length / 2)];
    }

    private getActiveLevelManager(): LevelManager | null {
        const scene = director.getScene();
        if (!scene) return null;

        const managers = scene.getComponentsInChildren(LevelManager);
        for (const lm of managers) {
            if (isValid(lm) && lm.node.activeInHierarchy) return lm;
        }
        return managers.length > 0 ? managers[0] : null;
    }

    private findGameCamera(): Camera | null {
        const level = this.getActiveLevelManager();
        if (level && isValid(level.mainCamera)) return level.mainCamera;
        return this.node.scene?.getComponentInChildren(Camera)
            ?? director.getScene()?.getComponentInChildren(Camera)
            ?? null;
    }

    private isPortrait(): boolean {
        const size = screen.windowSize;
        return size.height >= size.width;
    }

    private refreshBaseScale() {
        const mul = this.isPortrait() ? 1 : this.landscapeScaleMul;
        this.baseScale.set(
            this.editorScale.x * mul,
            this.editorScale.y * mul,
            this.editorScale.z * mul,
        );
    }
}
