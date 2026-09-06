import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to warnings.json in lib directory
const warningsPath = path.join(__dirname, 'warnings.json');

// Ensure warnings file exists
if (!fs.existsSync(warningsPath)) {
    fs.writeFileSync(warningsPath, JSON.stringify([]));
}

// Auto clear all warnings every 15 minutes (900000 ms)
setInterval(() => {
    try {
        fs.writeFileSync(warningsPath, JSON.stringify([]));
        console.log('[⚠️] All warnings cleared automatically (15 minute interval)');
    } catch (error) {
        console.error('Error auto-clearing warnings:', error);
    }
}, 900000); // 15 minutes in milliseconds

// AntiLink warnings
function getLinkWarnings() {
    try {
        const data = fs.readFileSync(warningsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading warnings.json:', error);
        return [];
    }
}

function saveLinkWarnings(warningsArray) {
    try {
        fs.writeFileSync(warningsPath, JSON.stringify(warningsArray, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing warnings.json:', error);
        return false;
    }
}

function getLinkWarningCount(sender) {
    try {
        const warnings = getLinkWarnings();
        for (let item of warnings) {
            if (item.startsWith(sender + '-')) {
                return parseInt(item.split('-')[1]) || 1;
            }
        }
        return 0;
    } catch (error) {
        console.error('Error getting warning count:', error);
        return 0;
    }
}

function addLinkWarning(sender) {
    try {
        let warnings = getLinkWarnings();
        let found = false;
        let newWarnings = [];
        let newCount = 1;
        
        for (let item of warnings) {
            if (item.startsWith(sender + '-')) {
                let currentCount = parseInt(item.split('-')[1]) || 1;
                newCount = currentCount + 1;
                newWarnings.push(`${sender}-${newCount}`);
                found = true;
            } else {
                newWarnings.push(item);
            }
        }
        
        if (!found) {
            newWarnings.push(`${sender}-1`);
        }
        
        saveLinkWarnings(newWarnings);
        return newCount;
    } catch (error) {
        console.error('Error adding warning:', error);
        return 1;
    }
}

function removeLinkWarning(sender) {
    try {
        let warnings = getLinkWarnings();
        let newWarnings = warnings.filter(item => !item.startsWith(sender + '-'));
        saveLinkWarnings(newWarnings);
        return true;
    } catch (error) {
        console.error('Error removing warning:', error);
        return false;
    }
}

// Generic warning functions using sender
export function getWarning(sender) {
    return getLinkWarningCount(sender);
}

export function addWarning(sender) {
    return addLinkWarning(sender);
}

export function clearWarning(sender) {
    return removeLinkWarning(sender);
}

export default {
    getWarning,
    addWarning,
    clearWarning
};
