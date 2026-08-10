import { _decorator, Component, PhysicsSystem, RigidBody, Node, isValid, CCFloat } from 'cc';

const { ccclass, property } = _decorator;

/**
 * Вешается на один корневой узел сцены (например на Canvas или GameRoot).
 * Единая точка настройки физического мира.
 *
 * ПОЧЕМУ ЭТО ВАЖНО:
 * - maxSubSteps = 1 (дефолт) означает, что при просадке кадра физика НЕ догоняет,
 *   шаг растягивается и быстрый снаряд проскакивает сквозь коробку.
 * - allowSleep + адекватный sleepThreshold позволяют стеку из 400 тел
 *   заснуть и перестать жрать CPU.
 */
@ccclass('PhysicsBootstrap')
export class PhysicsBootstrap extends Component {
    @property({ type: CCFloat, tooltip: 'Шаг физики. 1/60 = 0.0167. Для быстрых снарядов ставь 1/90 (0.0111)' })
    fixedTimeStep: number = 1 / 90;

    @property({ type: CCFloat, tooltip: 'Сколько подшагов физика может догнать за кадр. 1 = туннелирование при лагах' })
    maxSubSteps: number = 4;

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
        ps.autoSimulation = true;
        ps.fixedTimeStep = Math.max(1 / 240, this.fixedTimeStep);
        ps.maxSubSteps = Math.max(1, Math.floor(this.maxSubSteps));
        ps.allowSleep = this.allowSleep;
        ps.sleepThreshold = this.sleepThreshold;
        ps.gravity.set(0, this.gravityY, 0);

        // Иногда бэкенд игнорирует новый gravity без переприсвоения
        ps.gravity = ps.gravity;
    }

    /**
     * Включить CCD на конкретном теле (снаряд).
     * Работает на bullet / physx бэкендах. На builtin — тихо игнорируется.
     */
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
            // builtin physics — CCD не поддерживается, спасает только ProjectileCCD
        }
    }
}
