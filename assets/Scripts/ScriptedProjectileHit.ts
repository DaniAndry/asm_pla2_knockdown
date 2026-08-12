import { _decorator, Component, Vec3, CCFloat, isValid, RigidBody, director } from 'cc';
import { ScriptedKnockdown } from './ScriptedKnockdown';

const { ccclass, property } = _decorator;

// ВНИМАНИЕ: здесь можно держать только временные значения, живущие внутри
// одного вызова lateUpdate(). Позиция прошлого кадра (prev) ОБЯЗАНА быть
// полем экземпляра: на сцене больше одного объекта с этим компонентом
// (снаряд + превью траектории), и общая на всех переменная приводила к тому,
// что они затирали позицию друг другу. Луч строился между двумя разными
// объектами — длиной в пол-сцены — и «попадал» в случайную точку, где блоков
// нет. Отсюда были ложные попадания без всякого эффекта.
const _cur = new Vec3();
const _dir = new Vec3();
const _vel = new Vec3();
const _hit = new Vec3();

/**
 * Ищет попадание снаряда по блокам БЕЗ участия физики.
 *
 * У блоков в режиме ScriptedKnockdown нет ни RigidBody, ни коллайдеров —
 * значит ни onCollisionEnter, ни raycast движка их не увидят. Поэтому
 * пересечение считаем сами: отрезок, пройденный снарядом за кадр, проверяем
 * против AABB блоков (slab-метод). 430 таких проверок — это микросекунды,
 * и они выполняются только пока снаряд летит.
 *
 * Вешать на узел снаряда (рядом с его RigidBody — снаряд остаётся физическим,
 * дешевле одного тела уже некуда).
 */
@ccclass('ScriptedProjectileHit')
export class ScriptedProjectileHit extends Component {
    @property({ type: ScriptedKnockdown, tooltip: 'Необязательно. Обычно оставляйте пустым: снаряд сам берёт ScriptedKnockdown АКТИВНОГО уровня. Заполняйте, только если хотите жёстко прибить снаряд к конкретному уровню.' })
    knockdown: ScriptedKnockdown = null;

    @property({ type: CCFloat, tooltip: 'Радиус снаряда: AABB блоков расширяются на эту величину, чтобы касание считалось попаданием' })
    projectileRadius: number = 0.5;

    @property({ type: CCFloat, tooltip: 'Ниже этой скорости попадание не засчитывается (м/с)' })
    minSpeed: number = 2;

    @property({ tooltip: 'Останавливать снаряд в точке попадания. ВЫКЛ = снаряд летит насквозь и сносит всё по пути (пушечное ядро).' })
    stopOnHit: boolean = false;

    @property({ type: CCFloat, tooltip: 'Пауза между попаданиями одного снаряда (сек), чтобы один удар не засчитался несколько раз' })
    hitCooldown: number = 0.05;

    @property({ type: CCFloat, tooltip: 'Упреждение: насколько продлить луч вперёд за текущую позицию снаряда. Ловит попадание на кадр раньше, чем снаряд визуально войдёт в блок — иначе на высокой скорости удар выглядит запоздалым.' })
    lookAhead: number = 0.4;

    @property({ tooltip: 'ВРЕМЕННО: печатать в консоль состояние поиска попаданий (нашёлся ли реестр блоков, сколько их, куда идёт луч). Выключите, когда разберётесь.' })
    debug: boolean = false;

    private dbgFrames: number = 0;

    private rb: RigidBody | null = null;
    private hasPrev: boolean = false;
    private lastHit: number = 0;
    private readonly prev: Vec3 = new Vec3();

    onLoad() {
        this.rb = this.getComponent(RigidBody);
    }

    /**
     * Реестр берём КАЖДЫЙ раз, а не запоминаем в onLoad.
     * Все уровни лежат в одной сцене и переключаются через level.active, так
     * что ссылка, взятая один раз при загрузке, навсегда прилипала к первому
     * уровню — на втором снаряд летел сквозь блоки, потому что спрашивал не
     * тот реестр.
     */
    private resolveKnockdown(): ScriptedKnockdown | null {
        if (isValid(this.knockdown) && this.knockdown.node?.activeInHierarchy) {
            return this.knockdown;
        }
        return ScriptedKnockdown.getActive();
    }

    onEnable() {
        this.node.getWorldPosition(this.prev);
        this.hasPrev = true;
    }

    onDisable() {
        this.hasPrev = false;
    }

    lateUpdate(deltaTime: number) {
        if (!this.hasPrev) {
            if (this.debug) console.warn('[ScriptedProjectileHit] hasPrev=false — onEnable не отработал, поиск попаданий не идёт.');
            return;
        }

        const kd = this.resolveKnockdown();
        if (!kd) {
            if (this.debug && (this.dbgFrames++ % 60) === 0) {
                console.warn('[ScriptedProjectileHit] ScriptedKnockdown НЕ НАЙДЕН (нет активного экземпляра на сцене). Снаряд летит насквозь.');
            }
            return;
        }

        this.node.getWorldPosition(_cur);

        if (isValid(this.rb)) {
            this.rb.getLinearVelocity(_vel);
        } else {
            Vec3.subtract(_vel, _cur, this.prev);
        }
        const speed = _vel.length();
        if (speed < this.minSpeed) {
            if (this.debug && (this.dbgFrames++ % 60) === 0) {
                console.log(`[ScriptedProjectileHit] скорость ${speed.toFixed(2)} < minSpeed ${this.minSpeed} — луч не бросаю. ${kd.describe()}`);
            }
            this.prev.set(_cur);
            return;
        }

        const now = director.getTotalTime() * 0.001;
        if (now - this.lastHit < this.hitCooldown) {
            this.prev.set(_cur);
            return;
        }

        Vec3.subtract(_dir, _cur, this.prev);
        const segLen = _dir.length();
        if (segLen < 1e-5) return;

        // Защита от телепорта: между выстрелами снаряд перекидывается к дулу
        // (CannonController выставляет ему worldPosition пушки). Такой скачок
        // — не полёт, и трассировать его нельзя: луч длиной через полсцены
        // «попадёт» в случайный блок. Отрезок за кадр физически не может быть
        // сильно длиннее, чем скорость × dt.
        const plausible = speed * Math.max(1 / 240, deltaTime) * 3 + this.lookAhead + 1;
        if (segLen > plausible) {
            if (this.debug) {
                console.log(`[ScriptedProjectileHit] скачок ${segLen.toFixed(2)} > ожидаемых ${plausible.toFixed(2)} — телепорт, кадр пропускаю.`);
            }
            this.prev.set(_cur);
            return;
        }

        _dir.multiplyScalar(1 / segLen);

        // Луч бросаем каждый кадр по отрезку, реально пройденному за кадр,
        // плюс упреждение вперёд — чтобы попадание засчитывалось на кадр
        // раньше визуального касания, а не после того, как снаряд уже влез
        // внутрь блока.
        const t = kd.sweepSegment(this.prev, _dir, segLen + Math.max(0, this.lookAhead), this.projectileRadius);

        if (this.debug) {
            console.log(
                `[ScriptedProjectileHit:${this.node.name}${isValid(this.rb) ? '+rb' : ' БЕЗ rb'}] ` +
                `луч из (${this.prev.x.toFixed(2)}, ${this.prev.y.toFixed(2)}, ${this.prev.z.toFixed(2)}) ` +
                `напр (${_dir.x.toFixed(2)}, ${_dir.y.toFixed(2)}, ${_dir.z.toFixed(2)}) ` +
                `дл.${(segLen + this.lookAhead).toFixed(2)} r=${this.projectileRadius} v=${speed.toFixed(1)} -> ` +
                (t >= 0 ? `ПОПАЛ t=${t.toFixed(2)}` : 'мимо') + ` | ${kd.describe()}`
            );
        }

        if (t >= 0) {
            _hit.set(
                this.prev.x + _dir.x * t,
                this.prev.y + _dir.y * t,
                this.prev.z + _dir.z * t
            );
            this.lastHit = now;
            kd.reportHit(_hit, _dir, speed);

            if (this.stopOnHit && isValid(this.rb)) {
                this.rb.setLinearVelocity(Vec3.ZERO);
            }
        }

        this.prev.set(_cur);
    }
}
