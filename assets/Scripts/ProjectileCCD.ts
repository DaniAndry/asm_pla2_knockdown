import {
    _decorator, Component, RigidBody, isValid, director, Director, CCFloat, Collider,
    PhysicsMaterial, ICollisionEvent, Vec3,
} from 'cc';
import { LevelManager } from './LevelManager';
import { ProjectileSweepHit } from './ProjectileSweepHit';
import { RotatingLevelBodies } from './RotatingLevelBodies';

const { ccclass, property } = _decorator;

const _postVel = new Vec3();
const _inDir = new Vec3();

@ccclass('ProjectileCCD')
export class ProjectileCCD extends Component {

    @property({
        tooltip: 'На вращающемся уровне выключать нативный CCD. Иначе снаряд зависает или дёргается: CCD каждый шаг обрезает полёт о движущуюся грань.'
    })
    workaroundRotatingLevel: boolean = true;

    @property({
        tooltip: 'Всегда выключать нативный CCD. Нужно, если уровень крутится не через LevelManager.Enable Y Rotation / RotatingLevelBodies.'
    })
    forceSweepHit: boolean = false;

    @property({
        type: CCFloat,
        tooltip: 'На крутящемся уровне умножить массу обычного снаряда. 1 = как в префабе. Спецвыстрелы не трогаем.'
    })
    rotatingMassScale: number = 2;

    @property({
        type: CCFloat,
        tooltip: 'Какую долю скорости оставить после попадания. 0.5 = снаряд ещё пробивает пару блоков, но уже не улетает рикошетом.'
    })
    hitSpeedKeep: number = 0.45;

    @property({
        type: CCFloat,
        tooltip: 'Потолок вертикальной скорости после удара (м/с). Обрезает вылет в небо.'
    })
    hitMaxUpSpeed: number = 4;

    @property({
        type: CCFloat,
        tooltip: 'Линейное демпфирование после первого попадания. 0 = не менять. Больше — быстрее падает, а не летит дальше.'
    })
    hitLinearDamping: number = 1.1;

    @property({
        type: CCFloat,
        tooltip: 'Пол скорости после попаданий (м/с): ниже него удары снаряд больше не замедляют. Hit Speed Keep умножается на КАЖДОЕ столкновение, и в глубине стопки скорость падает геометрически — снаряд «случайно» останавливается в воздухе. 0 = выключить пол.'
    })
    minSpeedAfterHit: number = 6;

    @property({
        tooltip: 'Разрешить этому компоненту включать и выключать ProjectileSweepHit. ВЫКЛ (по умолчанию) = свип живёт сам по себе и настраивается своим инспектором. Включайте, только если действительно зовёте applyForLaunch() из пушки: иначе onEnable просто гасит свип, и попадания перестают засчитываться на быстрых кадрах.'
    })
    manageSweep: boolean = false;

    private rb: RigidBody | null = null;
    private collider: Collider | null = null;
    private disableCcd: boolean = false;
    private baseMass: number = 0;
    private baseLinearDamping: number = 0;
    private dampQueued: boolean = false;
    private hitDampingApplied: boolean = false;
    private listeningHits: boolean = false;
    private readonly preHitVel: Vec3 = new Vec3();
    private static noBounceMat: PhysicsMaterial | null = null;

    onLoad() {
        this.rb = this.getComponent(RigidBody);
        this.collider = this.getComponent(Collider);
        if (isValid(this.rb)) this.baseLinearDamping = this.rb.linearDamping;
    }

    onEnable() {
        this.rb = this.getComponent(RigidBody);
        this.collider = this.getComponent(Collider);
        this.rememberBaseMass();
        this.refreshLevelMode();
        this.resetHitState();

        // Решение «крутится ли уровень» перепроверяем в конце кадра.
        //
        // В onEnable оно ненадёжно: RotatingLevelBodies регистрирует себя тоже
        // в onEnable, и если снаряд активируется раньше уровня, hasAny() ещё
        // вернёт false. Тогда на вращающемся уровне остаётся включённым
        // нативный CCD — и снаряд снова залипает перед блоком. Причём через раз,
        // в зависимости от порядка активации узлов, что и выглядит случайным.
        this.scheduleOnce(this.refreshLevelMode, 0);
    }

    private refreshLevelMode = () => {
        if (!isValid(this.node) || !this.node.activeInHierarchy) return;

        this.disableCcd = this.forceSweepHit || (this.workaroundRotatingLevel && this.isRotatingLevel());

        // Массу и флаг CCD НЕ трогаем у уже летящего снаряда: в Bullet/Box3D
        // запись mass и useCCD пересобирает тело и обнуляет ему скорость —
        // снаряд просто падал бы у дула.
        if (!this.isFlying()) {
            this.applyMassForLevel(false);
            this.applyCcdFlag();
        }

        // ИНВАРИАНТ: у снаряда всегда должен работать РОВНО ОДИН механизм
        // непрерывной проверки — либо нативный CCD, либо ручной свип.
        //
        // Именно на этом снаряды снова начали пролетать насквозь: мы честно
        // выключали нативный CCD на вращающемся уровне, а замену не включали —
        // ProjectileSweepHit на префабе мог просто отсутствовать. Быстрый
        // снаряд между кадрами проходил блок насквозь, и проверять было нечем.
        if (this.disableCcd) {
            this.ensureSweep();
        } else if (this.manageSweep) {
            this.setSweep(false);
        }
    };

    /**
     * Гарантировать наличие включённого ручного свипа.
     * Настройки перезаписываем только если компонент создан прямо сейчас
     * (или если явно разрешено manageSweep) — иначе затрём то, что выставлено
     * в инспекторе руками.
     */
    private ensureSweep(): ProjectileSweepHit | null {
        let sweep = this.getComponent(ProjectileSweepHit);
        const created = !isValid(sweep);

        if (created) {
            sweep = this.addComponent(ProjectileSweepHit);
            console.warn(
                `[ProjectileCCD] На "${this.node.name}" нет ProjectileSweepHit, а нативный CCD выключен ` +
                `(вращающийся уровень). Компонент добавлен в рантайме со значениями по умолчанию. ` +
                `Добавьте его в префаб снаряда и настройте в инспекторе.`
            );
        }
        if (!isValid(sweep)) return null;

        if (created || this.manageSweep) {
            sweep.correctPosition = false;
            sweep.bounceKeep = this.hitSpeedKeep;
            sweep.hitMaxUpSpeed = this.hitMaxUpSpeed;
            sweep.minSpeedAfterHit = this.minSpeedAfterHit;
            sweep.hitTransfer = 0.8;
        }

        sweep.enabled = true;
        return sweep;
    }

    onDisable() {
        this.unbindHitDamp();
        this.resetHitState();
    }

    onDestroy() {
        this.unbindHitDamp();
    }

    /**
     * Вызывать из пушки сразу после type = DYNAMIC и до setLinearVelocity.
     * Смена типа может сбросить флаг CCD, а запись флага после скорости
     * обнуляет саму скорость.
     */
    public applyForLaunch() {
        this.disableCcd = this.forceSweepHit || (this.workaroundRotatingLevel && this.isRotatingLevel());
        this.applyCcdFlag();
        if (this.manageSweep) this.setSweep(this.disableCcd);
        this.applyMassForLevel(true);
        this.applyRestitution();
        this.resetHitState();
        // На крутящемся уровне скорость после удара гасит ProjectileSweepHit.
        // Здесь слушаем только нативные столкновения.
        this.bindHitDamp(!this.disableCcd);
    }

    /** Снаряд уже выстрелен и летит? */
    private isFlying(): boolean {
        if (!isValid(this.rb) || this.rb.type !== RigidBody.Type.DYNAMIC) return false;
        try {
            this.rb.getLinearVelocity(_postVel);
            return _postVel.lengthSqr() > 1;
        } catch { return false; }
    }

    private rememberBaseMass() {
        if (!isValid(this.rb)) return;
        if (this.baseMass <= 0) this.baseMass = Math.max(0.01, this.rb.mass);
    }

    private applyMassForLevel(launching: boolean) {
        if (!isValid(this.rb)) return;
        this.rememberBaseMass();
        const scale = (launching && this.disableCcd) ? Math.max(0.01, this.rotatingMassScale) : 1;
        this.rb.mass = this.baseMass * scale;
    }

    private applyRestitution() {
        const col = this.collider || this.getComponent(Collider);
        if (!isValid(col)) return;

        if (!ProjectileCCD.noBounceMat) {
            const mat = new PhysicsMaterial();
            mat.restitution = 0;
            mat.friction = 0.45;
            ProjectileCCD.noBounceMat = mat;
        }
        col.material = ProjectileCCD.noBounceMat;
    }

    private applyCcdFlag() {
        if (!isValid(this.rb)) {
            this.rb = this.getComponent(RigidBody);
            if (!isValid(this.rb)) return;
        }
        try { this.rb.useCCD = !this.disableCcd; } catch { }
    }

    private setSweep(on: boolean) {
        let sweep = this.getComponent(ProjectileSweepHit);
        if (on) {
            if (!isValid(sweep)) sweep = this.addComponent(ProjectileSweepHit);
            if (isValid(sweep)) {
                sweep.correctPosition = false;
                sweep.bounceKeep = this.hitSpeedKeep;
                sweep.hitMaxUpSpeed = this.hitMaxUpSpeed;
                sweep.hitTransfer = 0.8;
                sweep.enabled = true;
            }
            return;
        }
        if (isValid(sweep)) sweep.enabled = false;
    }

    private bindHitDamp(on: boolean) {
        this.unbindHitDamp();
        if (!on) return;

        if (!isValid(this.collider)) this.collider = this.getComponent(Collider);
        if (!isValid(this.collider)) return;

        this.listeningHits = true;
        this.collider.on('onCollisionEnter', this.onCollisionEnter, this);
        director.on(Director.EVENT_BEFORE_PHYSICS, this.snapshotPreHitVel, this);
        director.on(Director.EVENT_AFTER_PHYSICS, this.flushHitDamp, this);
    }

    private unbindHitDamp() {
        if (isValid(this.collider)) {
            this.collider.off('onCollisionEnter', this.onCollisionEnter, this);
        }
        director.off(Director.EVENT_BEFORE_PHYSICS, this.snapshotPreHitVel, this);
        director.off(Director.EVENT_AFTER_PHYSICS, this.flushHitDamp, this);
        this.listeningHits = false;
        this.dampQueued = false;
    }

    private resetHitState() {
        this.dampQueued = false;
        this.hitDampingApplied = false;
        this.preHitVel.set(0, 0, 0);
        if (isValid(this.rb)) this.rb.linearDamping = this.baseLinearDamping;
    }

    private snapshotPreHitVel = () => {
        if (!isValid(this.rb) || !this.rb.enabled || this.rb.type !== RigidBody.Type.DYNAMIC) return;
        try { this.rb.getLinearVelocity(this.preHitVel); } catch { }
    };

    private onCollisionEnter = (event: ICollisionEvent) => {
        if (!this.listeningHits) return;
        const other = event.otherCollider?.node;
        if (!isValid(other)) return;
        if (other.name.indexOf('Projectile') >= 0) return;
        this.dampQueued = true;
    };

    private flushHitDamp = () => {
        if (!this.dampQueued) return;
        this.dampQueued = false;
        this.applyHitDamp();
    };

    private applyHitDamp() {
        if (!isValid(this.rb) || !this.rb.enabled) return;
        if (this.rb.type !== RigidBody.Type.DYNAMIC) return;

        try { this.rb.getLinearVelocity(_postVel); } catch { return; }

        const keep = Math.max(0, Math.min(1, this.hitSpeedKeep));
        const incomingSqr = this.preHitVel.lengthSqr();

        // Убираем отскок назад: оставляем только то, что продолжает полёт
        // по входящему направлению, плюс чуть бокового сноса.
        if (incomingSqr > 0.01) {
            const invLen = 1 / Math.sqrt(incomingSqr);
            _inDir.set(this.preHitVel.x * invLen, this.preHitVel.y * invLen, this.preHitVel.z * invLen);
            const along = _postVel.x * _inDir.x + _postVel.y * _inDir.y + _postVel.z * _inDir.z;
            if (along < 0) {
                _postVel.x -= _inDir.x * along;
                _postVel.y -= _inDir.y * along;
                _postVel.z -= _inDir.z * along;
            }
        }

        // Замедление с полом: keep умножается на каждое столкновение, и без
        // нижней границы снаряд в глубине стопки останавливается в воздухе.
        const before = _postVel.length();
        if (before > 1e-4) {
            let after = before * keep;
            if (this.minSpeedAfterHit > 0 && after < this.minSpeedAfterHit) {
                after = Math.min(before, this.minSpeedAfterHit);
            }
            _postVel.multiplyScalar(after / before);
        }

        if (_postVel.y > this.hitMaxUpSpeed) _postVel.y = this.hitMaxUpSpeed;

        try { this.rb.setLinearVelocity(_postVel); } catch { }

        if (!this.hitDampingApplied) {
            this.hitDampingApplied = true;
            if (this.hitLinearDamping > 0) this.rb.linearDamping = this.hitLinearDamping;
            // Даже при прямом выстреле после удара снаряд должен падать,
            // а не улетать по прямой в небо.
            this.rb.useGravity = true;
        }
    }

    private isRotatingLevel(): boolean {
        if (RotatingLevelBodies.hasAny()) return true;

        const scene = this.node.scene ?? director.getScene();
        if (!scene) return false;

        const managers = scene.getComponentsInChildren(LevelManager);
        for (const m of managers) {
            if (isValid(m) && m.enabled && m.node.activeInHierarchy && m.enableYRotation) {
                return true;
            }
        }
        return false;
    }
}
