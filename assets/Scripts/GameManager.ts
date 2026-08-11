import { _decorator, Component, Node, Label, director, AudioSource } from 'cc';

const { ccclass, property } = _decorator;

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




    private static _instance: GameManager = null;
    private _score: number = 0;
    private _isGameOver: boolean = false;


    public static instance(): GameManager {
        return GameManager._instance;
    }

    onLoad() {

        GameManager._instance = this;




        this.updateScoreDisplay();


        if (this.gameOverPanel) this.gameOverPanel.active = false;
        if (this.winPanel) this.winPanel.active = false;


        this.node.on('score-added', this.onScoreAdded, this);







        this.node.on('level-failed', this.onLevelFailed, this);
        this.node.on('level-completed', this.onLevelCompleted, this);
    }

    onDestroy() {

        if (GameManager._instance === this) {
            GameManager._instance = null;
        }


        this.node.off('score-added', this.onScoreAdded, this);
        this.node.off('level-failed', this.onLevelFailed, this);
        this.node.off('level-completed', this.onLevelCompleted, this);
    }

    update() {

        if (!this._isGameOver) {
            this.checkVictoryCondition();
        }
    }


    onScoreAdded(points: number) {
        this.addScore(points);
    }


    addScore(points: number) {
        this._score += points;
        this.updateScoreDisplay();
    }


    private updateScoreDisplay() {
        if (this.scoreLabel) {
            this.scoreLabel.string = `Счет: ${this._score}`;
        }
    }


    private checkVictoryCondition() {

        if (this.pigsContainer && this.pigsContainer.children.length === 0) {
            this.onLevelCompleted();
        }
    }


    onLevelFailed() {
        if (this._isGameOver) return;
        this._isGameOver = true;


        if (this.gameOverPanel) {
            this.gameOverPanel.active = true;
        }


        if (this.gameOverSound) {
            this.gameOverSound.play();
        }


    }


    onLevelCompleted() {
        if (this._isGameOver) return;
        this._isGameOver = true;


        if (this.winPanel) {
            this.winPanel.active = true;
        }


        if (this.winSound) {
            this.winSound.play();
        }


    }


    restartLevel() {




        director.loadScene(director.getScene().name);
    }


    nextLevel() {










        this.restartLevel();

    }


    goToMainMenu() {
        director.loadScene('MainMenu');
    }
}
