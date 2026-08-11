import {
    _decorator,
    Component,
    RigidBody,
    Collider,
    BoxCollider,
    ICollisionEvent,
    Vec3,
    Quat,
    CCFloat,
    ParticleSystem,
    Node,
    MeshRenderer,
    instantiate,
    Camera,
    Prefab,
    tween,
    Label,
    isValid,
    director,
    Director,
    Animation,
    AnimationClip,
} from 'cc';
import { SoundManager } from './SoundManager';

const { ccclass, property } = _decorator;

// Переиспользуемые векторы — ноль аллокаций в горячем пути коллизий
const _velA = new Vec3();
const _velB = new Vec3();
const _rel = new Vec3();
const _impulse = new Vec3();
const _tmpPos = new Vec3();
const _tmpScale = new Vec3();
const _tmpQuat = new Quat();

interface WakeRequest { x: number; y: number; z: number; r2: number; }

@ccclass('UniversalCollisionHandler')
export class UniversalCollisionHandler extends Component {
    @property({ type: CCFloat }) health: number = 100;
    @property({ type: CCFloat }) damageThreshold: number = 1;
    @property({ type: CCFloat }) destroyThreshold: number = 10;
    @property({ type: CCFloat }) impactDamageFactor: number = 1;
    @property({ type: CCFloat }) minDamageSpeed: number = 0.5;

    @property({ tooltip: 'ВКЛ = урон/ломание от ударов (снаряд и т.п.). ВЫКЛ = ломается только об Floor' })
    useHealthSystem: boolean = true;

    @property({
        type: CCFloat,
        tooltip: 'Множитель impulse от снаряда, когда Use Health System ВЫКЛ'
    })
    noHealthHitImpulseScale: number = 0.35;

    @property({
        type: CCFloat,
        tooltip: 'Мин. доля Y в направлении knock (чтобы удар не уходил только вверх по нормали стека)'
    })
    noHealthHitForwardBias: number = 0.2;

    @property({ tooltip: 'Название объекта пола для уничтожения с задержкой' })
    floorObjectName: string = 'Floor';

    @property({ tooltip: 'Мин. задержка уничтожения при падении на Floor (сек)' })
    floorDestroyDelayMin: number = 0.3;

    @property({ tooltip: 'Макс. задержка уничтожения при падении на Floor (сек)' })
    floorDestroyDelayMax: number = 0.6;

    @property({ type: Prefab, tooltip: '3D префаб с текстом (Label компонент)' })
    scorePrefab: Prefab = null;

    @property({ type: Prefab, tooltip: 'Префаб партиклов уничтожения' })
    destructionParticlePrefab: Prefab | null = null;

    @property({ type: Node, tooltip: 'Родительский узел для спавна 3D Score' })
    scoreParent: Node | null = null;

    @property({ tooltip: 'Имя записи в SoundManager для звука попадания' })
    hitSoundName: string = 'hitWood';

    @property({ tooltip: 'Имя записи в SoundManager для звука уничтожения (пусто = только hit)' })
    destructionSoundName: string = '';

    @property({ tooltip: 'Кулдаун звука попадания (сек), общий на все объекты' })
    hitSoundCooldown: number = 0.12;

    @property({ tooltip: 'Радиус пробуждения соседей. ВАЖНО: 5 будит весь уровень — держи 1.5–2.5' })
    wakeRadius: number = 2;

    @property({ tooltip: 'Тег снаряда (fallback, если projectileGroup = 0)' })
    projectileTag: string = 'Projectile';

    @property({ tooltip: 'Битовая группа снаряда из Collision Matrix. 0 = сравнивать по имени (медленнее)' })
    projectileGroup: number = 0;

    @property({ tooltip: 'Битовая группа пола. 0 = сравнивать по имени' })
    floorGroup: number = 0;

    @property({ type: CCFloat, tooltip: 'Мин. доля длительности анимации уничтожения' })
    animDurationMinFactor: number = 0.15;

    @property({ type: CCFloat, tooltip: 'Макс. доля длительности анимации уничтожения' })
    animDurationMaxFactor: number = 1.0;

    @property({ type: CCFloat, tooltip: 'Жёсткий потолок жизни объекта после destroy (сек)' })
    maxDestroyLifeDuration: number = 0.55;

    @property({ type: CCFloat, tooltip: 'Длительность растворения (сек)' })
    fadeDestroyDuration: number = 0.2;

    @property({ type: CCFloat, tooltip: 'Длительность жизни без анимации / lite-пути (сек)' })
    liteDestroyLifeDuration: number = 0.22;

    @property({ tooltip: 'Устарело: material fade отключён (ломал GPU instancing). Всегда scale-fade.' })
    useMaterialFade: boolean = false;

    @property({
        tooltip: 'ВКЛ = распад на куски-дети ТОЛЬКО при касании Floor, затем fade прозрачностью'
    })
    shatterIntoMeshPieces: boolean = false;

    @property({ type: CCFloat, tooltip: 'Сила разлёта кусков' })
    shatterImpulse: number = 2.2;

    @property({ type: CCFloat, tooltip: 'Случайный угловой импульс кусков' })
    shatterTorque: number = 4;

    @property({ type: CCFloat, tooltip: 'Масса каждого куска' })
    shatterPieceMass: number = 0.35;

    @property({ type: CCFloat, tooltip: 'Сколько секунд куски живут с физикой до fade' })
    shatterLifeDuration: number = 1.1;

    @property({ type: CCFloat, tooltip: 'Длительность fade кусков после жизни (сек)' })
    shatterFadeDuration: number = 0.35;

    private mainCamera: Camera | null = null;

    private rb: RigidBody | null = null;
    private collider: Collider | null = null;
    /** Кэш детей — getComponentsInChildren на каждый destroy это обход поддерева */
    private cachedRenderers: MeshRenderer[] = [];
    private cachedAnims: Animation[] = [];
    private initialScale: Vec3 = new Vec3(1, 1, 1);

    private lastHitTime: number = 0;
    public isDestroyed: boolean = false;
    private floorDestroyScheduled: boolean = false;
    public scoreValue: number = 0;

    private static lastGlobalHitSoundTime: number = 0;
    private static liveBodies: Set<RigidBody> = new Set();

    private static activeFxCount: number = 0;
    private static readonly MAX_ACTIVE_FX: number = 6;
    private static readonly FADE_STEPS: number = 4;

    // --- Батчер пробуждения соседей ---
    private static wakeQueue: WakeRequest[] = [];
    private static wakeScheduled: boolean = false;
    private static readonly MAX_WAKE_REQUESTS: number = 12;

    // --- Пул score-попапов ---
    private static scorePool: Node[] = [];
    private static activeScorePopups: number = 0;
    private static readonly MAX_ACTIVE_SCORE_POPUPS: number = 8;

    onLoad() {
        this.rb = this.getComponent(RigidBody);
        this.collider = this.getComponent(Collider);

        this.cachedRenderers = this.node.getComponentsInChildren(MeshRenderer);
        this.cachedAnims = this.node.getComponentsInChildren(Animation);
        this.node.getScale(this.initialScale);

        if (this.collider) {
            this.collider.on('onCollisionEnter', this.onCollisionEnter, this);
        }

        if (isValid(this.rb)) {
            UniversalCollisionHandler.liveBodies.add(this.rb);
        }
    }

    public applyLevelSharedRefs(camera: Camera | null) {
        this.mainCamera = camera;
    }

    onDestroy() {
        if (isValid(this.collider)) {
            this.collider.off('onCollisionEnter', this.onCollisionEnter, this);
        }
        if (isValid(this.rb)) {
            UniversalCollisionHandler.liveBodies.delete(this.rb);
        }
        this.cachedRenderers.length = 0;
        this.cachedAnims.length = 0;
    }

    // ------------------------------------------------------------------
    // Коллизии. Порядок проверок — от самой дешёвой к самой дорогой.
    // ------------------------------------------------------------------
    onCollisionEnter(event: ICollisionEvent) {
        if (this.isDestroyed) return;

        const otherCollider = event.otherCollider;
        if (!otherCollider) return;

        if (this.isFloor(otherCollider)) {
            this.scheduleDestroyFromFloor();
            return;
        }

        // Гейт по времени ДО любых getComponent — режет шторм контактов в стеке
        const now = director.getTotalTime() * 0.001;
        if (now - this.lastHitTime < 0.1) return;
        this.lastHitTime = now;

        const isProj = this.isProjectile(otherCollider);
        if (isProj) {
            SoundManager.notifyHit();
            this.playHitSound();
        }

        if (!isValid(this.rb)) return;

        // Без HP: снаряд НЕ ломает и НЕ разбрасывает вручную — только звук.
        // Иначе applyImpulse валит стек, объекты падают на пол и «ломаются от снаряда».
        if (!this.useHealthSystem) {
            return;
        }

        const otherRb = otherCollider.attachedRigidBody;
        if (!isValid(otherRb)) return;

        this.rb.getLinearVelocity(_velA);
        otherRb.getLinearVelocity(_velB);
        Vec3.subtract(_rel, _velA, _velB);

        const speedSqr = _rel.lengthSqr();
        if (speedSqr < this.minDamageSpeed * this.minDamageSpeed) return;

        const speed = Math.sqrt(speedSqr);
        const impactForce = speed * (this.rb.mass + otherRb.mass) * 0.5;
        if (impactForce > this.damageThreshold) {
            this.applyDamage(impactForce * this.impactDamageFactor);
        }
    }

    /**
     * Урон/knock от sweep ProjectileCCD (движок коллизию мог пропустить).
     * hitDir — желательно скорость снаряда.
     */
    public applyExternalHit(impactSpeed: number, otherMass: number, hitDir?: Vec3) {
        if (this.isDestroyed) return;

        const now = director.getTotalTime() * 0.001;
        if (now - this.lastHitTime < 0.05) return;
        this.lastHitTime = now;

        SoundManager.notifyHit();
        this.playHitSound();

        // Без HP — только звук, без импульса и урона
        if (!this.useHealthSystem) {
            return;
        }

        if (impactSpeed < this.minDamageSpeed) return;

        const mass = isValid(this.rb) ? this.rb.mass : 1;
        const impactForce = impactSpeed * (mass + otherMass) * 0.5;
        if (impactForce > this.damageThreshold) {
            this.applyDamage(impactForce * this.impactDamageFactor);
        }
    }

    private isProjectile(other: Collider): boolean {
        if (this.projectileGroup > 0) return (other.getGroup() & this.projectileGroup) !== 0;
        const n = other.node;
        return isValid(n) && n.name.indexOf(this.projectileTag) >= 0;
    }

    private isFloor(other: Collider): boolean {
        if (this.floorGroup > 0) return (other.getGroup() & this.floorGroup) !== 0;
        const n = other.node;
        return isValid(n) && n.name === this.floorObjectName;
    }

    private playHitSound() {
        if (!this.hitSoundName || !SoundManager.hitsEnabled) return;

        const now = director.getTotalTime() * 0.001;
        if (now - UniversalCollisionHandler.lastGlobalHitSoundTime < this.hitSoundCooldown) return;

        UniversalCollisionHandler.lastGlobalHitSoundTime = now;
        SoundManager.playOneShot(this.hitSoundName);
    }

    public scheduleDestroyFromFloor() {
        if (this.isDestroyed || this.floorDestroyScheduled) return;
        this.floorDestroyScheduled = true;

        // Shatter-объекты — сразу при касании пола
        if (this.shatterIntoMeshPieces) {
            this.destroySelf(true);
            return;
        }

        const min = Math.min(this.floorDestroyDelayMin, this.floorDestroyDelayMax);
        const max = Math.max(this.floorDestroyDelayMin, this.floorDestroyDelayMax);
        const delay = min + Math.random() * (max - min);

        this.scheduleOnce(() => {
            if (!this.isDestroyed) this.destroySelf(true);
        }, delay);
    }

    /** Улетел/провалился — считаем уничтоженным для win-check (в т.ч. shatter) */
    public forceDestroyOutOfBounds() {
        if (this.isDestroyed) return;
        this.floorDestroyScheduled = true;
        this.destroySelf(true);
    }

    applyDamage(amount: number) {
        // Без HP-системы снаряды/удары не ломают — только Floor
        if (!this.useHealthSystem) return;
        // Куски-меши тоже только об пол (не от снаряда в воздухе)
        if (this.shatterIntoMeshPieces) return;

        this.health -= amount;
        if (this.health <= 0 || amount > this.destroyThreshold) {
            this.destroySelf(false);
        }
    }

    /**
     * @param fromFloor true = касание Floor (единственный триггер shatter)
     */
    destroySelf(fromFloor: boolean = false) {
        if (this.isDestroyed) return;

        // Shatter только с пола
        if (this.shatterIntoMeshPieces && !fromFloor) return;

        this.isDestroyed = true;
        this.scoreValue = ((Math.random() * 6) | 0) + 5;

        this.node.emit('destroyed', this);

        this.playHitSound();
        if (this.destructionSoundName && this.destructionSoundName !== this.hitSoundName) {
            SoundManager.playOneShot(this.destructionSoundName);
        }

        this.node.getWorldPosition(_tmpPos);

        if (isValid(this.collider)) {
            this.collider.off('onCollisionEnter', this.onCollisionEnter, this);
        }

        UniversalCollisionHandler.queueWake(_tmpPos, this.wakeRadius);
        this.spawnDestructionParticles(_tmpPos);
        this.spawnScorePopup(`+${this.scoreValue}`);

        if (this.shatterIntoMeshPieces) {
            this.shatterMeshPiecesAndFade();
            return;
        }

        const colliders = this.node.getComponentsInChildren(Collider);
        for (const c of colliders) {
            if (isValid(c)) c.enabled = false;
        }

        if (isValid(this.rb)) {
            UniversalCollisionHandler.liveBodies.delete(this.rb);
            this.rb.setAngularVelocity(Vec3.ZERO);
            this.rb.angularFactor = new Vec3(0, 0, 0);
        }

        this.playDestroyAnimationAndFadeOut();
    }

    // ------------------------------------------------------------------
    // Батчер пробуждения: 1 проход по liveBodies за кадр, тело будится 1 раз
    // ------------------------------------------------------------------
    private static queueWake(origin: Vec3, radius: number) {
        if (radius <= 0) return;

        const queue = UniversalCollisionHandler.wakeQueue;
        if (queue.length < UniversalCollisionHandler.MAX_WAKE_REQUESTS) {
            queue.push({ x: origin.x, y: origin.y, z: origin.z, r2: radius * radius });
        }

        if (UniversalCollisionHandler.wakeScheduled) return;
        UniversalCollisionHandler.wakeScheduled = true;
        director.once(Director.EVENT_AFTER_PHYSICS, UniversalCollisionHandler.flushWake);
    }

    private static flushWake = () => {
        UniversalCollisionHandler.wakeScheduled = false;

        const queue = UniversalCollisionHandler.wakeQueue;
        if (queue.length === 0) return;

        for (const rb of UniversalCollisionHandler.liveBodies) {
            if (!isValid(rb) || !rb.enabled || !rb.isDynamic) continue;
            const node = rb.node;
            if (!node || !node.activeInHierarchy) continue;

            node.getWorldPosition(_tmpPos);

            let inRange = false;
            for (let i = 0; i < queue.length; i++) {
                const q = queue[i];
                const dx = _tmpPos.x - q.x;
                const dy = _tmpPos.y - q.y;
                const dz = _tmpPos.z - q.z;
                if (dx * dx + dy * dy + dz * dz <= q.r2) { inRange = true; break; }
            }
            if (!inRange) continue;

            try {
                rb.wakeUp();
                _impulse.set(
                    (Math.random() - 0.5) * 0.2,
                    -Math.max(rb.mass * 0.9, 0.6),
                    (Math.random() - 0.5) * 0.2
                );
                rb.applyImpulse(_impulse);
            } catch {
                // тело ещё не инициализировано
            }
        }

        queue.length = 0;
    };

    // ------------------------------------------------------------------
    // Shatter: куски-дети с коллайдерами (без скелетной анимации)
    // ------------------------------------------------------------------
    private shatterMeshPiecesAndFade() {
        const pieces = this.collectShatterPieces();
        if (pieces.length === 0) {
            // Не нашли куски — fade, не мгновенный hide
            if (isValid(this.rb)) {
                UniversalCollisionHandler.liveBodies.delete(this.rb);
                this.rb.setAngularVelocity(Vec3.ZERO);
                this.rb.angularFactor = new Vec3(0, 0, 0);
            }
            const colliders = this.node.getComponentsInChildren(Collider);
            for (const c of colliders) {
                if (isValid(c)) c.enabled = false;
            }
            this.playLiteDestroyFx(Math.max(0.15, this.liteDestroyLifeDuration));
            return;
        }

        // Скорость родителя до отключения RB
        if (isValid(this.rb)) {
            this.rb.getLinearVelocity(_velA);
            UniversalCollisionHandler.liveBodies.delete(this.rb);
            this.rb.setLinearVelocity(Vec3.ZERO);
            this.rb.setAngularVelocity(Vec3.ZERO);
            this.rb.enabled = false;
        } else {
            _velA.set(0, 0, 0);
        }

        // Корневые коллайдеры выключаем (целое тело больше не сталкивается)
        for (const c of this.node.getComponents(Collider)) {
            if (isValid(c)) c.enabled = false;
        }

        this.node.getWorldPosition(_tmpPos);
        const originX = _tmpPos.x;
        const originY = _tmpPos.y;
        const originZ = _tmpPos.z;
        const parentVx = _velA.x;
        const parentVy = _velA.y;
        const parentVz = _velA.z;

        const scene = this.node.scene;
        const life = Math.max(0.2, this.shatterLifeDuration);
        const fadeDur = Math.max(0.05, this.shatterFadeDuration);
        const scheduler = director.getScheduler();

        // Заранее выключенные куски = debris; «целый» меш прячем ТОЛЬКО после
        // успешного reparent (иначе объект визуально пропадает в никуда).
        const dormant: Node[] = [];
        const living: Node[] = [];
        for (let i = 0; i < pieces.length; i++) {
            const p = pieces[i];
            if (!isValid(p)) continue;
            if (p.active) living.push(p);
            else dormant.push(p);
        }
        const toShatter = dormant.length > 0 ? dormant : living;
        const hideLivingAfter = dormant.length > 0;

        // World TRS корня — якорь для кусков, у которых матрица была stale (inactive)
        this.node.getWorldPosition(_tmpPos);
        const rootWx = _tmpPos.x;
        const rootWy = _tmpPos.y;
        const rootWz = _tmpPos.z;
        this.node.getWorldRotation(_tmpQuat);
        const rootQx = _tmpQuat.x;
        const rootQy = _tmpQuat.y;
        const rootQz = _tmpQuat.z;
        const rootQw = _tmpQuat.w;
        this.node.getWorldScale(_tmpScale);
        const rootSx = _tmpScale.x;
        const rootSy = _tmpScale.y;
        const rootSz = _tmpScale.z;

        const spawned: Node[] = [];

        for (let i = 0; i < toShatter.length; i++) {
            const piece = toShatter[i];
            if (!isValid(piece)) continue;

            if (!this.reparentShatterPieceToScene(piece, scene, rootWx, rootWy, rootWz, rootQx, rootQy, rootQz, rootQw, rootSx, rootSy, rootSz)) {
                continue;
            }

            const pieceRb = this.ensurePieceRigidBody(piece);
            if (!pieceRb) {
                spawned.push(piece);
                continue;
            }

            piece.getWorldPosition(_tmpPos);
            _impulse.set(
                _tmpPos.x - originX,
                _tmpPos.y - originY,
                _tmpPos.z - originZ
            );
            if (_impulse.lengthSqr() < 1e-4) {
                _impulse.set(Math.random() - 0.5, 0.6, Math.random() - 0.5);
            }
            _impulse.normalize();
            _impulse.y = Math.max(_impulse.y, 0.35);
            _impulse.normalize();
            const strength = this.shatterImpulse * (0.75 + Math.random() * 0.5);
            _impulse.multiplyScalar(strength);

            _rel.set(
                (Math.random() - 0.5) * this.shatterTorque,
                (Math.random() - 0.5) * this.shatterTorque,
                (Math.random() - 0.5) * this.shatterTorque
            );

            // RB после addComponent/reparent ещё без onLoad — импульс на след. кадр
            // Kick через scene scheduler: не зависит от жизни компонента корня
            const vx = parentVx;
            const vy = parentVy;
            const vz = parentVz;
            const ix = _impulse.x;
            const iy = _impulse.y;
            const iz = _impulse.z;
            const tx = _rel.x;
            const ty = _rel.y;
            const tz = _rel.z;
            const rbRef = pieceRb;
            const pieceRef = piece;
            const kickTarget = isValid(scene) ? scene : this.node;

            const kick = () => {
                if (!isValid(pieceRef) || !isValid(rbRef) || !rbRef.enabled) return;
                try {
                    if (!(rbRef as any)._isInitialized) {
                        scheduler.schedule(kick, kickTarget, 0, 0, 0, false);
                        return;
                    }
                    rbRef.setLinearVelocity(new Vec3(vx, vy, vz));
                    rbRef.wakeUp();
                    rbRef.applyImpulse(new Vec3(ix, iy, iz));
                    rbRef.setAngularVelocity(new Vec3(tx, ty, tz));

                    // Страховка от solver-взрыва при стартовом overlap
                    rbRef.getLinearVelocity(_velA);
                    const maxSpd = 10;
                    if (_velA.lengthSqr() > maxSpd * maxSpd) {
                        _velA.normalize().multiplyScalar(maxSpd);
                        rbRef.setLinearVelocity(_velA);
                    }
                } catch {
                    scheduler.schedule(kick, kickTarget, 0, 0, 0, false);
                }
            };
            scheduler.schedule(kick, kickTarget, 0, 0, 0, false);

            // Ещё 2 кадра после физики — срезать бешеные скорости от пенетрации
            let clampLeft = 2;
            const clampVel = () => {
                if (!isValid(pieceRef) || !isValid(rbRef) || !rbRef.enabled) return;
                try {
                    rbRef.getLinearVelocity(_velA);
                    const maxSpd = 12;
                    if (_velA.lengthSqr() > maxSpd * maxSpd) {
                        _velA.normalize().multiplyScalar(maxSpd);
                        rbRef.setLinearVelocity(_velA);
                    }
                } catch { /* ignore */ }
                clampLeft--;
                if (clampLeft > 0) {
                    scheduler.schedule(clampVel, kickTarget, 0, 0, 0, false);
                }
            };
            scheduler.schedule(clampVel, kickTarget, 0, 0, 0, false);

            spawned.push(piece);
        }

        // Прячем целый меш только когда хотя бы один кусок успешно вышел в сцену
        if (hideLivingAfter && spawned.length > 0) {
            for (let i = 0; i < living.length; i++) {
                if (isValid(living[i])) living[i].active = false;
            }
        }

        // Cleanup НЕ через this.scheduleOnce — при destroy корня колбэки срывались,
        // осколки оставались в сцене навсегда. Tween на самом piece + scheduler сцены.
        for (let i = 0; i < spawned.length; i++) {
            this.schedulePieceLifetime(spawned[i], life, fadeDur);
        }

        const root = this.node;
        if (isValid(scene)) {
            scheduler.schedule(() => {
                if (isValid(root)) root.destroy();
            }, scene, 0, 0, life + fadeDur + 0.15, false);
        } else {
            this.scheduleOnce(() => {
                if (isValid(root)) root.destroy();
            }, life + fadeDur + 0.15);
        }
    }

    /** Дети с MeshRenderer (включая inactive — куски часто выключены до ломания) */
    private collectShatterPieces(): Node[] {
        const pieces: Node[] = [];
        const renderers = this.node.getComponentsInChildren(MeshRenderer, true);
        for (let i = 0; i < renderers.length; i++) {
            const r = renderers[i];
            if (!isValid(r) || !isValid(r.node)) continue;
            if (r.node === this.node) continue;
            if (pieces.indexOf(r.node) < 0) pieces.push(r.node);
        }
        return pieces;
    }

    /**
     * Inactive-ноды имеют stale world-matrix. setParent(..., true) из такого состояния
     * телепортирует кусок в (0,0,0) / огромный offset — «меш пропал, renderer on».
     * Якорим к world TRS корня (или валидной матрице куска после activate).
     */
    private reparentShatterPieceToScene(
        piece: Node,
        scene: Node | null,
        rootWx: number, rootWy: number, rootWz: number,
        rootQx: number, rootQy: number, rootQz: number, rootQw: number,
        rootSx: number, rootSy: number, rootSz: number,
    ): boolean {
        if (!isValid(piece)) return false;

        piece.active = true;

        // Коллайдеры не включаем здесь — только ensurePieceRigidBody
        // (иначе Conserv/Heavy на миг получают все overlapping box'ы)

        try {
            piece.updateWorldTransform();
        } catch { /* older runtime */ }

        piece.getWorldPosition(_tmpPos);
        piece.getWorldRotation(_tmpQuat);
        piece.getWorldScale(_tmpScale);

        // Если матрица битая/нулевая после inactive — берём TRS корня
        const posBroken = !Number.isFinite(_tmpPos.x + _tmpPos.y + _tmpPos.z)
            || (_tmpPos.lengthSqr() < 1e-8 && (rootWx * rootWx + rootWy * rootWy + rootWz * rootWz) > 1e-4);
        const scaleBroken = !Number.isFinite(_tmpScale.x + _tmpScale.y + _tmpScale.z)
            || Math.abs(_tmpScale.x) + Math.abs(_tmpScale.y) + Math.abs(_tmpScale.z) < 1e-8;

        if (posBroken) {
            _tmpPos.set(rootWx, rootWy, rootWz);
        }
        if (scaleBroken) {
            // Куски часто имеют локальный scale ~0.01 относительно nested prefab —
            // если world scale сломан, ставим разумный от корня
            _tmpScale.set(
                Math.max(Math.abs(rootSx), 0.01) * Math.sign(rootSx || 1),
                Math.max(Math.abs(rootSy), 0.01) * Math.sign(rootSy || 1),
                Math.max(Math.abs(rootSz), 0.01) * Math.sign(rootSz || 1),
            );
        }
        if (!Number.isFinite(_tmpQuat.x + _tmpQuat.y + _tmpQuat.z + _tmpQuat.w)) {
            _tmpQuat.set(rootQx, rootQy, rootQz, rootQw);
        }

        const wpx = _tmpPos.x;
        const wpy = _tmpPos.y;
        const wpz = _tmpPos.z;
        const wqx = _tmpQuat.x;
        const wqy = _tmpQuat.y;
        const wqz = _tmpQuat.z;
        const wqw = _tmpQuat.w;
        const wsx = _tmpScale.x;
        const wsy = _tmpScale.y;
        const wsz = _tmpScale.z;

        if (isValid(scene) && piece.parent !== scene) {
            piece.setParent(scene, false);
        }

        _tmpPos.set(wpx, wpy, wpz);
        _tmpQuat.set(wqx, wqy, wqz, wqw);
        _tmpScale.set(wsx, wsy, wsz);
        piece.setWorldPosition(_tmpPos);
        piece.setWorldRotation(_tmpQuat);
        piece.setWorldScale(_tmpScale);

        // Sanity: далеко от корня = teleport bug после stale matrix
        piece.getWorldPosition(_tmpPos);
        const dx = _tmpPos.x - rootWx;
        const dy = _tmpPos.y - rootWy;
        const dz = _tmpPos.z - rootWz;
        if (dx * dx + dy * dy + dz * dz > 25) {
            _tmpPos.set(rootWx, rootWy, rootWz);
            piece.setWorldPosition(_tmpPos);
        }

        return true;
    }

    /**
     * Conserv: scale ~0.01, коллайдеры уже подогнаны в mesh-space — их и включаем.
     * Heavy: scale ~1, prefab box'ы 1×1 пересекаются → строим box по AABB меша.
     */
    private ensurePieceRigidBody(piece: Node): RigidBody | null {
        if (!isValid(piece)) return null;

        const allCols = piece.getComponentsInChildren(Collider);
        for (let i = 0; i < allCols.length; i++) {
            if (isValid(allCols[i])) allCols[i].enabled = false;
        }

        piece.getWorldScale(_tmpScale);
        const scaleMag = (
            Math.abs(_tmpScale.x) + Math.abs(_tmpScale.y) + Math.abs(_tmpScale.z)
        ) / 3;

        let host = piece;
        const boxes = piece.getComponentsInChildren(BoxCollider);

        if (scaleMag < 0.05 && boxes.length > 0) {
            // Conserv-path: берём самый компактный authored collider
            let best = boxes[0];
            let bestVol = Number.POSITIVE_INFINITY;
            for (let i = 0; i < boxes.length; i++) {
                const b = boxes[i];
                if (!isValid(b)) continue;
                const vol = Math.abs(b.size.x * b.size.y * b.size.z);
                if (vol > 1e-6 && vol < bestVol) {
                    bestVol = vol;
                    best = b;
                }
            }
            best.enabled = true;
            host = best.node;
        } else {
            // Heavy-path: box по bounds меша, без гигантских prefab-пересечений
            let box = piece.getComponent(BoxCollider);
            if (!box) {
                box = piece.addComponent(BoxCollider);
            }

            const size = new Vec3(0.3, 0.3, 0.3);
            const center = new Vec3();
            const mr = piece.getComponent(MeshRenderer) || piece.getComponentInChildren(MeshRenderer);
            if (isValid(mr) && mr.mesh) {
                const min = mr.mesh.minPosition;
                const max = mr.mesh.maxPosition;
                if (min && max) {
                    size.set(
                        Math.max(0.06, Math.abs(max.x - min.x) * 0.85),
                        Math.max(0.06, Math.abs(max.y - min.y) * 0.85),
                        Math.max(0.06, Math.abs(max.z - min.z) * 0.85),
                    );
                    center.set(
                        (max.x + min.x) * 0.5,
                        (max.y + min.y) * 0.5,
                        (max.z + min.z) * 0.5,
                    );
                }
            }
            box.size = size;
            box.center = center;
            box.enabled = true;
            host = piece;
        }

        let rb = host.getComponent(RigidBody);
        if (!rb) {
            rb = host.addComponent(RigidBody);
        }
        if (!isValid(rb)) return null;

        rb.enabled = true;
        rb.type = RigidBody.Type.DYNAMIC;
        rb.useGravity = true;
        rb.allowSleep = true;
        rb.mass = Math.max(0.05, this.shatterPieceMass);
        rb.linearDamping = 0.35;
        rb.angularDamping = 0.45;
        return rb;
    }

    private schedulePieceLifetime(piece: Node, life: number, fadeDur: number) {
        if (!isValid(piece)) return;

        // НЕ трогаем материалы: USE_INSTANCING + mainColor.a на shared/instance
        // делает невидимыми ВСЕ объекты с тем же материалом (баг Level 3).
        piece.getScale(_tmpScale);
        const sx = _tmpScale.x;
        const sy = _tmpScale.y;
        const sz = _tmpScale.z;
        const fade = { t: 0 };

        tween(fade)
            .delay(life)
            .call(() => {
                if (!isValid(piece)) return;
                const pieceRb = piece.getComponent(RigidBody);
                if (isValid(pieceRb)) {
                    try {
                        pieceRb.setLinearVelocity(Vec3.ZERO);
                        pieceRb.setAngularVelocity(Vec3.ZERO);
                    } catch { /* ignore */ }
                    pieceRb.enabled = false;
                }
                const colliders = piece.getComponentsInChildren(Collider);
                for (let i = 0; i < colliders.length; i++) {
                    if (isValid(colliders[i])) colliders[i].enabled = false;
                }
            })
            .to(fadeDur, { t: 1 }, {
                easing: 'quadIn',
                onUpdate: () => {
                    if (!isValid(piece)) return;
                    const k = Math.max(0, 1 - fade.t);
                    piece.setScale(sx * k, sy * k, sz * k);
                },
            })
            .call(() => {
                if (isValid(piece)) piece.destroy();
            })
            .start();
    }

    // ------------------------------------------------------------------
    // FX уничтожения
    // ------------------------------------------------------------------
    private getRandomAnimDurationFactor(): number {
        const min = Math.min(this.animDurationMinFactor, this.animDurationMaxFactor);
        const max = Math.max(this.animDurationMinFactor, this.animDurationMaxFactor);
        const clampedMin = Math.max(0.01, min);
        const clampedMax = Math.max(clampedMin, max);
        return clampedMin + Math.random() * (clampedMax - clampedMin);
    }

    private playDestroyAnimationAndFadeOut() {
        const maxLife = Math.max(0.08, this.maxDestroyLifeDuration);

        const durationFactor = this.getRandomAnimDurationFactor();
        const animDuration = this.playChildDestroyAnimations(durationFactor, maxLife);
        const lifeDuration = Math.min(
            maxLife,
            animDuration > 0 ? animDuration : Math.max(0.05, this.liteDestroyLifeDuration)
        );
        const fadeDuration = Math.min(lifeDuration, Math.max(0.05, this.fadeDestroyDuration));

        this.fadeOutStepped(fadeDuration);
        this.scheduleFinalDestroy(lifeDuration);
    }

    private playLiteDestroyFx(lifeDuration: number) {
        this.fadeOutStepped(Math.min(lifeDuration, Math.max(0.05, this.fadeDestroyDuration)));
        this.scheduleFinalDestroy(lifeDuration);
    }

    private scheduleFinalDestroy(lifeDuration: number) {
        this.scheduleOnce(() => {
            if (isValid(this.node)) this.node.destroy();
        }, lifeDuration);
    }

    private hideMeshes() {
        const renderers = this.cachedRenderers;
        for (let i = 0; i < renderers.length; i++) {
            const r = renderers[i];
            if (isValid(r)) r.enabled = false;
        }
    }

    /**
     * Только scale-fade. Material fade запрещён: на Level 3 один destroy
     * с mainColor.a=0 / transparency ломал GPU instancing и гасил пачку мешей.
     */
    private fadeOutStepped(duration: number) {
        const steps = UniversalCollisionHandler.FADE_STEPS;
        const stepDuration = Math.max(0.01, duration / steps);
        let step = 0;

        const tick = () => {
            if (!isValid(this.node)) return;
            step++;
            const k = Math.max(0, 1 - step / steps);
            _tmpScale.set(
                this.initialScale.x * k,
                this.initialScale.y * k,
                this.initialScale.z * k
            );
            this.node.setScale(_tmpScale);
            if (step < steps) {
                this.scheduleOnce(tick, stepDuration);
            } else {
                this.hideMeshes();
            }
        };

        this.scheduleOnce(tick, stepDuration);
    }

    private playChildDestroyAnimations(durationFactor: number, maxLife: number): number {
        const anims = this.cachedAnims;
        let maxPlayDuration = 0;

        for (let i = 0; i < anims.length; i++) {
            const anim = anims[i];
            if (!isValid(anim)) continue;

            const clip = this.resolveDestroyClip(anim);
            if (!clip || clip.duration <= 0) continue;

            const playDuration = Math.min(clip.duration * durationFactor, maxLife);
            if (playDuration <= 0) continue;

            let state = anim.getState(clip.name);
            if (!state) {
                anim.createState(clip, clip.name);
                state = anim.getState(clip.name);
            }
            if (state) {
                state.wrapMode = AnimationClip.WrapMode.Normal;
                state.speed = clip.duration / playDuration;
            }

            anim.play(clip.name);
            maxPlayDuration = Math.max(maxPlayDuration, playDuration);
        }

        return maxPlayDuration;
    }

    private resolveDestroyClip(anim: Animation): AnimationClip | null {
        if (isValid(anim.defaultClip)) return anim.defaultClip;
        const clips = anim.clips;
        if (!clips || clips.length === 0) return null;
        for (const clip of clips) {
            if (isValid(clip)) return clip;
        }
        return null;
    }

    private spawnDestructionParticles(worldPos: Vec3) {
        if (!isValid(this.destructionParticlePrefab)) return;
        if (UniversalCollisionHandler.activeFxCount >= UniversalCollisionHandler.MAX_ACTIVE_FX) return;

        const scene = this.node.scene;
        if (!isValid(scene)) return;

        const fxNode = instantiate(this.destructionParticlePrefab);
        if (!isValid(fxNode)) return;

        UniversalCollisionHandler.activeFxCount++;
        scene.addChild(fxNode);
        fxNode.setWorldPosition(worldPos);

        let maxLife = 0.8;
        const systems = fxNode.getComponentsInChildren(ParticleSystem);
        for (const ps of systems) {
            if (!isValid(ps)) continue;
            const lifetime = ps.startLifetime?.constant ?? 0;
            maxLife = Math.max(maxLife, (ps.duration || 0) + lifetime + 0.15);
            ps.play();
        }

        tween(fxNode)
            .delay(maxLife)
            .call(() => {
                UniversalCollisionHandler.activeFxCount = Math.max(0, UniversalCollisionHandler.activeFxCount - 1);
                if (isValid(fxNode)) fxNode.destroy();
            })
            .start();
    }

    /** Пул + лимит: 100 одновременных Label = 100 draw call'ов и 100 instantiate */
    spawnScorePopup(text: string) {
        if (!isValid(this.scorePrefab)) return;
        if (UniversalCollisionHandler.activeScorePopups >= UniversalCollisionHandler.MAX_ACTIVE_SCORE_POPUPS) return;

        const parent = isValid(this.scoreParent) ? this.scoreParent : this.node.scene;
        if (!isValid(parent)) return;

        let scoreNode: Node | null = null;
        const pool = UniversalCollisionHandler.scorePool;
        while (pool.length > 0) {
            const candidate = pool.pop();
            if (isValid(candidate)) { scoreNode = candidate; break; }
        }
        if (!scoreNode) {
            scoreNode = instantiate(this.scorePrefab);
            if (!isValid(scoreNode)) return;
        }

        UniversalCollisionHandler.activeScorePopups++;

        if (scoreNode.parent !== parent) parent.addChild(scoreNode);
        scoreNode.active = true;

        this.node.getWorldPosition(_tmpPos);
        _tmpPos.y += 1;
        scoreNode.setWorldPosition(_tmpPos);

        const label = scoreNode.getComponentInChildren(Label);
        if (isValid(label)) label.string = text;

        const billboard = scoreNode.getComponent('BillboardText');
        const camera = isValid(this.mainCamera) ? this.mainCamera : Camera.main;
        if (isValid(billboard) && isValid(camera)) {
            (billboard as any).targetCamera = camera;
        }

        const released = scoreNode;
        tween(released)
            .by(0.6, { worldPosition: new Vec3(0, 2, 0) }, { easing: 'quadOut' })
            .call(() => {
                UniversalCollisionHandler.activeScorePopups = Math.max(0, UniversalCollisionHandler.activeScorePopups - 1);
                if (isValid(released)) {
                    released.active = false;
                    UniversalCollisionHandler.scorePool.push(released);
                }
            })
            .start();
    }

    /** Вызывать при смене/перезапуске уровня, иначе статика утечёт между сценами */
    public static resetStatics() {
        UniversalCollisionHandler.liveBodies.clear();
        UniversalCollisionHandler.wakeQueue.length = 0;
        UniversalCollisionHandler.wakeScheduled = false;
        UniversalCollisionHandler.activeFxCount = 0;
        UniversalCollisionHandler.activeScorePopups = 0;
        UniversalCollisionHandler.scorePool.length = 0;
    }
}
