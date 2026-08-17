import { _decorator, Component, Node, Sprite, isValid } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('LevelUIController')
export class LevelUIController extends Component {
    @property({ type: Sprite, tooltip: 'Sprite для уровня 1' })
    level1Sprite: Sprite = null;

    @property({ type: Sprite, tooltip: 'Sprite для уровня 2' })
    level2Sprite: Sprite = null;

    @property({ type: Sprite, tooltip: 'Sprite для уровня 3' })
    level3Sprite: Sprite = null;

    @property({ type: [Node], tooltip: 'Ноды уровней с LevelManager для подписки на события' })
    levelNodes: Node[] = [];

    @property({ type: Node, tooltip: 'Нода с туториалом' })
    tutorialNode: Node = null;

    onLoad() {
        this.hideAllSprites();

        if (isValid(this.tutorialNode)) {
            this.tutorialNode.active = true;
        }

        for (const levelNode of this.levelNodes) {
            if (isValid(levelNode)) {
                levelNode.on('level-completed', this.onLevelCompleted, this);
            }
        }
    }

    private hideAllSprites() {
        if (this.level1Sprite?.node) this.level1Sprite.node.active = false;
        if (this.level2Sprite?.node) this.level2Sprite.node.active = false;
        if (this.level3Sprite?.node) this.level3Sprite.node.active = false;
    }

    private onLevelCompleted(eventData: any) {
        const { levelNumber } = eventData;
        this.showLevelSprite(levelNumber);
    }

    private showLevelSprite(levelNumber: number) {
        let sprite: Sprite = null;

        switch (levelNumber) {
            case 1:
                sprite = this.level1Sprite;
                break;
            case 2:
                sprite = this.level2Sprite;
                break;
            case 3:
                sprite = this.level3Sprite;
                break;
        }

        if (isValid(sprite) && sprite.node) {
            sprite.node.active = true;
        }
    }

    resetAllLevels() {
        this.hideAllSprites();
        if (isValid(this.tutorialNode)) {
            this.tutorialNode.active = true;
        }
    }

    onDestroy() {
        for (const levelNode of this.levelNodes) {
            if (isValid(levelNode)) {
                levelNode.off('level-completed', this.onLevelCompleted, this);
            }
        }
    }
}
