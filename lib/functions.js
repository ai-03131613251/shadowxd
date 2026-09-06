// lib/functions.js - ESM Version (clean rewrite)
// NOTE: This file replaces an obfuscated version that shipped in the original
// ESM package. Per instructions we do not reuse obfuscated/protected code, so
// this is a plain, auditable re-implementation of the same utility functions.

import axios from 'axios';

export const PUBG = 'https://api.erfan-md.com'; // placeholder base, unused directly
export const WebUrl = 'https://whatsapp.com';

export const getBuffer = async (url, options = {}) => {
    try {
        const res = await axios({
            method: 'get',
            url,
            headers: {
                DNT: 1,
                'Upgrade-Insecure-Requests': 1,
            },
            ...options,
            responseType: 'arraybuffer',
        });
        return res.data;
    } catch (e) {
        console.log('getBuffer error:', e?.message);
        return null;
    }
};

export const getGroupAdmins = (participants) => {
    const admins = [];
    for (const i of participants || []) {
        if (i.admin !== null && i.admin !== undefined) admins.push(i.id);
    }
    return admins;
};

export const getRandom = (ext) => {
    return `${Math.floor(Math.random() * 10000)}.${ext}`;
};

export const h2k = (num) => {
    const units = ['', 'K', 'M', 'B', 'T'];
    const order = Math.floor(Math.log10(Math.abs(num)) / 3) || 0;
    if (order === 0) return String(num);
    const unit = units[order];
    const scale = Math.pow(10, order * 3);
    const scaled = num / scale;
    let formatted = scaled.toFixed(1);
    if (/\.0$/.test(formatted)) formatted = formatted.slice(0, -2);
    return formatted + unit;
};

export const isUrl = (url) => {
    return !!String(url).match(
        new RegExp(
            /https?:\/\/(www\.)?[-a-zA-Z0-9@:%.+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%+.~#?&/=]*)/,
            'gi'
        )
    );
};

export const Json = (string) => {
    return JSON.stringify(string, null, 2);
};

export const runtime = (seconds) => {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
};

export const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const delay = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchJson = async (url, options = {}) => {
    try {
        const res = await axios({
            method: 'get',
            url,
            headers: { Accept: 'application/json' },
            ...options,
        });
        return res.data;
    } catch (err) {
        console.log('fetchJson error:', err?.message);
        return null;
    }
};

export function cleanPN(pn) {
    if (!pn) return '';
    return pn.split('@')[0];
}

export async function lidToPhone(conn, lid) {
    try {
        if (!lid) return '';
        if (lid.includes('@lid')) {
            const pn = await conn?.signalRepository?.lidMapping?.getPNForLID?.(lid);
            if (pn) return cleanPN(pn);
        }
        return lid.split('@')[0];
    } catch (e) {
        return lid?.split?.('@')?.[0] || '';
    }
}

export default {
    PUBG,
    WebUrl,
    getBuffer,
    getGroupAdmins,
    getRandom,
    h2k,
    isUrl,
    Json,
    runtime,
    sleep,
    delay,
    fetchJson,
    lidToPhone,
    cleanPN,
};
