import {
    _decorator, Component, Node, Vec3, Mat4, CCFloat, CCInteger, isValid,
    RigidBody, Collider, BoxCollider, MeshRenderer,
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';

const { ccclass, property } = _decorator;

const _p = new Vec3();
const _s = new Vec3();
const _tmp = new Vec3();
const _mat = new Mat4();
const _corner = new Vec3();

interface Block {
    node: Node;
    handler: UniversalCollisionHandler;
    // Мировой AABB в покое (пока блок стоит). Пересчитывать его каждый кадр
    // не нужно: пока блок не тронут, он неподвижен, а как только полетел —
    // он больше не участвует ни в поиске попадания, ни в графе опор.
    minX: number; minY: number; minZ: number;
    maxX: number; maxY: number; maxZ: number;
    cx: number; cy: number; cz: number;

    supporters: number;   // сколько блоков под ним ещё стоит на месте
    above: Block[];       // кого держит он сам
    falling: boolean;
    dead: boolean;

    vx: number; vy: number; vz: number;
    sx: number; sy: number; sz: number;   // угловая скорость (град/сек)
    ex: number; ey: number; ez: number;   // накопленный поворот
    delay: number;                        // задержка до начала падения
}

/**
 * Обрушение БЕЗ физики.
 *
 * Все блоки уровня лишаются RigidBody и Collider — в физическом мире их
 * просто нет, поэтому ни broadphase, ни solver на них ничего не тратят.
 * Вместо этого:
 *   - попадание ищется математически (отрезок против AABB, чистый JS);
 *   - падение считается вручную (скорость + гравитация + кувырок);
 *   - обрушение расходится по графу опор: у блока считается, сколько блоков
 *     под ним ещё стоит; когда опор не остаётся — он начинает падать.
 *
 * Снаряд НЕ трогаем: одно динамическое тело стоит копейки, а пушка и
 * траектория продолжают работать как раньше.
 *
 * Вешать на тот же узел, где LevelManager.
 */
@ccclass('ScriptedKnockdown')
export class ScriptedKnockdown extends Component {
    @property({ type: Node, tooltip: 'Родительский узел со всеми разрушаемыми объектами (как в LevelManager)' })
    destructiblesParent: Node = null;

    @property({ tooltip: 'Снять RigidBody/Collider со всех блоков при старте. Это и есть переход в режим "без физики".' })
    stripPhysicsFromBlocks: boolean = true;

    @property({ type: CCFloat, tooltip: 'Гравитация для скриптового падения (м/с²), со знаком минус' })
    gravityY: number = -18;

    @property({ type: CCFloat, tooltip: 'Радиус поражения от точки попадания снаряда (в мировых единицах)' })
    hitRadius: number = 1.6;

    @property({ type: CCFloat, tooltip: 'Сила разлёта блоков от точки попадания' })
    knockPower: number = 6;

    @property({ type: CCFloat, tooltip: 'Доля скорости снаряда, передаваемая блокам вдоль его направления' })
    forwardTransfer: number = 0.35;

    @property({ type: CCFloat, tooltip: 'Максимальная угловая скорость кувырка (град/сек)' })
    maxSpin: number = 320;

    @property({ tooltip: 'Определять уровень пола автоматически по самому нижнему блоку уровня. РЕКОМЕНДУЕТСЯ: у разных уровней пирамида стоит на разной высоте (в Level_2 низ на −2.57, а не на 0), и неверный Floor Y ломает и проверку опор, и момент разрушения.' })
    autoFloorY: boolean = true;

    @property({
        type: CCFloat,
        visible: function (this: any) { return !this.autoFloorY; },
        tooltip: 'Y пола: ниже этого уровня блок считается упавшим и разрушается (запускается шаттер)'
    })
    floorY: number = 0;

    @property({ type: CCFloat, tooltip: 'Разброс задержки перед падением блока, потерявшего опору (сек). Даёт эффект каскада, а не одновременного схлопывания.' })
    cascadeDelay: number = 0.08;

    @property({ type: CCFloat, tooltip: 'Допуск по вертикали при поиске опор: насколько верх нижнего блока может отстоять от низа верхнего' })
    supportTolerance: number = 0.12;

    @property({ type: CCInteger, tooltip: 'Ограничение числа одновременно падающих блоков (0 = без ограничения). Страховка от разового обвала всего уровня.' })
    maxFalling: number = 0;

    @property({ type: CCFloat, tooltip: 'Боковой разлёт блока, потерявшего опору. Без этого блоки просто оседают строго вниз столбиком — с этим они разъезжаются в стороны, как при настоящем обвале.' })
    cascadeSideScatter: number = 2.6;

    @property({ type: CCFloat, tooltip: 'Случайная добавка к боковому разлёту (доля от Cascade Side Scatter), чтобы обвал не выглядел одинаковым' })
    cascadeSideRandom: number = 0.6;

    @property({ type: CCFloat, tooltip: 'Подброс вверх при потере опоры — небольшой, чтобы блок «сваливался», а не проваливался' })
    cascadeLift: number = 0.8;

    @property({ type: CCFloat, tooltip: 'Луч вниз: на сколько ниже блока искать опору. Больше допуска опор — иначе блоки с неровной укладкой будут срываться сами.' })
    supportProbeDistance: number = 0.25;

    @property({ type: CCInteger, tooltip: 'Сколько стоящих блоков проверять лучом вниз за кадр (round-robin). 0 = ВЫКЛЮЧЕНО (значение по умолчанию). Это страховка от «висящих» блоков, но она же способна уронить уровень сама, если геометрия опор посчитана неточно — включайте только если реально видите зависшие блоки, и следите за результатом.' })
    supportChecksPerFrame: number = 0;

    private blocks: Block[] = [];
    private falling: Block[] = [];
    private probeCursor: number = 0;

    // Все уровни живут в ОДНОЙ сцене и переключаются через level.active
    // (см. LevelSwitcher). Значит на сцене может быть несколько
    // ScriptedKnockdown — по одному на уровень — и снаряду нужен тот, чей
    // уровень сейчас активен, а не первый попавшийся.
    private static instances: ScriptedKnockdown[] = [];

    public static getActive(): ScriptedKnockdown | null {
        const list = ScriptedKnockdown.instances;
        for (let i = 0; i < list.length; i++) {
            const k = list[i];
            if (isValid(k) && isValid(k.node) && k.node.activeInHierarchy) return k;
        }
        return null;
    }

    onEnable() {
        if (ScriptedKnockdown.instances.indexOf(this) < 0) {
            ScriptedKnockdown.instances.push(this);
        }
        // Пересобираем именно при активации уровня: на момент onLoad блоки
        // соседних уровней ещё неактивны и их трансформы могут быть не те.
        this.rebuild();

        const scene = this.node.scene;
        if (scene) scene.on('level-projectiles-ready', this.onLevelStarted, this);
    }

    onDisable() {
        const i = ScriptedKnockdown.instances.indexOf(this);
        if (i >= 0) ScriptedKnockdown.instances.splice(i, 1);

        const scene = this.node.scene;
        if (scene) scene.off('level-projectiles-ready', this.onLevelStarted, this);
    }

    // LevelManager.startLevel() шлёт это в сцену на каждом старте уровня —
    // подходит и когда ScriptedKnockdown один на всю сцену, а не по одному
    // на уровень.
    private onLevelStarted = () => {
        if (this.node.activeInHierarchy) this.rebuild();
    };

    /** Собрать блоки, снять физику, построить граф опор. */
    public rebuild() {
        this.blocks.length = 0;
        this.falling.length = 0;

        const parent = isValid(this.destructiblesParent) ? this.destructiblesParent : this.node;
        const handlers = parent.getComponentsInChildren(UniversalCollisionHandler);

        for (const h of handlers) {
            if (!isValid(h) || !isValid(h.node)) continue;
            // Блоки выключенных уровней в реестр не берём: их трансформы не
            // актуальны, и попадать по невидимому уровню нельзя.
            if (!h.node.activeInHierarchy) continue;
            if (h.isDestroyed) continue;
            const b = this.makeBlock(h);
            if (b) this.blocks.push(b);
        }

        if (this.stripPhysicsFromBlocks) {
            for (const b of this.blocks) this.stripPhysics(b.node);

            const live = this.countLivePhysics();
            if (live > 0) {
                console.warn(
                    `[ScriptedKnockdown] После снятия физики у ${live} из ${this.blocks.length} блоков она ВСЁ ЕЩЁ включена. ` +
                    `Физика будет каждый шаг переписывать позицию блока, и скриптовое падение работать не сможет. ` +
                    `Скорее всего RigidBody/Collider лежат не на том же узле, что UniversalCollisionHandler.`
                );
            }
        } else {
            console.warn('[ScriptedKnockdown] Strip Physics From Blocks ВЫКЛЮЧЕН — блоки остаются под управлением физики, скриптовое падение работать не будет.');
        }

        // Пол считаем по самому нижнему блоку уровня. Жёсткий 0 неверен:
        // в Level_2 низ пирамиды на −2.57, и с floorY = 0 нижние ряды
        // считались бы висящими в воздухе (а верхние — разрушались бы,
        // не долетев).
        if (this.autoFloorY && this.blocks.length > 0) {
            let lowest = Infinity;
            for (const b of this.blocks) if (b.minY < lowest) lowest = b.minY;
            this.floorY = lowest;
        }

        this.buildSupportGraph();
    }

    private makeBlock(h: UniversalCollisionHandler): Block | null {
        const node = h.node;

        // Локальная коробка блока (центр + полуразмеры) из BoxCollider, а если
        // его нет — из границ меша.
        let hx = 0.5, hy = 0.5, hz = 0.5;
        let ox = 0, oy = 0, oz = 0;

        const box = node.getComponent(BoxCollider);
        if (isValid(box)) {
            hx = Math.abs(box.size.x) * 0.5;
            hy = Math.abs(box.size.y) * 0.5;
            hz = Math.abs(box.size.z) * 0.5;
            ox = box.center.x; oy = box.center.y; oz = box.center.z;
        } else {
            const mr = node.getComponent(MeshRenderer) || node.getComponentInChildren(MeshRenderer);
            if (isValid(mr) && mr.mesh && mr.mesh.minPosition && mr.mesh.maxPosition) {
                const mn = mr.mesh.minPosition, mx = mr.mesh.maxPosition;
                hx = Math.abs(mx.x - mn.x) * 0.5;
                hy = Math.abs(mx.y - mn.y) * 0.5;
                hz = Math.abs(mx.z - mn.z) * 0.5;
                ox = (mx.x + mn.x) * 0.5;
                oy = (mx.y + mn.y) * 0.5;
                oz = (mx.z + mn.z) * 0.5;
            }
        }

        // ВАЖНО: гоняем 8 углов через мировую матрицу узла и берём min/max.
        // Раньше я просто умножал полуразмеры на масштаб — и для любого
        // ПОВЁРНУТОГО блока коробка получалась неверной. Из-за этого проверка
        // опоры не находила соседа под блоком, считала его висящим и роняла —
        // отсюда самопроизвольный развал уровня.
        node.getWorldMatrix(_mat);

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (let i = 0; i < 8; i++) {
            _corner.set(
                ox + ((i & 1) ? hx : -hx),
                oy + ((i & 2) ? hy : -hy),
                oz + ((i & 4) ? hz : -hz)
            );
            Vec3.transformMat4(_corner, _corner, _mat);
            if (_corner.x < minX) minX = _corner.x;
            if (_corner.y < minY) minY = _corner.y;
            if (_corner.z < minZ) minZ = _corner.z;
            if (_corner.x > maxX) maxX = _corner.x;
            if (_corner.y > maxY) maxY = _corner.y;
            if (_corner.z > maxZ) maxZ = _corner.z;
        }

        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;
        const cz = (minZ + maxZ) * 0.5;

        return {
            node, handler: h,
            minX, maxX,
            minY, maxY,
            minZ, maxZ,
            cx, cy, cz,
            supporters: 0, above: [],
            falling: false, dead: false,
            vx: 0, vy: 0, vz: 0,
            sx: 0, sy: 0, sz: 0,
            ex: 0, ey: 0, ez: 0,
            delay: 0,
        };
    }

    private stripPhysics(node: Node) {
        const rb = node.getComponent(RigidBody);
        if (isValid(rb)) rb.enabled = false;

        // Только собственные коллайдеры блока. Коллайдеры осколков внутри
        // префаба и так выключены, а включает их шаттер уже после смерти.
        for (const c of node.getComponents(Collider)) {
            if (isValid(c)) c.enabled = false;
        }
    }

    /**
     * Сколько блоков всё ещё имеют ВКЛЮЧЁННУЮ физику.
     * Это критично: если у блока жив RigidBody, физический движок каждый шаг
     * переписывает трансформ узла, и позиция, которую ставит наш скрипт
     * (setWorldPosition в update), тут же затирается. Со стороны выглядит так,
     * будто блок помечен падающим, но не двигается с места.
     */
    private countLivePhysics(): number {
        let n = 0;
        for (const b of this.blocks) {
            if (!isValid(b.node)) continue;
            const rb = b.node.getComponent(RigidBody);
            if (isValid(rb) && rb.enabled) { n++; continue; }
            for (const c of b.node.getComponents(Collider)) {
                if (isValid(c) && c.enabled) { n++; break; }
            }
        }
        return n;
    }

    /**
     * Кто кого держит: блок B — опора для A, если верх B почти совпадает с
     * низом A и их проекции на XZ пересекаются.
     */
    private buildSupportGraph() {
        const tol = Math.max(0.001, this.supportTolerance);

        for (const a of this.blocks) {
            a.supporters = 0;
            a.above.length = 0;
        }

        for (const a of this.blocks) {
            // Стоит на полу — считается опёртым всегда.
            if (a.minY - this.floorY <= tol) {
                a.supporters++;
                continue;
            }
            for (const b of this.blocks) {
                if (a === b) continue;
                if (Math.abs(b.maxY - a.minY) > tol) continue;
                if (b.maxX <= a.minX || b.minX >= a.maxX) continue;
                if (b.maxZ <= a.minZ || b.minZ >= a.maxZ) continue;
                a.supporters++;
                b.above.push(a);
            }
        }
    }

    /**
     * Сообщить о попадании: точка, направление полёта, скорость снаряда.
     * Вызывается из ScriptedProjectileHit.
     */
    public reportHit(point: Vec3, dir: Vec3, speed: number) {
        const r = Math.max(0.01, this.hitRadius);
        const r2 = r * r;
        const power = this.knockPower * Math.max(0.25, Math.min(3, speed / 12));

        for (const b of this.blocks) {
            if (b.dead || b.falling) continue;
            const dx = b.cx - point.x, dy = b.cy - point.y, dz = b.cz - point.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > r2) continue;

            const d = Math.sqrt(d2) || 0.0001;
            const fall = 1 - d / r;                    // ближе к центру — сильнее
            const k = power * (0.35 + fall);

            this.startFall(b, 0,
                (dx / d) * k + dir.x * speed * this.forwardTransfer,
                (dy / d) * k * 0.5 + Math.abs(dir.y) * speed * 0.1,
                (dz / d) * k + dir.z * speed * this.forwardTransfer);
        }
    }

    private startFall(b: Block, delay: number, vx: number, vy: number, vz: number) {
        if (b.dead || b.falling) return;
        if (this.maxFalling > 0 && this.falling.length >= this.maxFalling) return;

        b.falling = true;
        b.delay = delay;
        b.vx = vx; b.vy = vy; b.vz = vz;
        b.sx = (Math.random() - 0.5) * 2 * this.maxSpin;
        b.sy = (Math.random() - 0.5) * 2 * this.maxSpin;
        b.sz = (Math.random() - 0.5) * 2 * this.maxSpin;
        this.falling.push(b);

        // Он больше не опора — всё, что он держал, может поехать следом.
        for (const up of b.above) {
            if (up.dead || up.falling) continue;
            up.supporters--;
            if (up.supporters <= 0) this.startCascadeFall(up, b);
        }
    }

    /**
     * Блок потерял опору и валится следом за `from`.
     *
     * Раньше он получал только вертикальное падение (и жалкие 30% от скорости
     * опоры), из-за чего верхние ряды оседали строго вниз ровным столбиком.
     * Настоящий обвал так не выглядит: блок соскальзывает В СТОРОНУ от того
     * места, где ушла опора. Поэтому боковую скорость берём как направление
     * «от центра ушедшей опоры к блоку» в плоскости XZ, плюс случайный
     * разброс, плюс небольшой подброс вверх — иначе выглядит как провал.
     */
    private startCascadeFall(b: Block, from: Block) {
        let dx = b.cx - from.cx;
        let dz = b.cz - from.cz;
        let len = Math.sqrt(dx * dx + dz * dz);

        if (len < 1e-3) {
            // Блок стоял ровно по центру опоры — направление берём случайное,
            // иначе он свалится строго вниз.
            const a = Math.random() * Math.PI * 2;
            dx = Math.cos(a); dz = Math.sin(a); len = 1;
        }
        dx /= len; dz /= len;

        const rnd = 1 + (Math.random() - 0.5) * 2 * this.cascadeSideRandom;
        const side = this.cascadeSideScatter * rnd;

        this.startFall(
            b,
            Math.random() * this.cascadeDelay,
            dx * side + from.vx * 0.35,
            this.cascadeLift * Math.random(),
            dz * side + from.vz * 0.35
        );
    }

    /**
     * Есть ли под блоком опора — «луч вниз» против AABB стоящих блоков.
     * Граф опор строится один раз на старте и по допуску, поэтому блоки с
     * неровной укладкой или те, чью опору убрали не через каскад (например
     * снарядом напрямую), могут остаться висеть в воздухе. Эта проверка ловит
     * их постфактум.
     */
    private hasSupportBelow(a: Block): boolean {
        if (a.minY - this.floorY <= this.supportTolerance) return true;

        const probe = Math.max(this.supportTolerance, this.supportProbeDistance);
        const blocks = this.blocks;

        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b === a || b.dead || b.falling) continue;
            // верх b должен быть не ниже, чем на probe под низом a
            const gap = a.minY - b.maxY;
            if (gap > probe || gap < -0.5) continue;
            if (b.maxX <= a.minX || b.minX >= a.maxX) continue;
            if (b.maxZ <= a.minZ || b.minZ >= a.maxZ) continue;
            return true;
        }
        return false;
    }

    /** Round-robin: проверяем небольшую порцию стоящих блоков за кадр. */
    private probeSupports() {
        const n = this.supportChecksPerFrame;
        if (n <= 0 || this.blocks.length === 0) return;

        const total = this.blocks.length;
        const count = Math.min(n, total);

        for (let i = 0; i < count; i++) {
            if (this.probeCursor >= total) this.probeCursor = 0;
            const b = this.blocks[this.probeCursor++];
            if (!b || b.dead || b.falling) continue;
            if (!isValid(b.node)) continue;

            if (!this.hasSupportBelow(b)) {
                // Опоры под ним нет — валим его как каскадный, чтобы он тоже
                // разлетелся в сторону, а не осел строго вниз.
                this.startFall(
                    b,
                    Math.random() * this.cascadeDelay,
                    (Math.random() - 0.5) * this.cascadeSideScatter,
                    this.cascadeLift * Math.random(),
                    (Math.random() - 0.5) * this.cascadeSideScatter
                );
            }
        }
    }

    update(dt: number) {
        this.probeSupports();

        if (this.falling.length === 0) return;
        if (dt > 0.05) dt = 0.05;

        const g = this.gravityY;

        for (let i = this.falling.length - 1; i >= 0; i--) {
            const b = this.falling[i];

            if (b.dead || !isValid(b.node)) {
                this.falling.splice(i, 1);
                continue;
            }

            if (b.delay > 0) {
                b.delay -= dt;
                continue;
            }

            b.vy += g * dt;

            b.node.getWorldPosition(_tmp);
            _tmp.x += b.vx * dt;
            _tmp.y += b.vy * dt;
            _tmp.z += b.vz * dt;
            b.node.setWorldPosition(_tmp);

            b.ex += b.sx * dt;
            b.ey += b.sy * dt;
            b.ez += b.sz * dt;
            b.node.setRotationFromEuler(b.ex, b.ey, b.ez);

            // Долетел до пола — отдаём штатному разрушению (шаттер, звук, очки).
            if (_tmp.y <= this.floorY) {
                b.dead = true;
                this.falling.splice(i, 1);
                if (isValid(b.handler) && !b.handler.isDestroyed) {
                    b.handler.destroySelf('floor');
                }
            }
        }
    }

    /**
     * Пересечение отрезка с AABB стоящих блоков (slab-метод). Возвращает
     * расстояние до ближайшего попадания вдоль луча или -1, если попаданий
     * нет. Живёт здесь, рядом с данными, чтобы снаряду не пришлось лазить во
     * внутренний массив блоков.
     */
    public sweepSegment(origin: Vec3, dir: Vec3, maxDist: number, radius: number): number {
        const blocks = this.blocks;
        if (blocks.length === 0) return -1;

        const r = Math.max(0, radius);
        const invX = dir.x !== 0 ? 1 / dir.x : Infinity;
        const invY = dir.y !== 0 ? 1 / dir.y : Infinity;
        const invZ = dir.z !== 0 ? 1 / dir.z : Infinity;

        let best = -1;

        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.dead || b.falling) continue;

            let t0 = 0;
            let t1 = maxDist;

            let a = (b.minX - r - origin.x) * invX;
            let c = (b.maxX + r - origin.x) * invX;
            if (a > c) { const s = a; a = c; c = s; }
            if (a > t0) t0 = a;
            if (c < t1) t1 = c;
            if (t0 > t1) continue;

            a = (b.minY - r - origin.y) * invY;
            c = (b.maxY + r - origin.y) * invY;
            if (a > c) { const s = a; a = c; c = s; }
            if (a > t0) t0 = a;
            if (c < t1) t1 = c;
            if (t0 > t1) continue;

            a = (b.minZ - r - origin.z) * invZ;
            c = (b.maxZ + r - origin.z) * invZ;
            if (a > c) { const s = a; a = c; c = s; }
            if (a > t0) t0 = a;
            if (c < t1) t1 = c;
            if (t0 > t1) continue;

            if (t0 < 0) t0 = 0;
            if (best < 0 || t0 < best) best = t0;
        }

        return best;
    }

    /** Диагностика: сколько блоков в реестре и границы уровня. */
    public describe(): string {
        if (this.blocks.length === 0) return `blocks=0 (реестр пуст!) floorY=${this.floorY.toFixed(2)}`;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (const b of this.blocks) {
            if (b.minX < minX) minX = b.minX;
            if (b.maxX > maxX) maxX = b.maxX;
            if (b.minY < minY) minY = b.minY;
            if (b.maxY > maxY) maxY = b.maxY;
            if (b.minZ < minZ) minZ = b.minZ;
            if (b.maxZ > maxZ) maxZ = b.maxZ;
        }
        const live = this.countLivePhysics();
        return `blocks=${this.blocks.length} стоит=${this.getStandingCount()} падает=${this.falling.length}` +
            (live > 0 ? ` ⚠ФИЗИКА ЖИВА У ${live}` : ' физика снята') +
            ` floorY=${this.floorY.toFixed(2)}` +
            ` X=[${minX.toFixed(2)}..${maxX.toFixed(2)}]` +
            ` Y=[${minY.toFixed(2)}..${maxY.toFixed(2)}]` +
            ` Z=[${minZ.toFixed(2)}..${maxZ.toFixed(2)}] node=${this.node.name}`;
    }

    /** Сколько блоков ещё стоит (для проверки завершения уровня). */
    public getStandingCount(): number {
        let n = 0;
        for (const b of this.blocks) if (!b.dead && !b.falling) n++;
        return n;
    }
}
