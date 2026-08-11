import { _decorator, Component, PhysicsSystem, RigidBody, Node, isValid, CCFloat } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('PhysicsBootstrap')
export class PhysicsBootstrap extends Component {
    @property({ type: CCFloat, tooltip: 'Шаг физики. 1/60 = 0.0167. Для быстрых снарядов ставь 1/90 (0.0111)' })
    fixedTimeStep: number = 1 / 90;

    @property({ type: CCFloat, tooltip: 'Сколько подшагов физика может пройти за один вызов simulate()' })
    maxSubSteps: number = 4;

    @property({
        type: CCFloat,
        tooltip: 'ВАЖНО для стабильности при просадке FPS. Физика никогда не будет пытаться симулировать больше этого времени за один кадр — вместо накопления "долга" и рывка-ускорения потом, мир просто плавно тормозит на тяжёлых кадрах. Также ограничивает МАКСИМУМ подшагов, которые могут пройти за один simulate() и оказаться отрисованы одним кадром сразу все разом ("физика впереди рендера" при рывке кадра). 0.03 = не больше ~2-3 подшагов за один кадр при fixedTimeStep=1/90.'
    })
    maxFrameTime: number = 0.03;

    @property({ tooltip: 'Разрешить телам засыпать (обязательно при больших стеках)' })
    allowSleep: boolean = true;

    @property({ type: CCFloat, tooltip: 'Порог засыпания. Больше = быстрее засыпают' })
    sleepThreshold: number = 0.3;

    @property({ type: CCFloat, tooltip: 'Гравитация Y' })
    gravityY: number = -10;

    onLoad() {
        const ps = PhysicsSystem.instance;
        if (!ps) return;

        ps.enable = true;

        // ВАЖНО: раньше тут стоял autoSimulation = true. Встроенный accumulator
        // движка при просадке FPS копит "долг" физического времени и потом
        // пытается досимулировать его позже — это и даёт эффект "объекты летят
        // медленно, а потом резко ускоряются", когда нагрузка спадает.
        // Симулируем физику вручную в update() с зажатой (clamped) дельтой —
        // тогда мир на тяжёлых кадрах просто плавно тормозит, без долга и рывков.
        ps.autoSimulation = false;

        ps.fixedTimeStep = Math.max(1 / 240, this.fixedTimeStep);
        ps.maxSubSteps = Math.max(1, Math.floor(this.maxSubSteps));
        ps.allowSleep = this.allowSleep;
        ps.sleepThreshold = this.sleepThreshold;
        ps.gravity.set(0, this.gravityY, 0);


        ps.gravity = ps.gravity;
    }

    update(dt: number) {
        const ps = PhysicsSystem.instance;
        if (!ps || !ps.enable) return;

        const clampedDt = Math.min(dt, Math.max(1 / 240, this.maxFrameTime));
        ps.simulate(clampedDt);
    }


    public static enableCCD(target: Node | RigidBody | null, sweptRadius: number = 0.1) {
        if (!target) return;

        const rb = target instanceof RigidBody ? target : target.getComponent(RigidBody);
        if (!isValid(rb)) return;

        try {
            (rb as any).useCCD = true;
            if (typeof (rb as any).ccdSweptSphereRadius === 'number' || 'ccdSweptSphereRadius' in (rb as any)) {
                (rb as any).ccdSweptSphereRadius = sweptRadius;
            }
        } catch {

        }
    }
}
