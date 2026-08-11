import { _decorator, Component } from 'cc';
import super_html_playable from './super_html_playable';

const { ccclass, property } = _decorator;

@ccclass('NodeHTML')
export class NodeHTML extends Component {

    onLoad() {
        super_html_playable.set_google_play_url('https://play.google.com/store/apps/details?id=com.echidna.association.tile');
        super_html_playable.set_app_store_url('https://apps.apple.com/us/app/word-association-tiles/id6757710438');
    }


    OnClick() {
        this.on_click_download();
    }

    on_click_download() {
        super_html_playable.download();
        super_html_playable.game_end();
    }
}
