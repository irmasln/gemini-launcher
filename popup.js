// Gemini popup penceresi: GTK4 + WebKitGTK 6.0
// Kullanım: gjs -m popup.js <genişlik> <yükseklik>
import Gtk from 'gi://Gtk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import WebKit from 'gi://WebKit?version=6.0';
import System from 'system';

const APP_ID = 'io.github.irmasln.GeminiPopup';
const GEMINI_URL = 'https://gemini.google.com/app';

const [width = 480, height = 720] = System.programArgs.map(n => parseInt(n, 10));

// Oturum (çerezler, giriş) kalıcı olsun diye ayrı veri dizini
const dataDir = GLib.build_filenamev([GLib.get_user_data_dir(), 'gemini-popup']);
const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'gemini-popup']);

const app = new Gtk.Application({application_id: APP_ID});
let webView = null;

// Panel sağ tık menüsü bu eylemleri D-Bus üzerinden çağırır
const addAction = (name, accels, callback) => {
    const action = new Gio.SimpleAction({name});
    action.connect('activate', callback);
    app.add_action(action);
    app.set_accels_for_action(`app.${name}`, accels);
};
addAction('reload', ['<Control>r', 'F5'], () => webView?.reload());
addAction('home', ['<Alt>Home'], () => webView?.load_uri(GEMINI_URL));
addAction('back', ['<Alt>Left'], () => {
    if (webView?.can_go_back())
        webView.go_back();
    else
        webView?.load_uri(GEMINI_URL);
});
addAction('forward', ['<Alt>Right'], () => webView?.go_forward());

app.connect('activate', () => {
    const existing = app.get_active_window();
    if (existing) {
        existing.present();
        return;
    }

    const session = new WebKit.NetworkSession({
        data_directory: dataDir,
        cache_directory: cacheDir,
    });
    session.get_cookie_manager().set_persistent_storage(
        GLib.build_filenamev([dataDir, 'cookies.sqlite']),
        WebKit.CookiePersistentStorage.SQLITE);

    webView = new WebKit.WebView({network_session: session});

    // Yeni pencere/sekme açmak isteyen linkleri varsayılan tarayıcıya gönder
    webView.connect('decide-policy', (_view, decision, type) => {
        if (type !== WebKit.PolicyDecisionType.NEW_WINDOW_ACTION)
            return false;
        const uri = decision.get_navigation_action().get_request().get_uri();
        Gio.AppInfo.launch_default_for_uri_async(uri, null, null, null);
        decision.ignore();
        return true;
    });

    // Web süreci çöker/donarsa boş ekranda kalmasın: sayfayı yeniden yükle
    webView.connect('web-process-terminated', () => webView.load_uri(GEMINI_URL));

    // Yükleme başarısızsa (ağ hazır değil vb.) birkaç saniye sonra tekrar dene
    webView.connect('load-failed', (_view, _event, _uri, error) => {
        if (error.matches(WebKit.NetworkError, WebKit.NetworkError.CANCELLED))
            return false;
        GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3, () => {
            webView.load_uri(GEMINI_URL);
            return GLib.SOURCE_REMOVE;
        });
        return false;
    });

    webView.load_uri(GEMINI_URL);

    const window = new Gtk.ApplicationWindow({
        application: app,
        title: 'Gemini',
        default_width: width,
        default_height: height,
        decorated: false,
        child: webView,
    });

    // Esc ile gizle (pencereyi küçült; oturum açık kalır)
    const keys = new Gtk.EventControllerKey();
    keys.connect('key-pressed', (_c, keyval) => {
        if (keyval === 0xff1b /* Escape */) {
            window.minimize();
            return true;
        }
        return false;
    });
    window.add_controller(keys);

    // Farenin geri/ileri yan tuşları
    const mouseNav = new Gtk.GestureClick({button: 0});
    mouseNav.connect('pressed', gesture => {
        const button = gesture.get_current_button();
        if (button === 8)
            app.activate_action('back', null);
        else if (button === 9)
            app.activate_action('forward', null);
    });
    webView.add_controller(mouseNav);

    window.present();
});

app.run([System.programInvocationName]);
