// lib/connection.js - ESM Version
import axios from "axios";
import { 
    downloadContentFromMessage,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    jidDecode,
    prepareWAMessageMedia,
    proto
} from "@whiskeysockets/baileys";
import { getBuffer } from './functions.js';
import { sms } from './handler.js';
import * as FileType from "file-type";
import fs from "fs";
import path from "path";
import config from "../config.js";

export async function addConnectionFunctions(conn) {
    conn.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
        } else return jid;
    };

    conn.copyNForward = async (jid, message, forceForward = false, options = {}) => {
        try {
            let vtype;
            if (options.readViewOnce) {
                message.message = message.message &&
                    message.message.ephemeralMessage &&
                    message.message.ephemeralMessage.message
                    ? message.message.ephemeralMessage.message
                    : message.message || undefined;
                vtype = Object.keys(message.message.viewOnceMessage.message)[0];
                delete (message.message && message.message.ignore ? message.message.ignore : message.message || undefined);
                delete message.message.viewOnceMessage.message[vtype].viewOnce;
                message.message = {
                    ...message.message.viewOnceMessage.message,
                };
            }

            let mtype = Object.keys(message.message)[0];
            let content = await generateForwardMessageContent(message, forceForward);
            let ctype = Object.keys(content)[0];
            let context = {};
            if (mtype != "conversation") context = message.message[mtype].contextInfo;
            content[ctype].contextInfo = {
                ...context,
                ...content[ctype].contextInfo,
            };
            const waMessage = await generateWAMessageFromContent(
                jid,
                content,
                options
                    ? {
                        ...content[ctype],
                        ...options,
                        ...(options.contextInfo
                            ? {
                                contextInfo: {
                                    ...content[ctype].contextInfo,
                                    ...options.contextInfo,
                                },
                            }
                            : {}),
                    }
                    : {}
            );
            await conn.relayMessage(jid, waMessage.message, { messageId: waMessage.key.id });
            return waMessage;
        } catch (e) {
            return null;
        }
    };

    conn.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
        try {
            let quoted = message.msg ? message.msg : message;
            let mime = (message.msg || message).mimetype || "";
            let messageType = message.mtype ? message.mtype.replace(/Message/gi, "") : mime.split("/")[0];
            const stream = await downloadContentFromMessage(quoted, messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            let type = await FileType.fromBuffer(buffer);
            let trueFileName = attachExtension ? filename + "." + type.ext : filename;
            await fs.promises.writeFile(trueFileName, buffer);
            return trueFileName;
        } catch (e) {
            return null;
        }
    };

    conn.downloadMediaMessage = async (message) => {
        try {
            let mime = (message.msg || message).mimetype || "";
            let messageType = message.mtype ? message.mtype.replace(/Message/gi, "") : mime.split("/")[0];
            const stream = await downloadContentFromMessage(message, messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }
            return buffer;
        } catch (e) {
            return null;
        }
    };

    conn.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
        try {
            let mime = "";
            let res = await axios.head(url);
            mime = res.headers["content-type"];
            if (mime.split("/")[1] === "gif") {
                return conn.sendMessage(
                    jid,
                    { video: await getBuffer(url), caption: caption, gifPlayback: true, ...options },
                    { quoted: quoted, ...options }
                );
            }
            let type = mime.split("/")[0] + "Message";
            if (mime === "application/pdf") {
                return conn.sendMessage(
                    jid,
                    { document: await getBuffer(url), mimetype: "application/pdf", caption: caption, ...options },
                    { quoted: quoted, ...options }
                );
            }
            if (mime.split("/")[0] === "image") {
                return conn.sendMessage(
                    jid,
                    { image: await getBuffer(url), caption: caption, ...options },
                    { quoted: quoted, ...options }
                );
            }
            if (mime.split("/")[0] === "video") {
                return conn.sendMessage(
                    jid,
                    { video: await getBuffer(url), caption: caption, mimetype: "video/mp4", ...options },
                    { quoted: quoted, ...options }
                );
            }
            if (mime.split("/")[0] === "audio") {
                return conn.sendMessage(
                    jid,
                    { audio: await getBuffer(url), caption: caption, mimetype: "audio/mpeg", ...options },
                    { quoted: quoted, ...options }
                );
            }
        } catch (e) {
            return null;
        }
    };

    conn.cMod = (jid, copy, text = "", sender = conn.user.id.split(':')[0] + "@s.whatsapp.net", options = {}) => {
        try {
            let mtype = Object.keys(copy.message)[0];
            let isEphemeral = mtype === "ephemeralMessage";
            if (isEphemeral) {
                mtype = Object.keys(copy.message.ephemeralMessage.message)[0];
            }
            let msg = isEphemeral ? copy.message.ephemeralMessage.message : copy.message;
            let content = msg[mtype];
            if (typeof content === "string") msg[mtype] = text || content;
            else if (content.caption) content.caption = text || content.caption;
            else if (content.text) content.text = text || content.text;
            if (typeof content !== "string")
                msg[mtype] = {
                    ...content,
                    ...options,
                };
            if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant;
            else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant;
            if (copy.key.remoteJid.includes("@s.whatsapp.net")) sender = sender || copy.key.remoteJid;
            else if (copy.key.remoteJid.includes("@broadcast")) sender = sender || copy.key.remoteJid;
            copy.key.remoteJid = jid;
            copy.key.fromMe = sender === conn.user.id.split(':')[0] + "@s.whatsapp.net";
            return proto.WebMessageInfo.fromObject(copy);
        } catch (e) {
            return copy;
        }
    };

    conn.getFile = async (PATH, save) => {
        try {
            let res;
            let data = Buffer.isBuffer(PATH)
                ? PATH
                : /^data:.*?\/.*?;base64,/i.test(PATH)
                ? Buffer.from(PATH.split`,`[1], "base64")
                : /^https?:\/\//.test(PATH)
                ? await (res = await getBuffer(PATH))
                : fs.existsSync(PATH)
                ? ((filename = PATH), fs.readFileSync(PATH))
                : typeof PATH === "string"
                ? PATH
                : Buffer.alloc(0);
            let type = await FileType.fromBuffer(data) || {
                mime: "application/octet-stream",
                ext: ".bin",
            };
            let filename = path.join(__dirname, new Date() * 1 + "." + type.ext);
            if (data && save) fs.promises.writeFile(filename, data);
            return {
                res,
                filename,
                size: data.length,
                ...type,
                data,
            };
        } catch (e) {
            return null;
        }
    };

    conn.sendFile = async (jid, PATH, fileName, quoted = {}, options = {}) => {
        try {
            let types = await conn.getFile(PATH, true);
            let { filename, size, ext, mime, data } = types;
            let type = "",
                mimetype = mime,
                pathFile = filename;
            if (options.asDocument) type = "document";
            if (options.asSticker || /webp/.test(mime)) {
                const { writeExif } = await import("../exif.js");
                let media = { mimetype: mime, data };
                pathFile = await writeExif(media, {
                    packname: config.packname,
                    author: config.packname,
                    categories: options.categories ? options.categories : [],
                });
                await fs.promises.unlink(filename);
                type = "sticker";
                mimetype = "image/webp";
            } else if (/image/.test(mime)) type = "image";
            else if (/video/.test(mime)) type = "video";
            else if (/audio/.test(mime)) type = "audio";
            else type = "document";
            await conn.sendMessage(
                jid,
                {
                    [type]: { url: pathFile },
                    mimetype,
                    fileName,
                    ...options,
                },
                { quoted, ...options }
            );
            return fs.promises.unlink(pathFile);
        } catch (e) {
            return null;
        }
    };

    conn.parseMention = async (text) => {
        try {
            return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map((v) => v[1] + "@s.whatsapp.net");
        } catch (e) {
            return [];
        }
    };

    conn.sendMedia = async (jid, path, fileName = "", caption = "", quoted = "", options = {}) => {
        try {
            let types = await conn.getFile(path, true);
            let { mime, ext, res, data, filename } = types;
            if (res && res.status !== 200 || filename.length <= 65536) {
                try { throw { json: JSON.parse(filename.toString()) }; } catch (e) { if (e.json) throw e.json; }
            }
            let type = "",
                mimetype = mime,
                pathFile = filename;
            if (options.asDocument) type = "document";
            if (options.asSticker || /webp/.test(mime)) {
                const { writeExif } = await import("../exif.js");
                let media = { mimetype: mime, data };
                pathFile = await writeExif(media, {
                    packname: options.packname ? options.packname : config.packname,
                    author: options.author ? options.author : config.author,
                    categories: options.categories ? options.categories : [],
                });
                await fs.promises.unlink(filename);
                type = "sticker";
                mimetype = "image/webp";
            } else if (/image/.test(mime)) type = "image";
            else if (/video/.test(mime)) type = "video";
            else if (/audio/.test(mime)) type = "audio";
            else type = "document";
            await conn.sendMessage(
                jid,
                {
                    [type]: { url: pathFile },
                    caption,
                    mimetype,
                    fileName,
                    ...options,
                },
                { quoted, ...options }
            );
            return fs.promises.unlink(pathFile);
        } catch (e) {
            return null;
        }
    };

    conn.sendVideoAsSticker = async (jid, buff, options = {}) => {
        try {
            let buffer;
            if (options && (options.packname || options.author)) {
                const { writeExifVid } = await import("../exif.js");
                buffer = await writeExifVid(buff, options);
            } else {
                const { videoToWebp } = await import("../exif.js");
                buffer = await videoToWebp(buff);
            }
            await conn.sendMessage(jid, { sticker: { url: buffer }, ...options }, options);
        } catch (e) {}
    };

    conn.sendImageAsSticker = async (jid, buff, options = {}) => {
        try {
            let buffer;
            if (options && (options.packname || options.author)) {
                const { writeExifImg } = await import("../exif.js");
                buffer = await writeExifImg(buff, options);
            } else {
                const { imageToWebp } = await import("../exif.js");
                buffer = await imageToWebp(buff);
            }
            await conn.sendMessage(jid, { sticker: { url: buffer }, ...options }, options);
        } catch (e) {}
    };

    conn.sendTextWithMentions = async (jid, text, quoted, options = {}) =>
        conn.sendMessage(
            jid,
            { text: text, contextInfo: { mentionedJid: [...text.matchAll(/@(\d{0,16})/g)].map((v) => v[1] + "@s.whatsapp.net") }, ...options },
            { quoted }
        ).catch(() => {});

    conn.sendImage = async (jid, path, caption = "", quoted = "", options) => {
        try {
            let buffer = Buffer.isBuffer(path)
                ? path
                : /^data:.*?\/.*?;base64,/i.test(path)
                ? Buffer.from(path.split`,`[1], "base64")
                : /^https?:\/\//.test(path)
                ? await (await getBuffer(path))
                : fs.existsSync(path)
                ? fs.readFileSync(path)
                : Buffer.alloc(0);
            return await conn.sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted });
        } catch (e) {
            return null;
        }
    };

    conn.sendText = (jid, text, quoted = "", options) => 
        conn.sendMessage(jid, { text: text, ...options }, { quoted }).catch(() => {});

    conn.sendButtonText = (jid, buttons = [], text, footer, quoted = "", options = {}) => {
        let buttonMessage = {
            text,
            footer,
            buttons,
            headerType: 2,
            ...options,
        };
        conn.sendMessage(jid, buttonMessage, { quoted, ...options }).catch(() => {});
    };

    conn.send5ButImg = async (jid, text = "", footer = "", img, but = [], thumb, options = {}) => {
        try {
            let message = await prepareWAMessageMedia({ image: img, jpegThumbnail: thumb }, { upload: conn.waUploadToServer });
            var template = generateWAMessageFromContent(
                jid,
                proto.Message.fromObject({
                    templateMessage: {
                        hydratedTemplate: {
                            imageMessage: message.imageMessage,
                            hydratedContentText: text,
                            hydratedFooterText: footer,
                            hydratedButtons: but,
                        },
                    },
                }),
                options
            );
            conn.relayMessage(jid, template.message, { messageId: template.key.id });
        } catch (e) {}
    };

    conn.getName = (jid, withoutContact = false) => {
        try {
            let id = conn.decodeJid(jid);
            withoutContact = conn.withoutContact || withoutContact;
            let v;
            if (id.endsWith("@g.us"))
                return new Promise(async (resolve) => {
                    v = store.contacts[id] || {};
                    if (!(v.name.notify || v.subject)) v = conn.groupMetadata(id) || {};
                    resolve(v.name || v.subject || PhoneNumber("+" + id.replace("@s.whatsapp.net", "")).getNumber("international"));
                });
            else
                v =
                    id === "0@s.whatsapp.net"
                        ? {
                            id,
                            name: "WhatsApp",
                        }
                        : id === conn.decodeJid(conn.user.id.split(':')[0] + "@s.whatsapp.net")
                        ? conn.user
                        : store.contacts[id] || {};
            return (withoutContact ? "" : v.name) || v.subject || v.verifiedName || PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber("international");
        } catch (e) {
            return jid.split('@')[0];
        }
    };

    conn.sendContact = async (jid, kon, quoted = "", opts = {}) => {
        try {
            let list = [];
            for (let i of kon) {
                list.push({
                    displayName: await conn.getName(i + "@s.whatsapp.net"),
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${await conn.getName(i + "@s.whatsapp.net")}\nFN:${global.OwnerName}\nitem1.TEL;waid=${i}:${i}\nitem1.X-ABLabel:Click here to chat\nitem2.EMAIL;type=INTERNET:${global.email}\nitem2.X-ABLabel:GitHub\nitem3.URL:https://github.com/${global.github}/khan-xd\nitem3.X-ABLabel:GitHub\nitem4.ADR:;;${global.location};;;;\nitem4.X-ABLabel:Region\nEND:VCARD`,
                });
            }
            conn.sendMessage(
                jid,
                {
                    contacts: {
                        displayName: `${list.length} Contact`,
                        contacts: list,
                    },
                    ...opts,
                },
                { quoted }
            );
        } catch (e) {}
    };

    conn.setStatus = (status) => {
        try {
            conn.query({
                tag: "iq",
                attrs: {
                    to: "@s.whatsapp.net",
                    type: "set",
                    xmlns: "status",
                },
                content: [
                    {
                        tag: "status",
                        attrs: {},
                        content: Buffer.from(status, "utf-8"),
                    },
                ],
            });
            return status;
        } catch (e) {
            return status;
        }
    };

    conn.serializeM = (mek) => sms(conn, mek, store);
}
