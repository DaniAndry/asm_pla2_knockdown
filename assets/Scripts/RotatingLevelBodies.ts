import {
    _decorator, Component, Node, Vec3, Quat, CCFloat, CCInteger, isValid,
    RigidBody, Collider, ICollisionEvent,
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';

const { ccclass, property } = _decorator;

const _wp = new Vec3();
const _wr = new Quat();
const _ws = new Vec3();
const _vel = new Vec3();
const _imp = new Vec3();
const _a = new Vec3();
const _b = new Vec3();

interface Carried {
    node: Node;
    rb: RigidBody | null;
    collider: Collider | null;
    detached: boolean;
}

/**
 * Корректная физика на ВРАЩАЮЩЕМСЯ уровне.
 *
 * ПРОБЛЕМА. Когда блоки — дети вращающегося узла, их мировые трансформы каждый
 * кадр переписываются снаружи (родитель повернулся — повернулись все). Для
 * физики это не движение, а телепортация: относительная скорость поверхности в
 * контакте нулевая, кэш контактов постоянно рушится. Быстрый снаряд в такой
 * контакт упирается и «зависает» перед блоком, а потом проваливается внутрь.
 *
 * РЕШЕНИЕ, две части.
 *
 * 1. Пока блок катается на уровне, его тело переводится в Kinematic. Это
 *    официальный режим «двигаю кодом»: решатель берёт скорость поверхности из
 *    изменения трансформа, и удар считается правильно — снаряд отскакивает, а
 *    не залипает.
 *
 * 2. В момент попадания блок ВЫХОДИТ из иерархии вращающегося уровня (с
 *    сохранением мирового трансформа), становится Dynamic и получает импульс
 *    от снаряда. Дальше он падает по обычной физике и больше не таскается
 *    вращением родителя.
 *
 * ВАЖНО про «объекты совсем не толкаются». Kinematic-тело импульсами не
 * двигается ВООБЩЕ — движок его просто не интегрирует. Значит на вращающемся
 * уровне единственный способ сдвинуть блок — это провести его через detach().
 * Если detach не вызвался (не нашли блок по узлу коллайдера, не прошёл порог
 * скорости), внешне это выглядит как «снаряд отскочил, а уровень не шелохнулся».
 * Поэтому здесь: поиск блока идёт вверх по иерархии от любого узла, а вместе с
 * задетым блоком оживают и соседи в радиусе — иначе стопка так и висит в
 * воздухе, потому что kinematic-соседи не падают, даже когда опора исчезла.
 *
 * Вешать на узел уровня (тот, что вращается) или рядом, указав ссылки.
 */
@ccclass('RotatingLevelBodies')
export class RotatingLevelBodies extends Component {
    @property({ type: Node, tooltip: 'Вращающийся узел уровня, дети которого — блоки. Пусто = свой узел.' })
    rotatingRoot: Node = null;

    @property({ type: Node, tooltip: 'Куда переносить блок, когда он «ожил». Должен быть НЕподвижным. Пусто = корень сцены.' })
    detachedParent: Node = null;

    @property({ tooltip: 'Переводить стоящие блоки в Kinematic, пока они катаются на уровне. Это и лечит зависание снаряда перед блоком.' })
    makeCarriedKinematic: boolean = true;

    @property({ type: CCFloat, tooltip: 'Какая доля СКОРОСТИ снаряда передаётся блоку при попадании (1 = блок улетает со скоростью снаряда). Импульс домножается на массу блока, поэтому тяжёлые блоки сдвинуть труднее — как в настоящей физике.' })
    hitTransfer: number = 0.55;

    @property({ type: CCFloat, tooltip: 'Дополнительный подброс вверх при попадании, м/с' })
    hitLift: number = 1.5;

    @property({ tooltip: 'Подстрока в имени узла, по которой он считается снарядом' })
    projectileTag: string = 'Projectile';

    @property({ tooltip: 'Отцеплять блок и при столкновении с уже отцепленным (падающим) соседом, а не только от снаряда. Даёт цепную реакцию обвала.' })
    detachOnNeighbourHit: boolean = true;

    @property({ type: CCFloat, tooltip: 'Минимальная скорость столкновения, чтобы блок отцепился (м/с). Отсекает мелкие касания.' })
    minHitSpeed: number = 1.5;

    // ------------------------------------------------------------- обвал

    @property({
        type: CCFloat,
        tooltip: 'Радиус обвала: вместе с задетым блоком в Dynamic переходят соседи в этом радиусе. Без этого стопка висит в воздухе — kinematic-соседи не падают, даже когда опора выбита. 0 = выключить.'
    })
    collapseRadius: number = 2.5;

    @property({ type: CCInteger, tooltip: 'Максимум соседей, оживающих за одно попадание. Ограничивает лавину на плотных уровнях.' })
    collapseMaxPerHit: number = 10;

    @property({ type: CCFloat, tooltip: 'Какая доля импульса достаётся соседу на границе радиуса. Ближние получают больше, дальние — меньше.' })
    collapseTransfer: number = 0.25;

    @property({ type: CCInteger, tooltip: 'Сколько блоков проверять на «уже поехал» за кадр (страховка, если блок сдвинулся не через столкновение). 0 = выключить.' })
    checksPerFrame: number = 12;

    @property({ type: CCFloat, tooltip: 'Скорость, выше которой блок считается ожившим и отцепляется страховочной проверкой' })
    aliveSpeed: number = 0.6;

    @property({ tooltip: 'Логировать каждое отцепление — видно, доходит ли попадание снаряда до блока' })
    debug: boolean = false;

    private carried: Carried[] = [];
    private cursor: number = 0;

    // Все живые экземпляры: нужны, чтобы внешний код (ручной свип снаряда)
    // мог найти тот, что заведует конкретным блоком.
    private static instances: RotatingLevelBodies[] = [];

    /**
     * Найти компонент, под которым лежит данный узел.
     *
     * Поиск идёт ВВЕРХ по иерархии. Раньше сравнивался ровно тот узел, что
     * пришёл, — а свип отдаёт узел КОЛЛАЙДЕРА, который часто висит на потомке
     * блока. Совпадения не было, detach не вызывался, и блок оставался
     * kinematic: снаряд отскакивал, уровень стоял как вкопанный.
     */
    /**
     * Есть ли на сцене хоть один активный вращающийся уровень.
     * Спрашивает ProjectileCCD, чтобы решить, выключать ли нативный CCD.
     */
    public static hasAny(): boolean {
        for (const inst of RotatingLevelBodies.instances) {
            if (!isValid(inst)) continue;
            if (inst.enabled && isValid(inst.node) && inst.node.activeInHierarchy) return true;
        }
        return false;
    }

    public static findFor(node: Node): RotatingLevelBodies | null {
        for (const inst of RotatingLevelBodies.instances) {
            if (!isValid(inst)) continue;
            if (inst.findUp(node)) return inst;
        }
        return null;
    }

    onEnable() {
        if (RotatingLevelBodies.instances.indexOf(this) < 0) {
            RotatingLevelBodies.instances.push(this);
        }
        this.rebuild();
    }

    onDisable() {
        const i = RotatingLevelBodies.instances.indexOf(this);
        if (i >= 0) RotatingLevelBodies.instances.splice(i, 1);
        this.unsubscribeAll();
        this.carried.length = 0;
    }

    public has(node: Node): boolean {
        return this.findUp(node) !== null;
    }

    /**
     * Попадание, обнаруженное НЕ физическим контактом, а ручным свипом снаряда.
     *
     * Нужен отдельный вход: пока блок Kinematic и снаряд летит быстро,
     * onCollisionEnter может не сработать вовсе — контакт между кадрами
     * проскакивает. Свип его находит, но физике об этом ничего не известно,
     * поэтому отцепляем блок явно.
     *
     * @returns true, если блок действительно отцеплен и получил импульс.
     */
    public reportExternalHit(node: Node, vel: Vec3, speed: number): boolean {
        const item = this.findUp(node);
        if (!item || item.detached) return false;
        if (speed < this.minHitSpeed) {
            if (this.debug) console.log(`[RotatingLevel] "${node.name}": скорость ${speed.toFixed(2)} < порога ${this.minHitSpeed}, не отцепляем`);
            return false;
        }
        this.detach(item, vel, this.hitTransfer);
        this.collapseAround(item, vel);
        return true;
    }

    // ------------------------------------------------------------- сборка

    public rebuild() {
        this.unsubscribeAll();
        this.carried.length = 0;
        this.cursor = 0;

        const root = isValid(this.rotatingRoot) ? this.rotatingRoot : this.node;
        const handlers = root.getComponentsInChildren(UniversalCollisionHandler);

        for (const h of handlers) {
            if (!isValid(h) || !isValid(h.node) || h.isDestroyed) continue;
            if (!h.node.activeInHierarchy) continue;

            const rb = h.node.getComponent(RigidBody);
            const col = h.node.getComponent(Collider);

            const item: Carried = { node: h.node, rb, collider: col, detached: false };

            if (this.makeCarriedKinematic && isValid(rb)) {
                // Kinematic, а не Static: Static-тело движок считает вечно
                // неподвижным и не даёт контакту скорость поверхности — именно
                // на этом снаряд и залипал.
                rb.type = RigidBody.Type.KINEMATIC;
                rb.useGravity = false;
            }

            if (isValid(col)) col.on('onCollisionEnter', this.onBlockHit, this);

            this.carried.push(item);
        }

        if (this.debug) console.log(`[RotatingLevel] взято под управление блоков: ${this.carried.length}`);
    }

    private unsubscribeAll() {
        for (const c of this.carried) {
            if (isValid(c.collider)) c.collider.off('onCollisionEnter', this.onBlockHit, this);
        }
    }

    // ------------------------------------------------------------ попадание

    private onBlockHit = (event: ICollisionEvent) => {
        const selfNode = event.selfCollider?.node;
        const otherNode = event.otherCollider?.node;
        if (!isValid(selfNode) || !isValid(otherNode)) return;

        const item = this.findUp(selfNode);
        if (!item || item.detached) return;

        const isProjectile = this.projectileTag && otherNode.name.indexOf(this.projectileTag) >= 0;

        // Сосед считается «живым», если он уже отцеплен и падает.
        let neighbourAlive = false;
        if (!isProjectile && this.detachOnNeighbourHit) {
            const other = this.findUp(otherNode);
            neighbourAlive = !!other && other.detached;
        }

        if (!isProjectile && !neighbourAlive) return;

        // Скорость ударившего — из неё берём и порог, и импульс.
        const otherRb = otherNode.getComponent(RigidBody);
        _vel.set(0, 0, 0);
        if (isValid(otherRb)) {
            try { otherRb.getLinearVelocity(_vel); } catch { }
        }
        const speed = _vel.length();
        if (speed < this.minHitSpeed) return;

        this.detach(item, _vel, this.hitTransfer);
        if (isProjectile) this.collapseAround(item, _vel);
    };

    /** Найти блок, поднимаясь от узла вверх по иерархии. */
    private findUp(node: Node | null): Carried | null {
        let cur: Node | null = node;
        while (isValid(cur)) {
            for (const c of this.carried) {
                if (c.node === cur) return c;
            }
            cur = cur.parent;
        }
        return null;
    }

    /**
     * Оживить соседей вокруг задетого блока.
     *
     * Иначе получается физически бессмысленная картина: выбитый блок улетел, а
     * всё, что на нём стояло, продолжает висеть — kinematic-тело не падает под
     * гравитацией, ему всё равно, что опоры больше нет.
     */
    private collapseAround(origin: Carried, hitVel: Vec3) {
        if (this.collapseRadius <= 0 || this.collapseMaxPerHit <= 0) return;
        if (!isValid(origin.node)) return;

        origin.node.getWorldPosition(_a);
        const r2 = this.collapseRadius * this.collapseRadius;
        let count = 0;

        for (const c of this.carried) {
            if (count >= this.collapseMaxPerHit) break;
            if (c === origin || c.detached || !isValid(c.node)) continue;

            c.node.getWorldPosition(_b);
            const d2 = Vec3.squaredDistance(_a, _b);
            if (d2 > r2) continue;

            // Ближе к точке удара — сильнее толчок.
            const falloff = 1 - Math.sqrt(d2) / this.collapseRadius;
            this.detach(c, hitVel, this.collapseTransfer * falloff);
            count++;
        }

        if (this.debug && count > 0) {
            console.log(`[RotatingLevel] обвал: ожило соседей ${count} вокруг "${origin.node.name}"`);
        }
    }

    /**
     * Вывести блок из иерархии вращающегося уровня и отдать физике.
     *
     * @param transfer доля скорости бьющего, которую получит блок
     */
    private detach(item: Carried, hitVel: Vec3, transfer: number) {
        if (item.detached || !isValid(item.node)) return;
        item.detached = true;

        const node = item.node;

        // Мировой трансформ сохраняем руками: полагаться на флаг
        // keepWorldTransform у setParent не стоит, пока родитель вращается —
        // блок иначе прыгает в момент отцепления.
        node.getWorldPosition(_wp);
        node.getWorldRotation(_wr);
        node.getWorldScale(_ws);

        const target = isValid(this.detachedParent) ? this.detachedParent : node.scene;
        if (target && node.parent !== target) {
            node.setParent(target, true);
            node.setWorldPosition(_wp);
            node.setWorldRotation(_wr);
            node.setWorldScale(_ws);
        }

        const rb = item.rb;
        if (!isValid(rb)) return;

        try {
            rb.type = RigidBody.Type.DYNAMIC;
            rb.useGravity = true;
            rb.wakeUp();

            // Kinematic-тело от удара само не сдвинется, поэтому импульс
            // передаём вручную.
            //
            // Импульс = масса × желаемое приращение скорости. Раньше сюда шла
            // голая скорость снаряда, из-за чего лёгкий блок получал Δv в
            // несколько раз больше скорости снаряда, а тяжёлый — почти ничего:
            // масса влияла ровно наоборот тому, что ожидаешь.
            const mass = Math.max(0.001, rb.mass);
            _imp.set(hitVel);
            _imp.multiplyScalar(transfer);
            _imp.y += this.hitLift * Math.min(1, transfer / Math.max(0.001, this.hitTransfer));
            _imp.multiplyScalar(mass);
            rb.applyImpulse(_imp);

            if (this.debug) {
                console.log(`[RotatingLevel] отцеплен "${node.name}" (масса ${mass.toFixed(2)}, доля ${transfer.toFixed(2)})`);
            }
        } catch (e) {
            console.warn(`[RotatingLevelBodies] Не удалось отдать блок "${node.name}" физике:`, e);
        }
    }

    // ------------------------------------------------------------ страховка

    update() {
        const n = this.checksPerFrame;
        if (n <= 0 || this.carried.length === 0) return;

        const thr = this.aliveSpeed;
        const count = Math.min(n, this.carried.length);

        for (let i = 0; i < count; i++) {
            if (this.cursor >= this.carried.length) this.cursor = 0;
            const item = this.carried[this.cursor++];

            if (!item || item.detached) continue;
            if (!isValid(item.node) || !isValid(item.rb)) continue;
            // Kinematic-тело скорости не набирает — эта проверка нужна только
            // если Kinematic-режим выключен и блоки остались Dynamic.
            if (item.rb.type !== RigidBody.Type.DYNAMIC) continue;

            try {
                item.rb.getLinearVelocity(_vel);
                if (_vel.length() > thr) this.detach(item, _vel, this.hitTransfer);
            } catch { }
        }
    }
}
