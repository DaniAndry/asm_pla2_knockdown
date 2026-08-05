import { _decorator, Component, Label, isValid, tween } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Менеджер счета - плавное обновление счетчика очков
 */
@ccclass('ScoreManager')
export class ScoreManager extends Component {
    @property({ type: Label, tooltip: 'Label компонент для отображения счета' })
    scoreLabel: Label = null;

    private currentScore: number = 0;
    private displayScore: number = 0;
    private isAnimating: boolean = false;

    onLoad() {
        this.updateScoreDisplay();
        // Теперь очки добавляются через прямой вызов метода addScore()
    }

    // Добавить очки с плавной анимацией
    addScore(points: number) {
        this.currentScore += points;
        this.animateScoreIncrease();
    }

    // Плавная анимация увеличения счета
    private animateScoreIncrease() {
        if (this.isAnimating) {
            // Если уже анимируется, просто обновим целевое значение
            return;
        }

        this.isAnimating = true;

        const startScore = this.displayScore;
        const endScore = this.currentScore;
        const duration = 0.5; // 0.5 секунды

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

                // Если накопились еще очки во время анимации, запускаем снова
                if (this.displayScore < this.currentScore) {
                    this.animateScoreIncrease();
                }
            })
            .start();
    }

    // Обновить текст счета
    private updateScoreDisplay() {
        if (isValid(this.scoreLabel)) {
            this.scoreLabel.string = `Score: ${this.displayScore}`;
        }
    }

    // Сбросить счет
    resetScore() {
        this.currentScore = 0;
        this.displayScore = 0;
        this.isAnimating = false;
        this.updateScoreDisplay();
    }

    // Получить текущий счет
    getScore(): number {
        return this.currentScore;
    }

}
