import { _decorator, Component, Node, isValid, director } from 'cc';
import { LevelManager } from './LevelManager';
const { ccclass, property } = _decorator;

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

        for (const levelNode of this.levels) {
            if (isValid(levelNode)) {
                levelNode.on('level-completed', this.onLevelCompleted, this);
            }
        }
    }

    start() {

        this.hideAllLevels();


        this.startLevel(0);
    }


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


        levelNode.active = true;


        this.currentLevelManager = levelNode.getComponent(LevelManager);
        if (!isValid(this.currentLevelManager)) {
            console.error(`[GameController] LevelManager не найден на уровне ${index + 1}!`);
            return;
        }


        this.currentLevelManager.startLevel();
        console.log(`[GameController] 🎮 Уровень ${index + 1} запущен!`);
    }


    private onLevelCompleted(eventData: any) {
        const { levelNumber, victory, remainingObjects, projectilesUsed } = eventData;

        console.log(`[GameController] Уровень ${levelNumber} завершен!`);
        console.log(`Победа: ${victory}, Осталось объектов: ${remainingObjects}, Снарядов: ${projectilesUsed}`);


    }


    private nextLevel() {
        const nextIndex = this.currentLevelIndex + 1;

        if (nextIndex >= this.levels.length) {
            console.log('[GameController] 🏆 Все уровни пройдены! Поздравляем!');
            this.onAllLevelsCompleted();
            return;
        }


        if (isValid(this.levels[this.currentLevelIndex])) {
            this.levels[this.currentLevelIndex].active = false;
        }


        this.startLevel(nextIndex);
    }


    private restartCurrentLevel() {
        console.log('[GameController] 🔄 Перезапуск уровня...');


        director.loadScene(director.getScene().name);






    }


    private onAllLevelsCompleted() {
        console.log('[GameController] 🎊 Game Complete!');



        if (isValid(this.scoreManager)) {
            const scoreComponent = this.scoreManager.getComponent('ScoreManager');
            if (scoreComponent) {
                const finalScore = (scoreComponent as any).getScore();
                console.log(`Final Score: ${finalScore}`);
            }
        }
    }


    private hideAllLevels() {
        for (const levelNode of this.levels) {
            if (isValid(levelNode)) {
                levelNode.active = false;
            }
        }
    }


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
