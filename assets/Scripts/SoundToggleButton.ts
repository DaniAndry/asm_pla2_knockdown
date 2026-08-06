import { _decorator, Component, Node, Sprite, SpriteFrame, isValid, input, Input } from 'cc';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

@ccclass('SoundToggleButton')
export class SoundToggleButton extends Component {
    @property({ type: Sprite })
    buttonSprite: Sprite = null;

    @property({ type: SpriteFrame })
    soundOnFrame: SpriteFrame = null;

    @property({ type: SpriteFrame })
    soundOffFrame: SpriteFrame = null;

    /** Визуальное состояние кнопки (вкл/выкл) */
    private isSoundOn: boolean = true;

    onLoad() {
        this.isSoundOn = true;
        this.updateSprite();

        // Только синхронизация UI при ручном mute/unmute — не при init
        SoundManager.toggleSoundButtonCB = (muted: boolean) => {
            this.isSoundOn = !muted;
            this.updateSprite();
        };

        this.node.on(Node.EventType.TOUCH_START, this.onButtonClick, this);
        input.on(Input.EventType.TOUCH_START, this.onFirstClickAnywhere, this);
    }

    private onFirstClickAnywhere() {
        if (SoundManager.firstTouch) {
            input.off(Input.EventType.TOUCH_START, this.onFirstClickAnywhere, this);
            return;
        }

        SoundManager.markFirstTouch();
        input.off(Input.EventType.TOUCH_START, this.onFirstClickAnywhere, this);

        if (this.isSoundOn) SoundManager.unmuteAll();
        else SoundManager.muteAll();
    }

    private onButtonClick() {
        if (!SoundManager.firstTouch) {
            SoundManager.markFirstTouch();
            input.off(Input.EventType.TOUCH_START, this.onFirstClickAnywhere, this);
        }

        this.isSoundOn = !this.isSoundOn;
        this.updateSprite();

        if (this.isSoundOn) SoundManager.unmuteAll();
        else SoundManager.muteAll();
    }

    private updateSprite() {
        if (!isValid(this.buttonSprite)) return;
        this.buttonSprite.spriteFrame = this.isSoundOn ? this.soundOnFrame : this.soundOffFrame;
    }

    onDestroy() {
        this.node.off(Node.EventType.TOUCH_START, this.onButtonClick, this);
        input.off(Input.EventType.TOUCH_START, this.onFirstClickAnywhere, this);
        if (SoundManager.toggleSoundButtonCB) {
            SoundManager.toggleSoundButtonCB = null;
        }
    }
}
