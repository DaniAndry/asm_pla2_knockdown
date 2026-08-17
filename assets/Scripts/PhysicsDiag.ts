import {
    _decorator, Component, Node, Vec3, CCFloat, isValid,
    PhysicsSystem, RigidBody,
} from 'cc';

const { ccclass, property } = _decorator;

const _v = new Vec3();

/**
 * Диагностика физики: что РЕАЛЬНО доехало до движка и спят ли тела.
 *
 * Нужна, чтобы отличить три разные причины «меняю Sleep Threshold, и ничего
 * не происходит»:
 *   1. значение не сохранилось в project.json / Preview взял старый кэш;
 *   2. значение доехало, но кто-то перетирает его в рантайме
 *      (например PhysicsBootstrap, если компонент всё ещё висит на сцене);
 *   3. значение доехало и держится, но бэкенд его игнорирует — тогда телам
 *      порог безразличен и крутить его бессмысленно.
 *
 * Вешать на любой узел сцены.
 */
@ccclass('PhysicsDiag')
export class PhysicsDiag extends Component {
    @property({ type: Node, tooltip: 'Узел с телами уровня. Пусто = искать от корня сцены.' })
    bodiesParent: Node = null;

    @property({ type: CCFloat, tooltip: 'Период отчёта о состоянии тел (сек). 0 = только один раз на старте.' })
    reportInterval: number = 2;

    start() {
        this.dumpConfig('старт');

        // Второй замер спустя секунду: если значения разъехались с первым,
        // значит их кто-то перетирает уже после инициализации.
        this.scheduleOnce(() => this.dumpConfig('через 1 сек'), 1);

        if (this.reportInterval > 0) {
            this.schedule(this.reportBodies, this.reportInterval);
        }
    }

    private dumpConfig(when: string) {
        const ps = PhysicsSystem.instance;
        if (!ps) { console.warn('[PhysicsDiag] PhysicsSystem.instance отсутствует'); return; }

        const budget = ps.fixedTimeStep * ps.maxSubSteps * 1000;
        console.log(
            `[PhysicsDiag ${when}] sleepThreshold=${ps.sleepThreshold} allowSleep=${ps.allowSleep} ` +
            `fixedTimeStep=${ps.fixedTimeStep.toFixed(5)} maxSubSteps=${ps.maxSubSteps} ` +
            `(бюджет ${budget.toFixed(0)} мс/кадр) autoSimulation=${ps.autoSimulation} ` +
            `gravityY=${ps.gravity.y}`
        );
    }

    private reportBodies = () => {
        const parent = isValid(this.bodiesParent) ? this.bodiesParent : this.node.scene;
        if (!parent) return;

        let bodies: RigidBody[];
        try {
            bodies = parent.getComponentsInChildren(RigidBody);
        } catch {
            return;
        }

        let dyn = 0, sleeping = 0, awake = 0, maxSpeed = 0, sumSpeed = 0;

        for (const rb of bodies) {
            if (!isValid(rb) || !rb.enabled) continue;
            if (!rb.node?.activeInHierarchy) continue;
            if (!rb.isDynamic) continue;

            dyn++;
            try {
                if (rb.isSleeping) { sleeping++; continue; }
                awake++;
                rb.getLinearVelocity(_v);
                const s = _v.length();
                sumSpeed += s;
                if (s > maxSpeed) maxSpeed = s;
            } catch { }
        }

        const avg = awake > 0 ? sumSpeed / awake : 0;
        console.log(
            `[PhysicsDiag] динамических=${dyn} спят=${sleeping} бодрствуют=${awake} ` +
            `| скорость бодрствующих: средняя=${avg.toFixed(4)} макс=${maxSpeed.toFixed(4)} ` +
            `| порог сна=${PhysicsSystem.instance?.sleepThreshold}`
        );
    };
}
