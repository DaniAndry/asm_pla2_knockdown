import { _decorator, Component, Node, isValid, director } from 'cc';
import { LevelManager } from './LevelManager';
const { ccclass, property } = _decorator;

/**
 * Главный контроллер игры - управляет переходами между уровнями
 */
@ccclass('GameController')
export class GameController extends Component {
    @property({ type: [Node], tooltip: 'Все ноды уровней в порядке (Level1, Level2, Level3)' })
    levels: Node[] = [];

    @property({ type: Node, tooltip: 'UI контроллер уровней' })
    levelUIController: Node = null;

    @property({ type: Node, tooltip: 'ScoreManager' })
    scoreManager: Node = null;

    private currentLevelIndex: number = 0;
    private currentLevelManager: LevelManager = null;

    onLoad() {
        // Подписываемся на события завершения уровня
        for (const levelNode of this.levels) {
            if (isValid(levelNode)) {
                levelNode.on('level-completed', this.onLevelCompleted, this);
            }
        }
    }

    start() {
        // Скрываем все уровни кроме первого
        this.hideAllLevels();
        
        // Запускаем первый уровень
        this.startLevel(0);
    }

    // Начать уровень по индексу
    private startLevel(index: number) {
        if (index < 0 || index >= this.levels.length) {
            console.log('[GameController] Все уровни пройдены!');
            return;
        }

        this.currentLevelIndex = index;
        const levelNode = this.levels[index];

        if (!isValid(levelNode)) {
            console.error(`[GameController] Уровень ${index + 1} не найден!`);
            return;
        }

        // Показываем текущий уровень
        levelNode.active = true;

        // Получаем LevelManager
        this.currentLevelManager = levelNode.getComponent(LevelManager);
        if (!isValid(this.currentLevelManager)) {
            console.error(`[GameController] LevelManager не найден на уровне ${index + 1}!`);
            return;
        }

        // Запускаем уровень
        this.currentLevelManager.startLevel();
        console.log(`[GameController] 🎮 Уровень ${index + 1} запущен!`);
    }

    // Обработка завершения уровня
    private onLevelCompleted(eventData: any) {
        const { levelNumber, victory, remainingObjects, projectilesUsed } = eventData;

        console.log(`[GameController] Уровень ${levelNumber} завершен!`);
        console.log(`Победа: ${victory}, Осталось объектов: ${remainingObjects}, Снарядов: ${projectilesUsed}`);

        // Ждем немного перед переходом
        this.scheduleOnce(() => {
            if (victory) {
                // ПОБЕДА - переходим к следующему уровню
                this.nextLevel();
            } else {
                // ПОРАЖЕНИЕ - перезапускаем текущий уровень
                this.restartCurrentLevel();
            }
        }, 2); // 2 секунды на просмотр результата
    }

    // Следующий уровень
    private nextLevel() {
        const nextIndex = this.currentLevelIndex + 1;

        if (nextIndex >= this.levels.length) {
            console.log('[GameController] 🏆 Все уровни пройдены! Поздравляем!');
            this.onAllLevelsCompleted();
            return;
        }

        // Скрываем текущий уровень
        if (isValid(this.levels[this.currentLevelIndex])) {
            this.levels[this.currentLevelIndex].active = false;
        }

        // Запускаем следующий
        this.startLevel(nextIndex);
    }

    // Перезапуск текущего уровня
    private restartCurrentLevel() {
        console.log('[GameController] 🔄 Перезапуск уровня...');
        
        // Перезагружаем сцену (простейший способ)
        director.loadScene(director.getScene().name);
        
        // Или можно сделать ручной перезапуск:
        // this.levels[this.currentLevelIndex].active = false;
        // this.scheduleOnce(() => {
        //     this.startLevel(this.currentLevelIndex);
        // }, 0.1);
    }

    // Все уровни пройдены
    private onAllLevelsCompleted() {
        console.log('[GameController] 🎊 Game Complete!');
        
        // Здесь можно показать финальный экран, статистику и т.д.
        // Например, показать общий счет:
        if (isValid(this.scoreManager)) {
            const scoreComponent = this.scoreManager.getComponent('ScoreManager');
            if (scoreComponent) {
                const finalScore = (scoreComponent as any).getScore();
                console.log(`Final Score: ${finalScore}`);
            }
        }
    }

    // Скрыть все уровни
    private hideAllLevels() {
        for (const levelNode of this.levels) {
            if (isValid(levelNode)) {
                levelNode.active = false;
            }
        }
    }

    // Публичные методы для внешнего управления
    public getCurrentLevelManager(): LevelManager {
        return this.currentLevelManager;
    }

    public skipToLevel(levelIndex: number) {
        this.hideAllLevels();
        this.startLevel(levelIndex);
    }

    public resetGame() {
        if (isValid(this.scoreManager)) {
            this.scoreManager.emit('reset-score');
        }
        
        if (isValid(this.levelUIController)) {
            const uiController = this.levelUIController.getComponent('LevelUIController');
            if (uiController) {
                (uiController as any).resetAllLevels();
            }
        }

        this.hideAllLevels();
        this.startLevel(0);
    }

    onDestroy() {
        for (const levelNode of this.levels) {
            if (isValid(levelNode)) {
                levelNode.off('level-completed', this.onLevelCompleted, this);
            }
        }
    }
}
