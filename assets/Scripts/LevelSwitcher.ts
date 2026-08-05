import { _decorator, Component, Node, Sprite, math, Animation, Label, AudioClip, AudioSource } from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';

const { ccclass, property } = _decorator;

@ccclass('LevelSwitcher')
export class LevelSwitcher extends Component {
    @property([Node])
    levels: Node[] = [];

    @property(Sprite)
    progressBarSprite: Sprite = null;

    @property(Node)
    finishScreenNode: Node = null;

    @property(Node)
    tutorialNode: Node = null;

    @property(Node)
    titleAnimation: Node = null;

    @property(Label)
    titleLabel: Label = null;

    @property
    level2Title: string = "Level 2";

    @property
    level3Title: string = "Level 3";

    @property(AudioClip)
    levelChangeSound: AudioClip = null;

    @property(AudioSource)
    audioSource: AudioSource = null;

    @property(Animation)
    animation: Animation = null;

    private currentLevelIndex: number = 0;
    private isFinished: boolean = false;

    private readonly PROGRESS_INCREMENT_PER_LEVEL: number = 0.3;
    private readonly MAX_PROGRESS_FILL: number = 0.9;

    onLoad() {
        if (this.finishScreenNode) this.finishScreenNode.active = false;

        if (this.levels.length === 0) {
            this.isFinished = true;
            this.showFinishScreen();
            return;
        }

        if (this.progressBarSprite) this.progressBarSprite.fillRange = 0;

        this.activateLevel(0);

        this.node.scene.on('request-next-level', this.switchToNextLevel, this);
        this.node.scene.on('projectile-launched', this.onProjectileLaunched, this);
        // ❌ Убрали подписку на 'projectiles-finished' — теперь этим управляет только LevelManager
    }

    onDestroy() {
        this.node.scene.off('request-next-level', this.switchToNextLevel, this);
        this.node.scene.off('projectile-launched', this.onProjectileLaunched, this);
    }

    /** 🔹 Переход на следующий уровень (с задержкой 2 сек) */
    public switchToNextLevel(isAfterAutoLaunch: boolean = false) {
        const nextIndex = this.currentLevelIndex + 1;


        this.scheduleOnce(() => {
            if (nextIndex < this.levels.length) {
                this.activateLevel(nextIndex, isAfterAutoLaunch);
            } else {
                this.isFinished = true;
                if (this.currentLevelIndex === 2 && this.progressBarSprite) {
                    const currentProgress = this.currentLevelIndex * this.PROGRESS_INCREMENT_PER_LEVEL;
                    this.animateProgressBar(currentProgress, this.MAX_PROGRESS_FILL, 0.5, () => {
                        this.showFinishScreen();
                        if (!isAfterAutoLaunch) this.playLevelChangeSound();
                    });
                } else {
                    this.showFinishScreen();
                }
            }
        }, 0.5);
    }

    /** 🔹 Активация уровня */
    activateLevel(index: number, isAfterAutoLaunch: boolean = false) {

        this.levels.forEach((level, i) => {
            if (level && level.isValid) level.active = i === index;
        });

        this.currentLevelIndex = index;
        this.updateProgressBar();

        this.playLevelTitleAnimation(isAfterAutoLaunch);

        if (this.node.scene) {
            this.node.scene.emit('level-switched', { level: index + 1 });
        }

        const activeLevel = this.levels[index];
        if (activeLevel && activeLevel.isValid) {
            const levelManager = activeLevel.getComponent('LevelManager');
            if (levelManager && (levelManager as any).startLevel) {
                (levelManager as any).startLevel();
            }
        }
    }

    private updateProgressBar() {
        const currentProgress = this.currentLevelIndex * this.PROGRESS_INCREMENT_PER_LEVEL;
        if (this.progressBarSprite) {
            this.progressBarSprite.fillRange = math.clamp(currentProgress, 0, this.MAX_PROGRESS_FILL);
        }
    }

    private showFinishScreen() {
        this.levels.forEach(l => { if (l && l.isValid) l.active = false; });
        if (this.tutorialNode) this.tutorialNode.active = false;
        if (this.finishScreenNode) this.finishScreenNode.active = true;
        this.animation.play('NodeOff');
        this.scheduleOnce(() => {
            this.animation.node.active = false;
        }, 0.2);
        if (this.progressBarSprite) this.progressBarSprite.fillRange = this.MAX_PROGRESS_FILL;
    }

    private animateProgressBar(startValue: number, endValue: number, duration: number, onComplete?: Function) {
        if (!this.progressBarSprite) {
            if (onComplete) onComplete();
            return;
        }
        this.progressBarSprite.fillRange = endValue;
        if (onComplete) this.scheduleOnce(() => onComplete(), duration);
    }

    private playLevelTitleAnimation(isAfterAutoLaunch: boolean = false) {
        if (this.currentLevelIndex === 0) return;
        let title = this.currentLevelIndex === 1 ? this.level2Title : this.level3Title;
        if (!isAfterAutoLaunch) this.playLevelChangeSound();
        if (this.titleAnimation && this.titleLabel) {
            this.titleLabel.string = title;
            this.titleAnimation.active = true;
            const anim = this.titleAnimation.getComponent(Animation);
            if (anim) { anim.stop(); anim.play(); }
        }
    }

    private playLevelChangeSound() {
        if (this.levelChangeSound && this.audioSource) {
            this.audioSource.clip = this.levelChangeSound;
            this.audioSource.play();
        }
    }

    private onProjectileLaunched() {

    }
}