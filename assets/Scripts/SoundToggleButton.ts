import { _decorator, Component, Node, Sprite, SpriteFrame, AudioSource, isValid, input, Input, EventTouch } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SoundToggleButton')
export class SoundToggleButton extends Component {
    @property({ type: Sprite })
    buttonSprite: Sprite = null;

    @property({ type: SpriteFrame })
    soundOnFrame: SpriteFrame = null;

    @property({ type: SpriteFrame })
    soundOffFrame: SpriteFrame = null;

    @property({ type: [AudioSource] })
    audioSources: AudioSource[] = [];

    private isSoundOn: boolean = true; // визуальное состояние кнопки
    private soundEnabled: boolean = false; // активирован ли звук вообще (после первого клика)

    onLoad() {
        // На старте звук физически выключен, иконка "включён"
        this.isSoundOn = true;
        this.soundEnabled = false;
        this.muteAll(true);
        this.updateSprite();

        // Подписки
        this.node.on(Node.EventType.TOUCH_START, this.onButtonClick, this);
        input.on(Input.EventType.TOUCH_START, this.onFirstClickAnywhere, this);
    }

    /** Первый клик по экрану (вне кнопки) — активирует звук */
    private onFirstClickAnywhere(event: EventTouch) {
        if (event.target === this.node) return; // если клик был по кнопке, игнорируем

        // Активируем звук
        this.soundEnabled = true;
        this.muteAll(!this.isSoundOn);
        input.off(Input.EventType.TOUCH_START, this.onFirstClickAnywhere, this);

    }

    /** Клик по кнопке */
    private onButtonClick() {
        // Переключаем визуальное состояние
        this.isSoundOn = !this.isSoundOn;
        this.updateSprite();

        // Если звук уже активирован — включаем/выключаем реальный звук
        if (this.soundEnabled) {
            this.muteAll(!this.isSoundOn);

        } else {
            // Если звук ещё не активирован — просто ждём первого клика вне кнопки
            this.muteAll(true);

        }
    }

    private muteAll(mute: boolean) {
        const targetVolume = mute ? 0 : 1;
        for (const audioSource of this.audioSources) {
            if (isValid(audioSource)) {
                audioSource.volume = targetVolume;
            }
        }
    }

    private updateSprite() {
        if (!isValid(this.buttonSprite)) return;
        this.buttonSprite.spriteFrame = this.isSoundOn ? this.soundOnFrame : this.soundOffFrame;
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this.onButtonClick, this);
        input.off(Input.EventType.TOUCH_START, this.onFirstClickAnywhere, this);
    }
}
