// store.js - ESM Version
import { isJidBroadcast, isJidGroup, isJidNewsletter } from '@whiskeysockets/baileys';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storeDir = path.join(process.cwd(), 'store');

const readJSON = async (file) => {
    try {
        const filePath = path.join(storeDir, file);
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
};

const writeJSON = async (file, data) => {
    const filePath = path.join(storeDir, file);
    await fs.mkdir(storeDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

export const saveContact = async (jid, name) => {
    if (!jid || !name || isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid)) return;
    const contacts = await readJSON('contact.json');
    const index = contacts.findIndex((contact) => contact.jid === jid);
    if (index > -1) {
        contacts[index].name = name;
    } else {
        contacts.push({ jid, name });
    }
    await writeJSON('contact.json', contacts);
};

export const getContacts = async () => {
    try {
        const contacts = await readJSON('contact.json');
        return contacts;
    } catch (error) {
        return [];
    }
};

// ===== ANTI-DELETE / ANTI-EDIT MESSAGE STORE =====
// Yeh store SIRF antidel.js aur antiedit.js ke liye hai. Rules (Emran ke
// instruction ke mutabiq):
//   1) Message tabhi store ho jab us session (usi WhatsApp number) ka
//      ANTI_DELETE ya ANTI_EDIT "true" ho — warna store hi nahi hota.
//   2) Har session (user) ki apni alag file hoti hai — kisi aur ke
//      messages kabhi bhi kisi doosre session mein nahi jaate.
//   3) Har session mein max 200 messages rakhe jaate hain (purane khud
//      hat jaate hain jab limit cross ho).
//   4) Har message 5 minute ke baad khud expire ho jata hai (load hote
//      waqt aur background sweep se, dono taraf se clean hota hai).
const MAX_MESSAGES_PER_SESSION = 200;
const MESSAGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const antiWatchFile = (sanitized) => `antiwatch_${sanitized}.json`;

const purgeExpired = (messages) => {
    const now = Date.now();
    return messages.filter((msg) => msg.expiresAt && msg.expiresAt > now);
};

export const saveMessage = async (message, sanitized, userConfig) => {
    if (!message || !sanitized || !userConfig) return;

    // Sirf tabhi store karo jab is session ka ANTI_DELETE ya ANTI_EDIT on ho
    if (userConfig.ANTI_DELETE !== 'true' && userConfig.ANTI_EDIT !== 'true') return;

    const jid = message.key.remoteJid;
    const id = message.key.id;
    if (!id || !jid) return;

    const file = antiWatchFile(sanitized);
    let messages = purgeExpired(await readJSON(file));

    const timestamp = message.messageTimestamp ? message.messageTimestamp * 1000 : Date.now();
    const expiresAt = Date.now() + MESSAGE_TTL_MS;
    const index = messages.findIndex((msg) => msg.id === id && msg.jid === jid);

    if (index > -1) {
        messages[index].message = message;
        messages[index].timestamp = timestamp;
        messages[index].expiresAt = expiresAt;
    } else {
        messages.push({ id, jid, message, timestamp, expiresAt });
    }

    // 200 message per-user limit — sabse purane message hatao
    if (messages.length > MAX_MESSAGES_PER_SESSION) {
        messages = messages.slice(messages.length - MAX_MESSAGES_PER_SESSION);
    }

    await writeJSON(file, messages);
};

export const loadMessage = async (id, sanitized) => {
    if (!id || !sanitized) return null;
    const file = antiWatchFile(sanitized);
    const messages = purgeExpired(await readJSON(file));
    return messages.find((msg) => msg.id === id) || null;
};

// Background sweep — har 1 minute mein har session ki antiwatch file se
// expired (5 minute se purane) messages hata deta hai, taake disk par bhi
// zyada der tak na rukein (sirf memory-read ke waqt purge hona kaafi nahi).
const sweepExpiredAntiWatchMessages = async () => {
    try {
        await fs.mkdir(storeDir, { recursive: true });
        const allFiles = await fs.readdir(storeDir);
        const watchFiles = allFiles.filter((file) => file.startsWith('antiwatch_') && file.endsWith('.json'));

        for (const file of watchFiles) {
            const messages = await readJSON(file);
            const cleaned = purgeExpired(messages);
            if (cleaned.length !== messages.length) {
                await writeJSON(file, cleaned);
            }
        }
    } catch (_) {
        // Silent fail — agla sweep khud retry kar lega
    }
};

setInterval(sweepExpiredAntiWatchMessages, 60 * 1000); // har 1 minute

export const getName = async (jid) => {
    const contacts = await readJSON('contact.json');
    const contact = contacts.find((contact) => contact.jid === jid);
    return contact ? contact.name : jid.split('@')[0].replace(/_/g, ' ');
};

export const saveGroupMetadata = async (jid, client) => {
    if (!isJidGroup(jid)) return;
    const groupMetadata = await client.groupMetadata(jid);
    const metadata = {
        jid: groupMetadata.id,
        subject: groupMetadata.subject,
        subjectOwner: groupMetadata.subjectOwner,
        subjectTime: groupMetadata.subjectTime
            ? new Date(groupMetadata.subjectTime * 1000).toISOString()
            : null,
        size: groupMetadata.size,
        creation: groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toISOString() : null,
        owner: groupMetadata.owner,
        desc: groupMetadata.desc,
        descId: groupMetadata.descId,
        linkedParent: groupMetadata.linkedParent,
        restrict: groupMetadata.restrict,
        announce: groupMetadata.announce,
        isCommunity: groupMetadata.isCommunity,
        isCommunityAnnounce: groupMetadata.isCommunityAnnounce,
        joinApprovalMode: groupMetadata.joinApprovalMode,
        memberAddMode: groupMetadata.memberAddMode,
        ephemeralDuration: groupMetadata.ephemeralDuration,
    };

    const metadataList = await readJSON('metadata.json');
    const index = metadataList.findIndex((meta) => meta.jid === jid);
    if (index > -1) {
        metadataList[index] = metadata;
    } else {
        metadataList.push(metadata);
    }
    await writeJSON('metadata.json', metadataList);

    const participants = groupMetadata.participants.map((participant) => ({
        jid,
        participantId: participant.id,
        admin: participant.admin,
    }));
    await writeJSON(`${jid}_participants.json`, participants);
};

export const getGroupMetadata = async (jid) => {
    if (!isJidGroup(jid)) return null;
    const metadataList = await readJSON('metadata.json');
    const metadata = metadataList.find((meta) => meta.jid === jid);
    if (!metadata) return null;

    const participants = await readJSON(`${jid}_participants.json`);
    return { ...metadata, participants };
};

export const saveMessageCount = async (message) => {
    if (!message) return;
    const jid = message.key.remoteJid;
    const sender = message.key.participant || message.sender;
    if (!jid || !sender || !isJidGroup(jid)) return;

    const messageCounts = await readJSON('message_count.json');
    const index = messageCounts.findIndex((record) => record.jid === jid && record.sender === sender);

    if (index > -1) {
        messageCounts[index].count += 1;
    } else {
        messageCounts.push({ jid, sender, count: 1 });
    }

    await writeJSON('message_count.json', messageCounts);
};

export const getInactiveGroupMembers = async (jid) => {
    if (!isJidGroup(jid)) return [];
    const groupMetadata = await getGroupMetadata(jid);
    if (!groupMetadata) return [];

    const messageCounts = await readJSON('message_count.json');
    const inactiveMembers = groupMetadata.participants.filter((participant) => {
        const record = messageCounts.find((msg) => msg.jid === jid && msg.sender === participant.id);
        return !record || record.count === 0;
    });

    return inactiveMembers.map((member) => member.id);
};

export const getGroupMembersMessageCount = async (jid) => {
    if (!isJidGroup(jid)) return [];
    const messageCounts = await readJSON('message_count.json');
    const groupCounts = messageCounts
        .filter((record) => record.jid === jid && record.count > 0)
        .sort((a, b) => b.count - a.count);

    return Promise.all(
        groupCounts.map(async (record) => ({
            sender: record.sender,
            name: await getName(record.sender),
            messageCount: record.count,
        }))
    );
};

export const getChatSummary = async () => {
    const messages = await readJSON('message.json');
    const distinctJids = [...new Set(messages.map((msg) => msg.jid))];

    const summaries = await Promise.all(
        distinctJids.map(async (jid) => {
            const chatMessages = messages.filter((msg) => msg.jid === jid);
            const messageCount = chatMessages.length;
            const lastMessage = chatMessages.sort(
                (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
            )[0];
            const chatName = isJidGroup(jid) ? jid : await getName(jid);

            return {
                jid,
                name: chatName,
                messageCount,
                lastMessageTimestamp: lastMessage ? lastMessage.timestamp : null,
            };
        })
    );

    return summaries.sort(
        (a, b) => new Date(b.lastMessageTimestamp) - new Date(a.lastMessageTimestamp)
    );
};

const saveMessageV1 = saveMessage;
const saveMessageV2 = (message) => {
    return Promise.all([saveMessageV1(message), saveMessageCount(message)]);
};

// Poore bot ki auxiliary store files (contact/metadata/message-count) ko
// clean karta hai — antidelete/antiedit ki antiwatch_*.json files ko yeh
// touch nahi karta, wo apne 200-limit/5-min TTL se khud manage hoti hain.
// Yeh function index.js ke 15-minute "poora bot clean" cycle se call hota hai.
export const cleanAuxiliaryStore = async () => {
    try {
        const files = ['contact.json', 'message_count.json', 'metadata.json'];
        for (const file of files) {
            await writeJSON(file, []);
        }

        await fs.mkdir(storeDir, { recursive: true });
        const allFiles = await fs.readdir(storeDir);
        const participantFiles = allFiles.filter((file) => file.endsWith('_participants.json'));
        for (const file of participantFiles) {
            await writeJSON(file, []);
        }
    } catch (error) {
        console.error('❌ Error during auxiliary store clean:', error);
    }
};

export default {
    saveContact,
    loadMessage,
    getName,
    getChatSummary,
    saveGroupMetadata,
    getGroupMetadata,
    saveMessageCount,
    getInactiveGroupMembers,
    getGroupMembersMessageCount,
    saveMessage: saveMessageV2,
    cleanAuxiliaryStore,
};
