// Deterministic offline export: headless Chrome renders each frame at an exact
// time (motion-blur subframes included), frames are piped into ffmpeg, then the
// matching slice of the song is muxed in.
//   node tools/export.mjs --stills 1,5.5,12        -> out/still_*.png
//   node tools/export.mjs --video [--from 0 --to 30] [--w 1280 --h 720 --sub 6]
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { serve } from "./serve.mjs";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes("--" + k);
const W = +arg("w", 1280), H = +arg("h", 720), SUB = +arg("sub", 6);
const OUT = "out";
fs.mkdirSync(OUT, { recursive: true });

// --workers N: split the frame range into N contiguous slices rendered by N
// child processes (GPU work of one overlaps PNG encode of another), then
// concatenate the segments losslessly and mux the audio once.
if (has("video") && +arg("workers", 1) > 1) {
  const N = +arg("workers"), fps = 24;
  const server0 = await serve();
  // ask one child for the range, so slicing uses the same numbers as rendering
  const probe = await new Promise((ok) => {
    let s = ""; const c = spawn("node", ["tools/export.mjs", "--noserve", "--w", "64", "--h", "36", "--sub", "1"]);
    c.stdout.on("data", (d) => (s += d)); c.on("close", () => ok(JSON.parse(s.match(/range: (\{.*\})/)[1].replace(/(\w+):/g, '"$1":'))));
  });
  const from = +arg("from", probe.start), to = +arg("to", probe.end), n = Math.round((to - from) * fps);
  const t0 = Date.now(), segs = [];
  await Promise.all(Array.from({ length: N }, (_, k) => {
    const i0 = Math.floor((n * k) / N), i1 = Math.floor((n * (k + 1)) / N), seg = `${OUT}/_seg${k}.mp4`;
    segs.push(seg);
    return new Promise((ok, bad) => {
      const c = spawn("node", ["tools/export.mjs", "--video", "--noserve", "--segment", seg, "--from", String(from), "--i0", String(i0), "--i1", String(i1),
        "--w", String(W), "--h", String(H), "--sub", String(SUB)], { stdio: ["ignore", "pipe", "inherit"] });
      c.stdout.on("data", (d) => { const m = String(d).match(/frame (\d+)\/(\d+).*eta (\d+)s/); if (m && +m[1] % 96 === 0) console.log(`[w${k}] ${m[1]}/${m[2]} eta ${m[3]}s`); });
      c.on("close", (code) => (code === 0 ? ok() : bad(new Error(`worker ${k} exited ${code}`))));
    });
  }));
  fs.writeFileSync(`${OUT}/_segs.txt`, segs.map((s) => `file '${s.replace(`${OUT}/`, "")}'`).join("\n"));
  const final = arg("out", `${OUT}/final.mp4`);
  await new Promise((r) => spawn("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${OUT}/_segs.txt`,
    "-ss", String(from), "-t", String(n / fps), "-i", "web/media/song.mp3",
    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", "-shortest", final],
    { stdio: "inherit" }).on("close", r));
  for (const s of segs) fs.unlinkSync(s);
  fs.unlinkSync(`${OUT}/_segs.txt`);
  console.log("wrote", final, `(${((Date.now() - t0) / 1000).toFixed(0)}s, ${N} workers)`);
  server0.close();
  process.exit(0);
}

const server = has("noserve") ? null : await serve();
const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-gpu-watchdog",
         "--autoplay-policy=no-user-gesture-required"],
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[page]", m.text()); });
page.on("pageerror", (e) => console.log("[page error]", e.message));
await page.setViewport({ width: W, height: H + 60 });
await page.goto(`http://127.0.0.1:5178/web/index.html?export&w=${W}&h=${H}&sub=${SUB}`);
await page.waitForFunction(() => window.__mv, { timeout: 60000 });
const info = await page.evaluate(() => {
  const gl = document.querySelector("canvas").getContext("webgl2");
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "?", range: window.__mv.range,
    fps: window.__mv.fps, shots: window.__mv.shots };
});
console.log("GPU:", info.gpu, " range:", info.range);
if (has("shots")) {
  for (const s of info.shots) console.log(`  ${s.start.toFixed(2).padStart(7)} → ${s.end.toFixed(2).padStart(7)}  ${s.name}`);
  // structural checks: every shot has positive length, shots tile the range
  // with no gaps/overlaps (a gap renders black), last shot ends at the range end
  const S = info.shots, bad = [];
  S.forEach((s, i) => {
    if (s.end - s.start <= 0.01) bad.push(`non-positive duration: ${s.name} ${s.start} → ${s.end}`);
    if (i > 0 && Math.abs(s.start - S[i - 1].end) > 0.02) bad.push(`${s.start > S[i - 1].end ? "GAP" : "OVERLAP"} ${S[i - 1].name} ${S[i - 1].end} | ${s.name} ${s.start}`);
  });
  if (S.length && Math.abs(S[0].start - info.range.start) > 0.02) bad.push(`first shot starts at ${S[0].start}, range starts ${info.range.start}`);
  if (S.length && Math.abs(S.at(-1).end - info.range.end) > 0.02) bad.push(`last shot ends at ${S.at(-1).end}, range ends ${info.range.end}`);
  console.log(bad.length ? "SHOT CHECK FAILED\n  " + bad.join("\n  ") : "SHOT CHECK OK");
}

const grab = async (t) => Buffer.from((await page.evaluate((t) => window.__mv.frame(t), t)).split(",")[1], "base64");

if (has("stills")) {
  for (const t of arg("stills").split(",").map(Number)) {
    const t0 = Date.now();
    fs.writeFileSync(`${OUT}/still_${t.toFixed(2)}.png`, await grab(t));
    console.log(`still ${t}s  ${Date.now() - t0}ms`);
  }
}

if (has("video")) {
  const from = +arg("from", info.range.start), to = +arg("to", info.range.end), fps = info.fps;
  // a segment worker renders global frame indices [i0, i1) — times stay exact
  const SEG = arg("segment", null);
  const i0 = +arg("i0", 0), i1 = +arg("i1", Math.round((to - from) * fps));
  const n = i1 - i0, silent = SEG || `${OUT}/_video.mp4`;
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
    // RGB → BT.709 limited-range YUV, explicitly tagged so players don't guess
    // (untagged HD is often shown with the wrong matrix → shifted blues).
    // tune=film + aq-mode 3 keep dark gradients and film grain from banding.
    "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int",
    "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-tune", "film", "-x264-params", "aq-mode=3",
    "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    silent], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const buf = await grab(from + (i0 + i) / fps);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 24 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`frame ${i}/${n}  ${(el / (i + 1)).toFixed(2)}s/f  eta ${((n - i) * el / (i + 1)).toFixed(0)}s`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  if (SEG) { await browser.close(); process.exit(0); }       // segment workers stop here; the parent muxes
  const final = arg("out", `${OUT}/preview_${from.toFixed(1)}-${to.toFixed(1)}.mp4`);
  await new Promise((r) => spawn("ffmpeg", ["-v", "error", "-y", "-i", silent, "-ss", String(from), "-t", String(to - from),
    "-i", "web/media/song.mp3", "-map", "0:v", "-map", "1:a", "-c:v", "copy",
    "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", "-shortest", final], { stdio: "inherit" }).on("close", r));
  fs.unlinkSync(silent);
  console.log("wrote", final, `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}

await browser.close();
if (server) server.close();
