// stickerMaker.js - ESM Version
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import crypto from 'crypto';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath.path);

class StickerMaker {
    constructor() {
        this.tempDir = path.join(__dirname, '../temp');
        this.ensureTempDir();
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Convert video/GIF buffer to WebP sticker
     */
    async videoToWebp(videoBuffer) {
        const outputPath = path.join(
            tmpdir(),
            crypto.randomBytes(6).readUIntLE(0, 6).toString(36) + '.webp'
        );
        const inputPath = path.join(
            tmpdir(),
            crypto.randomBytes(6).readUIntLE(0, 6).toString(36) + '.mp4'
        );

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

    /**
     * Convert GIF buffer to WebP sticker
     */
    async gifToSticker(gifBuffer) {
        const outputPath = path.join(tmpdir(), crypto.randomBytes(6).toString('hex') + ".webp");
        const inputPath = path.join(tmpdir(), crypto.randomBytes(6).toString('hex') + ".gif");

        fs.writeFileSync(inputPath, gifBuffer);

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .on("error", reject)
                .on("end", () => resolve(true))
                .addOutputOptions([
                    "-vcodec", "libwebp",
                    "-vf", "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split [a][b];[a] palettegen=reserve_transparent=on:transparency_color=ffffff [p];[b][p] paletteuse",
                    "-loop", "0",
                    "-preset", "default",
                    "-an",
                    "-vsync", "0"
                ])
                .toFormat("webp")
                .save(outputPath);
        });

        const webpBuffer = fs.readFileSync(outputPath);
        fs.unlinkSync(outputPath);
        fs.unlinkSync(inputPath);

        return webpBuffer;
    }

    /**
     * Convert sticker to image (for reverse conversion if needed)
     */
    async convertStickerToImage(stickerBuffer) {
        const tempPath = path.join(this.tempDir, `sticker_${Date.now()}.webp`);
        const outputPath = path.join(this.tempDir, `image_${Date.now()}.png`);

        try {
            await fs.promises.writeFile(tempPath, stickerBuffer);

            await new Promise((resolve, reject) => {
                ffmpeg(tempPath)
                    .on('error', reject)
                    .on('end', resolve)
                    .output(outputPath)
                    .run();
            });

            return await fs.promises.readFile(outputPath);
        } catch (error) {
            console.error('Conversion error:', error);
            throw new Error('Failed to convert sticker to image');
        } finally {
            await Promise.all([
                fs.promises.unlink(tempPath).catch(() => {}),
                fs.promises.unlink(outputPath).catch(() => {})
            ]);
        }
    }

    /**
     * Fetch image from URL
     */
    async fetchImage(url) {
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            return response.data;
        } catch (error) {
            console.error("Error fetching image:", error);
            throw new Error("Could not fetch image.");
        }
    }

    /**
     * Fetch GIF from URL
     */
    async fetchGif(url) {
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            return response.data;
        } catch (error) {
            console.error("Error fetching GIF:", error);
            throw new Error("Could not fetch GIF.");
        }
    }
}

const stickerMaker = new StickerMaker();
export default stickerMaker;