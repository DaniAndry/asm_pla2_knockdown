import {
    _decorator,
    AudioClip,
    AudioSource,
    CCBoolean,
    CCFloat,
    CCString,
    Component,
    director,
    input,
    Input,
    Toggle,
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('SoundRecord')
export class SoundRecord {
    @property({ type: AudioClip })
    clip: AudioClip = null;

    @property({ type: CCFloat, max: 10.0, min: 0.0, displayName: 'Volume', tooltip: 'Initial volume' })
    initialVolume: number = 1.0;

    @property({ type: CCBoolean, tooltip: 'Looped' })
    looped: boolean = false;

    @property({ type: CCString, tooltip: 'If empty - uses clip name' })
    name: string = '';

    source: AudioSource = null;
    paused: boolean = false;
}

@ccclass('SoundManager')
export class SoundManager extends Component {
    private static _instance: SoundManager | null = null;

    public static get(): SoundManager | null {
        return this._instance;
    }


    public static isMuted = false;


    public static firstTouch = false;


    public static hitsEnabled = false;

    public static toggleSoundButtonCB: ((muted: boolean) => void) | null = null;

    @property([SoundRecord])
    records: SoundRecord[] = [];

    @property({ tooltip: 'Имя записи фоновой музыки (loop)' })
    backgroundName: string = 'background';

    private _listeningFirstTouch = false;
    private static _missingSoundWarned: Set<string> = new Set();


    private static _lastHitTimestampMs: number = 0;

    protected onLoad(): void {
        if (SoundManager._instance && SoundManager._instance !== this) {
            this.node.destroy();
            return;
        }

        SoundManager._instance = this;
        director.addPersistRootNode(this.node);
        this._setupSounds();
        this._listenFirstTouch();
    }

    protected onDestroy(): void {
        if (this._listeningFirstTouch) {
            input.off(Input.EventType.TOUCH_START, this._onFirstTouch, this);
            this._listeningFirstTouch = false;
        }
        if (SoundManager._instance === this) {
            SoundManager._instance = null;
        }
    }

    private _listenFirstTouch() {
        if (this._listeningFirstTouch || SoundManager.firstTouch) return;
        input.on(Input.EventType.TOUCH_START, this._onFirstTouch, this);
        this._listeningFirstTouch = true;
    }

    private _onFirstTouch = () => {
        SoundManager.markFirstTouch();
    };

    static addRecord(source: AudioSource, name: string = '') {
        const sm = SoundManager._instance;
        if (!sm || !source) return;

        const rec = new SoundRecord();
        rec.name = name === '' ? source.node.name : name;
        rec.source = source;
        rec.clip = source.clip;
        rec.initialVolume = source.volume;
        rec.looped = source.loop;
        rec.paused = false;
        sm.records.push(rec);
    }

    static stopAll() {
        const sm = SoundManager._instance;
        if (!sm) return;

        sm.records.forEach((record) => {
            if (record.name === sm.backgroundName) return;
            record.source?.stop();
        });
    }

    static pauseAll() {
        const sm = SoundManager._instance;
        if (!sm) return;

        sm.records.forEach((record) => {
            if (record.source && record.source.state === 1) {
                record.paused = true;
                record.source.pause();
            }
        });
    }

    static resumeAll() {
        const sm = SoundManager._instance;
        if (!sm) return;

        sm.records.forEach((record) => {
            if (record.paused && record.source) {
                record.paused = false;
                record.source.play();
            }
        });
    }

    static muteAll() {
        const sm = SoundManager._instance;
        if (!sm) return;

        sm.records.forEach((record) => {
            if (record.source) record.source.volume = 0;
        });
        this.isMuted = true;
        SoundManager.toggleSoundButtonCB?.(true);
    }

    static unmuteAll() {
        const sm = SoundManager._instance;
        if (!sm) return;

        sm.records.forEach((record) => {
            if (record.source) record.source.volume = record.initialVolume;
        });
        this.isMuted = false;
        SoundManager.toggleSoundButtonCB?.(false);
    }

    mute(flag: boolean = true) {
        if (flag) SoundManager.muteAll();
        else SoundManager.unmuteAll();
    }

    static toggleSound(toggle: Toggle) {
        if (toggle.isChecked) SoundManager.unmuteAll();
        else SoundManager.muteAll();
    }

    static canPlay(): boolean {
        return !!this.get() && this.firstTouch && !this.isMuted;
    }

    static markFirstTouch() {
        if (this.firstTouch) return;
        this.firstTouch = true;

        const sm = this._instance;
        if (sm?._listeningFirstTouch) {
            input.off(Input.EventType.TOUCH_START, sm._onFirstTouch, sm);
            sm._listeningFirstTouch = false;
        }

        if (!this.isMuted) {
            this.unmuteAll();
        }


        this.playBackground();
    }

    static playRecord(name: string) {
        if (!this.canPlay()) return;
        const source = this.getRecordSource(name);
        if (!source) return;
        source.play();
    }

    static playOneShot(name: string, volumeScale: number = 1) {
        if (!name) return;

        if (!this.canPlay()) return;

        const record = this.getRecord(name);
        if (!record?.source || !record.clip) {
            if (!this._missingSoundWarned.has(name)) {
                this._missingSoundWarned.add(name);
                console.warn(`[SoundManager] Нет записи звука: "${name}". Есть: ${this.listRecordNames().join(', ') || '(пусто)'}`);
            }
            return;
        }

        record.source.volume = record.initialVolume > 0 ? record.initialVolume : 1;
        record.source.playOneShot(record.clip, volumeScale);
    }


    static playBackground(name?: string) {
        const sm = this.get();
        if (!sm || !this.canPlay()) return;

        const bgName = name || sm.backgroundName;
        const record = this.getRecord(bgName);
        if (!record?.source || !record.clip) return;

        record.source.loop = true;
        record.source.playOnAwake = false;
        record.source.volume = this.isMuted ? 0 : (record.initialVolume > 0 ? record.initialVolume : 1);
        if (record.source.state !== 1) {
            record.source.clip = record.clip;
            record.source.play();
        }
    }

    static stopBackground(name?: string) {
        const sm = this.get();
        if (!sm) return;
        const bgName = name || sm.backgroundName;
        this.getRecordSource(bgName)?.stop();
    }

    static enableHits() {
        this.hitsEnabled = true;
    }

    static disableHits() {
        this.hitsEnabled = false;
    }


    static notifyHit() {
        this._lastHitTimestampMs = performance.now();
    }

    static getLastHitTimestampMs(): number {
        return this._lastHitTimestampMs;
    }

    static listRecordNames(): string[] {
        const sm = this.get();
        if (!sm) return [];
        return sm.records.map((r) => r.name).filter(Boolean);
    }

    static stopRecord(name: string) {
        this.getRecordSource(name)?.stop();
    }

    static pauseRecord(name: string) {
        this.getRecordSource(name)?.pause();
    }

    static getRecordSource(name: string): AudioSource | null {
        const sm = this.get();
        if (!sm) return null;

        for (const record of sm.records) {
            if (record.name === name) return record.source;
        }
        return null;
    }

    static getRecord(name: string): SoundRecord | null {
        const sm = this.get();
        if (!sm) return null;

        for (const record of sm.records) {
            if (record.name === name) return record;
        }
        return null;
    }

    private _setupSounds() {
        const node = this.node;
        this.records.forEach((record) => {
            record.source = node.addComponent(AudioSource);
            if (record.name === '') {
                record.name = record.clip ? record.clip.name : '';
            }
            record.source.playOnAwake = false;
            record.source.clip = record.clip;
            record.source.loop = record.looped || record.name === this.backgroundName;
            record.source.volume = 0;
        });
    }
}
