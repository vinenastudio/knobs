---
title: 'How to test your website on mobile devices from your desktop'
description: 'Test a site on phones from your computer: Chrome and Safari device modes, iOS Simulator, Android emulator, your phone over Wi-Fi, and their limits.'
slug: test-website-on-mobile-devices
date: 2026-10-29
updated: 2026-10-29
faq:
  - q: 'How can I see what my website looks like on a phone from my computer?'
    a: 'Open the site in Chrome, open DevTools with Command+Option+I (Ctrl+Shift+I on Windows), and click Toggle device toolbar. Pick a phone from the Dimensions list. Safari has the same thing under Develop > Enter Responsive Design Mode. Both show the layout at phone size, not a real phone browser.'
  - q: 'How do I open localhost on my phone?'
    a: "Put the phone on the same Wi-Fi as your computer, start the dev server so it listens on the network (for Vite, `npm run dev -- --host`), find your computer's IP with `ipconfig getifaddr en0` on a Mac, and open `http://<that IP>:<port>` on the phone."
  - q: "Is Chrome's device mode the same as testing on a real phone?"
    a: 'No. Google calls device mode a "first-order approximation". It changes the viewport, pixel ratio, user agent and touch, but the page still runs in desktop Chrome on a desktop CPU. Safari on iPhone has its own engine and its own toolbar behavior, so test there before you ship.'
  - q: 'Is there a Chrome extension to view a site on several devices at once?'
    a: 'Yes, several responsive viewer extensions show a page in many frames side by side. They render each size in an iframe of desktop Chrome, so they share the limits of device mode. They are good for a quick layout check across sizes.'
  - q: 'Can I test iPhone Safari on Windows?'
    a: "Not with Apple's tools. The iOS Simulator and Safari's Web Inspector run only on a Mac. On Windows you can check layouts in Chrome's device mode or use a paid cloud service with real iPhones."
---

To test your website on mobile devices from your desktop, open it in Chrome DevTools' device mode (Toggle device toolbar) or Safari's Responsive Design Mode to check the layout at phone sizes, then load it in the iOS Simulator or an Android emulator for a real mobile browser engine. Before you ship, open your local dev server on your own phone over Wi-Fi, because no emulator shows everything.

Each method below catches different bugs. We list them from fastest to most real, with the exact steps as of October 2026, and say what each one cannot show you.

## 1. Chrome DevTools device mode

This is the quickest check, and it is already in Chrome and Edge.

1. Open your page in Chrome.
2. Open DevTools: Command+Option+I on a Mac, Ctrl+Shift+I on Windows and Linux.
3. Click **Toggle device toolbar** (the phone and tablet icon at the top left of DevTools), or press Command+Shift+M (Ctrl+Shift+M) while DevTools has focus.
4. In the **Dimensions** list at the top of the page, pick a device, or leave it on **Responsive** and drag the handles to any size.
5. Click **Rotate** to switch to landscape.

What it changes: the viewport size, the device pixel ratio, the user agent of the preset, and touch input. The **Throttle** list adds slower network and CPU ("Mid-tier mobile", "Low-end mobile"). To add your own phone, open the device list, choose **Edit**, then **Add custom device**.

What it does not change: Google's own page calls device mode "a first-order approximation" and says "you don't actually run your code on a mobile device". The page still runs in desktop Chrome. Safari's toolbars, the iOS keyboard, `100vh` behavior on iPhone, and iOS-only bugs do not show up here.

Firefox has the same tool: Tools > Browser Tools > **Responsive Design Mode**, or Command+Option+M.

## 2. Safari Responsive Design Mode

On a Mac, Safari shows the page with WebKit, the engine that every iPhone browser uses.

1. If you do not see the Develop menu, choose Safari > Settings, click **Advanced**, and turn on **Show features for web developers**.
2. Choose **Develop > Enter Responsive Design Mode** (Control+Command+R).
3. Click a device at the top. Click it again to turn it to landscape.
4. Use the pop-up menus to change the pixel ratio and the user agent.

It is closer to an iPhone than Chrome's device mode because the engine is the same, but it is still desktop Safari at a small size. There are no iOS toolbars, no safe areas and no on-screen keyboard.

## 3. Responsive viewer extensions

"Responsive viewer" Chrome extensions show your page at several sizes side by side, so you can scroll one and see all of them. They are useful for catching a breakpoint that breaks at one width only.

They load each size in a frame of the same desktop Chrome, so they inherit every limit of device mode. Some sites also refuse to load in a frame. Use them for layout, not for real phone behavior.

## 4. iOS Simulator and Android emulator

These run the real mobile browser, which is where many bugs live.

**iOS Simulator (Mac only):**

1. Install Xcode from the Mac App Store.
2. Choose Xcode > Open Developer Tool > **Simulator**.
3. Pick a device in File > Open Simulator, then open Safari in it.
4. Type your dev server address. The Simulator shares your Mac's network, so `http://localhost:3000` works as is.
5. To inspect, open Safari on the Mac and choose **Develop >** the Simulator's name > your page.

**Android emulator:**

1. Install Android Studio and create a virtual device in the Device Manager.
2. Start it and open Chrome.
3. Use `http://10.0.2.2:3000`, not `localhost`. Android's documentation calls `10.0.2.2` the "special alias to your host loopback interface".
4. To inspect, open `chrome://inspect` in desktop Chrome.

Simulators show you the real Safari and Chrome toolbars, safe areas, the keyboard and engine-level bugs. They do not show real performance or real touch feel.

## 5. Your real phone, on your local network

Nothing replaces the phone in your hand. To open your local dev server on it:

1. Connect the phone and the computer to the same Wi-Fi.
2. Start the dev server so it listens on the network, not only on localhost:
   - Vite: `npm run dev -- --host`, or `server: { host: true }` in `vite.config`.
   - Next.js: `next dev -H 0.0.0.0`.
3. Find your computer's address. On a Mac: `ipconfig getifaddr en0`.
4. On the phone, open `http://192.168.1.20:5173` (your address and port).

Things that trip people up:

- **Next.js blocks it.** Next.js blocks cross-origin requests to dev-only assets by default. Add your address to `allowedDevOrigins` in `next.config.js`, for example `allowedDevOrigins: ['192.168.1.20']`.
- **The firewall.** macOS may ask to allow incoming connections for Node. Allow it.
- **HTTPS-only features.** Camera, geolocation, service workers and the clipboard need a secure context. `http://192.168.x.x` is not one, while `localhost` is. Use an HTTPS tunnel or a local HTTPS proxy for those.
- **Guest or office Wi-Fi.** Many such networks block devices from talking to each other.

**Inspect the real phone.** For iPhone: on the phone, turn on Settings > Apps > Safari > Advanced > **Web Inspector** (if your Settings app has no Apps entry, open Safari directly in Settings), connect it to the Mac with a cable, then choose **Develop >** your iPhone > the page in Safari on the Mac. For Android: turn on USB debugging, connect it, and open `chrome://inspect` in desktop Chrome. Its **Port forwarding** option lets the phone open `localhost:3000` from your computer over the cable, with no Wi-Fi setup.

## What emulation cannot fake

Keep this list in mind before you trust a desktop check:

- **Performance.** A desktop CPU is many times faster; CPU throttling is a rough guess.
- **The real browser chrome.** Safari's address bar that shrinks on scroll, and the viewport units (`svh`, `lvh`, `dvh`) that follow it.
- **The keyboard.** How a form field, a fixed footer or a chat input moves when the on-screen keyboard opens.
- **Real touch.** Pinch, momentum scrolling, and `:hover` that sticks after a tap.
- **Hardware.** Camera, sensors, notch and Dynamic Island, low power mode, a bad cell connection.

Use desktop tools for most of the work, and keep a real phone for the last pass.

## Where knobs fits

We make [knobs](/), an open source, dev-only panel that runs inside your own page. It covers the part of this work you do many times a day: looking at a page as a phone without leaving the page.

- **Devices in your page.** Pick an iPhone, Pixel, iPad or laptop preset, and the page loads in a real viewport of that size, inside a drawing of the phone with Safari's or Chrome's bars, so media queries and `vw` follow. See [devices](/docs/devices).
- **The rest of the conditions.** The same panel sets dark mode, reduced motion, text size, locale and right-to-left, time zone and clock, and offline. See [all knobs](/docs/knobs).
- **Any browser, or any site.** The npm package `@vinena/knobs` works in your own app in any browser, and the [Chrome extension](/docs/extension) puts the panel on any site, with the viewport set for real by Chrome.
- **For coding agents.** An agent can set a device, wait for the page and grab what broke through `window.knobs`. See [agents](/docs/agents).

It has the same limit as device mode: it runs in your desktop browser. Our [limits page](/docs/limits) lists what it cannot fake, such as real touch with pinch and network throttling. Keep the simulator and your phone for the last pass.

To test dark mode, time zones and right-to-left layouts next, see [how to test dark mode, time zones and RTL](/blog/test-dark-mode-time-zones-rtl).

<!-- faq -->

## Sources

- Chrome for Developers: [Simulate mobile devices with device mode](https://developer.chrome.com/docs/devtools/device-mode) and [Remote debug Android devices](https://developer.chrome.com/docs/devtools/remote-debugging)
- Apple: [Safari Developer Help, Responsive Design Mode](https://support.apple.com/en-us/guide/safari-developer/dev84bd42758/mac), [Use the developer tools in the Develop menu](https://support.apple.com/guide/safari/use-the-developer-tools-in-the-develop-menu-sfri20948/mac), [Inspecting iOS and iPadOS](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios)
- Android Developers: [Set up Android Emulator networking](https://developer.android.com/studio/run/emulator-networking)
- Next.js: [allowedDevOrigins](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins)
- Vite: [server.host](https://vite.dev/config/server-options#server-host)
