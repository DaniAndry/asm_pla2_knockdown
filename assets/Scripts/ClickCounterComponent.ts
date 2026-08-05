import { _decorator, Component, Node, input, Input, EventTouch, EventMouse, sys, log } from 'cc';
import { NodeHTML } from './NodeHTML';
const { ccclass, property } = _decorator;

@ccclass('ClickCounter')
export class ClickCounter extends Component {
    @property(Node)
    sceneNode: Node | null = null;

    @property
    requiredClicks = 3;

    private _currentClicks = 0;
    private _hasTriggered = false;
    private _clickRegisteredThisFrame = false;

    onLoad() {
        log(`[ClickCounter] Цель: ${this.requiredClicks} кликов`);
    }

    onEnable() {
        if (sys.isMobile) {
            input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        } else {
            input.on(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
        }
    }

    onDisable() {
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouseDown, this);
    }

    private onTouchStart(e: EventTouch) {
        this.registerClick();
    }

    private onMouseDown(e: EventMouse) {
        if (e.getButton() === EventMouse.BUTTON_LEFT) {
            this.registerClick();
        }
    }

    private registerClick() {
        if (this._hasTriggered || this._clickRegisteredThisFrame) return;
        this._clickRegisteredThisFrame = true;
        this.scheduleOnce(() => (this._clickRegisteredThisFrame = false), 0);

        this._currentClicks++;
        log(`[ClickCounter] Клик: ${this._currentClicks}/${this.requiredClicks}`);

        if (this._currentClicks >= this.requiredClicks) {
            this.callDownloadAction();
        }
    }

    private callDownloadAction() {
        if (!this.sceneNode) {
            log('[ClickCounter] ОШИБКА: sceneNode не назначен');
            return;
        }
        const sceneComponent = this.sceneNode.getComponent(NodeHTML);
        if (sceneComponent && typeof (sceneComponent as any).on_click_download === 'function') {
            log('[ClickCounter] Цель достигнута — вызываю on_click_download()');
            (sceneComponent as any).on_click_download();
        } else {
            log('[ClickCounter] ОШИБКА: Компонент "scene" или его метод on_click_download() не найден');
        }
    }

    public resetCounter() {
        this._currentClicks = 0;
        this._hasTriggered = false;
    }
}
