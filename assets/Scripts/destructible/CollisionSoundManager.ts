import { _decorator, Component, Node, AudioSource, AudioClip, find } from 'cc';
const { ccclass, property } = _decorator;

/**
 * Менеджер звуков столкновений
 * @deprecated Функциональность теперь включена в UniversalCollisionHandler
 */
@ccclass('CollisionSoundManager')
export class CollisionSoundManager extends Component {
    private static _instance: CollisionSoundManager = null;

    @property([AudioClip])
    collisionSounds: AudioClip[] = [];

    @property([AudioClip])
    destructionSounds: AudioClip[] = [];

    @property(AudioSource)
    audioSource: AudioSource = null;

    onLoad() {
        CollisionSoundManager._instance = this;
        
        if (!this.audioSource) {
            this.audioSource = this.getComponent(AudioSource);
            if (!this.audioSource) {
                this.audioSource = this.addComponent(AudioSource);
            }
        }
        
        console.log('[CollisionSoundManager] Инициализирован');
    }

    onDestroy() {
        if (CollisionSoundManager._instance === this) {
            CollisionSoundManager._instance = null;
        }
    }

    static getInstance(): CollisionSoundManager {
        if (!CollisionSoundManager._instance) {
            const node = find('CollisionSoundManager');
            if (node) {
                CollisionSoundManager._instance = node.getComponent(CollisionSoundManager);
                if (!CollisionSoundManager._instance) {
                    CollisionSoundManager._instance = node.addComponent(CollisionSoundManager);
                }
            }
        }
        return CollisionSoundManager._instance;
    }

    playCollisionSound() {
        if (this.collisionSounds && this.collisionSounds.length > 0 && this.audioSource) {
            const index = Math.floor(Math.random() * this.collisionSounds.length);
            this.audioSource.playOneShot(this.collisionSounds[index]);
        }
    }

    playDestructionSound() {
        if (this.destructionSounds && this.destructionSounds.length > 0 && this.audioSource) {
            const index = Math.floor(Math.random() * this.destructionSounds.length);
            this.audioSource.playOneShot(this.destructionSounds[index]);
        }
    }
}
