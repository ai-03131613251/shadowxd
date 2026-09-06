// config.js - ESM Version by MAFIA ADEEL 
import dotenv from 'dotenv';
dotenv.config();

const config = {
    // MongoDB Configuration (only this is from process.env)
    MONGODB_URL: process.env.MONGODB_URL || 'mongodb+srv://malikgf:malikgf@cluster0.e806lad.mongodb.net/?appName=Cluster0',
    
    // Fixed Database Name
    DB_NAME: process.env.DB_NAME || 'minibot',
    
    // Collections Configuration
    COLLECTIONS: {
        SESSIONS: 'whatsapp_sessions',
        NUMBERS: 'active_numbers',
        CONFIGS: 'bot_configs'
    },
    
    // Bot Configuration
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'false',  // ADDED - Auto like status messages
    MENTION_REPLY: 'false',
    AUTO_RECORDING: 'false',
    AUTO_REACT: 'false',
    AUTO_TYPING: 'false',
    ALWAYS_ONLINE: 'false',
    VERSION: '4.0.0 Bᴇᴛᴀ',
    DESCRIPTION: '*© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐒ʜᴀᴅᴏᴡ 𝐌𝐃*',
    ANTI_DELETE_PATH: 'inbox',
    ANTI_DELETE: 'false',
    ANTI_EDIT_PATH: 'inbox',
    ANTI_EDIT: 'false',
    STICKER_NAME: 'ꨄ 𝐒ʜᴀᴅᴏᴡ 𝐌𝐃 ꨄ',
    ANTI_LINK: 'true',
    WELCOME: 'false',
    GOODBYE: 'false',
    WELCOME_MESSAGE: '*_@user joined the group, welcome! 🎉_*',
    GOODBYE_MESSAGE: '*_@user has left the group, we will miss them! 👋_*',
    ADMIN_ACTION: 'false',
    MODE: 'public',
    PREFIX: '.',
    ANTI_CALL: 'false',
    REJECT_MSG: '*Call Rejected Automatically 📵*',
    READ_MESSAGE: 'false',
    AUTO_STATUS_SEEN: 'true',
    OWNER_REACT: 'false',
    OWNER_EMOJIS: ['❤️', '🔥', '👑', '⭐', '💎'],
    REACT_EMOJIS: ['🤟', '❤️', '🔥', '👏', '😮', '😢', '🙃', '👍', '🎉', '🤔', '🙏', '😍', '😊', '🥰', '💕', '🤩', '✨', '😎', '🥳', '🙌'],
    LIKE_EMOJIS: ['❤️', '👍', '😮', '😎', '💀'],  // ADDED - Emojis for auto like status
    
    // Bot Identity
    BOT_NAME: '𝐒ʜᴀᴅᴏᴡ 𝐌𝐃',
    OWNER_NAME: '𝐒ʜᴀᴅᴏᴡ 𝐁ᴏʏ',
    OWNER_NUMBER: '923131613251',
    DEV: '923174838990',
    IK_IMAGE_PATH: './lib/ERFAN.jpg',
    BOT_IMAGE: 'https://i.ibb.co/Vp97fDZ6/ERFAN-MD.jpg',
    
    // Newsletter Configuration
    NEWSLETTER_JID: '120363404811118873@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',  

    
    // System Configuration
    MAX_RETRIES: 3,
    OTP_EXPIRY: 300000,
    ADMIN_LIST_PATH: './admin.json',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbC15ycFHWpubqmNWe0N',
    BANNED: [],
    SUDO: ["48503753592860@lid", "48503753592860@lid", "923306137477@s.whatsapp.net", "923306137477@s.whatsapp.net"],
    
    // Default Settings Template
    DEFAULT_SETTINGS: {
        // Status & View Settings
        AUTO_VIEW_STATUS: 'true',
        AUTO_LIKE_STATUS: 'false',  // ADDED - Auto like status (disabled by default)
        MENTION_REPLY: 'false',
        AUTO_STATUS_SEEN: 'true',
        READ_MESSAGE: 'false',
        
        // Auto Actions
        AUTO_RECORDING: 'false',
        AUTO_REACT: 'false',
        AUTO_TYPING: 'false',
        ALWAYS_ONLINE: 'false',
        OWNER_REACT: 'false',
        
        // Anti Features
        ANTI_DELETE: 'false',
        ANTI_DELETE_PATH: 'inbox',
        ANTI_EDIT: 'false',
        ANTI_EDIT_PATH: 'inbox',
        ANTI_CALL: 'false',
        ANTI_LINK: 'true',
        
        // Group Events
        WELCOME: 'false',
        GOODBYE: 'false',
        ADMIN_ACTION: 'false',
        
        // Message Templates
        WELCOME_MESSAGE: '*_@user joined the group, welcome! 🎉_*',
        GOODBYE_MESSAGE: '*_@user has left the group, we will miss them! 👋_*',
        REJECT_MSG: '*Call Rejected Automatically 📵*',
        
        // Bot Identity
        VERSION: '12.0.0 Bᴇᴛᴀ',
        OWNER_NAME: '𝐒ʜᴀᴅᴏᴡ 𝐁ᴏʏ',
        OWNER_NUMBER: '923174838990',
        DEV: '923131613251',
        DESCRIPTION: '*© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝐒ʜᴀᴅᴏᴡ 𝐌𝐃*',
        STICKER_NAME: '𝐒ʜᴀᴅᴏᴡ 𝐌𝐃',
        MODE: 'public',
        PREFIX: '.',
        BOT_NAME: '𝐆ʜᴏsᴛ-𝐌ᴅ',
        BOT_IMAGE: 'https://i.ibb.co/Vp97fDZ6/ERFAN-MD.jpg',
        
        REACT_EMOJIS: ['😂', '❤️', '🔥', '👏', '😮', '😢', '🙃', '👍', '🎉', '🤔', '🙏', '😍', '😊', '🥰', '💕', '🤩', '✨', '😎', '🥳', '🙌'],
        OWNER_EMOJIS: ['❤️', '🔥', '👑', '⭐', '💎'],
        LIKE_EMOJIS: ['❤️', '👍', '😮', '😎', '💀'],  // ADDED - Emojis for auto like
        
        // Lists
        BANNED: [],
        SUDO: ["48503753592860@lid", "48503753592860@lid", "923174838990@s.whatsapp.net", "923174838990@s.whatsapp.net"]
    }
};

export default config;
