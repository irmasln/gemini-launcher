import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

const APP_ID = 'io.github.irmasln.GeminiPopup';
const APP_PATH = '/io/github/irmasln/GeminiPopup';
const MARGIN = 6;
// Başlatmadan sonra pencere bu süre içinde gelmezse süreç takılmış sayılır
const LAUNCH_TIMEOUT_MS = 10000;

export default class GeminiLauncherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._settingsId = this._settings.connect('changed', () => {
            const win = this._findWindow();
            if (win)
                this._place(win);
        });

        this._windowCreatedId = global.display.connect('window-created',
            (_display, win) => this._onWindowCreated(win));

        this._button = new PanelMenu.Button(0.0, this.metadata.name);
        this._button.add_child(new St.Icon({
            icon_name: 'starred-symbolic',
            style_class: 'system-status-icon',
        }));
        if (this._button._clickGesture) {
            // GNOME 49+: menüyü ClickGesture açıyor. Onu sağ tıka kısıtla,
            // sol tık için kendi hareketimizi ekle.
            this._button._clickGesture.set_required_button(Clutter.BUTTON_SECONDARY);
            const leftClick = new Clutter.ClickGesture();
            leftClick.set_required_button(Clutter.BUTTON_PRIMARY);
            leftClick.set_recognize_on_press(true);
            leftClick.connect('recognize', () => this._toggle());
            this._button.add_action(leftClick);
        } else {
            // Eski sürümler: 'event' sinyali vfunc_event'ten önce çalışır: sol tık
            // popup'ı açar, sağ tık olayı geçirir ve PanelMenu.Button menüyü açar
            this._button.connect('event', (_actor, event) => {
                const type = event.type();
                if (type === Clutter.EventType.TOUCH_BEGIN ||
                    (type === Clutter.EventType.BUTTON_PRESS &&
                     event.get_button() === Clutter.BUTTON_PRIMARY)) {
                    this._toggle();
                    return Clutter.EVENT_STOP;
                }
                if (type === Clutter.EventType.BUTTON_PRESS &&
                    event.get_button() !== Clutter.BUTTON_SECONDARY)
                    return Clutter.EVENT_STOP;
                return Clutter.EVENT_PROPAGATE;
            });
        }

        const items = [
            ['Ana Sayfa', 'home', 'go-home-symbolic'],
            ['Geri', 'back', 'go-previous-symbolic'],
            ['Sayfayı Yenile', 'reload', 'view-refresh-symbolic'],
        ].map(([label, action, icon]) => this._button.menu.addAction(label,
            () => this._activateAction(action), icon));
        this._button.menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                const running = this._findWindow() !== null;
                items.forEach(item => item.setSensitive(running));
            }
        });
        Main.panel.addToStatusArea(this.uuid, this._button);
    }

    disable() {
        this._clearWatchdog();
        if (this._relaunchId) {
            GLib.source_remove(this._relaunchId);
            this._relaunchId = 0;
        }
        global.display.disconnect(this._windowCreatedId);
        this._settings.disconnect(this._settingsId);
        this._settings = null;

        this._proc?.force_exit();
        this._proc = null;

        this._button?.destroy();
        this._button = null;
    }

    _isPopup(win) {
        return win.get_gtk_application_id() === APP_ID ||
            win.get_wm_class() === APP_ID;
    }

    _findWindows() {
        // list_all_windows küçültülmüş pencereleri de içerir
        return global.display.list_all_windows().filter(w => this._isPopup(w));
    }

    _findWindow() {
        // Birden fazla popup penceresi varsa ilkini tut, fazlasını kapat
        const [win, ...extra] = this._findWindows();
        for (const w of extra)
            w.delete(global.get_current_time());
        return win ?? null;
    }

    _show(win) {
        if (win.minimized)
            win.unminimize();
        this._place(win);
        win.activate(global.get_current_time());
    }

    _toggle() {
        const win = this._findWindow();
        if (win) {
            if (win.has_focus() && !win.minimized)
                win.minimize();
            else
                this._show(win);
            return;
        }

        // Başlatma sürüyor: pencere gelince kendisi açılacak
        if (this._watchdogId)
            return;

        this._launch();
    }

    _clearWatchdog() {
        if (this._watchdogId) {
            GLib.source_remove(this._watchdogId);
            this._watchdogId = 0;
        }
    }

    _startWatchdog() {
        this._clearWatchdog();
        this._watchdogId = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
            LAUNCH_TIMEOUT_MS, () => {
                this._watchdogId = 0;
                if (!this._findWindow()) {
                    console.warn('Gemini Launcher: popup yanıt vermiyor, yeniden başlatılıyor');
                    this._killStale(() => this._launch());
                }
                return GLib.SOURCE_REMOVE;
            });
    }

    // Takılı kalmış popup sürecini (D-Bus adını tutan) ve bizim başlattığımızı sonlandır
    _killStale(callback) {
        this._proc?.force_exit();
        this._proc = null;
        Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'GetConnectionUnixProcessID',
            new GLib.Variant('(s)', [APP_ID]), new GLib.VariantType('(u)'),
            Gio.DBusCallFlags.NONE, 2000, null, (conn, res) => {
                try {
                    const [pid] = conn.call_finish(res).deepUnpack();
                    Gio.Subprocess.new(['kill', '-9', `${pid}`],
                        Gio.SubprocessFlags.NONE);
                } catch (e) {
                    // Ad sahipsiz: öldürülecek süreç yok
                }
                // Bu arada eklenti devre dışı bırakıldıysa yeniden başlatma
                if (!this._settings)
                    return;
                this._relaunchId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                    this._relaunchId = 0;
                    callback();
                    return GLib.SOURCE_REMOVE;
                });
            });
    }

    _activateAction(name) {
        // Popup, GtkApplication olarak eylemlerini D-Bus'ta yayınlıyor
        const win = this._findWindow();
        if (win)
            this._show(win);
        Gio.DBus.session.call(APP_ID, APP_PATH, 'org.gtk.Actions', 'Activate',
            new GLib.Variant('(sava{sv})', [name, [], {}]),
            null, Gio.DBusCallFlags.NONE, -1, null, (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (e) {
                    console.error(`Gemini Launcher: '${name}' eylemi başarısız`, e);
                }
            });
    }

    _launch() {
        // Uygulama zaten çalışıyorsa GtkApplication bu çağrıyı mevcut
        // örneğe iletir (tek örnek); pencere yoksa yenisini oluşturur.
        this._startWatchdog();
        const width = this._settings.get_int('popup-width');
        const height = this._settings.get_int('popup-height');
        const script = GLib.build_filenamev([this.path, 'popup.js']);
        try {
            const proc = Gio.Subprocess.new(
                ['gjs', '-m', script, `${width}`, `${height}`],
                Gio.SubprocessFlags.NONE);
            this._proc = proc;
            proc.wait_async(null, () => {
                if (this._proc === proc)
                    this._proc = null;
            });
        } catch (e) {
            this._clearWatchdog();
            console.error('Gemini Launcher: popup başlatılamadı', e);
        }
    }

    _onWindowCreated(win) {
        // Wayland'da app id / wm_class ilk karede belli olur
        const actor = win.get_compositor_private();
        if (!actor)
            return;
        const id = actor.connect('first-frame', () => {
            actor.disconnect(id);
            if (!this._isPopup(win))
                return;
            this._clearWatchdog();
            // Başka bir popup penceresi zaten varsa bunu kapat, eskisini göster
            const other = this._findWindows().find(w => w !== win);
            if (other) {
                win.delete(global.get_current_time());
                this._show(other);
                return;
            }
            win.make_above();
            this._show(win);
        });
    }

    _place(win) {
        const width = this._settings.get_int('popup-width');
        const height = this._settings.get_int('popup-height');

        const monitor = Main.layoutManager.primaryIndex;
        const area = win.get_work_area_for_monitor(monitor);

        const w = Math.min(width, area.width - 2 * MARGIN);
        const h = Math.min(height, area.height - 2 * MARGIN);

        // Butonun ortasına hizala, ekran dışına taşmasın
        const [bx] = this._button.get_transformed_position();
        const center = bx + this._button.width / 2;
        let x = Math.round(center - w / 2);
        x = Math.max(area.x + MARGIN, Math.min(x, area.x + area.width - w - MARGIN));
        const y = area.y + MARGIN;

        win.move_resize_frame(true, x, y, w, h);
    }
}
