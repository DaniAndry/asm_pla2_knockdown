import {
    _decorator,
    Component,
    RigidBody,
    Collider,
    ICollisionEvent,
    Vec3,
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

interface WakeRequest { x: number; y: number; z: number; r2: number; }

@ccclass('UniversalCollisionHandler')
export class UniversalCollisionHandler extends Component {
    @property({ type: CCFloat }) health: number = 100;
    @property({ type: CCFloat }) damageThreshold: number = 1;
    @property({ type: CCFloat }) destroyThreshold: number = 10;
    @property({ type: CCFloat }) impactDamageFactor: number = 1;
    @property({ type: CCFloat }) minDamageSpeed: number = 0.5;

    @property({ tooltip: 'Использовать систему HP' })
    useHealthSystem: boolean = true;

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

    @property({ tooltip: 'ВЫКЛ = скейл вместо material fade. Material fade создаёт инстанс материала и ломает батчинг' })
    useMaterialFade: boolean = false;

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
    private destroyFxBudgetHeld: boolean = false;

    private static lastGlobalHitSoundTime: number = 0;
    private static liveBodies: Set<RigidBody> = new Set();

    private static activeFxCount: number = 0;
    private static readonly MAX_ACTIVE_FX: number = 6;
    private static activeDestroyFxCount: number = 0;
    private static readonly MAX_ACTIVE_DESTROY_FX: number = 5;
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
        this.releaseDestroyFxBudget();

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

        if (this.isProjectile(otherCollider)) {
            SoundManager.notifyHit();
            this.playHitSound();
        }

        if (!this.useHealthSystem || !isValid(this.rb)) return;

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

    /** Урон, пришедший от sweep-проверки ProjectileCCD (движок коллизию пропустил) */
    public applyExternalHit(impactSpeed: number, otherMass: number) {
        if (this.isDestroyed) return;

        const now = director.getTotalTime() * 0.001;
        if (now - this.lastHitTime < 0.05) return;
        this.lastHitTime = now;

        SoundManager.notifyHit();
        this.playHitSound();

        if (!this.useHealthSystem) return;
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

        const min = Math.min(this.floorDestroyDelayMin, this.floorDestroyDelayMax);
        const max = Math.max(this.floorDestroyDelayMin, this.floorDestroyDelayMax);
        const delay = min + Math.random() * (max - min);

        this.scheduleOnce(() => {
            if (!this.isDestroyed) this.destroySelf();
        }, delay);
    }

    applyDamage(amount: number) {
        this.health -= amount;
        if (this.health <= 0 || amount > this.destroyThreshold) {
            this.destroySelf();
        }
    }

    destroySelf() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.scoreValue = ((Math.random() * 6) | 0) + 5;

        this.node.emit('destroyed', this);

        this.playHitSound();
        if (this.destructionSoundName && this.destructionSoundName !== this.hitSoundName) {
            SoundManager.playOneShot(this.destructionSoundName);
        }

        this.node.getWorldPosition(_tmpPos);

        if (isValid(this.rb)) {
            UniversalCollisionHandler.liveBodies.delete(this.rb);
        }
        if (isValid(this.collider)) {
            this.collider.off('onCollisionEnter', this.onCollisionEnter, this);
        }

        // Один общий отложенный проход вместо N-го обхода всех тел
        UniversalCollisionHandler.queueWake(_tmpPos, this.wakeRadius);

        this.spawnDestructionParticles(_tmpPos);
        this.spawnScorePopup(`+${this.scoreValue}`);
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
    // FX уничтожения
    // ------------------------------------------------------------------
    private getRandomAnimDurationFactor(): number {
        const min = Math.min(this.animDurationMinFactor, this.animDurationMaxFactor);
        const max = Math.max(this.animDurationMinFactor, this.animDurationMaxFactor);
        const clampedMin = Math.max(0.01, min);
        const clampedMax = Math.max(clampedMin, max);
        return clampedMin + Math.random() * (clampedMax - clampedMin);
    }

    private tryAcquireDestroyFxBudget(): boolean {
        if (UniversalCollisionHandler.activeDestroyFxCount >= UniversalCollisionHandler.MAX_ACTIVE_DESTROY_FX) {
            return false;
        }
        UniversalCollisionHandler.activeDestroyFxCount++;
        this.destroyFxBudgetHeld = true;
        return true;
    }

    private releaseDestroyFxBudget() {
        if (!this.destroyFxBudgetHeld) return;
        this.destroyFxBudgetHeld = false;
        UniversalCollisionHandler.activeDestroyFxCount = Math.max(
            0, UniversalCollisionHandler.activeDestroyFxCount - 1
        );
    }

    private playDestroyAnimationAndFadeOut() {
        const maxLife = Math.max(0.08, this.maxDestroyLifeDuration);

        if (!this.tryAcquireDestroyFxBudget()) {
            this.playLiteDestroyFx(Math.min(maxLife, Math.max(0.05, this.liteDestroyLifeDuration)));
            return;
        }

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
        this.hideMeshes();
        this.scheduleFinalDestroy(lifeDuration);
    }

    private scheduleFinalDestroy(lifeDuration: number) {
        this.scheduleOnce(() => {
            this.releaseDestroyFxBudget();
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
     * По умолчанию — схлопывание по скейлу: 0 аллокаций материалов, 0 пересборки PSO,
     * батчинг не ломается. Material fade оставлен опцией (useMaterialFade).
     */
    private fadeOutStepped(duration: number) {
        if (this.useMaterialFade) {
            this.fadeMaterialsStepped(duration);
            return;
        }

        const steps = UniversalCollisionHandler.FADE_STEPS;
        const stepDuration = duration / steps;
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

    /** Тяжёлый путь: getMaterialInstance клонирует материал → +1 draw call и рекомпиляция PSO */
    private fadeMaterialsStepped(duration: number) {
        const renderers = this.cachedRenderers;
        const steps = UniversalCollisionHandler.FADE_STEPS;
        const stepDuration = duration / steps;
        let step = 0;

        const tick = () => {
            if (!isValid(this.node)) return;
            step++;
            const alpha = Math.max(0, 1 - step / steps);
            for (let i = 0; i < renderers.length; i++) {
                const r = renderers[i];
                if (!isValid(r)) continue;
                const mat = r.getMaterialInstance(0);
                if (!isValid(mat)) continue;
                mat.setProperty('albedoScale', new Vec3(1, 1, 1));
                (mat as any).setProperty?.('mainColor', { r: 255, g: 255, b: 255, a: alpha * 255 });
            }
            if (step < steps) this.scheduleOnce(tick, stepDuration);
            else this.hideMeshes();
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
        UniversalCollisionHandler.activeDestroyFxCount = 0;
        UniversalCollisionHandler.activeScorePopups = 0;
        UniversalCollisionHandler.scorePool.length = 0;
    }
}
