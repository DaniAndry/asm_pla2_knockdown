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
    tween,
    Tween,
    UIOpacity,
    Vec3,
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
    private finishBackdrop: Node | null = null;
    private finishLabelNode: Node | null = null;
    private finishButtonNode: Node | null = null;
    private finishLabelBaseScale: Vec3 = new Vec3(1, 1, 1);
    private finishButtonBaseScale: Vec3 = new Vec3(1, 1, 1);


    private static retryCount: number = 0;

    private static resumeLevelIndex: number = 0;

    private readonly PROGRESS_INCREMENT_PER_LEVEL: number = 0.3;
    private readonly MAX_PROGRESS_FILL: number = 0.9;

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
        this.resolveFinishScreenNodes();

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

        if (this.finishScreenNode) {
            this.finishScreenNode.active = true;
            this.playFinishScreenIntro();
        }

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

    private resolveFinishScreenNodes() {
        if (!isValid(this.finishScreenNode)) return;

        this.finishBackdrop = this.finishScreenNode.getChildByName('Back');
        this.finishLabelNode = this.finishScreenNode.getChildByName('LilitaOne-Regular');
        this.finishButtonNode = this.finishScreenNode.getChildByName('Button');
        if (isValid(this.finishLabelNode)) {
            this.finishLabelNode.getScale(this.finishLabelBaseScale);
        }
        if (isValid(this.finishButtonNode)) {
            this.finishButtonNode.getScale(this.finishButtonBaseScale);
        }
    }

    private playFinishScreenIntro() {
        if (!isValid(this.finishScreenNode)) return;
        if (!isValid(this.finishBackdrop)
            || !isValid(this.finishLabelNode)
            || !isValid(this.finishButtonNode)) {
            this.resolveFinishScreenNodes();
        }

        const backdrop = this.finishBackdrop;
        if (isValid(backdrop)) {
            const opacity = backdrop.getComponent(UIOpacity) || backdrop.addComponent(UIOpacity);
            Tween.stopAllByTarget(opacity);
            opacity.opacity = 0;
            tween(opacity)
                .to(0.25, { opacity: 255 }, { easing: 'quadOut' })
                .start();
        }

        this.playFinishScaleBounce(this.finishLabelNode, this.finishLabelBaseScale, 0);
        this.playFinishScaleBounce(this.finishButtonNode, this.finishButtonBaseScale, 0.16);
    }

    private playFinishScaleBounce(node: Node | null, baseScale: Vec3, delay: number) {
        if (!isValid(node)) return;

        Tween.stopAllByTarget(node);
        node.setScale(0, 0, baseScale.z);

        const overshoot = new Vec3(baseScale.x * 1.1, baseScale.y * 1.1, baseScale.z);
        tween(node)
            .delay(delay)
            .to(0.28, { scale: overshoot }, { easing: 'backOut' })
            .to(0.1, { scale: baseScale }, { easing: 'sineInOut' })
            .start();
    }

    private playSound(name: string) {
        if (!name) return;
        SoundManager.playOneShot(name);
    }
}
