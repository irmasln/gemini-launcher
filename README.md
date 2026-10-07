# Gemini Launcher

A GNOME Shell extension that opens [Google Gemini](https://gemini.google.com) in a
resizable popup window from a button in the top panel.

*Türkçe: Üst paneldeki butona tıklayınca Gemini'yi boyutu ayarlanabilir bir popup pencerede açar.*

## Features

- **Left click** the panel icon: show / hide the Gemini popup
- **Right click**: Home, Back, Reload
- **Esc** hides the popup — your login session stays open
- Keyboard: `Ctrl+R` / `F5` reload, `Alt+Left` / `Alt+Right` back / forward, `Alt+Home` home
- Mouse side buttons go back / forward
- Links that open a new window are sent to your default browser
- Popup width and height are configurable in the extension preferences
- Login (cookies) is stored in `~/.local/share/gemini-popup`

Supports GNOME Shell 45 – 51.

## Requirements

The popup is a small GTK4 + WebKitGTK app, so these must be installed:

| Distro | Packages |
|---|---|
| Arch / CachyOS | `gjs webkitgtk-6.0` |
| Fedora | `gjs webkitgtk6.0` |
| Debian / Ubuntu | `gjs gir1.2-webkit-6.0` |

## Installation

### From extensions.gnome.org

Install from [extensions.gnome.org](https://extensions.gnome.org) (search for *Gemini Launcher*).

### From source

```sh
git clone https://github.com/irmasln/gemini-launcher.git \
    ~/.local/share/gnome-shell/extensions/gemini-launcher@irmasln
glib-compile-schemas ~/.local/share/gnome-shell/extensions/gemini-launcher@irmasln/schemas
```

Log out and back in (Wayland) or press `Alt+F2`, `r` (X11), then:

```sh
gnome-extensions enable gemini-launcher@irmasln
```

## Building a release zip

```sh
./pack.sh
```

This creates `gemini-launcher@irmasln.shell-extension.zip`, ready to upload to
extensions.gnome.org.

## License

GPL-2.0-or-later. This project is not affiliated with Google.
