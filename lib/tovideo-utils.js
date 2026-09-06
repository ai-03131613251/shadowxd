// lib/utils.js - ESM Version
export function getRandomString(length = 10) {
    return Math.random().toString(36).substring(2, length + 2);
}

export function getExtensionFromMime(mimeType) {
    const extensions = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/ogg': 'ogg',
        'application/pdf': 'pdf',
        'application/json': 'json'
    };
    return extensions[mimeType] || 'bin';
}

export function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    
    return parts.join(' ');
}

export function isValidDuration(duration, maxDuration) {
    return duration <= maxDuration;
}

export default {
    getRandomString,
    getExtensionFromMime,
    formatDuration,
    isValidDuration
};