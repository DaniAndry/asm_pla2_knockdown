import { _decorator, Button, Color, Component, instantiate, Label, Node, Prefab, Sprite } from 'cc';
import super_html_playable from './super_html/super_html_playable';

const { ccclass, property } = _decorator;


@ccclass('GameEndButtonHandler')
export class GameEndButtonHandler extends Component {

     onLoad() {
        super_html_playable.set_google_play_url("https://play.google.com/store/apps/details?id=com.rovio.baba&hl=en");
        super_html_playable.set_app_store_url("https://apps.apple.com/cy/app/angry-birds-2/id880047117");

        if (super_html_playable.is_hide_download()) {
        }
    }

    on_click_game_end() {
        super_html_playable.game_end();
    }

    on_click_download() {
        super_html_playable.download();
    }


    onDestroy() {

        this.node.off(Node.EventType.TOUCH_END, this.onButtonClick, this);
    }


    onButtonClick() {
        console.log('Кнопка завершения игры нажата, вызываем super_html_playable.game_end()');
        
        // Вызываем метод game_end() из вашего существующего класса
        super_html_playable.game_end();
    }
}
