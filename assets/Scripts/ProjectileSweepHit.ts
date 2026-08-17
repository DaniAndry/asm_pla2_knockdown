import {
    _decorator, Component, Node, Vec3, CCFloat, CCInteger, isValid, RigidBody, Collider,
    SphereCollider, PhysicsSystem, geometry, director,
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';
import { RotatingLevelBodies } from './RotatingLevelBodies';
import { findComponentInParents } from './NodeUtils';

const { ccclass, property } = _decorator;

const _prevWorld = new Vec3();
const _cur = new Vec3();
const _dir = new Vec3();
const _vel = new Vec3();
const _push = new Vec3();
const _scale = new Vec3();
const _refl = new Vec3();
const _imp = new Vec3();
const _n = new Vec3();
const _ray = new geometry.Ray();

/**
 * Ручной свип-тест попаданий снаряда вместо встроенного CCD.
 *
 * ЗАЧЕМ. Встроенный useCCD на вращающемся уровне неприменим: свип движка
 * работает внутри шага симуляции и ОБРЕЗАЕТ продвижение тела до точки первого
 * касания. Когда грань сама въезжает в снаряд каждый шаг, продвижение
 * обрезается снова и снова — снаряд замирает в воздухе, а когда грань уходит,
 * летит дальше. Без CCD залипания нет, но быстрый снаряд проскакивает сквозь
 * блоки между кадрами.
 *
 * РЕШЕНИЕ. Проверяем отрезок, пройденный за кадр, сами — вне шага симуляции.
 * Движение снаряда при этом никто не режет, а попадание не теряется.
 *
 * ВАЖНО про реакцию снаряда. Свип находит попадание УЖЕ ПОСЛЕ шага физики,
 * поэтому движок про этот контакт ничего не знает и отскок сам не посчитает:
 * блок ломается, а снаряд летит дальше насквозь. Скорость снаряда после
 * попадания мы обязаны изменить сами — этим занимается applyBounce ниже.
 *
 * Вешать на узел снаряда ВМЕСТО ProjectileCCD.
 */
@ccclass('ProjectileSweepHit')
export class ProjectileSweepHit extends Component {
    @property({
        type: CCFloat,
        tooltip: '0 = взять реальный радиус из SphereCollider с учётом масштаба (рекомендуется). Больше нуля — задать вручную, в мировых единицах.'
    })
    radius: number = 0;

    @property({ type: CCFloat, tooltip: 'Ниже этой скорости свип не делаем (м/с)' })
    minSpeed: number = 3;

    @property({ type: CCFloat, tooltip: 'Потолок правдоподобной скорости. Выше — считаем сбоем физики и кадр пропускаем, чтобы не бить лучом через полсцены.' })
    maxSpeed: number = 150;

    @property({ tooltip: 'Ставить снаряд в точку касания, чтобы он не оказался внутри блока.' })
    correctPosition: boolean = true;

    // ------------------------------------------------------- реакция снаряда

    @property({
        tooltip: 'Гасить и разворачивать скорость снаряда при найденном попадании. ОБЯЗАТЕЛЬНО держать включённым: свип срабатывает после шага физики, движок про этот контакт не знает и отскок не посчитает — без этого блок ломается, а снаряд пролетает насквозь.'
    })
    applyBounce: boolean = true;

    @property({ type: CCFloat, tooltip: 'Какую долю скорости снаряд СОХРАНЯЕТ после попадания. 0.45 = пробивает ещё пару блоков, но уже не улетает рикошетом. Это то же самое, что Hit Speed Keep у ProjectileCCD, — он это поле и выставляет.' })
    bounceKeep: number = 0.45;

    @property({ type: CCFloat, tooltip: 'Потолок вертикальной скорости после удара (м/с). Обрезает вылет в небо.' })
    hitMaxUpSpeed: number = 4;

    @property({
        type: CCFloat,
        tooltip: 'Пол скорости после попаданий (м/с): ниже него удары снаряд больше не замедляют. ОБЯЗАТЕЛЬНО > 0. Bounce Keep умножается на КАЖДОЕ попадание, и в глубине стопки скорость складывается геометрически: 0.45 в четвёртой степени — это 4% от начальной, снаряд просто останавливается в воздухе. Именно это выглядит как «иногда снаряд стал очень медленным». 0 = выключить пол и вернуть старое поведение.'
    })
    minSpeedAfterHit: number = 6;

    @property({ type: CCFloat, tooltip: 'Добавка отскока НАРУЖУ по нормали, м/с. 0 = снаряд просто продолжает лететь медленнее (обычно так и надо). Больше нуля — отбрасывает от поверхности; на вращающемся уровне это как раз и выглядит как «снаряды отлетают, а блоки стоят».' })
    bounce: number = 0;

    @property({ type: CCFloat, tooltip: 'Если после удара скорость упала ниже этого значения — обнулить совсем, чтобы снаряд не полз.' })
    stopBelowSpeed: number = 1.5;

    // -------------------------------------------------------- толчок цели

    @property({
        tooltip: 'Толкать цель импульсом самим. ОБЯЗАТЕЛЬНО на вращающемся уровне: там блоки Kinematic, и обычный контакт их не двигает вообще — снаряд отскакивает, а уровень стоит.'
    })
    pushTarget: boolean = true;

    @property({ type: CCFloat, tooltip: 'Какая доля скорости снаряда передаётся цели. Импульс домножается на массу цели, поэтому тяжёлое сдвинуть труднее. ProjectileCCD выставляет это поле сам.' })
    hitTransfer: number = 0.8;

    // ------------------------------------------------------------- повторы

    @property({ type: CCFloat, tooltip: 'Пауза перед повторным попаданием В ТОТ ЖЕ узел (сек). Это НЕ пауза для свипа — по другим блокам снаряд бьёт сразу, иначе он проскакивает сквозь них.' })
    hitCooldown: number = 0.15;

    @property({ type: CCInteger, tooltip: 'Сколько попаданий разрешено одному снаряду за всю жизнь. 0 = без ограничения.' })
    maxHits: number = 0;

    // -------------------------------------------------------------- фильтры

    @property({
        tooltip: 'Считать попаданием ТОЛЬКО разрушаемые объекты (те, где есть UniversalCollisionHandler). Держите включённым: иначе свип цепляется за пушку, пол и соседние снаряды прямо у дула, и Correct Position дёргает снаряд на месте вместо полёта.'
    })
    onlyDestructibles: boolean = true;

    @property({ type: CCFloat, tooltip: 'Игнорировать попадания ближе этой доли радиуса — снаряд на старте уже пересекается с пушкой, и такие «касания» не должны его останавливать' })
    minHitDistanceFactor: number = 0.6;

    @property({ tooltip: 'Подстрока в имени, по которой узел считается другим снарядом и целью не является' })
    projectileTag: string = 'Projectile';

    @property({ tooltip: 'Писать в консоль результат каждого свипа — видно, ищется ли пересечение и что найдено' })
    debug: boolean = false;

    private rb: RigidBody | null = null;
    private selfCollider: Collider | null = null;
    private hasPrev: boolean = false;
    private hits: number = 0;

    // Кулдаун ПОУЗЛОВОЙ, а не общий.
    //
    // Раньше здесь было одно поле lastHit, и после каждого попадания свип
    // молчал 0.05 с целиком. На скорости 60 м/с это 3 метра непроверенного
    // пути — ровно те «редкие пролёты насквозь», когда снаряд ломает первый
    // блок и проходит второй и третий, не заметив их.
    private recent: { node: Node, t: number }[] = [];

    // Маска НЕ сужается по группе снаряда.
    //
    // Раньше здесь стояло 0xffffffff & ~selfCollider.getGroup() — «не попадать
    // в себя». Но снаряд и блоки в этом проекте лежат в ОДНОЙ группе DEFAULT,
    // поэтому такая маска вычёркивала из поиска ровно то, по чему мы стреляем,
    // и свип честно не находил ничего. Себя отсекаем по узлу, а не по группе.
    private static readonly MASK_ALL: number = 0xffffffff;

    onLoad() {
        this.rb = this.getComponent(RigidBody);
        this.selfCollider = this.getComponent(Collider);
    }

    onEnable() {
        this.node.getWorldPosition(_prevWorld);
        this.hasPrev = true;
        this.hits = 0;
        this.recent.length = 0;
    }

    onDisable() {
        this.hasPrev = false;
        this.recent.length = 0;
    }

    /** Узел принадлежит самому снаряду (он сам или его потомок)? */
    private isSelf(n: Node | null | undefined): boolean {
        let cur = n;
        while (isValid(cur)) {
            if (cur === this.node) return true;
            cur = cur.parent;
        }
        return false;
    }

    /** По этому узлу уже били совсем недавно? */
    private isOnCooldown(n: Node, now: number): boolean {
        for (let i = this.recent.length - 1; i >= 0; i--) {
            const rec = this.recent[i];
            if (now - rec.t > this.hitCooldown || !isValid(rec.node)) {
                this.recent.splice(i, 1);
                continue;
            }
            if (rec.node === n) return true;
        }
        return false;
    }

    /**
     * Годится ли найденный узел как цель.
     *
     * Свип идёт по полной маске (сужать её по группе нельзя — снаряд и блоки
     * лежат в одной группе DEFAULT). Значит фильтровать надо здесь, иначе на
     * старте свип цепляется за корпус пушки и за соседние снаряды у дула, а
     * Correct Position телепортирует снаряд обратно каждый кадр — он дрожит на
     * месте и никуда не летит.
     */
    private isValidTarget(n: Node | null | undefined, distance: number, r: number, now: number): boolean {
        if (!isValid(n)) return false;
        if (this.isSelf(n)) return false;

        // Слишком близкое «касание» — это перекрытие на старте, а не попадание.
        if (distance < r * this.minHitDistanceFactor) return false;

        // Другой снаряд целью не является.
        if (this.projectileTag && n.name.indexOf(this.projectileTag) >= 0) return false;

        if (this.onlyDestructibles) {
            const h = findComponentInParents(n, UniversalCollisionHandler);
            if (!h || h.isDestroyed) return false;
            if (this.isOnCooldown(h.node, now)) return false;
        } else if (this.isOnCooldown(n, now)) {
            return false;
        }
        return true;
    }

    /** Реальный радиус снаряда в мире: коллайдер × мировой масштаб. */
    private resolveRadius(): number {
        if (this.radius > 0) return this.radius;

        const s = this.getComponent(SphereCollider);
        if (!isValid(s)) return 0.5;

        this.node.getWorldScale(_scale);
        const k = Math.max(Math.abs(_scale.x), Math.abs(_scale.y), Math.abs(_scale.z));
        return Math.max(0.01, s.radius * k);
    }

    lateUpdate() {
        if (!this.hasPrev || !isValid(this.rb) || !this.rb.enabled) return;
        if (this.rb.type !== RigidBody.Type.DYNAMIC) {
            this.node.getWorldPosition(_prevWorld);
            return;
        }
        if (this.maxHits > 0 && this.hits >= this.maxHits) {
            this.node.getWorldPosition(_prevWorld);
            return;
        }

        this.node.getWorldPosition(_cur);

        try { this.rb.getLinearVelocity(_vel); } catch { return; }
        const speed = _vel.length();

        if (speed < this.minSpeed || speed > this.maxSpeed) {
            _prevWorld.set(_cur);
            return;
        }

        const now = director.getTotalTime() * 0.001;

        Vec3.subtract(_dir, _cur, _prevWorld);
        const dist = _dir.length();
        const r = this.resolveRadius();

        // За кадр снаряд прошёл меньше своего радиуса — дискретная физика
        // такое столкновение поймает сама, свип не нужен.
        if (dist <= r * 0.9) {
            _prevWorld.set(_cur);
            return;
        }

        _dir.multiplyScalar(1 / dist);
        geometry.Ray.set(_ray, _prevWorld.x, _prevWorld.y, _prevWorld.z, _dir.x, _dir.y, _dir.z);

        const ps = PhysicsSystem.instance;
        if (!ps) { _prevWorld.set(_cur); return; }

        const maxDist = dist + r;
        const mask = ProjectileSweepHit.MASK_ALL;

        // Берём ВСЕ пересечения, а не ближайшее: ближайшим почти всегда
        // окажется собственный коллайдер снаряда, ведь он стоит прямо на луче.
        // Из полного списка выбираем ближайшее чужое.
        let result: any = null;
        let bestDist = Infinity;

        const anyPs = ps as any;
        if (typeof anyPs.sweepSphere === 'function' && anyPs.sweepSphere(_ray, r, mask, maxDist, false)) {
            const list = anyPs.sweepCastResults || [];
            for (let i = 0; i < list.length; i++) {
                const res = list[i];
                if (!res || !isValid(res.collider)) continue;
                if (!this.isValidTarget(res.collider.node, res.distance, r, now)) continue;
                if (res.distance < bestDist) { bestDist = res.distance; result = res; }
            }
        }

        if (!result && ps.raycast(_ray, mask, maxDist, false)) {
            const list = ps.raycastResults || [];
            for (let i = 0; i < list.length; i++) {
                const res = list[i];
                if (!res || !isValid(res.collider)) continue;
                if (!this.isValidTarget(res.collider.node, res.distance, r, now)) continue;
                if (res.distance < bestDist) { bestDist = res.distance; result = res; }
            }
        }

        if (this.debug) {
            console.log(
                `[SweepHit] отрезок=${dist.toFixed(3)} r=${r.toFixed(2)} v=${speed.toFixed(1)} -> ` +
                (result ? `ПОПАЛ в "${result.collider.node.name}" на ${bestDist.toFixed(3)}` : 'ничего не найдено')
            );
        }

        if (!result) {
            _prevWorld.set(_cur);
            return;
        }

        const otherCollider: Collider = result.collider;
        const otherNode: Node = otherCollider.node;

        this.hits++;
        const handler = findComponentInParents(otherNode, UniversalCollisionHandler);
        this.recent.push({ node: handler ? handler.node : otherNode, t: now });

        // Нормаль поверхности. Если движок её не дал — берём встречное
        // направление полёта, это всегда физически осмысленный вариант.
        if (result.hitNormal && result.hitNormal.lengthSqr() > 1e-6) {
            _n.set(result.hitNormal);
            _n.normalize();
            // Нормаль должна смотреть НАВСТРЕЧУ снаряду, иначе отскок
            // получится в ту же сторону, куда он летел.
            if (Vec3.dot(_n, _dir) > 0) _n.multiplyScalar(-1);
        } else {
            _n.set(_dir);
            _n.multiplyScalar(-1);
        }

        if (this.correctPosition && result.hitPoint) {
            // Ставим снаряд вплотную к поверхности со стороны подлёта,
            // чтобы он не оказался внутри блока.
            Vec3.multiplyScalar(_push, _n, r * 1.02);
            Vec3.add(_push, result.hitPoint, _push);
            this.node.setWorldPosition(_push);
            _prevWorld.set(_push);
        } else {
            _prevWorld.set(_cur);
        }

        // ПОРЯДОК ВАЖЕН.
        //
        // Сначала отдаём импульс цели, и только потом — урон. applyExternalHit
        // умеет уничтожить блок прямо в вызове; если звать его первым, толкать
        // будет уже нечего, и получается «снаряд отскочил, ничего не сдвинулось».
        this.notifyHit(otherCollider, speed, _vel);

        // Контакт найден нами вручную уже ПОСЛЕ шага симуляции — движок о нём
        // не знает и скорость снаряда не тронет. Раньше мы только сообщали
        // блоку об уроне и на этом всё: снаряд продолжал лететь с прежней
        // скоростью, а коллайдер блока к следующему кадру уже исчезал, так что
        // и дискретная физика отработать не успевала. Поэтому отскок и потерю
        // скорости считаем сами — но уже ПОСЛЕ передачи импульса, иначе мы
        // отнимаем у снаряда ровно тот импульс, который должен уйти в блок.
        if (this.applyBounce) this.bounceOff(_n, speed);
    }

    /**
     * Скорость снаряда после попадания.
     *
     * ЗАЧЕМ НЕ ОТРАЖЕНИЕ. Сначала здесь было честное зеркальное отражение
     * v' = v − (1+e)(v·n)n. На вращающемся уровне это дало ровно ту картину,
     * что «снаряды отлетают, а блоки не двигаются»: мы разворачивали снаряд
     * НАЗАД в том же кадре, в котором его импульс должен был уйти в блок.
     *
     * Правильнее — как в ProjectileCCD.applyHitDamp: снаряд продолжает лететь
     * ВПЕРЁД, только медленнее (bounceKeep), вертикальная составляющая
     * подрезается, а отскок наружу добавляется только если его явно попросили.
     */
    private bounceOff(normal: Vec3, speed: number) {
        if (!isValid(this.rb)) return;

        _refl.set(_vel);

        if (this.bounce > 0) {
            Vec3.multiplyScalar(_n, normal, this.bounce);
            Vec3.add(_refl, _refl, _n);
        }

        // Замедление с ПОЛОМ.
        //
        // Голое умножение на bounceKeep копится: каждое попадание режет
        // скорость ещё раз, и на четвёртом блоке от неё остаётся 4%. Снаряд
        // как будто «случайно» становится очень медленным — на самом деле он
        // просто прошёл насквозь больше блоков, чем предыдущий. Пол оставляет
        // снаряду пробивную силу, но никогда его не разгоняет.
        const before = _refl.length();
        if (before > 1e-4) {
            let after = before * Math.max(0, Math.min(1, this.bounceKeep));
            if (this.minSpeedAfterHit > 0 && after < this.minSpeedAfterHit) {
                after = Math.min(before, this.minSpeedAfterHit);
            }
            _refl.multiplyScalar(after / before);
        }

        if (_refl.y > this.hitMaxUpSpeed) _refl.y = this.hitMaxUpSpeed;

        if (_refl.length() < this.stopBelowSpeed) _refl.set(0, 0, 0);

        if (this.debug) {
            console.log(`[SweepHit] скорость ${before.toFixed(1)} -> ${_refl.length().toFixed(1)} (попадание #${this.hits})`);
        }

        try {
            this.rb.setLinearVelocity(_refl);
            this.rb.wakeUp();
        } catch { }
    }

    private notifyHit(otherCollider: Collider, speed: number, vel: Vec3) {
        const otherNode = otherCollider.node;
        if (!isValid(otherNode)) return;

        // 1. На вращающемся уровне блок обязан выйти из иерархии и стать
        //    динамическим — иначе он Kinematic, и никакой импульс его не
        //    сдвинет в принципе. Это первым делом.
        let pushed = false;
        const rotating = RotatingLevelBodies.findFor(otherNode);
        if (rotating) {
            try { pushed = rotating.reportExternalHit(otherNode, vel, speed); } catch { }
        }

        // 2. Обычный динамический блок толкаем сами. Свип срабатывает только на
        //    быстрых кадрах, где движок контакт и так пропустил бы, поэтому
        //    двойного толчка тут не возникает.
        if (!pushed && this.pushTarget) this.pushBody(otherCollider, vel);

        // 3. И только теперь урон: applyExternalHit может уничтожить блок
        //    прямо внутри вызова.
        const handler = findComponentInParents(otherNode, UniversalCollisionHandler);
        if (handler && !handler.isDestroyed) {
            const mass = isValid(this.rb) ? this.rb.mass : 1;
            try { handler.applyExternalHit(speed, mass, vel); } catch { }
        }
    }

    /** Передать импульс обычному динамическому телу. */
    private pushBody(col: Collider, vel: Vec3) {
        const rb = col.getComponent(RigidBody) || findComponentInParents(col.node, RigidBody);
        if (!isValid(rb) || rb.type !== RigidBody.Type.DYNAMIC) return;

        // Импульс = масса × приращение скорости. Так hitTransfer читается
        // как «доля скорости снаряда», а тяжёлый блок честно сдвигается меньше.
        const mass = Math.max(0.001, rb.mass);
        Vec3.multiplyScalar(_imp, vel, this.hitTransfer * mass);
        try {
            rb.wakeUp();
            rb.applyImpulse(_imp);
        } catch { }
    }
}
