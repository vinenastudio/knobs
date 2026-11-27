import { bezelsBeside } from "./engine/bezels";
import { mount } from "./index";
import { pin } from "./instance";

// Read as the script runs, the only time the document knows which one it is.
const script = document.currentScript;
bezelsBeside(script instanceof HTMLScriptElement ? script.src : "");
// `<script src=".../index.global.js" data-grab-send="/grab">` sends each grab there.
const grabSend = script instanceof HTMLScriptElement ? script.dataset.grabSend : undefined;

pin(window);
mount(grabSend ? { grabSend } : {});
