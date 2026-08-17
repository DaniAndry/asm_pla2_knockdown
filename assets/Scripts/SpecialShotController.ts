import {
    _decorator, Component, Node, Vec3, Vec2, Quat, Prefab, instantiate, isValid,
    RigidBody, Collider, ICollisionEvent, CCFloat, CCInteger, Enum, director, Label, Button,
    Sprite, UITransform, EventTouch, Color, tween, Tween,
} from 'cc';
import { SoundManager } from './SoundManager';
import { RocketProjectile } from './RocketProjectile';
import { ProjectileCCD } from './ProjectileCCD';

const { ccclass, property } = _decorator;

const _dir = new Vec3();
const _q = new Quat();
const _qYaw = new Quat();
const _pitchAxis = new Vec3();

/** Режим спецвыстрела. */
export enum SpecialShotMode {
    Buckshot = 0,
    Rocket = 1,
}
Enum(SpecialShotMode);

@ccclass('SpecialShotController')
export class SpecialShotController extends Component {
    @property({ tooltip: 'Главный флаг: спецвыстрел активен. Выключен = пушка стреляет обычным снарядом.' })
    isSpecialShoot: boolean = false;

    @property({ type: SpecialShotMode, tooltip: 'Какой именно спецвыстрел применяется, пока isSpecialShoot включён' })
    mode: SpecialShotMode = SpecialShotMode.Buckshot;

    @property({ type: CCInteger, tooltip: 'Сколько выстрелов картечи и ракеты выдаётся на сессию' })
    shotsPerType: number = 5;

    // ------------------------------------------------------------- картечь

    @property({ type: Prefab, tooltip: 'Префаб дробины. Это ТОТ ЖЕ префаб обычного снаряда — картечь его переиспользует, просто уменьшает и стреляет пачкой.' })
    buckshotPrefab: Prefab = null;

    @property({ type: CCInteger, tooltip: 'Сколько дробин вылетает за выстрел' })
    pelletCount: number = 5;

    @property({ type: CCFloat, tooltip: 'Во сколько раз дробина меньше обычного снаряда. 0.3 = почти втрое.' })
    pelletScale: number = 0.3;

    @property({ type: CCFloat, tooltip: 'Полный угол разлёта картечи по горизонтали (градусы). Дробины распределяются равномерно внутри этого веера.' })
    spreadAngle: number = 16;

    @property({ type: CCFloat, tooltip: 'Дополнительный случайный разброс по вертикали (градусы), чтобы пачка не легла в одну строку' })
    verticalJitter: number = 4;

    @property({ type: CCFloat, tooltip: 'Множитель скорости дробин относительно обычного выстрела. Лёгкая дробь обычно летит чуть быстрее.' })
    pelletPowerFactor: number = 1.05;

    @property({ type: CCFloat, tooltip: 'Множитель массы дробины (относительно массы в префабе). Уменьшенный снаряд логично сделать легче.' })
    pelletMassFactor: number = 0.22;

    @property({ type: CCFloat, tooltip: 'Через сколько секунд дробина исчезает, если ни во что не попала. Запас на долгий полёт; по попаданию убирается сразу.' })
    pelletLifetime: number = 2.5;

    @property({ type: CCFloat, tooltip: 'Первые столько метров от дула попадание игнорируется. Иначе пачка, спавненная в одной точке, сразу считается столкнувшейся и исчезает.' })
    pelletMuzzleIgnore: number = 1.2;

    // -------------------------------------------------------------- ракета

    @property({ type: Prefab, tooltip: 'Префаб ракеты. Должен содержать RigidBody + Collider. RocketProjectile повесится сам, если его нет.' })
    rocketPrefab: Prefab = null;

    @property({ type: CCFloat, tooltip: 'Скорость ракеты. Своя, не зависит от Launch Power пушки.' })
    rocketSpeed: number = 20;

    @property({ type: CCFloat, tooltip: 'Добавка к углу Y модели (градусы). fromViewUp даёт 180, -90 разворачивает на 90.' })
    rocketYawOffset: number = -90;

    // --------------------------------------------------------------- UI

    @property({ type: Label, tooltip: 'Счётчик картечи. Пусто = искать Label у узла Kartesh.' })
    buckshotCountLabel: Label = null;

    @property({ type: Label, tooltip: 'Счётчик ракет. Пусто = искать Label у узла Roket.' })
    rocketCountLabel: Label = null;

    @property({ type: Node, tooltip: 'Кнопка картечи. Пусто = узел Kartesh.' })
    buckshotButton: Node = null;

    @property({ type: Node, tooltip: 'Кнопка ракеты. Пусто = узел Roket.' })
    rocketButton: Node = null;

    // --------------------------------------------------------------- прочее

    @property({ type: Node, tooltip: 'Куда складывать созданные снаряды. Пусто = корень сцены.' })
    spawnParent: Node = null;

    /**
     * Действует ли гравитация на спецснаряды. Выставляется пушкой из её флага
     * Flat Shot перед каждым выстрелом, чтобы картечь и ракета летели по тем же
     * правилам, что и обычный снаряд.
     */
    public useGravity: boolean = true;

    @property({ tooltip: 'Имя звука выстрела картечью / шрапнелью в SoundManager' })
    buckshotSoundName: string = 'shrapnel';

    @property({ tooltip: 'Имя звука пуска ракеты в SoundManager' })
    rocketSoundName: string = 'rocket';

    @property({ tooltip: 'Имя звука взрыва ракеты в SoundManager. Прокидывается на RocketProjectile.' })
    rocketExplosionSoundName: string = 'rocketExplosion';

    @property({ tooltip: 'Цвет свечения выбранной кнопки снаряда' })
    selectedGlowColor: Color = new Color(255, 210, 70, 255);

    @property({ type: CCFloat, tooltip: 'Длительность одного пульса свечения (сек)' })
    selectedGlowPulseDuration: number = 0.55;

    private buckshotLeft = 0;
    private rocketLeft = 0;
    private buckshotBaseScale = new Vec3(1, 1, 1);
    private rocketBaseScale = new Vec3(1, 1, 1);
    private readonly spriteRestBlend = new Map<Sprite, number>();
    private readonly restSpriteColor = new Color(255, 255, 255, 255);

    onLoad() {
        this.isSpecialShoot = false;
        this.ensureUiRefs();
        this.resetAmmo();
        this.refreshUi();
    }

    start() {
        this.ensureUiRefs();
        this.refreshUi();
    }

    public resetAmmo() {
        const n = Math.max(0, Math.floor(this.shotsPerType));
        this.buckshotLeft = n;
        this.rocketLeft = n;
        this.refreshUi();
    }

    // ------------------------------------------------------------- API UI

    public selectBuckshot() {
        this.toggleMode(SpecialShotMode.Buckshot);
    }

    public selectRocket() {
        this.toggleMode(SpecialShotMode.Rocket);
    }

    public selectNormal() {
        this.isSpecialShoot = false;
        this.refreshUi();
        this.node.emit('special-shot-changed', -1);
    }

    /** Пушка спрашивает это на TOUCH_START, чтобы клик по кнопке не стрелял. */
    public blocksAimTouch(event: EventTouch): boolean {
        const loc = event.getLocation();
        return this.hitUi(this.buckshotButton, loc) || this.hitUi(this.rocketButton, loc);
    }

    private toggleMode(mode: SpecialShotMode) {
        const ammo = mode === SpecialShotMode.Buckshot ? this.buckshotLeft : this.rocketLeft;
        if (ammo <= 0) return;

        if (this.isSpecialShoot && this.mode === mode) {
            this.selectNormal();
            return;
        }

        this.isSpecialShoot = true;
        this.mode = mode;
        this.refreshUi();
        this.node.emit('special-shot-changed', mode);
    }

    // ------------------------------------------------------------ выстрел

    /**
     * Вызывается пушкой в момент выстрела.
     * @returns true, если спецвыстрел выполнен и обычный снаряд запускать не нужно
     */
    public fireSpecial(origin: Vec3, dir: Vec3, power: number): boolean {
        if (!this.isSpecialShoot) return false;
        if (this.getCurrentAmmo() <= 0) {
            this.selectNormal();
            return false;
        }

        let done = false;
        if (this.mode === SpecialShotMode.Buckshot) done = this.fireBuckshot(origin, dir, power);
        else if (this.mode === SpecialShotMode.Rocket) done = this.fireRocket(origin, dir, power);

        if (done) {
            this.consumeCurrentAmmo();
            this.refreshUi();
            if (this.getCurrentAmmo() <= 0) this.selectNormal();
        }
        return done;
    }

    private getCurrentAmmo(): number {
        if (this.mode === SpecialShotMode.Buckshot) return this.buckshotLeft;
        if (this.mode === SpecialShotMode.Rocket) return this.rocketLeft;
        return 0;
    }

    private consumeCurrentAmmo() {
        if (this.mode === SpecialShotMode.Buckshot) {
            this.buckshotLeft = Math.max(0, this.buckshotLeft - 1);
        } else if (this.mode === SpecialShotMode.Rocket) {
            this.rocketLeft = Math.max(0, this.rocketLeft - 1);
        }
    }

    private fireBuckshot(origin: Vec3, dir: Vec3, power: number): boolean {
        if (!this.buckshotPrefab) {
            console.warn('[SpecialShotController] Картечь: не назначен Buckshot Prefab.');
            return false;
        }

        const n = Math.max(1, Math.floor(this.pelletCount));
        const parent = isValid(this.spawnParent) ? this.spawnParent : director.getScene();
        if (!parent) return false;

        const scale = Math.max(0.05, this.pelletScale);
        const half = this.spreadAngle * 0.5;

        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0.5 : i / (n - 1);
            const yaw = -half + t * this.spreadAngle;
            const pitch = (Math.random() - 0.5) * 2 * this.verticalJitter;

            const pellet = instantiate(this.buckshotPrefab);
            pellet.setParent(parent);
            pellet.setWorldPosition(origin);
            pellet.setScale(scale, scale, scale);

            this.aim(_dir, dir, yaw, pitch);
            pellet.setWorldPosition(
                origin.x + _dir.x * 0.25,
                origin.y + _dir.y * 0.25,
                origin.z + _dir.z * 0.25,
            );
            this.launchNode(pellet, _dir, power * this.pelletPowerFactor, this.pelletMassFactor);
            this.armPellet(pellet);
        }

        this.playSound(this.buckshotSoundName);
        return true;
    }

    private fireRocket(origin: Vec3, dir: Vec3, power: number): boolean {
        if (!this.rocketPrefab) {
            console.warn('[SpecialShotController] Ракета: не назначен Rocket Prefab.');
            return false;
        }

        const parent = isValid(this.spawnParent) ? this.spawnParent : director.getScene();
        if (!parent) return false;

        const rocket = instantiate(this.rocketPrefab);
        rocket.setParent(parent);
        rocket.setWorldPosition(origin);

        Quat.fromViewUp(_q, dir, Vec3.UP);
        if (this.rocketYawOffset !== 0) {
            Quat.fromAxisAngle(_qYaw, Vec3.UP, this.rocketYawOffset * Math.PI / 180);
            Quat.multiply(_q, _qYaw, _q);
        }
        rocket.setWorldRotation(_q);

        if (!rocket.getComponent(RocketProjectile)) {
            rocket.addComponent(RocketProjectile);
        }

        const ccd = rocket.getComponent(ProjectileCCD);
        if (isValid(ccd)) ccd.enabled = false;
        const rocketRb = rocket.getComponent(RigidBody);
        if (isValid(rocketRb)) {
            try { rocketRb.useCCD = false; } catch { }
        }

        _dir.set(dir);
        this.launchNode(rocket, _dir, this.rocketSpeed, 12);

        const rocketFx = rocket.getComponent(RocketProjectile);
        if (isValid(rocketFx) && this.rocketExplosionSoundName) {
            rocketFx.explosionSoundName = this.rocketExplosionSoundName;
        }

        this.playSound(this.rocketSoundName);
        return true;
    }

    /** Поворачивает направление на yaw (вокруг вертикали) и pitch (вверх/вниз). */
    private aim(out: Vec3, base: Vec3, yawDeg: number, pitchDeg: number) {
        out.set(base);

        if (yawDeg !== 0) {
            Quat.fromAxisAngle(_q, Vec3.UP, yawDeg * Math.PI / 180);
            Vec3.transformQuat(out, out, _q);
        }
        if (pitchDeg !== 0) {
            const rx = -out.z, rz = out.x;
            const rl = Math.sqrt(rx * rx + rz * rz);
            if (rl > 1e-4) {
                _pitchAxis.set(rx / rl, 0, rz / rl);
                Quat.fromAxisAngle(_q, _pitchAxis, pitchDeg * Math.PI / 180);
                Vec3.transformQuat(out, out, _q);
            }
        }
        out.normalize();
    }

    private launchNode(node: Node, dir: Vec3, power: number, massFactor: number) {
        const rb = node.getComponent(RigidBody);
        if (!isValid(rb)) {
            console.warn(`[SpecialShotController] У "${node.name}" нет RigidBody — лететь нечему.`);
            return;
        }

        const col = node.getComponent(Collider);
        if (isValid(col)) col.enabled = true;

        rb.enabled = true;
        rb.type = RigidBody.Type.DYNAMIC;
        rb.useGravity = this.useGravity;
        if (massFactor !== 1) rb.mass = Math.max(0.01, rb.mass * massFactor);

        rb.setLinearVelocity(Vec3.ZERO);
        rb.setAngularVelocity(Vec3.ZERO);

        _dir.set(dir);
        _dir.multiplyScalar(power);
        rb.setLinearVelocity(_dir);
    }

    /**
     * Обычный снаряд убирает ProjectileManager. Картечь спавнится отдельно.
     * CCD оставляем включённым: без него мелкая дробь пролетает сквозь блоки.
     * У дула попадания игнорируем — пачка стартует внахлёст и иначе сразу гаснет.
     */
    private armPellet(node: Node) {
        const ccd = node.getComponent(ProjectileCCD);
        if (isValid(ccd)) ccd.enabled = false;

        const rb = node.getComponent(RigidBody);
        if (isValid(rb)) {
            try { rb.useCCD = true; } catch { }
        }

        const spawn = node.worldPosition.clone();
        const ignore = Math.max(0, this.pelletMuzzleIgnore);

        const col = node.getComponent(Collider);
        if (isValid(col)) {
            const onHit = (event: ICollisionEvent) => {
                if (!isValid(node)) return;
                const other = event.otherCollider?.node;
                if (isValid(other) && other.name.indexOf('Projectile') >= 0) return;
                if (ignore > 0 && Vec3.distance(node.worldPosition, spawn) < ignore) return;
                this.despawnShot(node);
            };
            col.on('onCollisionEnter', onHit);
        }

        if (this.pelletLifetime > 0) {
            this.scheduleOnce(() => this.despawnShot(node), this.pelletLifetime);
        }
    }

    private despawnShot(node: Node) {
        if (!isValid(node)) return;
        const col = node.getComponent(Collider);
        if (isValid(col)) col.enabled = false;
        const rb = node.getComponent(RigidBody);
        if (isValid(rb)) {
            try {
                rb.setLinearVelocity(Vec3.ZERO);
                rb.setAngularVelocity(Vec3.ZERO);
            } catch { }
            rb.enabled = false;
        }
        node.destroy();
    }

    private playSound(name: string) {
        if (name) SoundManager.playOneShot(name);
    }

    // --------------------------------------------------------------- UI

    private ensureUiRefs() {
        const scene = director.getScene();
        if (!scene) return;

        if (!isValid(this.buckshotButton) || !isValid(this.buckshotCountLabel)) {
            const kartesh = this.findNodeByName(scene, 'Kartesh');
            if (kartesh) {
                if (!isValid(this.buckshotButton)) this.buckshotButton = kartesh;
                if (!isValid(this.buckshotCountLabel)) {
                    this.buckshotCountLabel = kartesh.getComponentInChildren(Label);
                }
            }
        }

        if (!isValid(this.rocketButton) || !isValid(this.rocketCountLabel)) {
            const roket = this.findNodeByName(scene, 'Roket');
            if (roket) {
                if (!isValid(this.rocketButton)) this.rocketButton = roket;
                if (!isValid(this.rocketCountLabel)) {
                    this.rocketCountLabel = roket.getComponentInChildren(Label);
                }
            }
        }

        if (isValid(this.buckshotButton)) {
            this.stripGeneratedGlow(this.buckshotButton);
            this.buckshotBaseScale.set(this.buckshotButton.scale);
        }
        if (isValid(this.rocketButton)) {
            this.stripGeneratedGlow(this.rocketButton);
            this.rocketBaseScale.set(this.rocketButton.scale);
        }
    }

    private findNodeByName(root: Node, name: string): Node | null {
        if (root.name === name) return root;
        for (const child of root.children) {
            const found = this.findNodeByName(child, name);
            if (found) return found;
        }
        return null;
    }

    private hitUi(node: Node, loc: Vec2): boolean {
        if (!isValid(node) || !node.activeInHierarchy) return false;
        const ui = node.getComponent(UITransform);
        if (ui && ui.hitTest(loc)) return true;
        for (const child of node.children) {
            if (this.hitUi(child, loc)) return true;
        }
        return false;
    }

    private refreshUi() {
        this.setCount(this.buckshotCountLabel, this.buckshotLeft);
        this.setCount(this.rocketCountLabel, this.rocketLeft);

        const buckshotOn = this.isSpecialShoot && this.mode === SpecialShotMode.Buckshot;
        const rocketOn = this.isSpecialShoot && this.mode === SpecialShotMode.Rocket;
        this.styleButton(this.buckshotButton, this.buckshotBaseScale, buckshotOn, this.buckshotLeft);
        this.styleButton(this.rocketButton, this.rocketBaseScale, rocketOn, this.rocketLeft);
    }

    private setCount(label: Label, value: number) {
        if (!isValid(label)) return;
        label.string = `${value}`;
    }

    private styleButton(node: Node, baseScale: Vec3, selected: boolean, ammo: number) {
        if (!isValid(node)) return;

        const empty = ammo <= 0;
        const on = selected && !empty;
        const mul = on ? 1.08 : 1;
        node.setScale(baseScale.x * mul, baseScale.y * mul, baseScale.z * mul);

        const button = node.getComponent(Button);
        if (isValid(button)) button.interactable = !empty;

        const sprite = node.getComponent(Sprite);
        if (isValid(sprite)) sprite.grayscale = empty;

        this.setButtonGlow(sprite, on);
    }

    private stripGeneratedGlow(button: Node) {
        const leftover = button.getChildByName('SelectGlow');
        if (isValid(leftover)) leftover.destroy();
    }

    private setButtonGlow(sprite: Sprite | null, on: boolean) {
        if (!isValid(sprite)) return;

        Tween.stopAllByTarget(sprite);
        if (!this.spriteRestBlend.has(sprite)) {
            this.spriteRestBlend.set(sprite, sprite.dstBlendFactor);
        }

        if (!on) {
            sprite.color = this.restSpriteColor;
            sprite.dstBlendFactor = this.spriteRestBlend.get(sprite) ?? 4;
            return;
        }

        sprite.dstBlendFactor = 1;
        const glow = this.selectedGlowColor.clone();
        const rest = this.restSpriteColor.clone();
        sprite.color = glow;
        const dur = Math.max(0.08, this.selectedGlowPulseDuration);
        tween(sprite)
            .to(dur, { color: rest }, { easing: 'sineInOut' })
            .to(dur, { color: glow }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();
    }
}
