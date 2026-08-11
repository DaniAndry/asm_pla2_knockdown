import { _decorator, Component, Label, isValid, tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ScoreManager')
export class ScoreManager extends Component {
    @property({ type: Label, tooltip: 'Label компонент для отображения счета' })
    scoreLabel: Label = null;

    private currentScore: number = 0;
    private displayScore: number = 0;
    private isAnimating: boolean = false;

    onLoad() {
        this.updateScoreDisplay();

    }


    addScore(points: number) {
        this.currentScore += points;
        this.animateScoreIncrease();
    }


    private animateScoreIncrease() {
        if (this.isAnimating) {

            return;
        }

        this.isAnimating = true;

        const startScore = this.displayScore;
        const endScore = this.currentScore;
        const duration = 0.5;

        tween({ value: startScore })
            .to(duration, { value: endScore }, {
                onUpdate: (target: any) => {
                    this.displayScore = Math.floor(target.value);
                    this.updateScoreDisplay();
                }
            })
            .call(() => {
                this.displayScore = endScore;
                this.updateScoreDisplay();
                this.isAnimating = false;


                if (this.displayScore < this.currentScore) {
                    this.animateScoreIncrease();
                }
            })
            .start();
    }


    private updateScoreDisplay() {
        if (isValid(this.scoreLabel)) {
            this.scoreLabel.string = `Score: ${this.displayScore}`;
        }
    }


    resetScore() {
        this.currentScore = 0;
        this.displayScore = 0;
        this.isAnimating = false;
        this.updateScoreDisplay();
    }


    getScore(): number {
        return this.currentScore;
    }

}
