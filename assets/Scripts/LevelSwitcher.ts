import {
    _decorator,
    Component,
    Node,
    Sprite,
    math,
    Animation,
    Label,
    director,
    isValid,
} from 'cc';
import { LevelManager } from './LevelManager';
import { SoundManager } from './SoundManager';
import { NodeHTML } from './NodeHTML';
import { Tutorial } from './Tutorial';

const { ccclass, property } = _decorator;

@ccclass('LevelSwitcher')
export class LevelSwitcher extends Component {
    @property([Node])
    levels: Node[] = [];

    @property(Sprite)
    progressBarSprite: Sprite = null;

    @property({ type: Node, tooltip: 'Экран победы после всех уровней' })
    finishScreenNode: Node = null;

    @property({ type: Node, tooltip: 'Экран поражения (снаряды кончились, объекты остались)' })
    loseScreenNode: Node = null;

    @property({ type: Node, tooltip: 'Кнопка Try Again на LoseScreen (опционально, можно повесить Click Event)' })
    tryAgainButton: Node = null;

    @property({ type: NodeHTML, tooltip: 'NodeHTML для CTA со 2-го TryAgain' })
    nodeHTML: NodeHTML = null;

    @property(Node)
    tutorialNode: Node = null;

    @property(Node)
    titleAnimation: Node = null;

    @property(Label)
    titleLabel: Label = null;

    @property
    level2Title: string = 'Level 2';

    @property
    level3Title: string = 'Level 3';

    @property(Animation)
    animation: Animation = null;

    @property({ tooltip: 'Звук смены / старта уровня в SoundManager' })
    levelChangeSoundName: string = 'levelAppear01';

    @property({ tooltip: 'Звук поражения в SoundManager' })
    loseSoundName: string = 'loss';

    @property({ tooltip: 'Звук финиша / победы в SoundManager' })
    victorySoundName: string = 'victory';

    private currentLevelIndex: number = 0;
    private isFinished: boolean = false;
    private isSwitching: boolean = false;
    private isLoseShown: boolean = false;
    private pendingNextLevel: boolean = false;
    private tutorial: Tutorial | null = null;

    /** Сколько раз уже нажали TryAgain за сессию (переживает reload сцены) */
    private static retryCount: number = 0;
    /** Уровень, с которого нужно продолжить после reload */
    private static resumeLevelIndex: number = 0;

    private readonly PROGRESS_INCREMENT_PER_LEVEL: number = 0.3;
    private readonly MAX_PROGRESS_FILL: number = 0.9;

    private pendingNextLevel: boolean = false;

    public getCurrentLevelIndex(): number {
        return this.currentLevelIndex;
    }

    public getActiveLevelNode(): Node | null {
        const level = this.levels[this.currentLevelIndex];
        return level && level.isValid ? level : null;
    }

    onLoad() {
        if (this.finishScreenNode) this.finishScreenNode.active = false;
        if (this.loseScreenNode) this.loseScreenNode.active = false;

        this.tutorial = this.ensureTutorial();

        if (this.tryAgainButton) {
            this.tryAgainButton.on(Node.EventType.TOUCH_END, this.onTryAgainClick, this);
        }

        if (this.levels.length === 0) {
            this.isFinished = true;
            this.showFinishScreen();
            return;
        }

        if (this.progressBarSprite) this.progressBarSprite.fillRange = 0;

        const startIndex = math.clamp(LevelSwitcher.resumeLevelIndex, 0, this.levels.length - 1);
        this.activateLevel(startIndex);

        const scene = this.node.scene;
        if (scene) {
            scene.on('request-next-level', this.onRequestNextLevel, this);
            scene.on('request-lose', this.onRequestLose, this);
        }
    }

    private ensureTutorial(): Tutorial | null {
        if (!isValid(this.tutorialNode)) return null;
        let tutorial = this.tutorialNode.getComponent(Tutorial);
        if (!tutorial) {
            tutorial = this.tutorialNode.addComponent(Tutorial);
        }
        return tutorial;
    }

    onDestroy() {
        if (this.tryAgainButton) {
            this.tryAgainButton.off(Node.EventType.TOUCH_END, this.onTryAgainClick, this);
        }
        const scene = this.node.scene;
        if (scene) {
            scene.off('request-next-level', this.onRequestNextLevel, this);
            scene.off('request-lose', this.onRequestLose, this);
        }
    }

    private onRequestNextLevel() {
        // Не теряем next, если пришёл во время анимации смены уровня
        if (this.isFinished || this.isLoseShown) return;
        if (this.isSwitching) {
            this.pendingNextLevel = true;
            return;
        }
        this.switchToNextLevel();
    }

    private onRequestLose() {
        this.showLoseScreen();
    }

    /** Победа на уровне → следующий или финиш */
    public switchToNextLevel() {
        if (this.isFinished || this.isLoseShown) return;
        if (this.isSwitching) {
            this.pendingNextLevel = true;
            return;
        }
        this.isSwitching = true;
        this.pendingNextLevel = false;

        const nextIndex = this.currentLevelIndex + 1;

        this.scheduleOnce(() => {
            this.isSwitching = false;

            if (nextIndex < this.levels.length) {
                this.activateLevel(nextIndex);
            } else {
                this.isFinished = true;
                this.showFinishScreen();
            }

            // Дожимаем отложенный next (например пустой уровень успел победить)
            if (this.pendingNextLevel && !this.isFinished && !this.isLoseShown) {
                this.pendingNextLevel = false;
                this.scheduleOnce(() => {
                    const lm = this.levels[this.currentLevelIndex]?.getComponent(LevelManager);
                    if (lm && lm.isComplete()) {
                        this.switchToNextLevel();
                    }
                }, 0.2);
            }
        }, 0.5);
    }

    /** Активация уровня */
    activateLevel(index: number) {
        this.isLoseShown = false;
        if (this.loseScreenNode) this.loseScreenNode.active = false;
        if (this.finishScreenNode) this.finishScreenNode.active = false;

        this.levels.forEach((level, i) => {
            if (level && level.isValid) level.active = i === index;
        });

        this.currentLevelIndex = index;
        LevelSwitcher.resumeLevelIndex = index;
        this.updateProgressBar();
        this.playLevelTitleAnimation();
        // На самом первом уровне до клика не играем — иначе скопом звуки на старте
        if (index > 0 || SoundManager.firstTouch) {
            this.playSound(this.levelChangeSoundName);
        }

        if (this.node.scene) {
            this.node.scene.emit('level-switched', { level: index + 1 });
        }

        const activeLevel = this.levels[index];
        if (activeLevel && activeLevel.isValid) {
            const levelManager = activeLevel.getComponent(LevelManager);
            if (levelManager) {
                levelManager.startLevel();
            }
            // Пустой уровень: победа может прийти сразу — подстрахуем переход на finish
            this.scheduleOnce(() => {
                if (this.isFinished || this.isSwitching || this.isLoseShown) return;
                const lm = this.levels[this.currentLevelIndex]?.getComponent(LevelManager);
                if (lm && lm.isComplete()) {
                    this.switchToNextLevel();
                }
            }, 0.6);
        }

        if (this.tutorial) {
            this.tutorial.setBlocked(false);
            // Чуть позже settle, чтобы позиция коробок стабилизировалась
            this.scheduleOnce(() => this.tutorial?.onLevelReady(), 0.35);
        }
    }

    private showLoseScreen() {
        if (this.isFinished || this.isLoseShown) return;
        this.isLoseShown = true;

        this.tutorial?.setBlocked(true);
        this.playSound(this.loseSoundName);

        if (this.loseScreenNode) {
            this.loseScreenNode.active = true;
        } else {
            console.warn('[LevelSwitcher] loseScreenNode не назначен — сразу TryAgain логика');
        }
    }

    /**
     * Кнопка Try Again:
     * 1-й раз — перезапуск текущего уровня
     * 2-й раз — NodeHTML.OnClick() (магазин)
     */
    public onTryAgainClick() {
        if (LevelSwitcher.retryCount < 1) {
            LevelSwitcher.retryCount++;
            LevelSwitcher.resumeLevelIndex = this.currentLevelIndex;
            this.restartCurrentLevel();
            return;
        }

        this.openStoreCta();
    }

    private restartCurrentLevel() {
        const scene = director.getScene();
        if (!scene) return;
        director.loadScene(scene.name);
    }

    private openStoreCta() {
        if (isValid(this.nodeHTML)) {
            this.nodeHTML.OnClick();
            return;
        }

        // Fallback: ищем NodeHTML на сцене
        const scene = director.getScene();
        const found = scene?.getComponentInChildren(NodeHTML);
        if (found) {
            found.OnClick();
            return;
        }

        console.warn('[LevelSwitcher] NodeHTML не найден для CTA');
    }

    private showFinishScreen() {
        this.levels.forEach(l => { if (l && l.isValid) l.active = false; });
        this.tutorial?.setBlocked(true);
        if (this.tutorialNode) this.tutorialNode.active = false;
        if (this.loseScreenNode) this.loseScreenNode.active = false;

        if (this.finishScreenNode) this.finishScreenNode.active = true;

        this.playSound(this.victorySoundName);

        if (this.animation) {
            this.animation.play('NodeOff');
            this.scheduleOnce(() => {
                if (this.animation && this.animation.node) {
                    this.animation.node.active = false;
                }
            }, 0.2);
        }
        if (this.progressBarSprite) this.progressBarSprite.fillRange = this.MAX_PROGRESS_FILL;
    }

    private updateProgressBar() {
        const currentProgress = this.currentLevelIndex * this.PROGRESS_INCREMENT_PER_LEVEL;
        if (this.progressBarSprite) {
            this.progressBarSprite.fillRange = math.clamp(currentProgress, 0, this.MAX_PROGRESS_FILL);
        }
    }

    private playLevelTitleAnimation() {
        if (this.currentLevelIndex === 0) return;
        const title = this.currentLevelIndex === 1 ? this.level2Title : this.level3Title;
        if (this.titleAnimation && this.titleLabel) {
            this.titleLabel.string = title;
            this.titleAnimation.active = true;
            const anim = this.titleAnimation.getComponent(Animation);
            if (anim) { anim.stop(); anim.play(); }
        }
    }

    private playSound(name: string) {
        if (!name) return;
        SoundManager.playOneShot(name);
    }
}
