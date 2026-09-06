// lib/videoToWebp.js - ESM Version
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * Converts a video or GIF buffer to a WebP sticker format.
 * @param {Buffer} videoBuffer - The video or GIF buffer to convert.
 * @returns {Promise<Buffer>} - The converted WebP sticker buffer.
 */
export async function videoToWebp(videoBuffer) {
    const outputPath = path.join(
        tmpdir(),
        crypto.randomBytes(6).readUIntLE(0, 6).toString(36) + '.webp'
    );
    const inputPath = path.join(
        tmpdir(),
        crypto.randomBytes(6).readUIntLE(0, 6).toString(36) + '.mp4'
    );

    // Save the video buffer to a file
    fs.writeFileSync(inputPath, videoBuffer);

    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .on('error', reject)
            .on('end', () => resolve(true))
            .addOutputOptions([
                '-vcodec', 'libwebp',
                '-vf', "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split [a][b];[a] palettegen=reserve_transparent=on:transparency_color=ffffff [p];[b][p] paletteuse",
                '-loop', '0',
                '-ss', '00:00:00',
                '-t', '00:00:05',
                '-preset', 'default',
                '-an',
                '-vsync', '0'
            ])
            .toFormat('webp')
            .save(outputPath);
    });

    const webpBuffer = fs.readFileSync(outputPath);
    fs.unlinkSync(outputPath);
    fs.unlinkSync(inputPath);

    return webpBuffer;
}

export default { videoToWebp };