// antidel.js - ESM Version
import { isJidGroup } from '@whiskeysockets/baileys';
import { loadMessage } from './store.js';
import config from '../config.js';

export const DeletedText = async (conn, mek, jid, deleteInfo, isGroup, update) => {
    try {
        if (!conn || !mek || !jid) return;
        
        const messageContent = mek.message?.conversation || 
                              mek.message?.extendedTextMessage?.text || 
                              'Unknown content';
        
        const mentionedJid = [];
        if (isGroup && mek.key?.participant) {
            mentionedJid.push(mek.key.participant);
        } else if (!isGroup && mek.key?.remoteJid) {
            mentionedJid.push(mek.key.remoteJid);
        }
        
        if (deleteInfo) {
            await conn.sendMessage(
                jid,
                {
                    text: deleteInfo,
                    contextInfo: {
                        mentionedJid: mentionedJid.length ? mentionedJid : undefined,
                    },
                },
                { quoted: mek }
            ).catch(e => {
                if (e.message?.includes('rate-overlimit') || e.message?.includes('429')) return;
            });
        }
        
        if (messageContent) {
            await conn.sendMessage(
                jid,
                {
                    text: messageContent,
                    contextInfo: {
                        mentionedJid: mentionedJid.length ? mentionedJid : undefined,
                    },
                },
                { quoted: mek }
            ).catch(e => {
                if (e.message?.includes('rate-overlimit') || e.message?.includes('429')) return;
            });
        }
    } catch (error) {
        if (error.message?.includes('rate-overlimit') || error.message?.includes('429')) return;
    }
};

// NOTE: sirf sticker aur audio/voice ke liye resend hoga — image, video,
// document sab ignore honge. Yeh Emran ke direct instruction ke mutabiq
// hai ("messages, sticker aur voice/audio, baaqi video waghera ignore").
const RESEND_MEDIA_TYPES = ['audioMessage', 'stickerMessage'];

export const DeletedMedia = async (conn, mek, jid, deleteInfo) => {
    try {
        if (!conn || !mek || !jid || !mek.message) return;
        
        const antideletedmek = structuredClone(mek.message);
        if (!antideletedmek) return;
        
        const messageType = Object.keys(antideletedmek)[0];
        if (!messageType) return;
        
        // Sirf sticker/audio hi yahan tak pahunchte hain (caller isMedia
        // check ab RESEND_MEDIA_TYPES ke against hota hai), lekin double
        // safety ke liye yahan bhi guard rakha hai.
        if (!RESEND_MEDIA_TYPES.includes(messageType)) return;
        
        if (deleteInfo) {
            await conn.sendMessage(
                jid,
                {
                    text: deleteInfo,
                    contextInfo: {
                        mentionedJid: mek.sender ? [mek.sender] : undefined,
                    },
                },
                { quoted: mek }
            ).catch(e => {
                if (e.message?.includes('rate-overlimit') || e.message?.includes('429')) return;
            });
        }
        
        await conn.relayMessage(jid, antideletedmek, {}).catch(e => {
            if (e.message?.includes('rate-overlimit') || e.message?.includes('429')) return;
        });
    } catch (error) {
        if (error.message?.includes('rate-overlimit') || error.message?.includes('429')) return;
    }
};

export const AntiDelete = async (conn, updates, sanitized) => {
    try {
        if (!conn || !updates || !Array.isArray(updates) || !sanitized) return;
        
        const userConfig = conn.userConfig || config;
        if (!userConfig.ANTI_DELETE || userConfig.ANTI_DELETE !== "true") return;
        
        for (const update of updates) {
            try {
                if (!update?.key?.id) continue;
                if (!update.update || update.update.message !== null) continue;
                
                let store;
                try {
                    store = await loadMessage(update.key.id, sanitized);
                } catch (err) {
                    continue;
                }
                
                if (!store?.message || !store?.jid) continue;
                
                const mek = store.message;
                const isGroup = isJidGroup(store.jid);
                
                let jid;
                if (userConfig.ANTI_DELETE_PATH === "inbox") {
                    jid = conn.user?.id ? conn.user.id.split(':')[0] + '@s.whatsapp.net' : null;
                    if (!jid) continue;
                } else {
                    jid = isGroup ? store.jid : (update.key?.remoteJid || store.jid);
                    if (!jid) continue;
                }
                
                let senderNumber = 'Unknown';
                if (isGroup && mek.key?.participant) {
                    senderNumber = mek.key.participant.split('@')[0];
                } else if (!isGroup && mek.key?.remoteJid) {
                    senderNumber = mek.key.remoteJid.split('@')[0];
                }
                
                const botName = userConfig.BOT_NAME || config.BOT_NAME || 'ADEEL-MD';
                
                const deleteInfo = `*⚠️ Deleted Message Alert 🚨*
*╭────⬡ ${botName} ⬡────*
*├▢ SENDER :* @${senderNumber}
*├▢ ACTION :* Deleted a Message
*╰▢ MESSAGE :* Content Below 🔽`;
                
                const hasText = mek.message?.conversation || mek.message?.extendedTextMessage?.text;
                
                if (hasText) {
                    await DeletedText(conn, mek, jid, deleteInfo, isGroup, update);
                } else {
                    const messageKeys = Object.keys(mek.message || {});
                    const isResendableMedia = messageKeys.some(key => RESEND_MEDIA_TYPES.includes(key));
                    
                    if (isResendableMedia) {
                        await DeletedMedia(conn, mek, jid, deleteInfo);
                    }
                    // image / video / document — ignore, per instruction
                }
            } catch (error) {
                continue;
            }
        }
    } catch (error) {
        // Silent fail
    }
};

export default {
    DeletedText,
    DeletedMedia,
    AntiDelete,
};
