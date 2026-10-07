import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GeminiLauncherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Popup Boyutu',
            description: 'Değişiklikler açık popup penceresine anında uygulanır.',
        });

        const widthRow = Adw.SpinRow.new_with_range(300, 4000, 10);
        widthRow.title = 'Genişlik (px)';
        settings.bind('popup-width', widthRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        const heightRow = Adw.SpinRow.new_with_range(300, 4000, 10);
        heightRow.title = 'Yükseklik (px)';
        settings.bind('popup-height', heightRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        group.add(widthRow);
        group.add(heightRow);
        page.add(group);
        window.add(page);
    }
}
