import { _decorator, Component, Node, Label, isValid } from 'cc';
const { ccclass, property } = _decorator;

/**
 * UI счетчик снарядов для уровня
 * Слушает событие 'projectiles-updated' от LevelManager
 */
@ccclass('ProjectileCounterUI')
export class ProjectileCounterUI extends Component {
    @property({ type: Label, tooltip: 'Label для отображения счетчика снарядов' })
    counterLabel: Label = null;

    @property({ type: [Node], tooltip: 'Ноды уровней с LevelManager для подписки на события' })
    levelNodes: Node[] = [];

    onLoad() {
        
        // Подписываемся на события от каждого уровня
        for (const levelNode of this.levelNodes) {
            if (isValid(levelNode)) {
                levelNode.on('projectiles-updated', this.onProjectilesUpdated, this);
                levelNode.on('projectiles-updated', this.onProjectilesUpdated, this);
            }
        }
    }

    // Обработка обновления счетчика снарядов
    private onProjectilesUpdated(data: { current: number, max: number }) {

        this.updateCounter(data.current, data.max);
    }

    // Обновить текст счетчика - показываем только оставшиеся снаряды
    private updateCounter(current: number, max: number) {
        if (!isValid(this.counterLabel)) {

            return;
        }

        const remaining = max - current; // Оставшиеся снаряды
        this.counterLabel.string = remaining.toString();
        

    }

    onDestroy() {
        // Отписываемся от всех уровней
        for (const levelNode of this.levelNodes) {
            if (isValid(levelNode)) {
                levelNode.off('projectiles-updated', this.onProjectilesUpdated, this);
            }
        }
    }
}
