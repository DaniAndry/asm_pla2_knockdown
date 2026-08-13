import {
    _decorator, Component, Node, Vec3, Mat4, CCFloat, CCInteger, isValid,
    RigidBody, Collider, BoxCollider, MeshRenderer,
} from 'cc';
import { UniversalCollisionHandler } from './UniversalCollisionHandler';

const { ccclass, property } = _decorator;

const _p = new Vec3();
const _mat = new Mat4();
const _corner = new Vec3();
const _tmp = new Vec3();

interface Block {
    node: Node;
    handler: UniversalCollisionHandler;

    // Полуразмеры коробки (мировые, считаются один раз на старте).
    hx: number; hy: number; hz: number;

    // Текущий центр коробки в мире. Это ведущая величина: позиция узла
    // получается из неё вычитанием off (центр коробки обычно не совпадает
    // с началом координат узла).
    cx: number; cy: number; cz: number;
    offX: number; offY: number; offZ: number;

    vx: number; vy: number; vz: number;

    // Визуальный кувырок. На столкновения не влияет — коробка остаётся
    // осепараллельной. Для playable этой условности достаточно, а честный
    // поворот в разрешении контактов стоил бы кратно дороже.
    sx: number; sy: number; sz: number;
    ex: number; ey: number; ez: number;

    awake: boolean;
    dead: boolean;
    grounded: boolean;
    restTimer: number;
}

/**
 * Самописная физика ящиков без движка.
 *
 * Блоки лишены RigidBody и Collider — в физическом мире их нет вообще.
 * Вместо этого здесь работает простой решатель на осепараллельных коробках:
 *   - спящие блоки не считаются, но участвуют как препятствия;
 *   - разбуженный блок падает под гравитацией и РЕАЛЬНО упирается в соседей
 *     и в пол: пересечение разводится по оси наименьшего проникновения,
 *     скорость вдоль нормали гасится;
 *   - налетая на спящего соседа, блок будит его — так обвал расходится сам,
 *     без графа опор и скриптового каскада;
 *   - успокоившийся и опёртый блок засыпает и перестаёт считаться.
 *
 * Обрушение здесь — следствие гравитации и контактов, а не сценария. Поэтому
 * один удар больше не сносит уровень: то, что осталось опёртым, продолжает
 * стоять.
 *
 * Вешать на тот же узел, где LevelManager.
 */
@ccclass('ScriptedKnockdown')
export class ScriptedKnockdown extends Component {
    @property({ type: Node, tooltip: 'Родительский узел со всеми разрушаемыми объектами (как в LevelManager)' })
    destructiblesParent: Node = null;

    @property({ tooltip: 'Снять RigidBody/Collider со всех блоков при старте — переход в режим собственной физики' })
    stripPhysicsFromBlocks: boolean = true;

    @property({ type: CCFloat, tooltip: 'Гравитация (м/с²), со знаком минус' })
    gravityY: number = -18;

    @property({ type: CCFloat, tooltip: 'Радиус поражения от точки попадания снаряда' })
    hitRadius: number = 1.2;

    @property({ type: CCFloat, tooltip: 'Сила удара снаряда' })
    knockPower: number = 6;

    @property({ type: CCFloat, tooltip: 'Доля скорости снаряда, передаваемая блоку вдоль полёта' })
    forwardTransfer: number = 0.2;

    @property({ type: CCFloat, tooltip: 'Потолок скорости удара, из которой считается импульс — страховка от сбоев физики снаряда' })
    maxImpactSpeed: number = 100;

    @property({ type: CCFloat, tooltip: 'Потолок скорости блока (м/с)' })
    maxBlockSpeed: number = 12;

    @property({ type: CCFloat, tooltip: 'Упругость при столкновении: 0 = ящики гасят удар полностью (как дерево), 0.3 = заметно отскакивают' })
    restitution: number = 0.05;

    @property({ type: CCFloat, tooltip: 'Трение при контакте: насколько гасится скорость ВДОЛЬ поверхности касания. 1 = мгновенно прилипает, 0 = скользит без потерь.' })
    friction: number = 0.35;

    @property({ type: CCFloat, tooltip: 'Какая доля скорости передаётся спящему блоку, когда в него врезаются. Главная ручка «заразности» обвала: меньше = обвал глохнет быстрее.' })
    impactTransfer: number = 0.45;

    @property({ type: CCFloat, tooltip: 'Минимальная скорость столкновения, чтобы разбудить спящий блок (м/с). Выше значение = мелкие касания не будят соседей и уровень не рассыпается от одного удара.' })
    wakeImpactSpeed: number = 2.2;

    @property({ type: CCInteger, tooltip: 'Проходов разрешения контактов за кадр. Больше = стек устойчивее, но дороже. 2–3 обычно достаточно.' })
    solverIterations: number = 3;

    @property({ type: CCFloat, tooltip: 'Скорость, ниже которой опёртый блок начинает засыпать (м/с)' })
    sleepSpeed: number = 0.35;

    @property({ type: CCFloat, tooltip: 'Сколько секунд блок должен быть медленным и опёртым, чтобы заснуть' })
    sleepDelay: number = 0.35;

    @property({ type: CCFloat, tooltip: 'Максимальная угловая скорость кувырка в полёте (град/сек). При касании кувырок гасится.' })
    maxSpin: number = 200;

    @property({ tooltip: 'Определять уровень пола автоматически по самому нижнему блоку' })
    autoFloorY: boolean = true;

    @property({
        type: CCFloat,
        visible: function (this: any) { return !this.autoFloorY; },
        tooltip: 'Y пола'
    })
    floorY: number = 0;

    @property({ tooltip: 'Разрушать блок (шаттер/очки), когда он улёгся на полу и заснул' })
    destroyOnFloorRest: boolean = true;

    @property({ tooltip: 'Печатать отчёт о попадании' })
    debug: boolean = false;

    private blocks: Block[] = [];
    private awake: Block[] = [];
    private lastSweepIndex: number = -1;

    // Горизонтальное направление последнего выстрела — по нему отсекается
    // движение навстречу стрелку при передаче удара.
    private impactDirX: number = 0;
    private impactDirZ: number = -1;

    // Равномерная сетка для поиска соседей: без неё каждый разбуженный блок
    // проверялся бы против всех четырёхсот, и при массовом обвале это O(n²).
    private cell: number = 1.5;
    private grid: Map<number, number[]> = new Map();

    private static instances: ScriptedKnockdown[] = [];

    public static getActive(): ScriptedKnockdown | null {
        for (const k of ScriptedKnockdown.instances) {
            if (isValid(k) && isValid(k.node) && k.node.activeInHierarchy) return k;
        }
        return null;
    }

    onEnable() {
        if (ScriptedKnockdown.instances.indexOf(this) < 0) ScriptedKnockdown.instances.push(this);
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

    private onLevelStarted = () => {
        if (this.node.activeInHierarchy) this.rebuild();
    };

    // ---------------------------------------------------------------- сборка

    public rebuild() {
        this.blocks.length = 0;
        this.awake.length = 0;
        this.lastSweepIndex = -1;

        const parent = isValid(this.destructiblesParent) ? this.destructiblesParent : this.node;
        for (const h of parent.getComponentsInChildren(UniversalCollisionHandler)) {
            if (!isValid(h) || !isValid(h.node)) continue;
            if (!h.node.activeInHierarchy || h.isDestroyed) continue;
            const b = this.makeBlock(h);
            if (b) this.blocks.push(b);
        }

        if (this.stripPhysicsFromBlocks) {
            for (const b of this.blocks) this.stripPhysics(b.node);
        }

        if (this.autoFloorY && this.blocks.length > 0) {
            let lowest = Infinity;
            for (const b of this.blocks) lowest = Math.min(lowest, b.cy - b.hy);
            this.floorY = lowest;
        }

        // Размер ячейки — по самому крупному блоку, чтобы сосед всегда
        // находился в пределах смежных ячеек.
        let maxExt = 0.5;
        for (const b of this.blocks) maxExt = Math.max(maxExt, b.hx, b.hy, b.hz);
        this.cell = Math.max(0.5, maxExt * 2.2);

        this.rebuildGrid();
    }

    private makeBlock(h: UniversalCollisionHandler): Block | null {
        const node = h.node;
        const bb = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };

        const box = node.getComponent(BoxCollider);
        if (isValid(box)) {
            node.getWorldMatrix(_mat);
            this.expand(bb, _mat, box.center.x, box.center.y, box.center.z,
                Math.abs(box.size.x) * 0.5, Math.abs(box.size.y) * 0.5, Math.abs(box.size.z) * 0.5);
        } else {
            // Коллайдеров нет — берём объединение ВСЕХ мешей блока. Один
            // произвольный меш брать нельзя: блок собран из кусков-осколков,
            // и первый кусок — лишь малая часть ящика.
            for (const mr of node.getComponentsInChildren(MeshRenderer)) {
                if (!isValid(mr) || !isValid(mr.node) || !mr.mesh) continue;
                const mn = mr.mesh.minPosition, mx = mr.mesh.maxPosition;
                if (!mn || !mx) continue;
                mr.node.getWorldMatrix(_mat);
                this.expand(bb, _mat,
                    (mx.x + mn.x) * 0.5, (mx.y + mn.y) * 0.5, (mx.z + mn.z) * 0.5,
                    Math.abs(mx.x - mn.x) * 0.5, Math.abs(mx.y - mn.y) * 0.5, Math.abs(mx.z - mn.z) * 0.5);
            }
        }

        if (!isFinite(bb.minX)) {
            console.warn(`[ScriptedKnockdown] "${node.name}": нет ни коллайдера, ни меша — пропускаю.`);
            return null;
        }

        const cx = (bb.minX + bb.maxX) * 0.5;
        const cy = (bb.minY + bb.maxY) * 0.5;
        const cz = (bb.minZ + bb.maxZ) * 0.5;
        node.getWorldPosition(_p);

        // Стартовый поворот берём из узла. Обнулять нельзя: ящики в сцене
        // часто повёрнуты, и первый же setRotationFromEuler от нуля давал
        // мгновенный скачок ориентации в момент попадания.
        const e0 = node.eulerAngles;

        return {
            node, handler: h,
            hx: (bb.maxX - bb.minX) * 0.5,
            hy: (bb.maxY - bb.minY) * 0.5,
            hz: (bb.maxZ - bb.minZ) * 0.5,
            cx, cy, cz,
            offX: cx - _p.x, offY: cy - _p.y, offZ: cz - _p.z,
            vx: 0, vy: 0, vz: 0,
            sx: 0, sy: 0, sz: 0,
            ex: e0.x, ey: e0.y, ez: e0.z,
            awake: false, dead: false, grounded: false, restTimer: 0,
        };
    }

    private expand(bb: any, mat: Mat4, ox: number, oy: number, oz: number, hx: number, hy: number, hz: number) {
        for (let i = 0; i < 8; i++) {
            _corner.set(ox + ((i & 1) ? hx : -hx), oy + ((i & 2) ? hy : -hy), oz + ((i & 4) ? hz : -hz));
            Vec3.transformMat4(_corner, _corner, mat);
            if (_corner.x < bb.minX) bb.minX = _corner.x;
            if (_corner.y < bb.minY) bb.minY = _corner.y;
            if (_corner.z < bb.minZ) bb.minZ = _corner.z;
            if (_corner.x > bb.maxX) bb.maxX = _corner.x;
            if (_corner.y > bb.maxY) bb.maxY = _corner.y;
            if (_corner.z > bb.maxZ) bb.maxZ = _corner.z;
        }
    }

    private stripPhysics(node: Node) {
        const rb = node.getComponent(RigidBody);
        if (isValid(rb)) rb.enabled = false;
        for (const c of node.getComponents(Collider)) {
            if (isValid(c)) c.enabled = false;
        }
    }

    // ------------------------------------------------------------------ сетка

    private key(ix: number, iy: number, iz: number): number {
        return (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791);
    }

    private rebuildGrid() {
        this.grid.clear();
        const c = this.cell;
        for (let i = 0; i < this.blocks.length; i++) {
            const b = this.blocks[i];
            if (b.dead) continue;
            const k = this.key(Math.floor(b.cx / c), Math.floor(b.cy / c), Math.floor(b.cz / c));
            let arr = this.grid.get(k);
            if (!arr) { arr = []; this.grid.set(k, arr); }
            arr.push(i);
        }
    }

    // ------------------------------------------------------------- симуляция

    update(dt: number) {
        // Блоки может уничтожать не только наша симуляция: LevelManager сносит
        // вылетевшие за границы уровня (forceDestroyOutOfBounds / killY).
        // Если этого не замечать, исчезнувший блок навсегда остаётся в реестре
        // «твёрдой опорой», и всё, что на нём стояло, зависает в воздухе.
        this.reapDestroyed();

        if (this.awake.length === 0) return;
        if (dt > 0.05) dt = 0.05;

        // Сетка перестраивается каждый кадр целиком: это O(n) и на четырёхстах
        // блоках стоит копейки, зато не нужно следить за переездами между
        // ячейками вручную.
        this.rebuildGrid();

        const g = this.gravityY;

        // 1. Интегрирование
        for (const b of this.awake) {
            if (b.dead) continue;
            b.vy += g * dt;
            b.cx += b.vx * dt;
            b.cy += b.vy * dt;
            b.cz += b.vz * dt;
            b.grounded = false;
        }

        // 2. Разрешение контактов.
        // ВАЖНО: импульс и трение применяются ТОЛЬКО на первом проходе.
        // Позиционную коррекцию повторять полезно (стек становится
        // устойчивее), а вот гашение скорости повторять нельзя: раньше оно
        // срабатывало на каждый контакт в каждой итерации, и при трёх
        // проходах с четырьмя соседями от скорости оставалось полпроцента —
        // ящик глох мгновенно, каким бы сильным ни был удар.
        const iters = Math.max(1, this.solverIterations);
        for (let it = 0; it < iters; it++) {
            const doVel = (it === 0);
            for (const b of this.awake) {
                if (b.dead) continue;
                this.resolveFloor(b, doVel);
                this.resolveNeighbours(b, doVel);
            }
        }

        // 2b. Трение — один раз за кадр и по времени, а не по числу контактов.
        const fr = Math.max(0, Math.min(1, this.friction));
        const keep = Math.pow(1 - fr, dt * 60);
        for (const b of this.awake) {
            if (b.dead || !b.grounded) continue;
            b.vx *= keep;
            b.vz *= keep;
        }

        // 3. Запись трансформов, сон, разрушение
        for (let i = this.awake.length - 1; i >= 0; i--) {
            const b = this.awake[i];

            if (b.dead || !isValid(b.node)) { this.awake.splice(i, 1); continue; }

            const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);

            // Кувырок только пока летим; при касании гасим, иначе лежащий
            // ящик крутится на месте.
            if (b.grounded) {
                b.sx *= 0.5; b.sy *= 0.5; b.sz *= 0.5;
            }
            b.ex += b.sx * dt; b.ey += b.sy * dt; b.ez += b.sz * dt;

            _tmp.set(b.cx - b.offX, b.cy - b.offY, b.cz - b.offZ);
            b.node.setWorldPosition(_tmp);
            b.node.setRotationFromEuler(b.ex, b.ey, b.ez);

            if (b.grounded && sp < this.sleepSpeed) {
                b.restTimer += dt;
                if (b.restTimer >= this.sleepDelay) {
                    b.awake = false;
                    b.vx = b.vy = b.vz = 0;
                    b.sx = b.sy = b.sz = 0;
                    this.awake.splice(i, 1);

                    // Улёгся на самом полу — отдаём штатному разрушению.
                    if (this.destroyOnFloorRest && (b.cy - b.hy) <= this.floorY + 0.05) {
                        b.dead = true;
                        // Исчезающий блок больше не опора: всё, что на нём
                        // стояло, обязано поехать вниз, иначе зависнет.
                        this.wakeSupported(b);
                        if (isValid(b.handler) && !b.handler.isDestroyed) b.handler.destroySelf('floor');
                    }
                }
            } else {
                b.restTimer = 0;
            }
        }
    }

    /**
     * Ищет блоки, уничтоженные вне нашей симуляции, помечает их мёртвыми и
     * будит всё, что на них опиралось. Проверка дешёвая — два обращения к
     * полю на блок, — поэтому гоняем её каждый кадр.
     */
    private reapDestroyed() {
        let found = false;
        for (const b of this.blocks) {
            if (b.dead) continue;
            if (isValid(b.node) && isValid(b.handler) && !b.handler.isDestroyed) continue;
            b.dead = true;
            found = true;
        }
        if (!found) return;

        // Сетка могла устареть — перестроим, прежде чем искать опирающихся.
        this.rebuildGrid();
        for (const b of this.blocks) {
            if (b.dead) this.wakeSupported(b);
        }
    }

    private resolveFloor(b: Block, doVel: boolean) {
        const bottom = b.cy - b.hy;
        if (bottom >= this.floorY) return;

        b.cy = this.floorY + b.hy;
        if (doVel && b.vy < 0) b.vy = -b.vy * this.restitution;
        b.grounded = true;
    }

    /**
     * Развести блок с соседями. Проникновение убирается по оси, где оно
     * наименьшее, скорость вдоль этой оси гасится. Спящий сосед при
     * достаточно сильном ударе просыпается и получает часть скорости — так
     * обвал распространяется сам собой.
     */
    private resolveNeighbours(a: Block, doVel: boolean) {
        const c = this.cell;
        const ix = Math.floor(a.cx / c), iy = Math.floor(a.cy / c), iz = Math.floor(a.cz / c);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const arr = this.grid.get(this.key(ix + dx, iy + dy, iz + dz));
                    if (!arr) continue;

                    for (let n = 0; n < arr.length; n++) {
                        const b = this.blocks[arr[n]];
                        if (b === a || b.dead) continue;

                        const ox = (a.hx + b.hx) - Math.abs(a.cx - b.cx);
                        if (ox <= 0) continue;
                        const oy = (a.hy + b.hy) - Math.abs(a.cy - b.cy);
                        if (oy <= 0) continue;
                        const oz = (a.hz + b.hz) - Math.abs(a.cz - b.cz);
                        if (oz <= 0) continue;

                        this.resolvePair(a, b, ox, oy, oz, doVel);
                    }
                }
            }
        }
    }

    private resolvePair(a: Block, b: Block, ox: number, oy: number, oz: number, doVel: boolean) {
        // Ось наименьшего проникновения = нормаль контакта.
        let nx = 0, ny = 0, nz = 0, pen = 0;
        if (ox <= oy && ox <= oz) { nx = a.cx < b.cx ? -1 : 1; pen = ox; }
        else if (oy <= oz) { ny = a.cy < b.cy ? -1 : 1; pen = oy; }
        else { nz = a.cz < b.cz ? -1 : 1; pen = oz; }

        const rvx = a.vx - b.vx, rvy = a.vy - b.vy, rvz = a.vz - b.vz;
        const vn = rvx * nx + rvy * ny + rvz * nz;

        const bAsleep = !b.awake;

        // Спящий сосед: он неподвижная опора. Разводим только a, а соседа
        // будим, если удар достаточно сильный.
        if (bAsleep) {
            a.cx += nx * pen; a.cy += ny * pen; a.cz += nz * pen;

            if (doVel && -vn > this.wakeImpactSpeed) {
                const k = this.impactTransfer;
                // Передаваемую скорость чистим от составляющей НАВСТРЕЧУ
                // выстрелу: разбуженный сосед не должен уезжать на стрелка.
                const f = this.forwardOnly(a.vx * k, a.vz * k);
                b.vx = f.x; b.vy = Math.min(0, a.vy) * k; b.vz = f.z;
                b.sx = (Math.random() - 0.5) * this.maxSpin;
                b.sy = (Math.random() - 0.5) * this.maxSpin;
                b.sz = (Math.random() - 0.5) * this.maxSpin;
                this.wake(b);
                // Ударивший теряет ровно столько, сколько отдал.
                a.vx *= (1 - k * 0.6); a.vz *= (1 - k * 0.6);
            }
        } else {
            // Оба в движении — расталкиваем поровну.
            const half = pen * 0.5;
            a.cx += nx * half; a.cy += ny * half; a.cz += nz * half;
            b.cx -= nx * half; b.cy -= ny * half; b.cz -= nz * half;
        }

        // Гасим сближение вдоль нормали — только на первом проходе.
        // Трения здесь НЕТ намеренно: оно применяется один раз за кадр в
        // update(), иначе умножалось бы на каждый контакт в каждой итерации.
        if (doVel && vn < 0) {
            const j = -vn * (1 + this.restitution) * (bAsleep ? 1 : 0.5);
            a.vx += nx * j; a.vy += ny * j; a.vz += nz * j;
            if (!bAsleep) { b.vx -= nx * j; b.vy -= ny * j; b.vz -= nz * j; }
        }

        if (ny > 0) a.grounded = true;   // опёрся сверху на b
        this.clampSpeed(a);
    }

    private clampSpeed(b: Block) {
        const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
        if (s > this.maxBlockSpeed) {
            const k = this.maxBlockSpeed / s;
            b.vx *= k; b.vy *= k; b.vz *= k;
        }
    }

    /**
     * Убирает из горизонтальной скорости составляющую, направленную ПРОТИВ
     * выстрела. Вбок и вперёд — можно, навстречу снаряду — нет.
     */
    private forwardOnly(vx: number, vz: number): { x: number; z: number } {
        const along = vx * this.impactDirX + vz * this.impactDirZ;
        if (along >= 0) return { x: vx, z: vz };
        return { x: vx - along * this.impactDirX, z: vz - along * this.impactDirZ };
    }

    private wake(b: Block) {
        if (b.awake || b.dead) return;
        b.awake = true;
        b.restTimer = 0;
        this.awake.push(b);

        // Тот, кто стоял на нём, теряет опору и должен поехать следом.
        // Без этого верхние ряды зависают в воздухе: спящий блок не
        // считается, и сообщить ему об уходе опоры больше некому — граф
        // опор мы убрали, положившись на контакты, а контакта с уехавшим
        // блоком уже не будет.
        this.wakeSupported(b);
    }

    /** Разбудить всё, что опирается сверху на данный блок. */
    private wakeSupported(b: Block) {
        const c = this.cell;
        const topY = b.cy + b.hy;
        const tol = 0.2;

        const ix = Math.floor(b.cx / c);
        const iz = Math.floor(b.cz / c);
        const iyTop = Math.floor(topY / c);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                for (let dy = 0; dy <= 1; dy++) {
                    const arr = this.grid.get(this.key(ix + dx, iyTop + dy, iz + dz));
                    if (!arr) continue;

                    for (let n = 0; n < arr.length; n++) {
                        const s = this.blocks[arr[n]];
                        if (s === b || s.dead || s.awake) continue;

                        // Низ соседа должен лежать примерно на верхе блока.
                        if (Math.abs((s.cy - s.hy) - topY) > tol) continue;
                        if (Math.abs(s.cx - b.cx) >= s.hx + b.hx) continue;
                        if (Math.abs(s.cz - b.cz) >= s.hz + b.hz) continue;

                        this.wake(s);
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------------- удар

    public reportHit(point: Vec3, dir: Vec3, speed: number) {
        speed = Math.min(Math.max(speed, 0), this.maxImpactSpeed);

        const hl = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
        if (hl > 1e-4) {
            this.impactDirX = dir.x / hl;
            this.impactDirZ = dir.z / hl;
        }

        if (this.debug) {
            console.log(`[ScriptedKnockdown] удар в (${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)}) v=${speed.toFixed(1)}`);
        }

        const power = this.knockPower * Math.max(0.25, Math.min(3, speed / 12));

        // Блок, в который луч попал напрямую — бьём всегда.
        if (this.lastSweepIndex >= 0 && this.lastSweepIndex < this.blocks.length) {
            this.applyImpact(this.blocks[this.lastSweepIndex], dir, speed, power * 1.4);
        }

        // Соседи в радиусе — по расстоянию до коробки, а не до центра.
        const r = Math.max(0.01, this.hitRadius);
        for (const b of this.blocks) {
            if (b.dead) continue;
            const dx = Math.max(Math.abs(point.x - b.cx) - b.hx, 0);
            const dy = Math.max(Math.abs(point.y - b.cy) - b.hy, 0);
            const dz = Math.max(Math.abs(point.z - b.cz) - b.hz, 0);
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d > r) continue;
            this.applyImpact(b, dir, speed, power * (1 - d / r));
        }
    }

    private applyImpact(b: Block, dir: Vec3, speed: number, k: number) {
        if (b.dead) return;
        const push = k + speed * this.forwardTransfer;
        b.vx += dir.x * push;
        b.vy += Math.max(0, dir.y) * push + 0.5;
        b.vz += dir.z * push;
        b.sx = (Math.random() - 0.5) * 2 * this.maxSpin;
        b.sy = (Math.random() - 0.5) * 2 * this.maxSpin;
        b.sz = (Math.random() - 0.5) * 2 * this.maxSpin;
        this.clampSpeed(b);
        this.wake(b);
    }

    // -------------------------------------------------------------- запросы

    public sweepSegment(origin: Vec3, dir: Vec3, maxDist: number, radius: number): number {
        this.lastSweepIndex = -1;
        const blocks = this.blocks;
        if (blocks.length === 0) return -1;

        const r = Math.max(0, radius);
        const invX = dir.x !== 0 ? 1 / dir.x : Infinity;
        const invY = dir.y !== 0 ? 1 / dir.y : Infinity;
        const invZ = dir.z !== 0 ? 1 / dir.z : Infinity;

        let best = -1, bestIdx = -1;

        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (b.dead) continue;

            let t0 = 0, t1 = maxDist;

            let a = (b.cx - b.hx - r - origin.x) * invX;
            let c = (b.cx + b.hx + r - origin.x) * invX;
            if (a > c) { const s = a; a = c; c = s; }
            if (a > t0) t0 = a; if (c < t1) t1 = c;
            if (t0 > t1) continue;

            a = (b.cy - b.hy - r - origin.y) * invY;
            c = (b.cy + b.hy + r - origin.y) * invY;
            if (a > c) { const s = a; a = c; c = s; }
            if (a > t0) t0 = a; if (c < t1) t1 = c;
            if (t0 > t1) continue;

            a = (b.cz - b.hz - r - origin.z) * invZ;
            c = (b.cz + b.hz + r - origin.z) * invZ;
            if (a > c) { const s = a; a = c; c = s; }
            if (a > t0) t0 = a; if (c < t1) t1 = c;
            if (t0 > t1) continue;

            if (t0 < 0) t0 = 0;
            if (best < 0 || t0 < best) { best = t0; bestIdx = i; }
        }

        this.lastSweepIndex = bestIdx;
        return best;
    }

    public getStandingCount(): number {
        let n = 0;
        for (const b of this.blocks) if (!b.dead) n++;
        return n;
    }

    public describe(): string {
        if (this.blocks.length === 0) return 'blocks=0 (реестр пуст!)';
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const b of this.blocks) {
            minX = Math.min(minX, b.cx - b.hx); maxX = Math.max(maxX, b.cx + b.hx);
            minY = Math.min(minY, b.cy - b.hy); maxY = Math.max(maxY, b.cy + b.hy);
            minZ = Math.min(minZ, b.cz - b.hz); maxZ = Math.max(maxZ, b.cz + b.hz);
        }
        return `blocks=${this.blocks.length} живых=${this.getStandingCount()} активных=${this.awake.length}` +
            ` floorY=${this.floorY.toFixed(2)}` +
            ` X=[${minX.toFixed(2)}..${maxX.toFixed(2)}]` +
            ` Y=[${minY.toFixed(2)}..${maxY.toFixed(2)}]` +
            ` Z=[${minZ.toFixed(2)}..${maxZ.toFixed(2)}] node=${this.node.name}`;
    }
}
