import { _decorator, Component, Node, tween, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PulseScale')
export class PulseScale extends Component {
    @property({ tooltip: "Интервал между циклами пульсации (сек)" })
    interval: number = 2;

    @property({ tooltip: "На сколько процентов уменьшать (0.8 = на 20%)" })
    scaleMultiplier: number = 0.8;

    @property({ tooltip: "Длительность одной фазы (сек)" })
    duration: number = 0.2;

    private originalScale: Vec3 = new Vec3();

    onLoad() {
        this.originalScale = this.node.scale.clone();
        this.startPulse();
    }

    startPulse() {
        this.schedule(() => {
            const smallerScale = this.originalScale.clone().multiplyScalar(this.scaleMultiplier);

            tween(this.node)
                .to(this.duration, { scale: smallerScale })
                .to(this.duration, { scale: this.originalScale })
                .start();
        }, this.interval);
    }
}
