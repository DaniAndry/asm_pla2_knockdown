import { _decorator, Component, Node, Label, isValid } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ProjectileCounterUI')
export class ProjectileCounterUI extends Component {
    @property({ type: Label, tooltip: 'Label для отображения счетчика снарядов' })
    counterLabel: Label = null;

    @property({ type: [Node], tooltip: 'Ноды уровней с LevelManager для подписки на события' })
    levelNodes: Node[] = [];

    onLoad() {


        for (const levelNode of this.levelNodes) {
            if (isValid(levelNode)) {
                levelNode.on('projectiles-updated', this.onProjectilesUpdated, this);
                levelNode.on('projectiles-updated', this.onProjectilesUpdated, this);
            }
        }
    }


    private onProjectilesUpdated(data: { current: number, max: number }) {

        this.updateCounter(data.current, data.max);
    }


    private updateCounter(current: number, max: number) {
        if (!isValid(this.counterLabel)) {

            return;
        }

        const remaining = max - current;
        this.counterLabel.string = remaining.toString();


    }

    onDestroy() {

        for (const levelNode of this.levelNodes) {
            if (isValid(levelNode)) {
                levelNode.off('projectiles-updated', this.onProjectilesUpdated, this);
            }
        }
    }
}
