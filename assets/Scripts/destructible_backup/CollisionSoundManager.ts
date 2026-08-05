import { _decorator, Component, Node, AudioClip, AudioSource, Vec3, CCFloat } from 'cc';
import { DestructibleObject, MaterialType } from './DestructibleObject';
const { ccclass, property } = _decorator;

/**
 * Менеджер звуков столкновений для разрушаемых объектов
 */
@ccclass('CollisionSoundManager')
export class CollisionSoundManager extends Component {
    @property([AudioClip])
    woodSounds: AudioClip[] = [];

    @property([AudioClip])
    iceSounds: AudioClip[] = [];

    @property([AudioClip])
    stoneSounds: AudioClip[] = [];

    @property([AudioClip])
    pigSounds: AudioClip[] = [];

    @property([AudioClip])
    birdSounds: AudioClip[] = [];

    @property(AudioSource)
    audioSource: AudioSource = null;

    @property(CCFloat)
    minVelocityThreshold: number = 5;

    @property(CCFloat)
    soundCooldown: number = 0.1;

    private _lastSoundTime: number = 0;
    private static _instance: CollisionSoundManager = null;

    /** Получить текущий экземпляр CollisionSoundManager */
    public static instance(): CollisionSoundManager {
        return CollisionSoundManager._instance;
    }

    onLoad() {
        // Инициализация синглтона
        CollisionSoundManager._instance = this;

        // Создаем AudioSource если он не существует
        if (!this.audioSource) {
            this.audioSource = this.addComponent(AudioSource);
        }
    }

    onDestroy() {
        if (CollisionSoundManager._instance === this) {
            CollisionSoundManager._instance = null;
        }
    }

    /**
     * Воспроизвести звук столкновения для материала
     * @param materialType Тип материала
     * @param velocity Скорость столкновения
     * @param position Позиция столкновения
     */
    playCollisionSound(materialType: MaterialType, velocity: number, position: Vec3) {
        const currentTime = Date.now() / 1000;
        
        // Проверяем, прошло ли достаточно времени с предыдущего звука
        if (currentTime - this._lastSoundTime < this.soundCooldown) return;
        
        // Проверяем, достаточна ли скорость для звука
        if (velocity < this.minVelocityThreshold) return;
        
        // Выбираем звук в зависимости от материала
        let sounds: AudioClip[] = null;
        switch (materialType) {
            case MaterialType.Wood:
                sounds = this.woodSounds;
                break;
            case MaterialType.Ice:
                sounds = this.iceSounds;
                break;
            case MaterialType.Stone:
                sounds = this.stoneSounds;
                break;
            case MaterialType.Pig:
                sounds = this.pigSounds;
                break;
            case MaterialType.Bird:
                sounds = this.birdSounds;
                break;
            default:
                return;
        }
        
        if (!sounds || sounds.length === 0) return;
        
        // Выбираем случайный звук из доступных
        const randomIndex = Math.floor(Math.random() * sounds.length);
        const sound = sounds[randomIndex];
        
        if (!sound) return;
        
        // Настраиваем громкость в зависимости от скорости
        const volume = Math.min(1.0, velocity / 50);
        this.audioSource.volume = volume;
        
        // Воспроизводим звук
        this.audioSource.playOneShot(sound);
        
        // Обновляем время последнего звука
        this._lastSoundTime = currentTime;
    }
}
