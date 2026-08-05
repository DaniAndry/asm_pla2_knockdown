import { _decorator, Component, Node, Label, director, AudioSource } from 'cc';
// import { SlingShotController } from './SlingShotController'; // УДАЛЕН - заменен на CannonController
const { ccclass, property } = _decorator;

/**
 * Основной класс управления игрой
 */
@ccclass('GameManager')
export class GameManager extends Component {
    @property({ type: Label })
    scoreLabel: Label = null;

    @property({ type: Node })
    gameOverPanel: Node = null;

    @property({ type: Node })
    winPanel: Node = null;

    @property({ type: AudioSource })
    winSound: AudioSource = null;

    @property({ type: AudioSource })
    gameOverSound: AudioSource = null;

    @property({ type: Node, tooltip: 'Узел для отслеживания свиней' })
    pigsContainer: Node = null;

    // @property({ type: SlingShotController, tooltip: 'Контроллер рогатки' })
    // slingShotController: SlingShotController = null; // УДАЛЕН - заменен на CannonController

    private static _instance: GameManager = null;
    private _score: number = 0;
    private _isGameOver: boolean = false;
    
    /** Получить текущий экземпляр GameManager */
    public static instance(): GameManager {
        return GameManager._instance;
    }

    onLoad() {
        // Инициализация синглтона
        GameManager._instance = this;
        
        // В оригинальной версии здесь не было никаких обработчиков ошибок

        // Инициализация UI
        this.updateScoreDisplay();
        
        // Скрываем панели
        if (this.gameOverPanel) this.gameOverPanel.active = false;
        if (this.winPanel) this.winPanel.active = false;

        // Подписываемся на события начисления очков
        this.node.on('score-added', this.onScoreAdded, this);

        // Сбрасываем рогатку при первой загрузке, если она назначена
        // if (this.slingShotController) {
        //     this.slingShotController.resetForNewLevel();
        // }
        
        // Событие проигрыша или победы
        this.node.on('level-failed', this.onLevelFailed, this);
        this.node.on('level-completed', this.onLevelCompleted, this);
    }

    onDestroy() {
        // Удаляем синглтон
        if (GameManager._instance === this) {
            GameManager._instance = null;
        }
        
        // Отписываемся от событий
        this.node.off('score-added', this.onScoreAdded, this);
        this.node.off('level-failed', this.onLevelFailed, this);
        this.node.off('level-completed', this.onLevelCompleted, this);
    }

    update() {
        // Проверяем условия победы в каждом кадре
        if (!this._isGameOver) {
            this.checkVictoryCondition();
        }
    }
    
    /**
     * Обработчик события начисления очков
     */
    onScoreAdded(points: number) {
        this.addScore(points);
    }

    /**
     * Добавить очки к общему счету
     */
    addScore(points: number) {
        this._score += points;
        this.updateScoreDisplay();
    }

    /**
     * Обновить отображение счета
     */
    private updateScoreDisplay() {
        if (this.scoreLabel) {
            this.scoreLabel.string = `Счет: ${this._score}`;
        }
    }

    /**
     * Проверка условий победы
     */
    private checkVictoryCondition() {
        // Если все свиньи уничтожены, игра выиграна
        if (this.pigsContainer && this.pigsContainer.children.length === 0) {
            this.onLevelCompleted();
        }
    }

    /**
     * Обработчик события проигрыша уровня
     */
    onLevelFailed() {
        if (this._isGameOver) return;
        this._isGameOver = true;
        
        // Показываем панель проигрыша
        if (this.gameOverPanel) {
            this.gameOverPanel.active = true;
        }
        
        // Воспроизводим звук проигрыша
        if (this.gameOverSound) {
            this.gameOverSound.play();
        }
        
        // Можно добавить анимации или другие эффекты
    }

    /**
     * Обработчик события выигрыша уровня
     */
    onLevelCompleted() {
        if (this._isGameOver) return;
        this._isGameOver = true;
        
        // Показываем панель победы
        if (this.winPanel) {
            this.winPanel.active = true;
        }
        
        // Воспроизводим звук победы
        if (this.winSound) {
            this.winSound.play();
        }
        
        // Можно добавить анимации или другие эффекты
    }

    /**
     * Перезапустить текущий уровень
     */
    restartLevel() {
        // Сбрасываем состояние рогатки перед перезагрузкой сцены
        // if (this.slingShotController) {
        //     this.slingShotController.resetForNewLevel();
        // }
        director.loadScene(director.getScene().name);
    }

    /**
     * Перейти к следующему уровню
     */
    nextLevel() {
        // Здесь должна быть логика загрузки следующего уровня
        // Например:
        // const currentLevel = parseInt(director.getScene().name.replace('level', ''));
        // director.loadScene(`level${currentLevel + 1}`);
        
        // Пока просто перезапускаем текущий уровень
        // Сбрасываем состояние рогатки перед загрузкой следующего уровня
        // if (this.slingShotController) {
        //     this.slingShotController.resetForNewLevel();
        // }
        this.restartLevel(); // В вашей текущей логике это перезапускает уровень
        // Если будет реальная загрузка следующего уровня, вызов resetForNewLevel() также должен быть здесь
    }

    /**
     * Перейти в главное меню
     */
    goToMainMenu() {
        director.loadScene('MainMenu');
    }
}
