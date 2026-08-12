import { _decorator, Component, RigidBody, Collider, SphereCollider, isValid, CCFloat, Vec3 } from 'cc';
import { ProjectileCCD } from './ProjectileCCD';

const { ccclass, property } = _decorator;

const _scale = new Vec3();

/**
 * Включает ВСТРОЕННЫЙ (нативный) CCD у снаряда.
 *
 * Зачем это отдельно от ProjectileCCD.ts: тот делает ручной sweep-тест на
 * JavaScript каждый кадр в lateUpdate() — это было единственным вариантом на
 * бэкенде cannon.js. После перехода на Bullet (WASM) движок умеет CCD сам,
 * внутри нативного кода — это и точнее, и дешевле, чем JS-свип.
 *
 * ВАЖНО — ограничения Bullet для CCD (из документации Cocos 3.8):
 *   - только ОДИН коллайдер на объекте (single shape object);
 *   - у этого коллайдера center должен быть (0, 0, 0);
 *   - только DYNAMIC-тело;
 *   - только выпуклые (convex) формы;
 *   - вращательное проникновение CCD не решает;
 *   - события приходят только через onCollision*.
 * Если эти условия нарушены, CCD молча не работает — поэтому компонент их
 * проверяет и пишет понятное предупреждение в консоль вместо тихого отказа.
 *
 * Вешать на узел снаряда (там же, где RigidBody + Collider).
 */
@ccclass('ProjectileNativeCCD')
export class ProjectileNativeCCD extends Component {
    @property({ tooltip: 'Включать нативный CCD движка (Bullet). Выключите, чтобы сравнить поведение со старым JS-свипом.' })
    useNativeCCD: boolean = true;

    @property({
        type: CCFloat,
        tooltip: '0 = вычислить автоматически: (радиус SphereCollider × мировой масштаб) × Swept Radius Factor. Значение больше нуля задаёт радиус вручную, в МИРОВЫХ единицах сцены. ВНИМАНИЕ: этот радиус НИКОГДА не должен быть равен реальному радиусу снаряда или больше — иначе CCD даёт ложные срабатывания и снаряд дёргается назад-вперёд.'
    })
    sweptSphereRadius: number = 0;

    @property({
        type: CCFloat,
        tooltip: 'Доля от реального радиуса снаряда для "заметающей" сферы CCD. Рекомендация Bullet/ammo — 0.2..0.5. Единица (полный радиус) ЛОМАЕТ поведение: сфера размером с сам объект вызывает ложные столкновения.'
    })
    sweptRadiusFactor: number = 0.25;

    @property({
        tooltip: 'ОПЦИОНАЛЬНО: выключить старый JS-свип (ProjectileCCD) на этом же узле, когда нативный CCD включился. Экономит проверку каждый кадр, но убирает запасной путь нанесения урона через applyExternalHit — включайте только после того, как убедитесь, что попадания корректно отрабатывают и без него.'
    })
    disableJsSweepWhenActive: boolean = false;

    @property({ tooltip: 'Проверять ограничения Bullet и писать в консоль, если CCD не сможет заработать' })
    validateSetup: boolean = true;

    private rb: RigidBody | null = null;
    private applied: boolean = false;
    private warned: boolean = false;

    onEnable() {
        this.rb = this.getComponent(RigidBody);
        this.applied = false;
        this.warned = false;

        if (this.validateSetup) this.validate();
        this.tryApply();
    }

    update() {
        // CCD применим только к DYNAMIC-телу, а снаряд до выстрела висит
        // KINEMATIC (см. CannonController.setProjectile). Поэтому ждём момента,
        // когда он станет динамическим, и применяем ровно один раз.
        if (this.applied || !this.useNativeCCD) return;
        this.tryApply();
    }

    private tryApply() {
        if (!this.useNativeCCD || this.applied) return;
        if (!isValid(this.rb)) {
            this.rb = this.getComponent(RigidBody);
            if (!isValid(this.rb)) return;
        }
        if (this.rb.type !== RigidBody.Type.DYNAMIC) return;

        try {
            (this.rb as any).useCCD = true;

            // Недокументированное свойство: есть не во всех сборках движка.
            // Пишем только если оно реально существует, иначе молча пропускаем.
            if ('ccdSweptSphereRadius' in (this.rb as any)) {
                (this.rb as any).ccdSweptSphereRadius = Math.max(0.01, this.resolveRadius());
            }
        } catch (e) {
            console.warn('[ProjectileNativeCCD] Не удалось включить нативный CCD:', e);
            return;
        }

        this.applied = true;

        if (this.disableJsSweepWhenActive) {
            const jsSweep = this.getComponent(ProjectileCCD);
            if (isValid(jsSweep) && jsSweep.enabled) {
                jsSweep.enabled = false;
            }
        }
    }

    /**
     * Радиус снаряда в МИРОВЫХ единицах. Если sweptSphereRadius <= 0 — берём
     * его из SphereCollider и умножаем на мировой масштаб узла.
     *
     * Зачем автовычисление: в Projectile.prefab радиус коллайдера = 1, а
     * масштаб узла = 0.5, то есть настоящий радиус в сцене = 0.5. Число,
     * вбитое руками, легко расходится с реальностью при любой правке
     * масштаба или коллайдера — и тогда CCD (или свип) работает по сфере
     * неправильного размера, молча пропуская попадания по краям.
     */
    public resolveRadius(): number {
        const real = this.getRealWorldRadius();

        // Жёсткий потолок: заметающая сфера ОБЯЗАНА быть меньше самого снаряда.
        // Если она равна его радиусу или больше, Bullet начинает выдавать
        // ложные столкновения — визуально снаряд дёргается назад-вперёд.
        const cap = real * 0.9;

        if (this.sweptSphereRadius > 0) {
            if (this.sweptSphereRadius > cap) {
                console.warn(
                    `[ProjectileNativeCCD] Swept Sphere Radius (${this.sweptSphereRadius}) слишком велик при реальном радиусе снаряда ${real.toFixed(3)} — обрезаю до ${cap.toFixed(3)}, иначе CCD даёт ложные срабатывания.`
                );
                return cap;
            }
            return this.sweptSphereRadius;
        }

        const factor = Math.min(0.9, Math.max(0.05, this.sweptRadiusFactor));
        return Math.max(0.01, real * factor);
    }

    /** Настоящий радиус снаряда в мировых единицах (коллайдер × масштаб). */
    private getRealWorldRadius(): number {
        const sphere = this.getComponent(SphereCollider);
        if (!isValid(sphere)) return 0.5;

        this.node.getWorldScale(_scale);
        const maxScale = Math.max(Math.abs(_scale.x), Math.abs(_scale.y), Math.abs(_scale.z));
        return Math.max(0.01, sphere.radius * maxScale);
    }

    /** Проверка ограничений Bullet — молчит, если всё в порядке. */
    private validate() {
        if (this.warned) return;

        const colliders = this.getComponents(Collider);

        if (colliders.length === 0) {
            console.warn('[ProjectileNativeCCD] На узле нет Collider — CCD работать не будет.');
            this.warned = true;
            return;
        }

        if (colliders.length > 1) {
            console.warn(
                `[ProjectileNativeCCD] На узле ${colliders.length} коллайдеров. Bullet поддерживает CCD только для объектов с ОДНИМ коллайдером — CCD будет проигнорирован. Оставьте один.`
            );
            this.warned = true;
        }

        const c = colliders[0];
        if (isValid(c) && !Vec3.equals(c.center, Vec3.ZERO, 1e-4)) {
            console.warn(
                `[ProjectileNativeCCD] Center коллайдера = (${c.center.x}, ${c.center.y}, ${c.center.z}). Bullet требует center = (0,0,0) для CCD — иначе CCD не сработает. Сдвиньте сам узел вместо center.`
            );
            this.warned = true;
        }

        if (!isValid(this.rb)) {
            console.warn('[ProjectileNativeCCD] На узле нет RigidBody — включать CCD не на чем.');
            this.warned = true;
        }
    }
}
