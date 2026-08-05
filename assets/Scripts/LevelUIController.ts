import { _decorator, Component, Node, Sprite, isValid, input, Input, EventTouch, Animation } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Контроллер UI уровней - управляет отображением победы/поражения для каждого уровня
 */
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

    @property({ type: Node, tooltip: 'Нода с туториалом (скрывается при первом клике)' })
    tutorialNode: Node = null;

    private tutorialHidden: boolean = false;


    onLoad() {
        this.hideAllSprites();
        
        // Показываем туториал в начале
        if (isValid(this.tutorialNode)) {
            this.tutorialNode.active = true;
        }
        
        // Подписываемся на события от каждого уровня
        for (const levelNode of this.levelNodes) {
            if (isValid(levelNode)) {
                levelNode.on('level-completed', this.onLevelCompleted, this);
            }
        }
        
        // Слушаем первый клик через глобальный input (не блокируем выстрел)
        input.on(Input.EventType.TOUCH_START, this.onFirstClick, this);
    }

    // Скрыть все спрайты в начале
    private hideAllSprites() {
        if (this.level1Sprite?.node) this.level1Sprite.node.active = false;
        if (this.level2Sprite?.node) this.level2Sprite.node.active = false;
        if (this.level3Sprite?.node) this.level3Sprite.node.active = false;
    }

    // Обработка первого клика - скрываем туториал (не блокирует выстрел)
    private onFirstClick(event: EventTouch) {
        if (!this.tutorialHidden && isValid(this.tutorialNode)) {
            this.tutorialNode.active = false;
            this.tutorialHidden = true;
            
            // Отписываемся от глобального слушателя
            input.off(Input.EventType.TOUCH_START, this.onFirstClick, this);
        }
    }

    // Обработка завершения уровня
    private onLevelCompleted(eventData: any) {
        const { levelNumber } = eventData;
        // Показываем спрайт завершенного уровня
        this.showLevelSprite(levelNumber);
    }

    // Показать спрайт уровня
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

    // Сбросить все спрайты
    resetAllLevels() {
        this.hideAllSprites();
        
        // Показываем туториал снова
        this.tutorialHidden = false;
        if (isValid(this.tutorialNode)) {
                this.tutorialNode.active = true;
        }
        
        // Переподписываемся на глобальный клик
        input.off(Input.EventType.TOUCH_START, this.onFirstClick, this);
        input.on(Input.EventType.TOUCH_START, this.onFirstClick, this);
    }

    onDestroy() {
        // Отписываемся от всех уровней
        for (const levelNode of this.levelNodes) {
            if (isValid(levelNode)) {
                levelNode.off('level-completed', this.onLevelCompleted, this);
            }
        }

        input.off(Input.EventType.TOUCH_START, this.onFirstClick, this);
    }
}
