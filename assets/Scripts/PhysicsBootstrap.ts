import { _decorator, Component, PhysicsSystem, RigidBody, Node, isValid, CCFloat, debug } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('PhysicsBootstrap')
export class PhysicsBootstrap extends Component {
    @property({
        tooltip: 'Показывать поверх игры ту же панель статистики (FPS/Draw call/Physics/Renderer мс), что видно в редакторском Preview — но уже в РЕАЛЬНОМ билде (без оверхеда редактора). Включайте только для тестовой сборки, перед отправкой в рекламную сеть — выключите.'
    })
    debugShowStats: boolean = false;

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

    // Если ps.simulate почему-то недоступен/падает (битый бэкенд физики в
    // редакторе — уже бывало, см. историю с "ps.simulate is not a function"),
    // компонент раньше просто крашился каждый кадр, и это приводило к тому,
    // что его убирали со сцены целиком — а вместе с ним терялись и
    // sleepThreshold/allowSleep/fixedTimeStep, которые к падению simulate()
    // вообще не имеют отношения. Теперь: настройки применяются в onLoad()
    // безусловно, а ручной клэмп-степ — best-effort, с авто-откатом на
    // autoSimulation, если он не работает, вместо падения каждый кадр.
    private canManualSimulate: boolean = false;

    onLoad() {
        if (this.debugShowStats) {
            try { debug.setDisplayStats(true); } catch {}
        }

        const ps = PhysicsSystem.instance;
        if (!ps) return;

        ps.enable = true;

        this.canManualSimulate = typeof (ps as any).simulate === 'function';

        // ВАЖНО: раньше тут всегда стоял autoSimulation = false. Встроенный
        // accumulator движка при просадке FPS копит "долг" физического
        // времени и потом пытается досимулировать его позже — это и даёт
        // эффект "объекты летят медленно, а потом резко ускоряются", когда
        // нагрузка спадает. Симулируем физику вручную в update() с зажатой
        // (clamped) дельтой — мир на тяжёлых кадрах просто плавно тормозит,
        // без долга и рывков. НО если ps.simulate недоступен — оставляем
        // autoSimulation = true, иначе физика не будет считаться ВООБЩЕ.
        ps.autoSimulation = !this.canManualSimulate;

        ps.fixedTimeStep = Math.max(1 / 240, this.fixedTimeStep);
        ps.maxSubSteps = Math.max(1, Math.floor(this.maxSubSteps));
        ps.allowSleep = this.allowSleep;
        ps.sleepThreshold = this.sleepThreshold;
        ps.gravity.set(0, this.gravityY, 0);


        ps.gravity = ps.gravity;

        if (!this.canManualSimulate) {
            console.warn('[PhysicsBootstrap] ps.simulate недоступен — использую autoSimulation движка вместо ручного клэмп-степа (fixedTimeStep/maxSubSteps/allowSleep/sleepThreshold всё равно применены).');
        }
    }

    update(dt: number) {
        if (!this.canManualSimulate) return;

        const ps = PhysicsSystem.instance;
        if (!ps || !ps.enable) return;

        const clampedDt = Math.min(dt, Math.max(1 / 240, this.maxFrameTime));
        try {
            ps.simulate(clampedDt);
        } catch (e) {
            console.warn('[PhysicsBootstrap] ps.simulate упал в рантайме — переключаюсь на autoSimulation вместо падения каждый кадр.', e);
            this.canManualSimulate = false;
            ps.autoSimulation = true;
        }
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
