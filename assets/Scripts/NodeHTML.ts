import { _decorator, Component } from 'cc';
import super_html_playable from './super_html_playable';
const { ccclass, property } = _decorator;

@ccclass('NodeHTML')
export class NodeHTML extends Component {


    onLoad() {
        super_html_playable.set_google_play_url("https://play.google.com/store/apps/details?id=com.famobi.cannonballs3d&hl=ru");
        super_html_playable.set_app_store_url("https://apps.apple.com/us/app/cannon-balls-3d-tower-crash/id6468768727");

    }

    on_click_download() {
        super_html_playable.download();
        super_html_playable.game_end();
    }
}


