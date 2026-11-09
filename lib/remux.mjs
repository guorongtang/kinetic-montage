import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function probe(file, stream) {
  const stdout = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', stream,
      '-show_entries', 'stream=codec_type,width,height,r_frame_rate,nb_frames,duration',
      '-show_entries', 'format=duration',
      '-of', 'json',
      file
    ],
    { encoding: 'utf8' }
  );
  return JSON.parse(stdout);
}

function videoInfo(file) {
  const p = probe(file, 'v:0');
  const s = p.streams?.[0] || {};
  return {
    width: s.width,
    height: s.height,
    fps: s.r_frame_rate,
    frames: Number(s.nb_frames),
    duration: Number(p.format?.duration ?? s.duration)
  };
}

function audioInfo(file) {
  const p = probe(file, 'a:0');
  const s = p.streams?.[0] || {};
  return { duration: Number(p.format?.duration ?? s.duration) };
}

export function remuxVideo({ video, audio, out }) {
  if (!fs.existsSync(video)) throw new Error(`video not found: ${video}`);
  if (!fs.existsSync(audio)) throw new Error(`audio not found: ${audio}`);

  const before = videoInfo(video);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  // Copy the video stream verbatim; only replace audio. `apad` + `-t` keeps the
  // original video length even when the new audio is shorter.
  execFileSync(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error',
      '-i', video,
      '-i', audio,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '256k',
      '-af', 'apad',
      '-t', String(before.duration),
      out
    ],
    { stdio: 'inherit' }
  );

  const after = videoInfo(out);
  const sameVideo =
    before.width === after.width &&
    before.height === after.height &&
    before.fps === after.fps &&
    before.frames === after.frames;

  if (!sameVideo) {
    throw new Error(
      `video stream changed after remux: before ${JSON.stringify(before)} after ${JSON.stringify(after)}`
    );
  }

  return { out, before, after, audio: audioInfo(out) };
}
