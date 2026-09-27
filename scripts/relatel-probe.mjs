#!/usr/bin/env node
/**
 * The Relatel test (plan-go-live §1A): does a call on Finn's MOBILE come back
 * through the API with its recording, and in what shape?
 *
 *   RELATEL_TOKEN=… node scripts/relatel-probe.mjs                # last 24 h
 *   RELATEL_TOKEN=… node scripts/relatel-probe.mjs --since=2026-09-29T11:00:00Z
 *   RELATEL_TOKEN=… node scripts/relatel-probe.mjs --watch=20     # poll 20 min
 *   RELATEL_TOKEN=… node scripts/relatel-probe.mjs --download     # + audio format
 *
 * The four questions it answers, one line each at the end:
 *   1. Do mobile calls appear in GET /calls with `recording.sound.url`?
 *   2. What audio comes back — format, mono or two channels, sample rate?
 *   3. How long after hang-up does the recording appear? (--watch)
 *   4. Do voicemails come back (GET /voice_mails, …/sound as MP3)?
 *
 * THE TOKEN IS FINN'S OWN personal access token
 * (app.relatel.dk/account/authorized_applications, created logged in as him):
 * only a number's own user may hear its recordings, so an admin token will not
 * do. It is a secret (config doctrine tier 1): pass it in the environment for
 * this run only — never on the command line, never in a file in the repo — and
 * this script never prints it.
 *
 * Downloads are CUSTOMER CALL AUDIO: they go to the OS temp dir, not the repo,
 * and the script says where so they can be deleted after the test.
 *
 * API: https://app.relatel.dk/api/v2 (spec: dev.relatel.dk/oas), bearer auth.
 * Numbers come back as country code + number without "+" (4571999999).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://app.relatel.dk/api/v2";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const token = process.env.RELATEL_TOKEN;
if (!token) {
  console.error(
    "RELATEL_TOKEN is not set. Run as:  RELATEL_TOKEN=… node scripts/relatel-probe.mjs",
  );
  process.exit(2);
}

const since = args.since
  ? new Date(String(args.since))
  : new Date(Date.now() - 24 * 3600 * 1000);
if (Number.isNaN(since.getTime())) {
  console.error(`--since is not a date: ${args.since}`);
  process.exit(2);
}
const watchMinutes = args.watch === true ? 15 : Number(args.watch ?? 0);
const download = Boolean(args.download);
const outDir = join(tmpdir(), "relatel-probe");

async function api(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `${res.status} from ${path} — the token was refused. Is it Finn's own, and still active?`,
    );
  }
  if (!res.ok) throw new Error(`${res.status} from ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Host + path only: a recording URL may carry a signature in its query. */
function safeUrl(u) {
  try {
    const url = new URL(u);
    return `${url.host}${url.pathname}${url.search ? " (+query)" : ""}`;
  } catch {
    return "(unparseable url)";
  }
}

const fmtTime = (iso) => (iso ? iso.replace("T", " ").slice(0, 19) : "—");

async function listCalls() {
  const q = new URLSearchParams({
    started_at_gt_or_eq: since.toISOString(),
    limit: "100",
  });
  const data = await api(`/calls?${q}`);
  return data.calls ?? [];
}

async function listVoicemails() {
  const data = await api(`/voice_mails?limit=50`);
  return (data.voice_mails ?? []).filter(
    (v) => !v.created_at || new Date(v.created_at) >= since,
  );
}

function printCalls(calls) {
  console.log(`\nCALLS since ${fmtTime(since.toISOString())} — ${calls.length}`);
  for (const c of calls) {
    const rec = c.recording;
    const recText = !rec
      ? "no recording"
      : rec.expired
        ? "recording EXPIRED"
        : `recording ${rec.duration ?? "?"} s, ${(rec.sound?.formats ?? []).join("/") || "format ?"}` +
          `${rec.accepted === false ? ", consent NOT accepted" : ""}` +
          `${rec.sound?.url ? ` → ${safeUrl(rec.sound.url)}` : ", NO url"}`;
    console.log(
      `  ${fmtTime(c.started_at)}  ${String(c.direction).padEnd(8)} ${String(c.status).padEnd(9)} ` +
        `${String(c.endpoint_type ?? "").padEnd(9)} ${String(c.endpoint_name ?? c.endpoint ?? "").padEnd(18)} ` +
        `remote ${c.remote_number ?? "—"}  talk ${c.talk_duration ?? "—"} s  ${recText}` +
        `${c.voice_mail ? "  + voicemail" : ""}`,
    );
  }
}

function printVoicemails(vms) {
  console.log(`\nVOICEMAILS since ${fmtTime(since.toISOString())} — ${vms.length}`);
  for (const v of vms) {
    console.log(
      `  ${fmtTime(v.created_at)}  #${v.id}  ${v.duration ?? "?"} s  for ${v.endpoint_name ?? v.endpoint ?? "—"}` +
        `  from ${v.from_number ?? "—"}  ${(v.sound?.formats ?? []).join("/") || ""}` +
        `${v.sound?.url ? ` → ${safeUrl(v.sound.url)}` : ""}`,
    );
  }
}

/** Channels and sample rate from the bytes — the diarization question. */
function describeAudio(buf, contentType) {
  // WAV: RIFF....WAVE, then a "fmt " chunk.
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WAVE") {
    const i = buf.indexOf("fmt ");
    if (i > 0) {
      return `WAV, ${buf.readUInt16LE(i + 10)} channel(s), ${buf.readUInt32LE(i + 12)} Hz`;
    }
    return "WAV (no fmt chunk found)";
  }
  // MP3: skip an ID3v2 tag, then read the first frame header.
  let off = 0;
  if (buf.slice(0, 3).toString() === "ID3") {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    off = 10 + size;
  }
  for (let i = off; i < Math.min(buf.length - 4, off + 64 * 1024); i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (buf[i + 1] >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const rateIdx = (buf[i + 2] >> 2) & 0x03;
    const mode = (buf[i + 3] >> 6) & 0x03; // 3 = mono
    if (versionBits === 1 || rateIdx === 3) continue; // reserved values: not a real header
    const base = [44100, 48000, 32000][rateIdx];
    const rate = versionBits === 3 ? base : versionBits === 2 ? base / 2 : base / 4;
    const modes = ["stereo", "joint stereo", "dual channel (two separate channels)", "mono"];
    return `MP3, ${modes[mode]}, ${rate} Hz`;
  }
  return `unrecognised audio (${contentType || "no content-type"}, ${buf.length} bytes)`;
}

async function fetchAudio(url, name) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return `download failed: ${res.status}`;
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, name);
  await writeFile(path, buf);
  return `${describeAudio(buf, res.headers.get("content-type"))} — ${Math.round(buf.length / 1024)} KB saved to ${path}`;
}

async function snapshot() {
  const [calls, vms] = await Promise.all([listCalls(), listVoicemails()]);
  return { calls, vms };
}

async function main() {
  console.log(`Relatel probe — ${BASE}`);
  let { calls, vms } = await snapshot();

  // --watch: poll, and time how long after hang-up each recording shows up.
  if (watchMinutes > 0) {
    console.log(`Watching for ${watchMinutes} min (every 15 s). Make the test calls now.`);
    const seenRecording = new Map(); // call uuid → first seen time
    const endAt = Date.now() + watchMinutes * 60 * 1000;
    while (Date.now() < endAt) {
      ({ calls, vms } = await snapshot());
      for (const c of calls) {
        if (c.recording?.sound?.url && !seenRecording.has(c.call_uuid)) {
          seenRecording.set(c.call_uuid, Date.now());
          const lag = c.ended_at ? Math.round((Date.now() - new Date(c.ended_at)) / 1000) : null;
          console.log(
            `  [${new Date().toISOString().slice(11, 19)}] recording appeared for ${c.direction} call ` +
              `${fmtTime(c.started_at)} — ${lag == null ? "call not ended?" : `${lag} s after hang-up (±15 s)`}`,
          );
        }
      }
      await new Promise((r) => setTimeout(r, 15000));
    }
  }

  printCalls(calls);
  printVoicemails(vms);

  if (download) {
    console.log("\nAUDIO");
    const rec = calls.find((c) => c.recording?.sound?.url && !c.recording.expired);
    console.log(
      `  recording: ${rec ? await fetchAudio(rec.recording.sound.url, `call-${rec.call_uuid}.bin`) : "none to download"}`,
    );
    const vm = vms[0];
    console.log(
      `  voicemail: ${vm ? await fetchAudio(`${BASE}/voice_mails/${vm.id}/sound`, `voicemail-${vm.id}.mp3`) : "none to download"}`,
    );
    console.log(`  Customer audio — delete ${outDir} when the test is done.`);
  }

  const withRecording = calls.filter((c) => c.recording?.sound?.url);
  const mobileRecorded = withRecording.filter((c) => c.endpoint_type === "employee");
  console.log("\nANSWERS");
  console.log(
    `  1. Mobile calls with a recording: ${mobileRecorded.length} of ${calls.filter((c) => c.endpoint_type === "employee").length} employee calls` +
      ` (${withRecording.length} of ${calls.length} calls in total).`,
  );
  console.log(`  2. Audio format: ${download ? "see AUDIO above" : "run with --download"}.`);
  console.log(`  3. Delay after hang-up: ${watchMinutes > 0 ? "see the watch log above" : "run with --watch"}.`);
  console.log(`  4. Voicemails: ${vms.length} since ${fmtTime(since.toISOString())}.`);
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
