// lib/sticker-utils.js - ESM version
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import Crypto from 'crypto';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export async function fetchImage(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        console.error('Error fetching image:', error.message);
        throw new Error('Could not fetch image.');
    }
}

export async function fetchGif(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return response.data;
    } catch (error) {
        console.error('Error fetching GIF:', error.message);
        throw new Error('Could not fetch GIF.');
    }
}

export async function gifToSticker(gifBuffer) {
    const outputPath = path.join(tmpdir(), Crypto.randomBytes(6).toString('hex') + '.webp');
    const inputPath = path.join(tmpdir(), Crypto.randomBytes(6).toString('hex') + '.gif');

    fs.writeFileSync(inputPath, gifBuffer);

    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .on('error', reject)
            .on('end', () => resolve(true))
            .addOutputOptions([
                '-vcodec', 'libwebp',
                '-vf', "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split [a][b];[a] palettegen=reserve_transparent=on:transparency_color=ffffff [p];[b][p] paletteuse",
                '-loop', '0',
                '-preset', 'default',
                '-an',
                '-vsync', '0',
            ])
            .toFormat('webp')
            .save(outputPath);
    });

    const webpBuffer = fs.readFileSync(outputPath);
    fs.unlinkSync(outputPath);
    fs.unlinkSync(inputPath);

    return webpBuffer;
}

export default { fetchImage, fetchGif, gifToSticker };
