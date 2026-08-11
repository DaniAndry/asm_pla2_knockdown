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

const _velA = new Vec3();
const _rel = new Vec3();
const _impulse = new Vec3();
const _tmpPos = new Vec3();
const _tmpScale = new Vec3();
const _tmpQuat = new Quat();

interface WakeRequest { x: number; y: number; z: number; r2: number; }

@ccclass('UniversalCollisionHandler')
export class UniversalCollisionHandler extends Component {
    @property({
        tooltip: 'ВКЛ = ломается сразу от попадания снаряда ИЛИ от Floor. ВЫКЛ = ломается только об Floor.'
    })
    useHealthSystem: boolean = true;

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

    private cachedRenderers: MeshRenderer[] = [];
    private cachedAnims: Animation[] = [];
    private initialScale: Vec3 = new Vec3(1, 1, 1);

    private lastHitTime: number = 0;
    public isDestroyed: boolean = false;
    private floorDestroyScheduled: boolean = false;
    public scoreValue: number = 0;

    private static lastGlobalHitSoundTime: number = 0;
    private static liveBodies: Set<RigidBody> = new Set();
    
    private static readonly MAX_LINEAR_SPEED: number = 18;
    private static velocitySafetyRegistered: boolean = false;
    private static sceneResetRegistered: boolean = false;

    private static readonly MAX_STEP_DISTANCE: number = 6;
    private static lastGoodPos: Map<RigidBody, Vec3> = new Map();

    // Печатать в консоль причину каждого уничтожения объекта (floor / hit /
    // outOfBounds / physicsGlitch / unknown) — помогает понять, откуда именно
    // объект сломался. Можно выключить.
    public static debugLogDestroy: boolean = true;

    private static activeFxCount: number = 0;
    private static readonly MAX_ACTIVE_FX: number = 6;
    private static readonly FADE_STEPS: number = 4;


    private static wakeQueue: WakeRequest[] = [];
    private static wakeScheduled: boolean = false;
    private static readonly MAX_WAKE_REQUESTS: number = 12;


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

        if (!UniversalCollisionHandler.velocitySafetyRegistered) {
            UniversalCollisionHandler.velocitySafetyRegistered = true;
            director.on(Director.EVENT_AFTER_PHYSICS, UniversalCollisionHandler.clampAllVelocities);
        }

        // ВАЖНО: liveBodies/lastGoodPos/wakeQueue/scorePool и т.д. — static,
        // общие на все инстансы и НЕ привязаны к жизни конкретной сцены.
        // EVENT_AFTER_PHYSICS-листенер выше регистрируется один раз навсегда
        // (director переживает рестарт/перезагрузку сцены). Если при
        // Restart в редакторе где-то в этих static-коллекциях остаётся
        // "протухшая" ссылка на RigidBody/Node из уже уничтожаемой старой
        // сцены, а физический шаг успевает сработать в этот момент —
        // clampAllVelocities()/destroyUnstableBody() может попытаться второй
        // раз destroy() узел, который движок и так уже разрушает как часть
        // обычной уборки старой сцены — отсюда "Error 5000: destroy object
        // twice". Поэтому чистим все static-коллекции ровно один раз перед
        // запуском КАЖДОЙ новой сцены (EVENT_BEFORE_SCENE_LAUNCH), пока новые
        // объекты ещё не успели зарегистрироваться в onLoad().
        if (!UniversalCollisionHandler.sceneResetRegistered) {
            UniversalCollisionHandler.sceneResetRegistered = true;
            director.on(Director.EVENT_BEFORE_SCENE_LAUNCH, UniversalCollisionHandler.resetStatics);
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
            UniversalCollisionHandler.lastGoodPos.delete(this.rb);
        }
        this.cachedRenderers.length = 0;
        this.cachedAnims.length = 0;
    }




    onCollisionEnter(event: ICollisionEvent) {
        if (this.isDestroyed) return;

        const otherCollider = event.otherCollider;
        if (!otherCollider) return;

        // Проверка "это пол?" раньше делал каждый разрушаемый объект сам —
        // при плотном стеке это лишняя работа на каждое столкновение (а их
        // может быть десятки в кадр). Теперь за это отвечает один компонент
        // FloorCollisionDestroyer, повешенный на сам Floor: он сам находит
        // UniversalCollisionHandler объекта, который в него врезался, и
        // вызывает scheduleDestroyFromFloor() — см. FloorCollisionDestroyer.ts.

        const now = director.getTotalTime() * 0.001;
        if (now - this.lastHitTime < 0.1) return;
        this.lastHitTime = now;

        const isProj = this.isProjectile(otherCollider);
        if (isProj) {
            SoundManager.notifyHit();
            this.playHitSound();
        }

        // Упрощённая логика (без health/порогов урона):
        // Use Health System ВЫКЛ — ломается ТОЛЬКО об Floor (см.
        // scheduleDestroyFromFloor/FloorCollisionDestroyer.ts).
        // Use Health System ВКЛ — ломается сразу от любого попадания снаряда
        // (плюс по-прежнему может сломаться и об Floor).
        if (!this.useHealthSystem) return;
        if (!isProj) return;
        if (!SoundManager.hitsEnabled) return; // не считаем удары во время усадки стека на старте уровня

        this.destroySelf('hit');
    }


    public applyExternalHit(impactSpeed: number, otherMass: number, hitDir?: Vec3) {
        if (this.isDestroyed) return;

        const now = director.getTotalTime() * 0.001;
        if (now - this.lastHitTime < 0.05) return;
        this.lastHitTime = now;

        SoundManager.notifyHit();
        this.playHitSound();

        // См. комментарий в onCollisionEnter. applyExternalHit всегда
        // вызывается из ProjectileCCD (sweep-попадание снаряда), так что
        // проверка "это снаряд?" тут не нужна.
        if (!this.useHealthSystem) return;
        if (!SoundManager.hitsEnabled) return;

        this.destroySelf('hit');
    }

    private isProjectile(other: Collider): boolean {
        if (this.projectileGroup > 0) return (other.getGroup() & this.projectileGroup) !== 0;
        const n = other.node;
        return isValid(n) && n.name.indexOf(this.projectileTag) >= 0;
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

        // Пока идёт первоначальная "усадка" стека под гравитацией (CannonController
        // держит физику разморожённой settleDuration секунд перед первым выстрелом
        // и именно на это время выключает звук ударов через SoundManager.disableHits()),
        // объекты могут задеть Floor чисто из-за исходного перекрытия коллайдеров
        // на большом уровне — это НЕ игровое попадание. Раньше это всё равно считалось
        // разрушением, из-за чего часть уровня (особенно 3-й, самый плотный) могла
        // "само-разрушиться" в первую секунду и уровень засчитывался пройденным.
        if (!SoundManager.hitsEnabled) return;

        this.floorDestroyScheduled = true;


        if (this.shatterIntoMeshPieces) {
            // Шаттеринг запускается СРАЗУ при касании пола, без задержки.
            this.destroySelf('floor');
            return;
        }

        const min = Math.min(this.floorDestroyDelayMin, this.floorDestroyDelayMax);
        const max = Math.max(this.floorDestroyDelayMin, this.floorDestroyDelayMax);
        const delay = min + Math.random() * (max - min);

        this.scheduleOnce(() => {
            if (!this.isDestroyed) this.destroySelf('floor');
        }, delay);
    }


    public forceDestroyOutOfBounds() {
        if (this.isDestroyed) return;
        this.floorDestroyScheduled = true;
        this.destroySelf('outOfBounds');
    }


    destroySelf(reason: string = 'unknown') {
        if (this.isDestroyed) return;

        if (UniversalCollisionHandler.debugLogDestroy) {
            console.log(`[UniversalCollisionHandler] "${this.node.name}" destroyed. reason=${reason}, useHealthSystem=${this.useHealthSystem}`);
        }

        // "Вылет за пределы уровня" (killY / outOfBoundsXZ в LevelManager) и
        // "физический глюк" (телепорт/NaN за один шаг, см. destroyUnstableBody)
        // — это фоновая уборка, а не игровое разрушение: объект ни во что не
        // попал. Раньше в этом случае всё равно проигрывался звук удара,
        // партиклы и score-попап — из-за этого казалось, что объект с
        // useHealthSystem = false "ломается непонятно от чего".
        const isCleanupOnly = reason === 'outOfBounds' || reason === 'physicsGlitch';

        this.isDestroyed = true;
        this.scoreValue = isCleanupOnly ? 0 : ((Math.random() * 6) | 0) + 5;

        this.node.emit('destroyed', this);

        if (!isCleanupOnly) {
            this.playHitSound();
            if (this.destructionSoundName && this.destructionSoundName !== this.hitSoundName) {
                SoundManager.playOneShot(this.destructionSoundName);
            }
        }

        this.node.getWorldPosition(_tmpPos);

        if (isValid(this.collider)) {
            this.collider.off('onCollisionEnter', this.onCollisionEnter, this);
        }

        if (!isCleanupOnly) {
            UniversalCollisionHandler.queueWake(_tmpPos, this.wakeRadius);
            this.spawnDestructionParticles(_tmpPos);
            this.spawnScorePopup(`+${this.scoreValue}`);
        }

        if (isCleanupOnly) {
            // Тихая уборка (вылет за пределы уровня / физический глюк): без
            // шаттера на куски — не создаём новые физические тела на объекте,
            // который и так уже был нестабилен, и без анимации/fade — объект
            // всё равно должен быть незаметен для игрока.
            const colliders = this.node.getComponentsInChildren(Collider);
            for (const c of colliders) {
                if (isValid(c)) c.enabled = false;
            }
            if (isValid(this.rb)) {
                UniversalCollisionHandler.liveBodies.delete(this.rb);
                try {
                    this.rb.setLinearVelocity(Vec3.ZERO);
                    this.rb.setAngularVelocity(Vec3.ZERO);
                } catch {

                }
                this.rb.angularFactor = new Vec3(0, 0, 0);
            }
            this.scheduleFinalDestroy(Math.max(0.05, this.liteDestroyLifeDuration));
            return;
        }

        // Шаттер на куски — только при разрушении об Floor (см. тултип
        // shatterIntoMeshPieces). Разрушение от прямого попадания снаряда
        // (reason='hit') всегда идёт обычным путём — colliders выключаются
        // и объект проигрывает анимацию/fade уничтожения.
        if (this.shatterIntoMeshPieces && reason === 'floor') {
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

            }
        }

        queue.length = 0;
    };


    // Тело "телепортировалось" за один физический шаг (взрыв решателя) —
    // раньше мы откатывали его позицию и гасили скорость на месте, но так
    // объект просто зависал (позиция и скорость обнулены, а новое
    // столкновение/floor-контакт больше не сгенерируется, потому что ручной
    // setWorldPosition в обход физики не всегда триггерит свежий contact-enter).
    // Правильнее считать это тем же самым "вылетом за пределы уровня" и
    // аккуратно, без каких-либо визуальных эффектов, убрать объект —
    // так же, как это уже делает cullOutOfBoundsDestructibles в LevelManager.
    private static destroyUnstableBody(rb: RigidBody) {
        UniversalCollisionHandler.liveBodies.delete(rb);
        UniversalCollisionHandler.lastGoodPos.delete(rb);

        const node = rb.node;
        const handler = node ? node.getComponent(UniversalCollisionHandler) : null;

        if (handler && isValid(handler) && !handler.isDestroyed) {
            handler.destroySelf('physicsGlitch');
            return;
        }

        // Осколок (shatter piece) — у него нет своего UniversalCollisionHandler,
        // просто гасим физику и прячем узел.
        try {
            rb.setLinearVelocity(Vec3.ZERO);
            rb.setAngularVelocity(Vec3.ZERO);
        } catch {

        }
        rb.enabled = false;

        if (node && isValid(node)) {
            const colliders = node.getComponentsInChildren(Collider);
            for (let i = 0; i < colliders.length; i++) {
                if (isValid(colliders[i])) colliders[i].enabled = false;
            }
            node.active = false;
        }
    }

    // Раз в физический шаг проходим по всем живым динамическим телам и:
    // 1) лечим NaN/Infinity скорость (иначе объект улетает в никуда, физически
    //    остаётся "живым" для игровой логики, но визуально пропадает);
    // 2) клэмпим слишком большую скорость, чтобы не давать нестабильности
    //    (взрывным impulse-ам при плотных стеках) разгонять тела до абсурда —
    //    это одна из причин просадки физики и "телепортов" объектов.
    private static clampAllVelocities = () => {
        const maxSqr = UniversalCollisionHandler.MAX_LINEAR_SPEED * UniversalCollisionHandler.MAX_LINEAR_SPEED;
        const maxStepSqr = UniversalCollisionHandler.MAX_STEP_DISTANCE * UniversalCollisionHandler.MAX_STEP_DISTANCE;

        for (const rb of UniversalCollisionHandler.liveBodies) {
            if (!isValid(rb) || !rb.enabled || !rb.isDynamic) continue;
            const node = rb.node;
            if (!node?.activeInHierarchy) continue;

            try {
                // --- 1. Проверка телепорта позиции за один шаг ---
                node.getWorldPosition(_tmpPos);
                const posBad = !Number.isFinite(_tmpPos.x) || !Number.isFinite(_tmpPos.y) || !Number.isFinite(_tmpPos.z);

                const prev = UniversalCollisionHandler.lastGoodPos.get(rb);
                if (posBad) {
                    UniversalCollisionHandler.destroyUnstableBody(rb);
                    continue;
                }

                if (prev) {
                    const dx = _tmpPos.x - prev.x;
                    const dy = _tmpPos.y - prev.y;
                    const dz = _tmpPos.z - prev.z;
                    if (dx * dx + dy * dy + dz * dz > maxStepSqr) {
                        UniversalCollisionHandler.destroyUnstableBody(rb);
                        continue;
                    }
                    prev.set(_tmpPos);
                } else {
                    UniversalCollisionHandler.lastGoodPos.set(rb, _tmpPos.clone());
                }

                // --- 2. Клэмп скорости ---
                rb.getLinearVelocity(_velA);

                const velBad = !Number.isFinite(_velA.x) || !Number.isFinite(_velA.y) || !Number.isFinite(_velA.z);
                if (velBad) {
                    rb.setLinearVelocity(Vec3.ZERO);
                    rb.setAngularVelocity(Vec3.ZERO);
                    continue;
                }

                const speedSqr = _velA.lengthSqr();
                if (speedSqr > maxSqr && speedSqr > 0) {
                    _velA.multiplyScalar(UniversalCollisionHandler.MAX_LINEAR_SPEED / Math.sqrt(speedSqr));
                    rb.setLinearVelocity(_velA);
                }
            } catch {

            }
        }
    };


    private shatterMeshPiecesAndFade() {
        const pieces = this.collectShatterPieces();
        if (pieces.length === 0) {

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


        if (isValid(this.rb)) {
            this.rb.getLinearVelocity(_velA);
            UniversalCollisionHandler.liveBodies.delete(this.rb);
            this.rb.setLinearVelocity(Vec3.ZERO);
            this.rb.setAngularVelocity(Vec3.ZERO);
            this.rb.enabled = false;
        } else {
            _velA.set(0, 0, 0);
        }


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


        const spawned: Node[] = [];

        for (let i = 0; i < toShatter.length; i++) {
            const piece = toShatter[i];
            if (!isValid(piece)) continue;

            // Раньше здесь кусок переносился в scene (setParent) с ручным
            // восстановлением мирового трансформа (позиция/поворот/масштаб,
            // плюс NaN-гварды и снэп-бэк при "разрыве" дистанции > 5м) — это
            // сама по себе тяжёлая операция (включая updateWorldTransform()),
            // и при массовом одновременном разрушении (когда весь стек разом
            // падает на пол и десятки объектов шаттерятся в один кадр) именно
            // она, судя по всему, была причиной "зависания"/визуального
            // пропадания на кадр и кусков с координатами непонятно откуда.
            //
            // Кусок и так уже уничтожается раньше (piece.destroy() в конце
            // schedulePieceLifetime, через life + fadeDur), чем сам root
            // (root.destroy() ниже отложен на life + fadeDur + 0.15 — заведомо
            // позже) — значит, оставлять кусок ребёнком root безопасно для
            // жизненного цикла. А раз parent не меняется, мировые координаты
            // куска вообще не сдвигаются никакой ручной математикой — он остаётся
            // ровно там, где визуально был.
            piece.active = true;

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
                } catch {  }
                clampLeft--;
                if (clampLeft > 0) {
                    scheduler.schedule(clampVel, kickTarget, 0, 0, 0, false);
                }
            };
            scheduler.schedule(clampVel, kickTarget, 0, 0, 0, false);

            spawned.push(piece);
        }


        if (hideLivingAfter && spawned.length > 0) {
            for (let i = 0; i < living.length; i++) {
                if (isValid(living[i])) living[i].active = false;
            }
        }



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


    private collectShatterPieces(): Node[] {
        const pieces: Node[] = [];
        const renderers = this.node.getComponentsInChildren(MeshRenderer);
        for (let i = 0; i < renderers.length; i++) {
            const r = renderers[i];
            if (!isValid(r) || !isValid(r.node)) continue;
            if (r.node === this.node) continue;
            if (pieces.indexOf(r.node) < 0) pieces.push(r.node);
        }
        return pieces;
    }


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

        // ВАЖНО: раньше осколки (shatter pieces) не попадали в liveBodies и
        // поэтому НЕ были защищены общим клэмпом скорости/NaN (clampAllVelocities)
        // и не участвовали в queueWake. При плотном уровне и нескольких
        // одновременных разрушениях именно у осколков чаще всего "взрывалась"
        // скорость — отсюда куски, улетающие в случайные координаты.
        UniversalCollisionHandler.liveBodies.add(rb);
        return rb;
    }

    private schedulePieceLifetime(piece: Node, life: number, fadeDur: number) {
        if (!isValid(piece)) return;



        piece.getScale(_tmpScale);
        const sx = _tmpScale.x;
        const sy = _tmpScale.y;
        const sz = _tmpScale.z;
        const fade = { t: 0 };
        const lockedPos = new Vec3();

        tween(fade)
            .delay(life)
            .call(() => {
                if (!isValid(piece)) return;
                const pieceRb = piece.getComponent(RigidBody);
                if (isValid(pieceRb)) {
                    try {
                        pieceRb.setLinearVelocity(Vec3.ZERO);
                        pieceRb.setAngularVelocity(Vec3.ZERO);
                    } catch {  }
                    pieceRb.enabled = false;
                    UniversalCollisionHandler.liveBodies.delete(pieceRb);
                    UniversalCollisionHandler.lastGoodPos.delete(pieceRb);
                }
                const colliders = piece.getComponentsInChildren(Collider);
                for (let i = 0; i < colliders.length; i++) {
                    if (isValid(colliders[i])) colliders[i].enabled = false;
                }

                // Пивот у осколков — от исходного разбитого меша, а не от
                // центра конкретного куска, так что setScale() ниже "тянет"
                // кусок к этому пивоту при уменьшении. Раньше это выглядело
                // как будто кусок проваливается в пол ровно в момент
                // выключения коллайдера — на самом деле он просто съезжал к
                // своему пивоту во время сжатия. Фиксируем мировую позицию
                // здесь и удерживаем её каждый кадр, пока идёт fade.
                piece.getWorldPosition(lockedPos);
            })
            .to(fadeDur, { t: 1 }, {
                easing: 'quadIn',
                onUpdate: () => {
                    if (!isValid(piece)) return;
                    const k = Math.max(0, 1 - fade.t);
                    piece.setScale(sx * k, sy * k, sz * k);
                    piece.setWorldPosition(lockedPos);
                },
            })
            .call(() => {
                if (isValid(piece)) piece.destroy();
            })
            .start();
    }




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
        const camera = isValid(this.mainCamera)
            ? this.mainCamera
            : (this.node.scene?.getComponentInChildren(Camera) ?? null);
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


    public static resetStatics() {
        UniversalCollisionHandler.liveBodies.clear();
        UniversalCollisionHandler.lastGoodPos.clear();
        UniversalCollisionHandler.lastGlobalHitSoundTime = 0;
        UniversalCollisionHandler.wakeQueue.length = 0;
        UniversalCollisionHandler.wakeScheduled = false;
        UniversalCollisionHandler.activeFxCount = 0;
        UniversalCollisionHandler.activeScorePopups = 0;
        UniversalCollisionHandler.scorePool.length = 0;
    }
}
